'use client';

// SCR-06 Architecture Studio: Toolbar + Palette + React Flow Canvas + PropertyInspector
import '@xyflow/react/dist/style.css';   // D-03: React Flow 기본 CSS만 inline 규칙의 예외
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, useReactFlow, type Node } from '@xyflow/react';
import { useStudio, type SaveState } from '@/lib/aa/studio-store';
import { toFlow } from '@/lib/aa/graph-mapper';
import { shouldWarnOnLeave } from '@/lib/aa/autosave';
import { modelByteSize } from '@/lib/aa/architecture-api';
import ComponentNode from './ComponentNode';
import GroupNode from './GroupNode';
import NoteNode from './NoteNode';
import RelationEdge from './RelationEdge';
import PropertyInspector from './PropertyInspector';
import ImportMermaidModal from './ImportMermaidModal';
import AskAiModal from '../AskAiModal';
import PasteAnswerModal from '../PasteAnswerModal';
import type { ArchitectureModel } from '@/lib/aa/architecture-types';

/** 현재 View에서 선택한 노드 중 컴포넌트 노드의 componentId (Ask AI 범위) */
function selectedComponentIds(model: ArchitectureModel | null, viewId: string, nodeIds: string[]): string[] {
  const view = model?.views.find((v) => v.id === viewId);
  if (!view || !nodeIds.length) return [];
  const picked = new Set(nodeIds);
  return [...new Set(view.nodes.filter((n) => picked.has(n.id) && n.kind === 'component' && n.componentId).map((n) => n.componentId!))];
}
import type { InspectorEdits } from './SchemaForm';
import { CATEGORY_COLOR, DND_MIME, paletteItems, type PaletteItem } from './palette-meta';

// React Flow가 렌더마다 새로 만들지 않도록 컴포넌트 밖에 둔다
const nodeTypes = { component: ComponentNode, group: GroupNode, note: NoteNode };
const edgeTypes = { relation: RelationEdge };
const MODEL_WARN_BYTES = 900 * 1024;
const CATEGORY_ORDER = ['application', 'data', 'general'];
// 새 노드를 놓을 때 커서가 노드 가운데쯤 오도록 (컴포넌트 168×56, 그룹 360×240, 노트 200×64)
const DROP_OFFSET: Record<string, { x: number; y: number }> = { component: { x: 84, y: 28 }, group: { x: 180, y: 120 }, note: { x: 100, y: 32 } };

const SAVE_LABEL: Record<SaveState, { text: string; color: string }> = {
  loading: { text: '불러오는 중', color: 'rgba(255,255,255,0.4)' },
  saved: { text: '저장됨', color: '#3ecf8e' },
  dirty: { text: '변경사항 있음', color: 'rgba(255,255,255,0.55)' },
  saving: { text: '저장 중…', color: '#c8a96e' },
  error: { text: '저장 실패', color: '#e5484d' },
  conflict: { text: '충돌', color: '#f5a524' },
};

const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

function createInspectorEdits(): InspectorEdits & { clear: () => void; hasPending: () => boolean } {
  const pending = new Map<string, { apply: () => void; timer: ReturnType<typeof setTimeout> }>();
  const take = (id: string) => {
    const entry = pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(id);
    return entry.apply;
  };
  return {
    queue(id, apply) {
      take(id);
      if (apply) pending.set(id, { apply, timer: setTimeout(() => take(id)?.(), 300) });
    },
    flush(id) {
      if (id !== undefined) take(id)?.();
      else for (const key of Array.from(pending.keys())) take(key)?.();
    },
    clear() {
      for (const key of pending.keys()) take(key);
    },
    hasPending: () => pending.size > 0,
  };
}

export default function ArchitectureStudio({ projectId }: { projectId: string }) {
  return (
    <ReactFlowProvider>
      <Studio projectId={projectId} />
    </ReactFlowProvider>
  );
}

