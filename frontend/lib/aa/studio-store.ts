'use client';

// Architecture Studio 상태 (D-05 Zustand). 도메인 모델이 진실의 원천이다 (02 §3.1, §5).
// 모델 변경은 전부 model-ops 순수 함수로 한다. 저장은 수동(버튼·Ctrl+S) — 2초 자동 저장과 충돌 모달은 Sprint 3.
import { create } from 'zustand';
import type { Connection, EdgeChange, NodeChange } from '@xyflow/react';
import type { ArchitectureModel, TypeRegistry } from './architecture-types';
import { getAaProject, getDraft, getTypeRegistry, saveDraft, AaApiError, RevisionConflictError } from './architecture-api';
import { newId } from './ids';
import type { AaFlowNode } from './graph-mapper';
import * as ops from './model-ops';

export type SaveState = 'loading' | 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';
type Point = { x: number; y: number };

/** 확인이 필요한 삭제 (컴포넌트가 포함된 경우). 그룹·노트·엣지만이면 바로 삭제한다 */
export type PendingDelete = { nodeIds: string[]; edgeIds: string[]; componentCount: number; relationCount: number };

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
  pendingDelete: PendingDelete | null;
  loadError: string | null;

  load: (projectId: string) => Promise<void>;
  addComponent: (type: string, position: Point) => void;
  addGroup: (position: Point) => void;
  addNote: (position: Point) => void;
  applyNodeChanges: (changes: NodeChange<AaFlowNode>[]) => void;
  applyEdgeChanges: (changes: EdgeChange[]) => void;
  connect: (c: Connection) => void;
  /** 드래그가 끝난 노드의 중심(캔버스 절대 좌표)이 그룹 안이면 그 그룹으로, 밖이면 해제 */
  reparentAt: (nodeId: string, center: Point) => void;
  /** 삭제의 유일한 입구 — 키보드·버튼·React Flow 이벤트 모두 여기로 */
  requestDelete: (nodeIds?: string[], edgeIds?: string[]) => void;
  confirmDelete: (mode: 'nodes' | 'components') => void;
  cancelDelete: () => void;
  duplicateSelection: () => void;
  updateNoteText: (nodeId: string, text: string) => void;
  updateGroupLabel: (nodeId: string, label: string) => void;
  clearSelection: () => void;
  save: () => Promise<void>;
};

