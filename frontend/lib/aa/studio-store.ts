'use client';

// Architecture Studio 상태 (D-05 Zustand). 도메인 모델이 진실의 원천이다 (02 §3.1, §5).
// 모델 변경은 model-ops를 사용한다. 자동 저장과 수동 저장은 같은 revision 경로를 거친다.
import { create } from 'zustand';
import type { Connection, EdgeChange, NodeChange } from '@xyflow/react';
import type { VersionRef, ArchitectureModel, Requirement, TypeRegistry } from './architecture-types';
import { getAaProject, getDraft, getTypeRegistry, listRequirements, modelByteSize, saveDraft, AaApiError, RevisionConflictError } from './architecture-api';
import { newId } from './ids';
import type { AaFlowNode } from './graph-mapper';
import * as ops from './model-ops';
import { createClient } from '../supabase';
import { createAutosave } from './autosave';
import { readDraftBackup, removeDraftBackup, writeDraftBackup } from './draft-backup';

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
  /** Draft가 마지막으로 발행·복원한 버전 (Sprint 6) */
  baseVersion: VersionRef | null;
  setBaseVersion: (v: VersionRef | null) => void;
  saveState: SaveState;
  saveMessage: string | null;
  conflictRevision: number | null;
  editSeq: number;                 // 편집할 때마다 증가 — 저장 중 추가 편집 감지
  registry: TypeRegistry | null;
  /** 현재 프로젝트의 FR/NFR (Inspector 연결 후보). 조회에 실패해도 Studio는 열린다 */
  requirements: Requirement[];
  requirementsError: string | null;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  pendingDelete: PendingDelete | null;
  loadError: string | null;

  backupMessage: string | null;
  recovery: ReturnType<typeof readDraftBackup>;
  reloading: boolean;
  load: (projectId: string) => Promise<void>;
  leave: () => void;
  recover: () => void;
  discardRecovery: () => void;
  reloadServer: () => Promise<void>;
  overwrite: () => Promise<void>;
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
  updateComponentText: (id: string, field: 'name' | 'technology' | 'description', value: string) => void;
  updateComponentProperty: (id: string, key: string, raw: string) => void;
  updateCustomProperty: (id: string, previous: string | undefined, key: string, value?: string) => void;
  updateRelationField: (id: string, field: 'protocol' | 'mode' | 'label', value: string) => void;
  setRequirementLink: (target: ops.RequirementTarget, id: string, requirementId: string, on: boolean) => void;
  loadRequirements: () => Promise<void>;
  clearSelection: () => void;
  save: () => Promise<void>;

  /** Mermaid 가져오기 적용 중 — 편집·자동 저장을 막는다 */
  importing: boolean;
  /** 가져오기 직후 1단계 되돌리기 (Q5). 다음 모델 편집이 생기면 null */
  importUndo: { model: ArchitectureModel; revision: number; summary: ops.ImportSummary } | null;
  /** 가져오기 적용 (Step 3 ①~⑦). build는 그 시점의 최신 모델로 병합 결과를 만든다 */
  applyImport: (build: (latest: ArchitectureModel) => ImportBuild) => Promise<ImportOutcome>;
  undoImport: () => Promise<ImportOutcome>;
  dismissImportUndo: () => void;
};

export type ImportBuild = { model: ArchitectureModel; summary: ops.ImportSummary } | { error: string; ids?: string[] };
export type ImportOutcome =
  | { status: 'saved'; revision: number; summary?: ops.ImportSummary }
  | { status: 'blocked'; reason: 'save_conflict' | 'save_failed' | 'busy' }
  | { status: 'invalid'; error: string; ids?: string[] }
  | { status: 'conflict'; revision: number | null }
  | { status: 'failed'; message: string; code?: string };

export const IMPORT_MAX_BYTES = 1024 * 1024;
export const IMPORT_MAX_COMPONENTS = 500;

