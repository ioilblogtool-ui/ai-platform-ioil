'use client';

// Architecture Studio 상태 (D-05 Zustand). 도메인 모델이 진실의 원천이다 (02 §3.1, §5).
// Sprint 1: 수동 저장(버튼·Ctrl+S). 2초 자동 저장과 충돌 모달은 Sprint 3.
import { create } from 'zustand';
import type { Connection, EdgeChange, NodeChange } from '@xyflow/react';
import type { ArchitectureModel, TypeRegistry } from './architecture-types';
import { getAaProject, getDraft, getTypeRegistry, saveDraft, AaApiError, RevisionConflictError } from './architecture-api';
import { newId } from './ids';
import type { AaFlowNode } from './graph-mapper';
import * as ops from './model-ops';

export type SaveState = 'loading' | 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

type StudioState = {
  projectId: string | null;
  projectName: string;
  model: ArchitectureModel | null;
  viewId: string;
  baseRevision: number;
  saveState: SaveState;
  saveMessage: string | null;
  conflictRevision: number | null;
  editSeq: number;                 // 편집할 때마다 증가 — 저장 중 추가 편집 감지
  registry: TypeRegistry | null;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  loadError: string | null;

  load: (projectId: string) => Promise<void>;
  addComponent: (type: string, position: { x: number; y: number }) => void;
  applyNodeChanges: (changes: NodeChange<AaFlowNode>[]) => void;
  applyEdgeChanges: (changes: EdgeChange[]) => void;
  connect: (c: Connection) => void;
  save: () => Promise<void>;
};