function Studio({ projectId }: { projectId: string }) {
  const router = useRouter();
  const s = useStudio();
  const { screenToFlowPosition, getInternalNode, fitView } = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);   // 하단 토스트 (가져오기·리뷰 저장 안내)
  const [modal, setModal] = useState<null | 'askai' | 'paste'>(null);

  const edits = useMemo(() => createInspectorEdits(), [projectId]);
  useEffect(() => {
    useStudio.getState().load(projectId);
    return () => {
      edits.flush();
      edits.clear();
      useStudio.getState().leave();
    };
  }, [projectId, edits]);
  useEffect(() => { edits.flush(); }, [s.selectedNodeIds, s.selectedEdgeIds, edits]);

  const saveWithInspector = useCallback(() => {
    edits.flush();
    const current = useStudio.getState();
    if (current.saveState !== 'conflict') void current.save();
  }, [edits]);

  // 단축키 (04 §6.10). 입력 중(note·그룹 라벨·검색)에는 Ctrl+S 말고는 무시
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStudio.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveWithInspector(); return; }
      if (st.pendingDelete) { if (e.key === 'Escape') st.cancelDelete(); return; }
      if (isEditable(e.target)) return;
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); st.duplicateSelection(); return; }
      if (mod || e.altKey) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); st.requestDelete(); }
      else if (e.key === 'Escape') st.clearSelection();
      else if (e.key === 'f' || e.key === 'F') fitView({ maxZoom: 1, duration: 200 });
      else if (e.key === '[') setPaletteOpen((v) => !v);
      else if (e.key === ']') setInspectorOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fitView, saveWithInspector]);

  // 저장 안 한 변경이 있으면 이탈 경고
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      const st = useStudio.getState();
      if (shouldWarnOnLeave(st.saveState, Boolean(st.model), edits.hasPending())) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [edits]);

  const view = s.model?.views.find((v) => v.id === s.viewId);
  const selected = useMemo(() => new Set(s.selectedNodeIds), [s.selectedNodeIds]);
  const flow = useMemo(() => (s.model ? toFlow(s.model, s.viewId, selected) : { nodes: [], edges: [] }), [s.model, s.viewId, selected]);
  const edges = useMemo(() => flow.edges.map((e) => ({ ...e, selected: s.selectedEdgeIds.includes(e.id) })), [flow.edges, s.selectedEdgeIds]);
  const bytes = useMemo(() => (s.model ? modelByteSize(s.model) : 0), [s.model]);
  const items = useMemo(() => paletteItems(s.registry, view?.kind ?? 'logical', query), [s.registry, view?.kind, query]);

  const addItem = useCallback((item: PaletteItem, pos: { x: number; y: number }) => {
    if (item.nodeKind === 'group') s.addGroup(pos);
    else if (item.nodeKind === 'note') s.addNote(pos);
    else s.addComponent(item.type, pos);
  }, [s]);

  const addAtCenter = useCallback((item: PaletteItem) => {
    const r = canvasRef.current?.getBoundingClientRect();
    const off = DROP_OFFSET[item.nodeKind] ?? DROP_OFFSET.component;
    const pos = r ? screenToFlowPosition({ x: r.left + r.width / 2 - off.x, y: r.top + r.height / 2 - off.y }) : { x: 0, y: 0 };
    addItem(item, pos);
  }, [addItem, screenToFlowPosition]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData(DND_MIME);
    const item = paletteItems(useStudio.getState().registry, view?.kind ?? 'logical').find((i) => i.type === type);
    if (!item) return;
    const off = DROP_OFFSET[item.nodeKind] ?? DROP_OFFSET.component;
    addItem(item, screenToFlowPosition({ x: e.clientX - off.x, y: e.clientY - off.y }));
  }, [addItem, screenToFlowPosition, view?.kind]);

  // 드래그 종료: 노드 중심이 그룹 안이면 그 그룹으로, 밖이면 그룹에서 뺀다 (같이 끌린 부모가 있으면 부모만 판단)
  const onNodeDragStop = useCallback((_: unknown, _node: Node, dragged: Node[]) => {
    const ids = new Set(dragged.map((n) => n.id));
    for (const n of dragged) {
      if (n.parentId && ids.has(n.parentId)) continue;
      const internal = getInternalNode(n.id);
      if (!internal) continue;
      const w = internal.measured.width ?? 0, h = internal.measured.height ?? 0;
      const p = internal.internals.positionAbsolute;
      useStudio.getState().reparentAt(n.id, { x: p.x + w / 2, y: p.y + h / 2 });
    }
  }, [getInternalNode]);

  if (s.loadError) {
    return (
      <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: '#080809', color: 'rgba(255,255,255,0.7)' }}>
        <div style={{ textAlign: 'center' }}>
          <div role="alert" style={{ marginBottom: 12 }}>{s.loadError}</div>
          <button onClick={() => router.push('/aa/projects')} style={btn()}>목록으로</button>
        </div>
      </div>
    );
  }

  const label = SAVE_LABEL[s.saveState];

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#080809', color: 'rgba(255,255,255,0.9)', fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: 13 }}>
      {/* Toolbar */}
      <div style={{ height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#0a0a0c' }}>
        <button onClick={() => router.push('/aa/projects')} title="프로젝트 목록" style={btn(true)}>◀</button>
        <button onClick={() => setPaletteOpen((v) => !v)} title="팔레트 접기·펴기 ([)" style={btn(true)}>☰</button>
        <b style={{ fontSize: 13.5 }}>{s.projectName || '…'}</b>
        <button onClick={() => router.push(`/aa/projects/${projectId}`)} style={btn()}>
          개요
        </button>
        <button onClick={() => router.push(`/aa/projects/${projectId}/requirements`)} style={btn()}>
          요구사항
        </button>
        <button onClick={() => { edits.flush(); setImportNotice(null); setImportOpen(true); }} style={btn()} data-testid="aa-import-open"
          disabled={!s.model || Boolean(s.recovery) || s.saveState === 'loading'} title="Mermaid flowchart를 붙여 넣어 노드·관계 만들기">
          가져오기
        </button>
        <button onClick={() => { edits.flush(); setModal('askai'); }} style={btn()} data-testid="aa-askai-open"
          disabled={!s.model || s.saveState === 'loading'} title="외부 AI에 붙여넣을 검토 자료 · Mermaid 내보내기">
          ⤓ 내보내기
        </button>
        <button onClick={() => setModal('paste')} style={btn()} data-testid="aa-paste-open" title="외부 AI 답변을 리뷰로 저장">
          답변 붙여넣기
        </button>
        <button onClick={() => router.push(`/aa/projects/${projectId}/reviews`)} style={btn()} data-testid="aa-reviews-open">
          리뷰
        </button>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }} data-testid="aa-revision">Draft · rev {s.baseRevision || '–'}</span>
        <div style={{ flex: 1 }} />
        {bytes > MODEL_WARN_BYTES && <span style={{ fontSize: 12, color: '#f5a524' }}>설계 크기 {Math.round(bytes / 1024)}KB (한도 1MB)</span>}
        <span data-testid="aa-save-state" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: label.color }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: label.color }} />{label.text}
        </span>
        {s.saveMessage && s.saveState !== 'conflict' && <span data-testid="aa-save-message" role={s.saveState === 'error' ? 'alert' : undefined} style={{ fontSize: 12, color: s.saveState === 'error' ? '#e5484d' : 'rgba(255,255,255,0.45)' }}>{s.saveMessage}</span>}
        <button onClick={saveWithInspector} disabled={Boolean(s.recovery) || s.saveState === 'saving' || s.saveState === 'loading' || s.saveState === 'conflict'}
          title="저장 (Ctrl+S)" style={{ ...btn(), background: '#c8a96e', color: '#16130c', fontWeight: 600, borderColor: '#c8a96e', opacity: s.saveState === 'dirty' || s.saveState === 'error' ? 1 : 0.55 }}>
          {s.saveState === 'error' ? '저장 재시도' : '저장'}
        </button>
        <button onClick={() => setInspectorOpen((v) => !v)} title="Inspector 접기·펴기 (])" style={btn(true)}>◧</button>
      </div>

      {s.backupMessage && <div role="status" style={{ padding: '6px 14px', color: '#f3c97a' }}>{s.backupMessage}</div>}
      {s.recovery && (
        <div role="dialog" aria-label="미저장 편집 복구" style={{ padding: '8px 14px', color: '#f3c97a' }}>
          {s.recovery.value.revision < s.baseRevision ? '서버에 더 새 버전이 있습니다. ' : ''}
          브라우저에 저장되지 않은 편집이 남아 있습니다.
          <button style={btn()} onClick={s.recover}>편집 복구</button>
          <button style={btn()} onClick={s.discardRecovery}>복구본 삭제</button>
        </div>
      )}
      {s.saveState === 'conflict' && (
        <div role="dialog" aria-label="저장 충돌" style={{ padding: '8px 14px', background: 'rgba(245,165,36,0.1)', borderBottom: '1px solid rgba(245,165,36,0.3)', color: '#f3c97a', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 10 }}>
          서버에 더 최근 설계가 있습니다 (rev {s.conflictRevision}). 내 편집은 유지됩니다.
          {s.saveMessage && <span role="status">{s.saveMessage}</span>}
          <span style={{ flex: 1 }} />
          <button style={btn()} disabled={s.reloading} onClick={() => {
            if (confirm('저장하지 않은 변경을 버리고 서버 버전을 불러올까요?')) {
              edits.clear();
              void s.reloadServer();
            }
          }}>서버 버전 불러오기</button>
          <button style={btn()} disabled={s.reloading || !Number.isInteger(s.conflictRevision)} onClick={() => {
            if (confirm(`서버 rev ${s.conflictRevision}을 내 편집으로 덮어쓸까요?`)) {
              edits.flush();
              void s.overwrite();
            }
          }}>내 변경으로 덮어쓰기</button>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Palette */}
        {paletteOpen && (
          <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.07)', background: '#0a0a0c', padding: 12, overflowY: 'auto' }}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="검색 (postgres, redis, kafka…)" data-testid="aa-palette-search"
              onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); if (e.key === 'Enter' && items[0]) addAtCenter(items[0]); }}
              style={{ width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 7, fontSize: 12, background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.9)', borderStyle: 'solid', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', outline: 'none' }} />
            {CATEGORY_ORDER.map((cat) => {
              const list = items.filter((i) => i.category === cat);
              if (!list.length) return null;
              return (
                <div key={cat}>
                  <div style={{ margin: '12px 0 6px', fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {s.registry?.categories.find((c) => c.key === cat)?.label ?? cat}
                  </div>
                  {list.map((it) => (
                    <div key={it.type} draggable role="button" tabIndex={0} data-testid={`aa-palette-${it.type}`}
                      onDragStart={(e) => { e.dataTransfer.setData(DND_MIME, it.type); e.dataTransfer.effectAllowed = 'move'; }}
                      onClick={() => addAtCenter(it)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addAtCenter(it); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px', borderRadius: 7, cursor: 'grab', userSelect: 'none' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                      <span style={{ width: 22, height: 22, borderRadius: 5, display: 'grid', placeItems: 'center', fontSize: 12, color: CATEGORY_COLOR[cat], background: 'rgba(255,255,255,0.04)' }}>{it.icon}</span>
                      {it.label}
                    </div>
                  ))}
                </div>
              );
            })}
            {items.length === 0 && <div style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>“{query}”와 맞는 타입이 없습니다</div>}
            <div style={{ marginTop: 14, fontSize: 11.5, color: 'rgba(255,255,255,0.35)', lineHeight: 1.7 }}>
              끌어다 놓거나 클릭해서 추가 · 오른쪽 점 → 왼쪽 점으로 연결 · Boundary 위에 놓으면 그룹에 들어감<br />
              Delete 삭제 · Ctrl+D 복제 · Shift+클릭 다중 선택 · F 화면 맞춤 · Esc 선택 해제 · [ ] 패널 · Ctrl+S 저장
            </div>
          </div>
        )}

        {/* Canvas */}
        <div ref={canvasRef} style={{ flex: 1, minWidth: 0, position: 'relative', ['--xy-background-color' as string]: '#080809', ['--xy-edge-stroke' as string]: 'rgba(255,255,255,0.35)', ['--xy-edge-stroke-selected' as string]: '#c8a96e' }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }} onDrop={onDrop}>
          {s.model && (
            <ReactFlow
              nodes={flow.nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={s.applyNodeChanges}
              onEdgesChange={s.applyEdgeChanges}
              onConnect={s.connect}
              onNodeDragStop={onNodeDragStop}
              deleteKeyCode={null}
              multiSelectionKeyCode={['Shift', 'Control', 'Meta']}
              elevateNodesOnSelect={false}
              colorMode="dark"
              snapToGrid
              snapGrid={[16, 16]}
              fitView
              fitViewOptions={{ maxZoom: 1 }}
            >
              <Background gap={16} />
              <MiniMap pannable zoomable />
              <Controls />
            </ReactFlow>
          )}
          {s.model && flow.nodes.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
              왼쪽 팔레트에서 컴포넌트를 끌어다 놓으세요
            </div>
          )}
        </div>

        {inspectorOpen && <PropertyInspector edits={edits} />}
      </div>

      {s.pendingDelete && <DeleteDialog />}
      {importOpen && (
        <ImportMermaidModal
          onClose={() => setImportOpen(false)}
          flushEdits={() => edits.flush()}
          onApplied={() => { setImportNotice(null); setTimeout(() => fitView({ maxZoom: 1, duration: 200 }), 50); }}
        />
      )}
      {modal === 'askai' && (
        <AskAiModal projectId={projectId} projectName={s.projectName}
          selectedComponentIds={selectedComponentIds(s.model, s.viewId, s.selectedNodeIds)}
          unsaved={s.saveState === 'dirty' || s.saveState === 'error' || s.saveState === 'saving'}
          onClose={() => setModal(null)} />
      )}
      {modal === 'paste' && (
        <PasteAnswerModal projectId={projectId} onClose={() => setModal(null)}
          onSaved={(r) => { setModal(null); setImportNotice(r.existing ? '이미 저장된 리뷰입니다.' : '리뷰를 저장했습니다. [리뷰]에서 볼 수 있습니다.'); }} />
      )}
      {(s.importUndo || importNotice) && (
        <div role="status" data-testid="aa-import-toast" style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 30, padding: '10px 14px', borderRadius: 10, background: '#16161a', border: '1px solid rgba(200,169,110,0.4)', color: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
          {s.importUndo
            ? <>가져오기 완료 · 새 컴포넌트 {s.importUndo.summary.newComponents} · 기존 연결 {s.importUndo.summary.reused} · 새 관계 {s.importUndo.summary.newRelations}
                <button style={btn()} data-testid="aa-import-undo" onClick={async () => {
                  const r = await s.undoImport();
                  setImportNotice(r.status === 'saved' ? '가져오기 전으로 되돌렸습니다.' : r.status === 'conflict' ? '다른 곳에서 먼저 저장되어 되돌리지 못했습니다. 위의 충돌 안내를 확인하세요.' : '되돌리지 못했습니다.');
                }}>가져오기 전으로 되돌리기</button>
                <button style={btn(true)} onClick={s.dismissImportUndo}>닫기</button></>
            : <>{importNotice}<button style={btn(true)} onClick={() => setImportNotice(null)}>닫기</button></>}
        </div>
      )}
    </div>
  );
}