export const useStudio = create<StudioState>((set, get) => {
  const dirtyState = (s: SaveState): SaveState => (s === 'saving' || s === 'conflict' ? s : 'dirty');

  const inFlight = new Map<string, ReturnType<typeof saveDraft>>();
  let session = 0;
  let backupKey: string | null = null;
  let ownedBackup: string | null = null;
  let tab: string | undefined;
  let pausedForAuth = false;
  let retryUsed = false;
  let committedModel: ArchitectureModel | null = null;
  const autosave = createAutosave(() => { void persist(); });

  const clearBackup = (raw = ownedBackup) => {
    if (!backupKey) return;
    try {
      removeDraftBackup(backupKey, raw);
      if (raw === ownedBackup) ownedBackup = null;
    } catch {
      set({ backupMessage: '브라우저 복구본을 정리하지 못했습니다.' });
    }
  };

  const backup = () => {
    const { baseRevision, recovery } = get();
    if (!backupKey || !committedModel || recovery) return;
    try {
      tab ??= crypto.randomUUID();
      const raw = writeDraftBackup(backupKey, {
        model: committedModel, revision: baseRevision, editedAt: autosave.now(), tab,
      });
      if (!raw) {
        clearBackup();
        set({ backupMessage: '민감정보가 포함된 변경은 브라우저에 백업하지 않았습니다.' });
        return;
      }
      ownedBackup = raw;
      set({ backupMessage: null });
    } catch {
      set({ backupMessage: '브라우저에 미저장 변경을 백업하지 못했습니다.' });
    }
  };

  const commitEdit = () => {
    const { editSeq, model, saveState, recovery } = get();
    committedModel = model;
    // 가져오기 되돌리기는 가져온 직후에만 가능하다 (Q5)
    set({ editSeq: editSeq + 1, saveState: dirtyState(saveState), importUndo: null });
    backup();
    if (!pausedForAuth && !recovery && saveState !== 'saving' && saveState !== 'conflict') {
      retryUsed = false;
      autosave.queue();
    }
  };

  async function persist(confirmedRevision?: number) {
    const { projectId, baseRevision, saveState, editSeq, recovery, reloading, importing } = get();
    if (!projectId || !committedModel || recovery || reloading || importing || saveState === 'saving' ||
        saveState === 'loading' || saveState === 'saved' || pausedForAuth ||
        (saveState === 'conflict' && confirmedRevision === undefined)) return;
    const currentSession = session;
    const model = committedModel;
    autosave.stop();
    set({ saveState: 'saving', saveMessage: null });
    const request = saveDraft(projectId, confirmedRevision ?? baseRevision, model);
    inFlight.set(projectId, request);
    try {
      const res = await request;
      if (session !== currentSession) return;
      const edited = get().editSeq !== editSeq;
      retryUsed = false;
      // V9: 서버는 현재 프로젝트에 없는 요구사항 참조를 빼고 저장했다. 로컬 모델에서도 그 참조만 정리한다.
      // 저장 중 편집이 없었다면 정리된 모델이 서버 저장본과 같으므로 다시 저장하지 않는다.
      // 편집이 있었다면 아래 dirty 경로가 정리된 최신 모델을 다시 저장한다.
      const removals = res.warnings.filter((warning) => warning.removedIds?.length);
      const current = get().model;
      if (removals.length && current) {
        const cleaned = ops.removeRequirementRefs(current, removals);
        if (cleaned !== current) {
          committedModel = cleaned;
          set({ model: cleaned });
        }
      }
      set({
        baseRevision: res.revision,
        conflictRevision: null,
        saveState: edited ? 'dirty' : 'saved',
        saveMessage: res.warnings.length ? `경고 ${res.warnings.length}건` : null,
      });
      if (edited) {
        backup();
        autosave.queue();
      } else {
        // 서버에 모두 저장됐으므로 이전 백업 실패 안내는 더 이상 유효하지 않다
        set({ backupMessage: null });
        clearBackup();
      }
    } catch (error) {
      if (session !== currentSession) return;
      if (error instanceof RevisionConflictError) {
        set({ saveState: 'conflict', conflictRevision: error.currentRevision, saveMessage: error.message });
        return;
      }
      const apiError = error instanceof AaApiError ? error : null;
      pausedForAuth = apiError?.status === 401;
      const issues = apiError && Array.isArray(apiError.details) ? apiError.details : [];
      const sensitive = issues.find((issue) => issue?.rule === 'V12' && typeof issue.path === 'string');
      let message = (error as Error).message;
      if (pausedForAuth) message = '다시 로그인한 뒤 저장을 재시도하세요.';
      else if (sensitive) message = `민감정보로 보이는 값이 있어 저장할 수 없습니다. (${sensitive.path})`;
      else if (apiError?.code === 'MODEL_TOO_LARGE') message = '설계가 너무 큽니다 (최대 1MB)';
      if (sensitive) clearBackup();
      // A failed confirmed overwrite must stay in conflict. A manual retry requires confirmation again.
      set({ saveState: confirmedRevision === undefined ? 'error' : 'conflict', saveMessage: message });
      if (confirmedRevision === undefined && !retryUsed && apiError && (apiError.status === 0 || apiError.status >= 500)) {
        retryUsed = true;
        autosave.queue(5000);
      }
    } finally {
      if (inFlight.get(projectId) === request) inFlight.delete(projectId);
    }
  }

  // 모델을 바꾸는 공통 경로: model-ops가 새 모델을 돌려준다. 같은 객체면 변경 없음 → dirty 아님
  const edit = (fn: (m: ArchitectureModel, viewId: string) => ArchitectureModel) => {
    const { model, viewId, recovery, reloading, importing } = get();
    if (!model || recovery || reloading || importing) return false;
    const next = fn(model, viewId);
    if (next === model) return false;
    set({ model: next });
    commitEdit();
    return true;
  };

  // 드래그·크기 조절 중에는 화면에만 반영하고 편집으로 세지 않는다. 끝났을 때 그동안 바뀌었는지로 dirty를 정한다
  let changedDuringGesture = false;
  const preview = (fn: (m: ArchitectureModel, viewId: string) => ArchitectureModel) => {
    const { model, viewId, recovery, reloading, importing } = get();
    if (!model || recovery || reloading || importing) return;
    const next = fn(model, viewId);
    if (next !== model) { changedDuringGesture = true; set({ model: next }); }
  };
  const commitGesture = (fn: (m: ArchitectureModel, viewId: string) => ArchitectureModel) => {
    const changed = edit(fn);
    if (!changed && changedDuringGesture && !get().reloading && !get().recovery) commitEdit();
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
    baseVersion: null,
    setBaseVersion(v) { set({ baseVersion: v }); },
    saveState: 'loading',
    saveMessage: null,
    conflictRevision: null,
    editSeq: 0,
    registry: null,
    requirements: [],
    requirementsError: null,
    importing: false,
    importUndo: null,
    selectedNodeIds: [],
    selectedEdgeIds: [],
    pendingDelete: null,
    loadError: null,

    backupMessage: null,
    recovery: null,
    reloading: false,

    leave() {
      session++;
      autosave.stop();
    },

    async load(projectId) {
      get().leave();
      const currentSession = session;
      changedDuringGesture = false;
      pausedForAuth = false;
      retryUsed = false;
      backupKey = null;
      ownedBackup = null;
      committedModel = null;
      set({
        projectId, saveState: 'loading', loadError: null, model: null,
        selectedNodeIds: [], selectedEdgeIds: [], pendingDelete: null,
        conflictRevision: null, saveMessage: null, backupMessage: null, recovery: null, reloading: false,
        requirements: [], requirementsError: null, importing: false, importUndo: null,
      });
      try {
        await inFlight.get(projectId)?.catch(() => undefined);
        if (session !== currentSession) return;
        const auth = createClient().auth;
        const initial = await auth.getSession();
        const [project, draft, registry] = await Promise.all([
          getAaProject(projectId), getDraft(projectId), getTypeRegistry(),
        ]);
        const current = await auth.getSession();
        if (session !== currentSession) return;
        const userId = initial.data.session?.user.id;
        backupKey = userId && userId === current.data.session?.user.id ? `aa:draft:${userId}:${projectId}` : null;
        let recovery = null;
        let backupMessage = null;
        try {
          if (backupKey) recovery = readDraftBackup(backupKey, draft.revision, draft.updatedAt);
        } catch {
          backupMessage = '브라우저 복구본을 읽지 못했습니다.';
        }
        committedModel = draft.model;
        set({
          projectName: project.name, model: draft.model, baseRevision: draft.revision, baseVersion: draft.baseVersion,
          registry, saveState: 'saved', editSeq: 0, recovery, backupMessage,
        });
        void get().loadRequirements();
      } catch (error) {
        if (session !== currentSession) return;
        const message = error instanceof AaApiError && error.code === 'NOT_FOUND'
          ? '프로젝트를 찾을 수 없습니다.' : (error as Error).message;
        set({ loadError: message, saveState: 'error' });
      }
    },

    recover() {
      const { recovery, baseRevision } = get();
      if (!recovery) return;
      ownedBackup = recovery.raw;
      const older = recovery.value.revision < baseRevision;
      set({
        model: recovery.value.model,
        recovery: null,
        saveState: older ? 'conflict' : 'dirty',
        conflictRevision: older ? baseRevision : null,
      });
      commitEdit();
    },

    discardRecovery() {
      const { recovery } = get();
      if (!recovery) return;
      clearBackup(recovery.raw);
      set({ recovery: null });
    },

    async reloadServer() {
      const { projectId, saveState, reloading } = get();
      if (!projectId || saveState !== 'conflict' || reloading) return;
      const currentSession = session;
      set({ reloading: true, saveMessage: null });
      try {
        const draft = await getDraft(projectId);
        if (session !== currentSession) return;
        clearBackup();
        committedModel = draft.model;
        changedDuringGesture = false;
        pausedForAuth = false;
        set({
          model: draft.model, baseRevision: draft.revision, baseVersion: draft.baseVersion, saveState: 'saved',
          conflictRevision: null, reloading: false, selectedNodeIds: [], selectedEdgeIds: [],
          pendingDelete: null, editSeq: 0,
        });
      } catch (error) {
        if (session !== currentSession) return;
        set({ reloading: false, saveMessage: (error as Error).message });
      }
    },

    async overwrite() {
      const { conflictRevision, saveState } = get();
      if (saveState !== 'conflict' || !Number.isInteger(conflictRevision)) return;
      pausedForAuth = false;
      await persist(conflictRevision);
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

    updateComponentText(id, field, value) {
      edit((m) => ops.updateComponentText(m, id, field, value));
    },

    updateComponentProperty(id, key, raw) {
      edit((m) => ops.updateComponentProperty(m, get().registry, id, key, raw));
    },

    updateCustomProperty(id, previous, key, value) {
      edit((m) => ops.updateCustomProperty(m, get().registry, id, previous, key, value));
    },

    updateRelationField(id, field, value) {
      edit((m) => ops.updateRelationField(m, id, field, value));
    },

    setRequirementLink(target, id, requirementId, on) {
      edit((m) => ops.setRequirementLink(m, target, id, requirementId, on));
    },

    async loadRequirements() {
      const { projectId } = get();
      if (!projectId) return;
      const currentSession = session;
      try {
        // 요구사항 API 한 페이지 최대치(200건)만 후보로 쓴다
        const res = await listRequirements(projectId, { limit: 200 });
        if (session !== currentSession) return;
        set({ requirements: res.data, requirementsError: null });
      } catch (error) {
        if (session !== currentSession) return;
        set({ requirementsError: (error as Error).message });
      }
    },

    clearSelection() {
      set({ selectedNodeIds: [], selectedEdgeIds: [] });
    },

    async save() {
      if (get().saveState === 'saving') return;
      pausedForAuth = false;
      retryUsed = false;
      await persist();
    },

    // ── Mermaid 가져오기 (Sprint 4 Step 3, 실행계획 "적용 순서" ①~⑦) ──
    // ①(Inspector 대기 입력 반영)은 호출하는 화면에서 먼저 한다.
    async applyImport(build) {
      const outcome = await saveWholeModel((latest) => build(latest), true);
      return outcome;
    },

    async undoImport() {
      const undo = get().importUndo;
      if (!undo) return { status: 'invalid', error: 'no_undo' };
      return saveWholeModel(() => ({ model: undo.model, summary: undo.summary }), false);
    },

    dismissImportUndo() {
      set({ importUndo: null });
    },
  };

  // 가져오기 적용·되돌리기 공통 저장. Draft PUT은 많아야 1회다.
  async function saveWholeModel(build: (latest: ArchitectureModel) => ImportBuild, isImport: boolean): Promise<ImportOutcome> {
    const { projectId, importing, recovery, reloading } = get();
    if (!projectId || importing || recovery || reloading) return { status: 'blocked', reason: 'busy' };
    const currentSession = session;
    // ② 자동 저장 예약 중지, 이후 편집·자동 저장 차단
    autosave.stop();
    set({ importing: true });
    try {
      // ③ 진행 중 저장이 끝날 때까지 기다린다. 그 저장이 충돌·실패로 끝나면 가져오기 PUT 없이 멈춘다
      await inFlight.get(projectId)?.catch(() => undefined);
      if (session !== currentSession) return { status: 'blocked', reason: 'busy' };
      const state = get();
      if (state.saveState === 'conflict') return { status: 'blocked', reason: 'save_conflict' };
      if (state.saveState === 'error') return { status: 'blocked', reason: 'save_failed' };
      if (!state.model || state.saveState === 'loading' || state.saveState === 'saving') return { status: 'blocked', reason: 'busy' };

      // ④ 그 시점의 최신 모델(미저장 편집 포함)로 병합
      const latest = state.model;
      const built = build(latest);
      if ('error' in built) return { status: 'invalid', error: built.error, ids: built.ids };
      // ⑤ 저장 한도를 먼저 확인 (서버 V1~V12와 revision 검사는 PUT에서)
      if (modelByteSize(built.model) > IMPORT_MAX_BYTES) return { status: 'invalid', error: 'too_large' };
      if (Object.keys(built.model.components).length > IMPORT_MAX_COMPONENTS) return { status: 'invalid', error: 'too_many_components' };

      // ⑥ 저장 PUT 1회
      set({ saveMessage: null });
      const request = saveDraft(projectId, state.baseRevision, built.model);
      inFlight.set(projectId, request);
      try {
        const res = await request;
        if (session !== currentSession) return { status: 'blocked', reason: 'busy' };
        // ⑦ 성공: 모델·revision 반영, 되돌리기 정보 기록 (되돌리기 자체는 다시 되돌릴 수 없다)
        committedModel = built.model;
        clearBackup();
        set({
          model: built.model, baseRevision: res.revision, saveState: 'saved', conflictRevision: null,
          saveMessage: res.warnings.length ? `경고 ${res.warnings.length}건` : null,
          importUndo: isImport ? { model: latest, revision: res.revision, summary: built.summary } : null,
          selectedNodeIds: [], selectedEdgeIds: [],
        });
        return { status: 'saved', revision: res.revision, summary: built.summary };
      } catch (error) {
        if (session !== currentSession) return { status: 'blocked', reason: 'busy' };
        if (error instanceof RevisionConflictError) {
          // 로컬 모델(미저장 편집 포함)은 그대로 두고 Sprint 3 충돌 절차로 넘긴다. 가져오기 결과는 적용하지 않았다
          set({ saveState: 'conflict', conflictRevision: error.currentRevision, saveMessage: error.message, importUndo: null });
          return { status: 'conflict', revision: error.currentRevision };
        }
        const apiError = error instanceof AaApiError ? error : null;
        if (apiError?.status === 401) pausedForAuth = true;
        return { status: 'failed', message: (error as Error).message, code: apiError?.code };
      } finally {
        if (inFlight.get(projectId) === request) inFlight.delete(projectId);
      }
    } finally {
      if (session === currentSession) {
        set({ importing: false });
        // 가져오기를 멈췄을 때 남아 있던 미저장 편집은 평소처럼 자동 저장한다
        if (get().saveState === 'dirty' && !pausedForAuth) autosave.queue();
      }
    }
  }
});

// 개발 중 브라우저 확인용 (운영 빌드에는 노출하지 않음)
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  (window as unknown as { __aaStudio?: typeof useStudio }).__aaStudio = useStudio;
}