export const useStudio = create<StudioState>((set, get) => {
  // 모델을 바꾸는 공통 경로: model-ops 순수 함수가 새 모델을 돌려준다. 같은 객체면 변경 없음 → dirty 아님
  const edit = (fn: (m: ArchitectureModel, viewId: string) => ArchitectureModel) => {
    const { model, saveState, viewId } = get();
    if (!model) return false;
    const next = fn(model, viewId);
    if (next === model) return false;
    set({
      model: next,
      editSeq: get().editSeq + 1,
      saveState: saveState === 'saving' || saveState === 'conflict' ? saveState : 'dirty',
    });
    return true;
  };

  // 드래그 중 위치는 편집으로 세지 않고 화면에만 반영한다. 드래그가 끝나면 그동안 움직였는지로 dirty를 정한다
  let draggedSinceCommit = false;
  const markDirty = () => {
    const { saveState } = get();
    set({ editSeq: get().editSeq + 1, saveState: saveState === 'saving' || saveState === 'conflict' ? saveState : 'dirty' });
  };

  return {
    projectId: null,
    projectName: '',
    model: null,
    viewId: 'view_logical',
    baseRevision: 0,
    saveState: 'loading',
    saveMessage: null,
    conflictRevision: null,
    editSeq: 0,
    registry: null,
    selectedNodeIds: [],
    selectedEdgeIds: [],
    loadError: null,

    async load(projectId) {
      draggedSinceCommit = false;
      set({ projectId, saveState: 'loading', loadError: null, model: null, selectedNodeIds: [], selectedEdgeIds: [], conflictRevision: null, saveMessage: null });
      try {
        const [project, draft, registry] = await Promise.all([getAaProject(projectId), getDraft(projectId), getTypeRegistry()]);
        set({ projectName: project.name, model: draft.model, baseRevision: draft.revision, registry, saveState: 'saved', editSeq: 0 });
      } catch (e) {
        const msg = e instanceof AaApiError && e.code === 'NOT_FOUND' ? '프로젝트를 찾을 수 없습니다.' : (e as Error).message;
        set({ loadError: msg, saveState: 'error' });
      }
    },

    addComponent(type, position) {
      let nodeId: string | null = null;
      edit((m, viewId) => {
        const r = ops.addComponent(m, viewId, type, get().registry, position, newId);
        nodeId = r.nodeId;
        return r.model;
      });
      if (nodeId) set({ selectedNodeIds: [nodeId], selectedEdgeIds: [] });
    },

    applyNodeChanges(changes) {
      let selection = get().selectedNodeIds;
      const moves: { id: string; x: number; y: number }[] = [];
      const removes: string[] = [];
      let final = false;   // 드래그 종료 (React Flow 12는 종료 이벤트에 position을 안 보낼 수 있음)
      for (const ch of changes) {
        if (ch.type === 'select') {
          selection = ch.selected ? Array.from(new Set([...selection, ch.id])) : selection.filter((x) => x !== ch.id);
        } else if (ch.type === 'position') {
          if (ch.position) moves.push({ id: ch.id, x: ch.position.x, y: ch.position.y });
          if (ch.dragging === false) final = true;
        } else if (ch.type === 'remove') {
          removes.push(ch.id);
        }
      }
      if (selection !== get().selectedNodeIds) set({ selectedNodeIds: selection });

      if (moves.length || final) {
        // 드래그 중 위치는 화면 갱신용으로만 반영하고, 드래그가 끝났을 때만 편집(dirty)으로 센다
        const { model, viewId } = get();
        if (!model) return;
        if (final) {
          const changed = edit((m, vid) => ops.moveNodes(m, vid, moves));
          if (!changed && draggedSinceCommit) markDirty();
          draggedSinceCommit = false;
        } else {
          const next = ops.moveNodes(model, viewId, moves);
          if (next !== model) { draggedSinceCommit = true; set({ model: next }); }
        }
      }
      if (removes.length) {
        // Sprint 1 동작 유지 (마지막 노드면 컴포넌트·관계까지 삭제). Step 3에서 requestDelete + 확인 다이얼로그로 바뀐다
        edit((m, vid) => ops.removeNodes(m, vid, removes, { deleteComponents: true }));
        set({ selectedNodeIds: get().selectedNodeIds.filter((id) => !removes.includes(id)) });
      }
    },

    applyEdgeChanges(changes) {
      let selection = get().selectedEdgeIds;
      const removes: string[] = [];
      for (const ch of changes) {
        if (ch.type === 'select') selection = ch.selected ? Array.from(new Set([...selection, ch.id])) : selection.filter((x) => x !== ch.id);
        else if (ch.type === 'remove') removes.push(ch.id);
      }
      if (selection !== get().selectedEdgeIds) set({ selectedEdgeIds: selection });
      if (removes.length) {
        edit((m, vid) => ops.removeEdges(m, vid, removes, { deleteRelations: true }));
        set({ selectedEdgeIds: get().selectedEdgeIds.filter((id) => !removes.includes(id)) });
      }
    },

    connect(c) {
      if (!c.source || !c.target) return;
      edit((m, vid) => ops.connect(m, vid, c.source, c.target, { sourceHandle: c.sourceHandle, targetHandle: c.targetHandle }, newId).model);
    },

    async save() {
      const { projectId, model, baseRevision, saveState, editSeq } = get();
      if (!projectId || !model || saveState === 'saving' || saveState === 'loading') return;
      set({ saveState: 'saving', saveMessage: null });
      try {
        const res = await saveDraft(projectId, baseRevision, model);
        const changedWhileSaving = get().editSeq !== editSeq;
        set({
          baseRevision: res.revision,
          saveState: changedWhileSaving ? 'dirty' : 'saved',
          saveMessage: res.warnings.length ? `경고 ${res.warnings.length}건` : null,
        });
      } catch (e) {
        if (e instanceof RevisionConflictError) {
          set({ saveState: 'conflict', conflictRevision: e.currentRevision, saveMessage: e.message });
        } else {
          const msg = e instanceof AaApiError && e.code === 'MODEL_TOO_LARGE' ? '설계가 너무 큽니다 (최대 1MB)' : (e as Error).message;
          set({ saveState: 'error', saveMessage: msg });
        }
      }
    },
  };
});