export const useStudio = create<StudioState>((set, get) => {
  const dirtyState = (s: SaveState): SaveState => (s === 'saving' || s === 'conflict' ? s : 'dirty');

  // 모델을 바꾸는 공통 경로: model-ops가 새 모델을 돌려준다. 같은 객체면 변경 없음 → dirty 아님
  const edit = (fn: (m: ArchitectureModel, viewId: string) => ArchitectureModel) => {
    const { model, saveState, viewId } = get();
    if (!model) return false;
    const next = fn(model, viewId);
    if (next === model) return false;
    set({ model: next, editSeq: get().editSeq + 1, saveState: dirtyState(saveState) });
    return true;
  };

  // 드래그·크기 조절 중에는 화면에만 반영하고 편집으로 세지 않는다. 끝났을 때 그동안 바뀌었는지로 dirty를 정한다
  let changedDuringGesture = false;
  const preview = (fn: (m: ArchitectureModel, viewId: string) => ArchitectureModel) => {
    const { model, viewId } = get();
    if (!model) return;
    const next = fn(model, viewId);
    if (next !== model) { changedDuringGesture = true; set({ model: next }); }
  };
  const commitGesture = (fn: (m: ArchitectureModel, viewId: string) => ArchitectureModel) => {
    const changed = edit(fn);
    if (!changed && changedDuringGesture) set({ editSeq: get().editSeq + 1, saveState: dirtyState(get().saveState) });
    changedDuringGesture = false;
  };

  const runDelete = (nodeIds: string[], edgeIds: string[], deleteComponents: boolean) => {
    edit((m, vid) => {
      let next = edgeIds.length ? ops.removeEdges(m, vid, edgeIds, { deleteRelations: true }) : m;
      if (nodeIds.length) next = ops.removeNodes(next, vid, nodeIds, { deleteComponents });
      return next;
    });
    set({
      pendingDelete: null,
      selectedNodeIds: get().selectedNodeIds.filter((id) => !nodeIds.includes(id)),
      selectedEdgeIds: get().selectedEdgeIds.filter((id) => !edgeIds.includes(id)),
    });
  };

  const addNode = (fn: (m: ArchitectureModel, viewId: string) => { model: ArchitectureModel; nodeId: string | null }) => {
    let nodeId: string | null = null;
    edit((m, vid) => { const r = fn(m, vid); nodeId = r.nodeId; return r.model; });
    if (nodeId) set({ selectedNodeIds: [nodeId], selectedEdgeIds: [] });
    return nodeId as string | null;
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
    pendingDelete: null,
    loadError: null,

    async load(projectId) {
      changedDuringGesture = false;
      set({ projectId, saveState: 'loading', loadError: null, model: null, selectedNodeIds: [], selectedEdgeIds: [], pendingDelete: null, conflictRevision: null, saveMessage: null });
      try {
        const [project, draft, registry] = await Promise.all([getAaProject(projectId), getDraft(projectId), getTypeRegistry()]);
        set({ projectName: project.name, model: draft.model, baseRevision: draft.revision, registry, saveState: 'saved', editSeq: 0 });
      } catch (e) {
        const msg = e instanceof AaApiError && e.code === 'NOT_FOUND' ? '프로젝트를 찾을 수 없습니다.' : (e as Error).message;
        set({ loadError: msg, saveState: 'error' });
      }
    },

    addComponent(type, position) {
      const nodeId = addNode((m, vid) => ops.addComponent(m, vid, type, get().registry, position, newId));
      // 그룹 위에 놓았으면 그 그룹의 자식으로
      if (nodeId) {
        const { model, viewId } = get();
        const g = model && ops.findDropGroup(model, viewId, position, nodeId);
        if (g) edit((m, vid) => ops.setParent(m, vid, nodeId, g));
      }
    },

    addGroup(position) {
      addNode((m, vid) => ops.addGroup(m, vid, position, ops.GROUP_DEFAULT_SIZE, newId));
    },

    addNote(position) {
      const nodeId = addNode((m, vid) => ops.addNote(m, vid, position, '메모', newId));
      if (nodeId) {
        const { model, viewId } = get();
        const g = model && ops.findDropGroup(model, viewId, position, nodeId);
        if (g) edit((m, vid) => ops.setParent(m, vid, nodeId, g));
      }
    },

    applyNodeChanges(changes) {
      let selection = get().selectedNodeIds;
      const moves: { id: string; x: number; y: number }[] = [];
      const resizes: { id: string; width: number; height: number }[] = [];
      const removes: string[] = [];
      let final = false;   // 드래그·크기 조절 종료 (React Flow 12는 종료 이벤트에 position을 안 보낼 수 있음)
      for (const ch of changes) {
        if (ch.type === 'select') {
          selection = ch.selected ? Array.from(new Set([...selection, ch.id])) : selection.filter((x) => x !== ch.id);
        } else if (ch.type === 'position') {
          if (ch.position) moves.push({ id: ch.id, x: ch.position.x, y: ch.position.y });
          if (ch.dragging === false) final = true;
        } else if (ch.type === 'dimensions') {
          // NodeResizer만 resizing을 보낸다. 측정(measure)용 dimensions 변경은 무시
          if (ch.resizing === undefined) continue;
          if (ch.dimensions) resizes.push({ id: ch.id, width: ch.dimensions.width, height: ch.dimensions.height });
          if (ch.resizing === false) final = true;
        } else if (ch.type === 'remove') {
          removes.push(ch.id);
        }
      }
      if (selection !== get().selectedNodeIds) set({ selectedNodeIds: selection });

      if (moves.length || resizes.length || final) {
        const apply = (m: ArchitectureModel, vid: string) => {
          let next = ops.moveNodes(m, vid, moves);
          for (const r of resizes) next = ops.resizeGroup(next, vid, r.id, r);
          return next;
        };
        if (final) commitGesture(apply); else preview(apply);
      }
      if (removes.length) get().requestDelete(removes, []);
    },

    applyEdgeChanges(changes) {
      let selection = get().selectedEdgeIds;
      const removes: string[] = [];
      for (const ch of changes) {
        if (ch.type === 'select') selection = ch.selected ? Array.from(new Set([...selection, ch.id])) : selection.filter((x) => x !== ch.id);
        else if (ch.type === 'remove') removes.push(ch.id);
      }
      if (selection !== get().selectedEdgeIds) set({ selectedEdgeIds: selection });
      if (removes.length) get().requestDelete([], removes);
    },

    connect(c) {
      if (!c.source || !c.target) return;
      edit((m, vid) => ops.connect(m, vid, c.source, c.target, { sourceHandle: c.sourceHandle, targetHandle: c.targetHandle }, newId).model);
    },

    reparentAt(nodeId, center) {
      const { model, viewId } = get();
      if (!model) return;
      const target = ops.findDropGroup(model, viewId, center, nodeId);
      edit((m, vid) => ops.setParent(m, vid, nodeId, target));
    },

    requestDelete(nodeIds, edgeIds) {
      const { model, viewId, selectedNodeIds, selectedEdgeIds } = get();
      if (!model) return;
      const n = nodeIds ?? selectedNodeIds;
      const e = edgeIds ?? selectedEdgeIds;
      if (!n.length && !e.length) return;
      const summary = ops.deleteSummary(model, viewId, n);
      if (summary.needsConfirm) {
        set({ pendingDelete: { nodeIds: n, edgeIds: e, componentCount: summary.componentCount, relationCount: summary.relationCount } });
      } else {
        runDelete(n, e, true);   // 그룹·노트·엣지만 — 컴포넌트가 없으므로 deleteComponents는 의미 없음
      }
    },

    confirmDelete(mode) {
      const p = get().pendingDelete;
      if (!p) return;
      runDelete(p.nodeIds, p.edgeIds, mode === 'components');
    },

    cancelDelete() {
      set({ pendingDelete: null });
    },

    duplicateSelection() {
      const ids = get().selectedNodeIds;
      if (!ids.length) return;
      let created: string[] = [];
      edit((m, vid) => { const r = ops.duplicateNodes(m, vid, ids, newId); created = r.newNodeIds; return r.model; });
      if (created.length) {
        // 복제한 최상위 노드만 선택 (하위는 같이 움직인다)
        const { model, viewId } = get();
        const v = model ? ops.getView(model, viewId) : undefined;
        const set_ = new Set(created);
        const roots = created.filter((id) => { const p = v?.nodes.find((x) => x.id === id)?.parentId; return !p || !set_.has(p); });
        set({ selectedNodeIds: roots, selectedEdgeIds: [] });
      }
    },

    updateNoteText(nodeId, text) {
      edit((m, vid) => ops.updateNoteText(m, vid, nodeId, text));
    },

    updateGroupLabel(nodeId, label) {
      edit((m, vid) => ops.updateGroupLabel(m, vid, nodeId, label));
    },

    clearSelection() {
      set({ selectedNodeIds: [], selectedEdgeIds: [] });
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

// 개발 중 브라우저 확인용 (운영 빌드에는 노출하지 않음)
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  (window as unknown as { __aaStudio?: typeof useStudio }).__aaStudio = useStudio;
}
