'use client';

// Architecture Studio 상태 (D-05 Zustand). 도메인 모델이 진실의 원천이다 (02 §3.1, §5).
// Sprint 1: 수동 저장(버튼·Ctrl+S). 2초 자동 저장과 충돌 모달은 Sprint 3.
import { create } from 'zustand';
import type { Connection, EdgeChange, NodeChange } from '@xyflow/react';
import type { ArchitectureModel, Component, TypeRegistry } from './architecture-types';
import { getAaProject, getDraft, getTypeRegistry, saveDraft, AaApiError, RevisionConflictError } from './architecture-api';
import { newId } from './ids';
import type { AaFlowNode } from './graph-mapper';

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

const clone = <T,>(v: T): T => structuredClone(v);

export const useStudio = create<StudioState>((set, get) => {
  // 모델을 바꾸는 공통 경로: 복제 → 수정 → dirty 표시
  const edit = (fn: (m: ArchitectureModel) => void) => {
    const { model, saveState } = get();
    if (!model) return;
    const next = clone(model);
    fn(next);
    set({
      model: next,
      editSeq: get().editSeq + 1,
      saveState: saveState === 'saving' || saveState === 'conflict' ? saveState : 'dirty',
    });
  };

  const view = (m: ArchitectureModel) => m.views.find((v) => v.id === get().viewId);

  // 노드 제거: 컴포넌트의 마지막 노드면 컴포넌트와 연결된 관계·엣지까지 제거 (04 §6.8 — 확인 다이얼로그는 Sprint 2)
  const removeNodes = (m: ArchitectureModel, nodeIds: string[]) => {
    const v = view(m);
    if (!v) return;
    const removed = v.nodes.filter((n) => nodeIds.includes(n.id));
    v.nodes = v.nodes.filter((n) => !nodeIds.includes(n.id));
    for (const n of removed) {
      if (!n.componentId) continue;
      const stillShown = m.views.some((vv) => vv.nodes.some((x) => x.componentId === n.componentId));
      if (stillShown) continue;
      delete m.components[n.componentId];
      for (const [rid, r] of Object.entries(m.relations)) {
        if (r.from === n.componentId || r.to === n.componentId) {
          delete m.relations[rid];
          for (const vv of m.views) vv.edges = vv.edges.filter((e) => e.relationId !== rid);
        }
      }
    }
    // 이 View에서 끝 노드가 사라진 엣지 정리
    const shown = new Set(v.nodes.map((n) => n.componentId));
    v.edges = v.edges.filter((e) => {
      const r = m.relations[e.relationId];
      return r && shown.has(r.from) && shown.has(r.to);
    });
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
      const reg = get().registry?.types[type];
      edit((m) => {
        const v = view(m);
        if (!v) return;
        const label = reg?.label ?? type;
        const count = Object.values(m.components).filter((c) => c.type === type).length + 1;
        const id = newId('cmp');
        const component: Component = {
          id, type, layer: reg?.layer ?? 'logical', name: `${label} ${count}`,
          properties: {}, requirementIds: [], decisionIds: [],
        };
        m.components[id] = component;
        const nodeId = newId('nd');
        v.nodes.push({ id: nodeId, kind: 'component', componentId: id, position: { x: Math.round(position.x), y: Math.round(position.y) } });
        set({ selectedNodeIds: [nodeId], selectedEdgeIds: [] });
      });
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
        const model = get().model;
        if (!model) return;
        const apply = (m: ArchitectureModel) => {
          const v = view(m);
          if (!v) return;
          for (const mv of moves) {
            const n = v.nodes.find((x) => x.id === mv.id);
            if (n) n.position = { x: Math.round(mv.x), y: Math.round(mv.y) };
          }
        };
        if (final) edit(apply);
        else { const next = clone(model); apply(next); set({ model: next }); }
      }
      if (removes.length) {
        edit((m) => removeNodes(m, removes));
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
        edit((m) => {
          const v = view(m);
          if (!v) return;
          const gone = v.edges.filter((e) => removes.includes(e.id));
          v.edges = v.edges.filter((e) => !removes.includes(e.id));
          for (const e of gone) {
            const usedElsewhere = m.views.some((vv) => vv.edges.some((x) => x.relationId === e.relationId));
            if (!usedElsewhere) delete m.relations[e.relationId];
          }
        });
        set({ selectedEdgeIds: get().selectedEdgeIds.filter((id) => !removes.includes(id)) });
      }
    },

    connect(c) {
      if (!c.source || !c.target || c.source === c.target) return;
      edit((m) => {
        const v = view(m);
        if (!v) return;
        const from = v.nodes.find((n) => n.id === c.source)?.componentId;
        const to = v.nodes.find((n) => n.id === c.target)?.componentId;
        if (!from || !to) return;
        // 같은 from/to calls 관계가 있으면 재사용 (02 §6.2)
        let rel = Object.values(m.relations).find((r) => r.type === 'calls' && r.from === from && r.to === to);
        if (!rel) {
          rel = { id: newId('rel'), type: 'calls', from, to, protocol: 'HTTP', mode: 'sync', requirementIds: [] };
          m.relations[rel.id] = rel;
        }
        if (!v.edges.some((e) => e.relationId === rel!.id)) {
          v.edges.push({ id: newId('ed'), relationId: rel.id, sourceHandle: c.sourceHandle ?? undefined, targetHandle: c.targetHandle ?? undefined });
        }
      });
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
