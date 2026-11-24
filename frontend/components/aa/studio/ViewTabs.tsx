'use client';

// View 탭 (Sprint 7 · 04 SCR-06 `[Logical] [Deployment ▾]`, §6.10 배치안 메뉴).
// 배치안 = deployment View. 추가(빈 배치안 / 지금 배치안 복제)·이름 바꾸기·삭제(확인 창).
import { useState, type CSSProperties } from 'react';
import { eksPlacements, deploymentViewSummary, MAX_DEPLOYMENT_VIEWS, VARIANT_MAX, fallbackReferrers } from '@/lib/aa/model-ops';
import { useStudio } from '@/lib/aa/studio-store';
import type { InspectorEdits } from './SchemaForm';

const infraEnabled = process.env.NEXT_PUBLIC_AA_INFRA_VIEWS !== 'false';

type ManagedKind = 'deployment' | 'aws' | 'kubernetes';

const kinds: { kind: ManagedKind; label: string }[] = [
  { kind: 'deployment', label: 'Deployment' },
  ...(infraEnabled ? [{ kind: 'aws' as const, label: 'AWS' }, { kind: 'kubernetes' as const, label: 'K8s' }] : []),
];

type Mode = null | 'menu' | 'new' | 'dup' | 'rename' | 'delete';

