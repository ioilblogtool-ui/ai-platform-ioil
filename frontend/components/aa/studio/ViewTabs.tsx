'use client';

// View 탭 (Sprint 7 · 04 SCR-06 `[Logical] [Deployment ▾]`, §6.10 배치안 메뉴).
// 배치안 = deployment View. 추가(빈 배치안 / 지금 배치안 복제)·이름 바꾸기·삭제(확인 창).
import { useState, type CSSProperties } from 'react';
import { deploymentViews, deploymentViewSummary, MAX_DEPLOYMENT_VIEWS, VARIANT_MAX } from '@/lib/aa/model-ops';
import { useStudio } from '@/lib/aa/studio-store';
import type { InspectorEdits } from './SchemaForm';

type Mode = null | 'menu' | 'new' | 'dup' | 'rename' | 'delete';

export default function ViewTabs({ edits }: { edits: InspectorEdits }) {
  const s = useStudio();
  const [mode, setMode] = useState<Mode>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!s.model) return null;
  const deps = deploymentViews(s.model);
  const current = s.model.views.find((v) => v.id === s.viewId);
  const inDeployment = current?.kind === 'deployment';
  const locked = Boolean(s.recovery) || s.saveState === 'loading' || s.importing;

  const open = (m: Mode, initial = '') => { edits.flush(); setMode(m); setName(initial); setError(null); };
  const close = () => { setMode(null); setError(null); };
  const submit = () => {
    const err = mode === 'new' ? s.addDeploymentView(name) : mode === 'dup' ? s.duplicateDeploymentView(name) : mode === 'rename' ? s.renameDeploymentView(name) : null;
    if (err) setError(err); else close();
  };
  const summary = mode === 'delete' && inDeployment ? deploymentViewSummary(s.model, s.viewId) : null;

  return (
    <div style={{ height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#09090b', position: 'relative' }}
      data-testid="aa-view-tabs">
      <button style={tab(current?.kind === 'logical')} onClick={() => { edits.flush(); s.setView('view_logical'); }} data-testid="aa-view-tab-logical">Logical</button>
      {deps.map((v) => (
        <button key={v.id} style={tab(v.id === s.viewId)} onClick={() => { edits.flush(); s.setView(v.id); }} data-testid="aa-view-tab-deployment" aria-label={`배치안 ${v.variant}`}>
          ▦ {v.variant}
        </button>
      ))}
      <button style={tab(false)} disabled={locked} onClick={() => (mode ? close() : open('menu'))} data-testid="aa-view-menu" aria-expanded={Boolean(mode)}>
        Deployment ▾
      </button>
      <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.35)' }}>{inDeployment ? '배치안 — Logical 컴포넌트는 공유, 실행 위치만 다름' : ''}</span>

      {mode && (
        <div role="dialog" aria-label="배치안 메뉴" data-testid="aa-view-menu-panel" onKeyDown={(e) => { if (e.key === 'Escape') close(); e.stopPropagation(); }}
          style={{ position: 'absolute', top: 38, left: 12 + 70, zIndex: 40, width: 320, padding: 12, borderRadius: 10, background: '#141418', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 12px 30px rgba(0,0,0,0.5)', display: 'grid', gap: 8, fontSize: 12.5 }}>
          {mode === 'menu' && <>
            <b>배치안 ({deps.length}/{MAX_DEPLOYMENT_VIEWS})</b>
            <button style={item} disabled={deps.length >= MAX_DEPLOYMENT_VIEWS} onClick={() => open('new', deps.length ? '' : '현재 · PaaS')} data-testid="aa-view-add">+ 새 배치안</button>
            <button style={item} disabled={!inDeployment || deps.length >= MAX_DEPLOYMENT_VIEWS} onClick={() => open('dup', `${current?.variant ?? ''} 복제`.slice(0, VARIANT_MAX))} data-testid="aa-view-duplicate">지금 배치안 복제</button>
            <button style={item} disabled={!inDeployment} onClick={() => open('rename', current?.variant ?? '')} data-testid="aa-view-rename">이름 바꾸기</button>
            <button style={{ ...item, color: '#ff9b9d' }} disabled={!inDeployment} onClick={() => open('delete')} data-testid="aa-view-delete">이 배치안 삭제</button>
            {!inDeployment && deps.length > 0 && <span style={hint}>복제·이름·삭제는 배치안 탭을 연 뒤 할 수 있습니다.</span>}
          </>}
          {(mode === 'new' || mode === 'dup' || mode === 'rename') && <>
            <b>{mode === 'new' ? '새 배치안' : mode === 'dup' ? `${current?.variant} 복제` : '배치안 이름 바꾸기'}</b>
            <input autoFocus value={name} maxLength={VARIANT_MAX + 5} onChange={(e) => { setName(e.target.value); setError(null); }} data-testid="aa-view-name"
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} placeholder="예: 대안 · VM×2 + LB" style={input} />
            {mode === 'dup' && <span style={hint}>배치안의 플랫폼·VM·Process를 새로 복사합니다. Logical 컴포넌트와의 구현 연결은 그대로 이어집니다.</span>}
            {mode === 'new' && <span style={hint}>배포 전략은 템플릿으로 시작합니다. 아무것도 선택하지 않으면 오른쪽에서 편집합니다.</span>}
            {error && <span role="alert" style={{ color: '#ff9b9d' }}>{error}</span>}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button style={item} onClick={close}>취소</button>
              <button style={{ ...item, background: '#c8a96e', color: '#16130c', borderColor: '#c8a96e' }} onClick={submit} data-testid="aa-view-submit">확인</button>
            </div>
          </>}
          {mode === 'delete' && summary && <>
            <b>{summary.variant} 삭제</b>
            <span>이 배치안에만 있는 컴포넌트 {summary.ownComponents}개와 그 관계 {summary.relations}개(구현 연결 포함)를 함께 지웁니다. Logical 설계는 그대로입니다.</span>
            <span style={hint}>삭제는 곧 자동 저장되며 되돌릴 수 없습니다. 이미 발행한 버전에는 그대로 남아 있습니다.</span>
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