/** 삭제 확인 (04 §6.8): 컴포넌트가 포함된 삭제만 묻는다 */
function DeleteDialog() {
  const p = useStudio((s) => s.pendingDelete)!;
  const confirmDelete = useStudio((s) => s.confirmDelete);
  const cancelDelete = useStudio((s) => s.cancelDelete);
  return (
    <div onClick={cancelDelete} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="aa-del-title" data-testid="aa-delete-dialog" onClick={(e) => e.stopPropagation()}
        style={{ width: 420, padding: 20, borderRadius: 12, background: '#121215', borderStyle: 'solid', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>
        <div id="aa-del-title" style={{ fontWeight: 600, fontSize: 14 }}>컴포넌트도 삭제할까요?</div>
        <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
          컴포넌트 {p.componentCount}개{p.relationCount ? `와 연결된 관계 ${p.relationCount}개도 함께 삭제됩니다.` : '가 삭제됩니다.'}<br />
          “노드만 제거”는 화면에서만 지우고 컴포넌트·관계는 남깁니다 (저장 시 경고).
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button style={btn()} onClick={cancelDelete}>취소</button>
          <button style={btn()} onClick={() => confirmDelete('nodes')} data-testid="aa-delete-nodes">노드만 제거</button>
          <button autoFocus style={{ ...btn(), background: '#e5484d', borderColor: '#e5484d', color: '#fff', fontWeight: 600 }} onClick={() => confirmDelete('components')} data-testid="aa-delete-components">컴포넌트 삭제</button>
        </div>
      </div>
    </div>
  );
}

function btn(ghost = false): React.CSSProperties {
  return {
    padding: '6px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
    borderStyle: 'solid', borderWidth: 1, borderColor: ghost ? 'transparent' : 'rgba(255,255,255,0.12)',
    background: ghost ? 'transparent' : 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.85)',
  };
}
