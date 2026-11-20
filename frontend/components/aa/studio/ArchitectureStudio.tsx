'use client';

// SCR-06 Architecture Studio (Sprint 1): Toolbar + Palette + React Flow Canvas + Inspector(읽기 전용)
import '@xyflow/react/dist/style.css';   // D-03: React Flow 기본 CSS만 inline 규칙의 예외
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, useReactFlow } from '@xyflow/react';
import { useStudio, type SaveState } from '@/lib/aa/studio-store';
import { toFlow } from '@/lib/aa/graph-mapper';
import { modelByteSize } from '@/lib/aa/architecture-api';
import ComponentNode from './ComponentNode';
import { CATEGORY_COLOR, DND_MIME, SPRINT1_TYPES, TYPE_FALLBACK } from './palette-meta';

// React Flow가 렌더마다 새로 만들지 않도록 컴포넌트 밖에 둔다
const nodeTypes = { component: ComponentNode };
const MODEL_WARN_BYTES = 900 * 1024;

const SAVE_LABEL: Record<SaveState, { text: string; color: string }> = {
  loading: { text: '불러오는 중', color: 'rgba(255,255,255,0.4)' },
  saved: { text: '저장됨', color: '#3ecf8e' },
  dirty: { text: '변경사항 있음', color: 'rgba(255,255,255,0.55)' },
  saving: { text: '저장 중…', color: '#c8a96e' },
  error: { text: '저장 실패', color: '#e5484d' },
  conflict: { text: '충돌', color: '#f5a524' },
};

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
  const { screenToFlowPosition } = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => { s.load(projectId); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl+S 즉시 저장
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); useStudio.getState().save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 저장 안 한 변경이 있으면 이탈 경고
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      const st = useStudio.getState().saveState;
      if (st === 'dirty' || st === 'saving' || st === 'conflict') { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, []);

  const selected = useMemo(() => new Set(s.selectedNodeIds), [s.selectedNodeIds]);
  const flow = useMemo(() => (s.model ? toFlow(s.model, s.viewId, selected) : { nodes: [], edges: [] }), [s.model, s.viewId, selected]);
  const edges = useMemo(() => flow.edges.map((e) => ({ ...e, selected: s.selectedEdgeIds.includes(e.id) })), [flow.edges, s.selectedEdgeIds]);
  const bytes = useMemo(() => (s.model ? modelByteSize(s.model) : 0), [s.model]);

  const addAtCenter = useCallback((type: string) => {
    const r = canvasRef.current?.getBoundingClientRect();
    const pos = r ? screenToFlowPosition({ x: r.left + r.width / 2 - 84, y: r.top + r.height / 2 - 28 }) : { x: 0, y: 0 };
    s.addComponent(type, pos);
  }, [s, screenToFlowPosition]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData(DND_MIME);
    if (!type) return;
    s.addComponent(type, screenToFlowPosition({ x: e.clientX - 84, y: e.clientY - 28 }));
  }, [s, screenToFlowPosition]);

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
  const selectedNode = s.model?.views.find((v) => v.id === s.viewId)?.nodes.find((n) => n.id === s.selectedNodeIds[0]);
  const selectedComponent = selectedNode?.componentId ? s.model?.components[selectedNode.componentId] : undefined;
  const view = s.model?.views.find((v) => v.id === s.viewId);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#080809', color: 'rgba(255,255,255,0.9)', fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: 13 }}>
      {/* Toolbar */}
      <div style={{ height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#0a0a0c' }}>
        <button onClick={() => router.push('/aa/projects')} title="프로젝트 목록" style={btn(true)}>◀</button>
        <b style={{ fontSize: 13.5 }}>{s.projectName || '…'}</b>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }} data-testid="aa-revision">Draft · rev {s.baseRevision || '–'}</span>
        <div style={{ flex: 1 }} />
        {bytes > MODEL_WARN_BYTES && <span style={{ fontSize: 12, color: '#f5a524' }}>설계 크기 {Math.round(bytes / 1024)}KB (한도 1MB)</span>}
        <span data-testid="aa-save-state" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: label.color }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: label.color }} />{label.text}
        </span>
        {s.saveMessage && s.saveState !== 'conflict' && <span style={{ fontSize: 12, color: s.saveState === 'error' ? '#e5484d' : 'rgba(255,255,255,0.45)' }}>{s.saveMessage}</span>}
        <button onClick={() => s.save()} disabled={s.saveState === 'saving' || s.saveState === 'loading' || s.saveState === 'conflict'}
          title="저장 (Ctrl+S)" style={{ ...btn(), background: '#c8a96e', color: '#16130c', fontWeight: 600, borderColor: '#c8a96e', opacity: s.saveState === 'dirty' || s.saveState === 'error' ? 1 : 0.55 }}>
          저장
        </button>
      </div>

      {/* 충돌 안내 (Sprint 1 최소판 — 모달·덮어쓰기 선택은 Sprint 3) */}
      {s.saveState === 'conflict' && (
        <div role="alert" style={{ padding: '8px 14px', background: 'rgba(245,165,36,0.1)', borderBottom: '1px solid rgba(245,165,36,0.3)', color: '#f3c97a', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 10 }}>
          ⚠ 다른 곳에서 더 최근에 저장되었습니다 (rev {s.conflictRevision}). 지금 변경은 저장되지 않았어요.
          <span style={{ flex: 1 }} />
          <button style={btn()} onClick={() => { if (confirm('저장하지 않은 변경을 버리고 서버 버전을 불러올까요?')) s.load(projectId); }}>서버 버전 불러오기</button>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Palette */}
        <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.07)', background: '#0a0a0c', padding: 12, overflowY: 'auto' }}>
          {(['application', 'data'] as const).map((cat) => (
            <div key={cat}>
              <div style={{ margin: '10px 0 6px', fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {s.registry?.categories.find((c) => c.key === cat)?.label ?? cat}
              </div>
              {SPRINT1_TYPES.filter((t) => TYPE_FALLBACK[t].category === cat).map((t) => (
                <div key={t} draggable role="button" tabIndex={0} data-testid={`aa-palette-${t}`}
                  onDragStart={(e) => { e.dataTransfer.setData(DND_MIME, t); e.dataTransfer.effectAllowed = 'move'; }}
                  onClick={() => addAtCenter(t)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addAtCenter(t); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px', borderRadius: 7, cursor: 'grab', userSelect: 'none' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <span style={{ width: 22, height: 22, borderRadius: 5, display: 'grid', placeItems: 'center', fontSize: 12, color: CATEGORY_COLOR[cat], background: 'rgba(255,255,255,0.04)' }}>{TYPE_FALLBACK[t].icon}</span>
                  {s.registry?.types[t]?.label ?? t}
                </div>
              ))}
            </div>
          ))}
          <div style={{ marginTop: 14, fontSize: 11.5, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>
            끌어다 놓거나 클릭해서 추가 · 오른쪽 점 → 왼쪽 점으로 연결 · Delete로 삭제 · Ctrl+S 저장
          </div>
        </div>

        {/* Canvas */}
        <div ref={canvasRef} style={{ flex: 1, minWidth: 0, position: 'relative', ['--xy-background-color' as string]: '#080809', ['--xy-edge-stroke' as string]: 'rgba(255,255,255,0.35)', ['--xy-edge-stroke-selected' as string]: '#c8a96e' }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }} onDrop={onDrop}>
          {s.model && (
            <ReactFlow
              nodes={flow.nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={s.applyNodeChanges}
              onEdgesChange={s.applyEdgeChanges}
              onConnect={s.connect}
              deleteKeyCode={['Delete', 'Backspace']}
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

        {/* Inspector (Sprint 1: 읽기 전용 — 속성 편집은 Sprint 3) */}
        <div style={{ width: 320, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.07)', background: '#0a0a0c', padding: 16, overflowY: 'auto' }} data-testid="aa-inspector">
          {selectedComponent ? (
            <>
              <div style={{ fontWeight: 600 }}>{selectedComponent.name}</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 4 }}>{s.registry?.types[selectedComponent.type]?.label ?? selectedComponent.type}</div>
              <div style={{ fontFamily: 'Consolas, monospace', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>{selectedComponent.id}</div>
              <div style={{ marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                위치 ({selectedNode?.position.x}, {selectedNode?.position.y})<br />
                이름·기술·속성 편집은 Sprint 3에서 추가됩니다.
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600 }}>Logical View</div>
              <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.9 }}>
                컴포넌트 {view?.nodes.length ?? 0} · 관계 {view?.edges.length ?? 0}<br />
                Draft rev {s.baseRevision || '–'}
              </div>
            </>
          )}
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