export default function ViewTabs({ edits }: { edits: InspectorEdits }) {
  const s = useStudio();
  const [emptyKind, setEmptyKind] = useState<ManagedKind | null>(null);
  const [lastViews, setLastViews] = useState<Partial<Record<ManagedKind, string>>>({});
  const [mode, setMode] = useState<Mode>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!s.model) return null;
  const model = s.model;
  const current = model.views.find((v) => v.id === s.viewId);
  const activeKind = s.panel === 'canvas' ? kinds.find(({ kind }) => kind === current?.kind)?.kind : undefined;
  const menuKind = emptyKind ?? activeKind;
  const infraKind = menuKind === 'aws' || menuKind === 'kubernetes' ? menuKind : undefined;
  const deps = model.views.filter((v) => v.kind === menuKind);
  const limit = menuKind === 'aws' ? 3 : menuKind === 'kubernetes' ? 5 : MAX_DEPLOYMENT_VIEWS;
  const menuLabel = menuKind === 'aws' ? 'AWS 배치안' : menuKind === 'kubernetes' ? 'K8s View' : '배치안';
  const inMenuView = current?.kind === menuKind;
  const clusters = infraEnabled && current?.kind === 'kubernetes' ? eksPlacements(s.model) : [];
  const cluster = clusters.find((p) => p.componentId === current?.clusterRef);
  const locked = Boolean(s.recovery) || s.saveState === 'loading' || s.importing;

  const open = (m: Mode, initial = '') => { edits.flush(); setMode(m); setName(initial); setError(null); };
  const close = () => { setMode(null); setEmptyKind(null); setError(null); };
  const submit = () => {
    const err = mode === 'new' ? s.addDeploymentView(name, infraKind ?? undefined) : mode === 'dup' ? s.duplicateDeploymentView(name) : mode === 'rename' ? s.renameDeploymentView(name) : null;
    if (err) setError(err); else close();
  };
  const showView = (viewId: string) => {
    edits.flush();
    if (activeKind && current) setLastViews((last) => ({ ...last, [activeKind]: current.id }));
    close();
    s.setView(viewId);
  };
  const showKind = (kind: ManagedKind) => {
    if (activeKind === kind && current) return;
    const views = model.views.filter((v) => v.kind === kind);
    const next = views.find((v) => v.id === lastViews[kind]) ?? views[0];
    if (next) showView(next.id);
    else { setEmptyKind(kind); open('new', kind === 'deployment' ? '현재 · PaaS' : ''); }
  };
  const summary = mode === 'delete' && inMenuView ? deploymentViewSummary(s.model, s.viewId) : null;
  const detached = summary && infraKind === 'aws'
    ? s.model.views.filter((v) => v.clusterRef && current?.nodes.some((n) => n.componentId === v.clusterRef)).length
    : 0;
  // Sprint 11 (C2): 이 배치안을 VM 복귀 대상으로 쓰는 전략
  const fallbackRefs = summary && s.model ? fallbackReferrers(s.model, s.viewId) : [];

  return (
    <div style={{ flexShrink: 0, padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#09090b', position: 'relative' }}
      data-testid="aa-view-tabs">
      <div aria-label="View 종류" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        <button style={tab(s.panel === 'canvas' && current?.kind === 'logical')} onClick={() => showView('view_logical')} data-testid="aa-view-tab-logical">Logical</button>
        {kinds.map(({ kind, label }) => (
          <button key={kind} style={tab(activeKind === kind)} aria-pressed={activeKind === kind}
            disabled={locked} onClick={() => showKind(kind)} data-testid={`aa-view-tab-${kind}`}>{label}</button>
        ))}
        <button style={tab(s.panel === 'flows')} onClick={() => { edits.flush(); close(); s.openFlows(); }} data-testid="aa-view-tab-flows">API Flow</button>
      </div>

      {activeKind && !emptyKind && current && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <label style={hint}>
            {menuLabel}{' '}
            <select aria-label={menuLabel} value={current.id} style={item} onChange={(event) => showView(event.target.value)}>
              {deps.map((v) => <option key={v.id} value={v.id}>{v.variant ?? v.name}</option>)}
            </select>
          </label>
          <button style={item} disabled={locked || deps.length >= limit} onClick={() => open('new')} data-testid="aa-view-add">+ 새 {menuLabel}</button>
          <button style={item} disabled={locked} aria-label={`${menuLabel} 관리`} aria-expanded={mode === 'menu'}
            onClick={() => { if (mode) close(); else open('menu'); }} data-testid="aa-view-menu">⋯</button>
          {activeKind === 'kubernetes' && (
            <>
              <select aria-label="K8s 클러스터" value={current.clusterRef ?? ''} disabled={locked} style={item}
                onChange={(event) => { edits.flush(); s.setClusterRef(event.target.value || undefined); }}>
                <option value="">클러스터 미지정</option>
                {clusters.filter((p) => !model.views.some((v) => v.id !== current.id && v.clusterRef === p.componentId))
                  .map((p) => <option key={p.componentId} value={p.componentId}>{p.variant} · {p.name}</option>)}
              </select>
              {cluster && <button style={tab(false)} onClick={() => { edits.flush(); close(); s.focusNode(cluster.viewId, cluster.nodeId); }}>◂ {cluster.name}</button>}
            </>
          )}
        </div>
      )}

      {mode && (
        <div role="dialog" aria-label="배치안 메뉴" data-testid="aa-view-menu-panel" onKeyDown={(e) => { if (e.key === 'Escape') close(); e.stopPropagation(); }}
          style={{ position: 'absolute', top: '100%', left: 12, zIndex: 40, width: 320, padding: 12, borderRadius: 10, background: '#141418', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 12px 30px rgba(0,0,0,0.5)', display: 'grid', gap: 8, fontSize: 12.5 }}>
          {mode === 'menu' && <>
            <b>{menuLabel} ({deps.length}/{limit})</b>
            {infraKind !== 'kubernetes' && <button style={item} disabled={!inMenuView || deps.length >= limit} onClick={() => open('dup', `${current?.variant ?? ''} 복제`.slice(0, VARIANT_MAX))} data-testid="aa-view-duplicate">지금 배치안 복제</button>}
            <button style={item} disabled={!inMenuView} onClick={() => open('rename', current?.variant ?? '')} data-testid="aa-view-rename">이름 바꾸기</button>
            <button style={{ ...item, color: '#ff9b9d' }} disabled={!inMenuView} onClick={() => open('delete')} data-testid="aa-view-delete">이 {menuLabel} 삭제</button>
            {!inMenuView && deps.length > 0 && <span style={hint}>먼저 관리할 {menuLabel} 탭을 여세요.</span>}
          </>}
          {(mode === 'new' || mode === 'dup' || mode === 'rename') && <>
            <b>{mode === 'new' ? (infraKind === 'aws' ? '새 AWS 배치안' : infraKind === 'kubernetes' ? '새 K8s View' : '새 배치안') : mode === 'dup' ? `${current?.variant} 복제` : '배치안 이름 바꾸기'}</b>
            <input autoFocus value={name} maxLength={VARIANT_MAX + 5} onChange={(e) => { setName(e.target.value); setError(null); }} data-testid="aa-view-name"
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} placeholder="예: 대안 · VM×2 + LB" style={input} />
            {mode === 'dup' && <span style={hint}>{infraKind === 'aws' ? '복제한 EKS는 클러스터 미지정 상태로 시작합니다.' : '복제본에서도 Logical 컴포넌트와의 구현 연결이 유지됩니다.'}</span>}
            {mode === 'new' && !infraKind && <span style={hint}>배포 전략은 템플릿으로 시작합니다. 아무것도 선택하지 않으면 오른쪽에서 편집합니다.</span>}
            {error && <span role="alert" style={{ color: '#ff9b9d' }}>{error}</span>}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button style={item} onClick={close}>취소</button>
              <button style={{ ...item, background: '#c8a96e', color: '#16130c', borderColor: '#c8a96e' }} onClick={submit} data-testid="aa-view-submit">확인</button>
            </div>
          </>}
          {mode === 'delete' && summary && <>
            <b>{summary.variant} 삭제</b>
            <span>이 View에만 있는 컴포넌트 {summary.ownComponents}개와 그 관계 {summary.relations}개(구현 연결 포함)를 함께 지웁니다. Logical 설계는 그대로입니다.</span>
            {detached > 0 && <span>K8s View {detached}개가 클러스터 미지정 상태가 됩니다. 워크로드는 보존됩니다.</span>}
            {fallbackRefs.length > 0 && <span data-testid="aa-view-delete-fallback">VM 복귀 대상 {fallbackRefs.length}건이 미지정이 됩니다({fallbackRefs.join(', ')}). 복귀 정책 문구는 그대로입니다.</span>}
            <span style={hint}>삭제는 자동 저장됩니다. 이미 발행한 버전의 구성은 유지됩니다.</span>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button style={item} onClick={close} data-testid="aa-view-delete-cancel">취소</button>
              <button style={{ ...item, color: '#ff9b9d', borderColor: 'rgba(248,113,113,0.4)' }} onClick={() => { s.removeDeploymentView(s.viewId); close(); }} data-testid="aa-view-delete-confirm">삭제</button>
            </div>
          </>}
        </div>
      )}
    </div>
  );
}

const tab = (active: boolean): CSSProperties => ({
  padding: '5px 11px', borderRadius: 7, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis',
  borderStyle: 'solid', borderWidth: 1, borderColor: active ? 'rgba(200,169,110,0.6)' : 'rgba(255,255,255,0.1)',
  background: active ? 'rgba(200,169,110,0.12)' : 'transparent', color: active ? '#e9d6b0' : 'rgba(255,255,255,0.75)',
});
const item: CSSProperties = { textAlign: 'left', padding: '6px 10px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#e2e0db' };
const input: CSSProperties = { boxSizing: 'border-box', width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.15)', background: '#101013', color: '#e8e6e1', font: 'inherit' };
const hint: CSSProperties = { fontSize: 11.5, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 };
