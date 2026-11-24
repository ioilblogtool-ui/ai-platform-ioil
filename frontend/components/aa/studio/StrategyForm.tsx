'use client';

// 구조화 배포 전략 폼 (Sprint 11 · DEP-04·06 일부 · 04 §6.10.2 · 08 D-45).
// 배치안(deployment·aws)에서 아무것도 선택하지 않았을 때 Inspector에 보인다.
// 편집은 이 폼 안의 초안에 모았다가 [적용]에서 한 번에 모델로 보낸다 — 서버 V18과 같은 검사를 먼저 해서 자동 저장이 400에 막히지 않게 한다.
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useStudio } from '@/lib/aa/studio-store';
import type { DeploymentStrategy } from '@/lib/aa/architecture-types';
import {
  DB_POLICIES, PROMOTIONS, RELEASE_LABEL, RELEASE_TYPES, ROLLBACK_METHODS, SWITCH_BY, SWITCH_METHODS, STRATEGY_LIMITS,
  defaultStrategy, fallbackCandidates, fallbackStatus, formatCanary, parseCanary, strategyErrors,
} from '@/lib/aa/strategy-ops';

const input: CSSProperties = { background: '#141417', color: '#e8e6e1', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '4px 7px', fontSize: 12.5, minWidth: 0 };
const btn: CSSProperties = { ...input, cursor: 'pointer', padding: '4px 10px' };
const muted: CSSProperties = { color: 'rgba(255,255,255,0.5)', fontSize: 11.5 };
const section: CSSProperties = { display: 'grid', gap: 6, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' };
const row: CSSProperties = { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' };
const chip: CSSProperties = { fontSize: 11, padding: '1px 7px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.55)' };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label style={{ display: 'grid', gap: 3, fontSize: 12 }}><span style={{ color: 'rgba(255,255,255,0.55)' }}>{label}</span>{children}</label>;
}

export default function StrategyForm() {
  const s = useStudio();
  const view = s.model?.views.find((v) => v.id === s.viewId);
  const saved = view?.strategy;
  const [draft, setDraft] = useState<DeploymentStrategy | null>(() => (saved ? structuredClone(saved) : null));
  const [canaryText, setCanaryText] = useState(() => formatCanary(saved?.release.canary?.steps));
  const [errors, setErrors] = useState<string[]>([]);
  const nfrs = useMemo(() => s.requirements.filter((r) => r.kind === 'nfr'), [s.requirements]);
  if (!s.model || !view) return null;
  const model = s.model;
  const candidates = fallbackCandidates(model);
  const status = fallbackStatus(model, view);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved ?? null);

  if (!draft) {
    return (
      <div style={section} data-testid="aa-strategy-empty">
        <span style={muted}>구조화된 배포 전략이 없습니다.</span>
        <button style={btn} data-testid="aa-strategy-create" onClick={() => { const d = defaultStrategy(); setDraft(d); setCanaryText(formatCanary(d.release.canary?.steps)); }}>구조화 전략 만들기</button>
      </div>
    );
  }
  const set = (fn: (d: DeploymentStrategy) => void) => setDraft((cur) => { if (!cur) return cur; const next = structuredClone(cur); fn(next); return next; });

  const apply = () => {
    const next = structuredClone(draft);
    if (next.release.type === 'canary') {
      const steps = parseCanary(canaryText);
      if (!steps) { setErrors(['Canary 단계는 "비율:대기분, …" 형식으로 입력하세요. 예: 10:10, 50:10, 100:0']); return; }
      next.release.canary = { steps };
    }
    const errs = strategyErrors(next, model);
    setErrors(errs);
    if (!errs.length) { s.setStructuredStrategy(next); setDraft(next); }
  };

  // 이미 고른 대상이 새 후보 목록에 없어도 현재 값으로 보여 준다 (C2)
  const currentTarget = draft.fallback?.targetViewId;
  const currentView = currentTarget ? model.views.find((v) => v.id === currentTarget) : undefined;
  const targetOptions = [...candidates];
  if (currentView && !targetOptions.some((c) => c.viewId === currentView.id)) targetOptions.unshift({ viewId: currentView.id, variant: currentView.variant ?? currentView.name });

  return (
    <div style={{ display: 'grid', gap: 10 }} data-testid="aa-strategy-form">
      <div style={section}>
        <b style={{ fontSize: 12.5 }}>환경과 승인</b>
        {draft.environments.map((e, i) => (
          <div key={i} style={row}>
            <input style={{ ...input, width: 80 }} aria-label={`환경 ${i + 1} 이름`} value={e.name} onChange={(ev) => set((d) => { d.environments[i].name = ev.target.value; })} />
            <select style={input} aria-label={`환경 ${i + 1} 승격`} value={e.promotion} onChange={(ev) => set((d) => { d.environments[i].promotion = ev.target.value as typeof e.promotion; })}>
              {PROMOTIONS.map((p) => <option key={p} value={p}>{p === 'same-image' ? '동일 이미지' : '다시 빌드'}</option>)}
            </select>
            <input style={{ ...input, width: 80 }} aria-label={`환경 ${i + 1} 승인 역할`} placeholder="승인 역할" value={e.approvalRole ?? ''} onChange={(ev) => set((d) => { if (ev.target.value) d.environments[i].approvalRole = ev.target.value; else delete d.environments[i].approvalRole; })} />
            <button style={btn} aria-label={`환경 ${i + 1} 삭제`} onClick={() => set((d) => { d.environments.splice(i, 1); })}>×</button>
          </div>
        ))}
        {draft.environments.length < STRATEGY_LIMITS.environments && <button style={btn} onClick={() => set((d) => { d.environments.push({ name: '', promotion: 'same-image' }); })}>＋ 환경</button>}
      </div>

      <div style={section}>
        <b style={{ fontSize: 12.5 }}>릴리스 방식</b>
        <div style={row}>
          <select style={input} aria-label="릴리스 방식" data-testid="aa-strategy-release" value={draft.release.type} onChange={(ev) => set((d) => {
            const type = ev.target.value as DeploymentStrategy['release']['type'];
            d.release = { type, ...(type === 'rolling' ? { rolling: { maxSurge: '25%', maxUnavailable: '0' } } : {}), ...(type === 'blue-green' ? { blueGreen: { switchBy: 'lb' as const } } : {}) };
          })}>
            {RELEASE_TYPES.map((t) => <option key={t} value={t}>{RELEASE_LABEL[t]}</option>)}
          </select>
          <span style={chip} title="릴리스 방식 선택 이유는 ADR로 남깁니다">ADR · Phase 3에서 연결</span>
        </div>
        {draft.release.type === 'canary' && <Field label="Canary 단계 (비율:대기분, …)"><input style={input} data-testid="aa-strategy-canary" value={canaryText} onChange={(ev) => setCanaryText(ev.target.value)} /></Field>}
        {draft.release.type === 'rolling' && <div style={row}>
          <input style={{ ...input, width: 80 }} aria-label="maxSurge" value={draft.release.rolling?.maxSurge ?? ''} onChange={(ev) => set((d) => { d.release.rolling = { maxSurge: ev.target.value, maxUnavailable: d.release.rolling?.maxUnavailable ?? '' }; })} />
          <input style={{ ...input, width: 80 }} aria-label="maxUnavailable" value={draft.release.rolling?.maxUnavailable ?? ''} onChange={(ev) => set((d) => { d.release.rolling = { maxSurge: d.release.rolling?.maxSurge ?? '', maxUnavailable: ev.target.value }; })} />
        </div>}
        {draft.release.type === 'blue-green' && <select style={input} aria-label="전환 방식" value={draft.release.blueGreen?.switchBy ?? 'lb'} onChange={(ev) => set((d) => { d.release.blueGreen = { switchBy: ev.target.value as (typeof SWITCH_BY)[number] }; })}>
          {SWITCH_BY.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>}
      </div>

      <div style={section}>
        <b style={{ fontSize: 12.5 }}>진행·중단 기준</b>
        {draft.gates.map((g, i) => (
          <div key={i} style={{ display: 'grid', gap: 4, padding: 6, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }} data-testid="aa-strategy-gate">
            <div style={row}>
              <input style={{ ...input, width: 90 }} aria-label={`기준 ${i + 1} 이름`} value={g.name} onChange={(ev) => set((d) => { d.gates[i].name = ev.target.value; })} />
              <input style={{ ...input, width: 90 }} aria-label={`기준 ${i + 1} 지표`} value={g.metric} onChange={(ev) => set((d) => { d.gates[i].metric = ev.target.value; })} />
              <input style={{ ...input, width: 70 }} aria-label={`기준 ${i + 1} 임계값`} data-testid={`aa-strategy-gate-threshold-${i}`} value={g.threshold} onChange={(ev) => set((d) => { d.gates[i].threshold = ev.target.value; })} />
              <input style={{ ...input, width: 52 }} aria-label={`기준 ${i + 1} 관찰 분`} type="number" value={g.observeMin} onChange={(ev) => set((d) => { d.gates[i].observeMin = Number(ev.target.value); })} />분
              <button style={btn} aria-label={`기준 ${i + 1} 삭제`} onClick={() => set((d) => { d.gates.splice(i, 1); })}>×</button>
            </div>
            <div style={row}>
              <span style={muted}>NFR</span>
              {nfrs.length ? nfrs.map((r) => (
                <label key={r.id} style={{ ...row, fontSize: 11.5 }}>
                  <input type="checkbox" checked={g.requirementIds.includes(r.id)} data-testid={`aa-strategy-gate-${i}-nfr-${r.code}`}
                    onChange={(ev) => set((d) => { const ids = d.gates[i].requirementIds; d.gates[i].requirementIds = ev.target.checked ? [...ids, r.id] : ids.filter((x) => x !== r.id); })} />{r.code}
                </label>
              )) : <span style={muted}>NFR 없음</span>}
              <span style={chip}>Validation · Phase 3에서 연결</span>
            </div>
          </div>
        ))}
        {draft.gates.length < STRATEGY_LIMITS.gates && <button style={btn} onClick={() => set((d) => { d.gates.push({ name: '', metric: '', threshold: '', observeMin: 10, requirementIds: [] }); })}>＋ 기준</button>}
      </div>

      <div style={section}>
        <b style={{ fontSize: 12.5 }}>이미지 롤백</b>
        <div style={row}>
          <select style={input} aria-label="롤백 방식" value={draft.rollback.method} onChange={(ev) => set((d) => { d.rollback.method = ev.target.value as (typeof ROLLBACK_METHODS)[number]; })}>
            {ROLLBACK_METHODS.map((x) => <option key={x} value={x}>{x === 'previous-image' ? '이전 이미지' : '다시 배포'}</option>)}
          </select>
          <input style={{ ...input, width: 52 }} aria-label="롤백 목표 분" type="number" value={draft.rollback.targetMin} onChange={(ev) => set((d) => { d.rollback.targetMin = Number(ev.target.value); })} />분
        </div>
        <input style={input} aria-label="롤백 트리거" value={draft.rollback.trigger} onChange={(ev) => set((d) => { d.rollback.trigger = ev.target.value; })} />
      </div>

      <div style={section} data-testid="aa-strategy-fallback">
        <b style={{ fontSize: 12.5 }}>VM 트래픽 복귀</b>
        {!draft.fallback ? (
          <button style={btn} data-testid="aa-strategy-fallback-add" onClick={() => set((d) => { d.fallback = { ...(candidates[0] ? { targetViewId: candidates[0].viewId } : {}), trigger: '', switchMethod: 'lb-weight', ownerRole: '', targetMin: 15, dbCondition: '' }; })}>＋ 복귀 정책</button>
        ) : (<>
          <Field label="복귀 대상 (실행 요소가 있는 배치안만 표시)">
            <select style={input} data-testid="aa-strategy-fallback-target" value={draft.fallback.targetViewId ?? ''} onChange={(ev) => set((d) => { if (ev.target.value) d.fallback!.targetViewId = ev.target.value; else delete d.fallback!.targetViewId; })}>
              <option value="">미지정</option>
              {targetOptions.map((c) => <option key={c.viewId} value={c.viewId}>{c.variant}</option>)}
            </select>
          </Field>
          {!dirty && status.state === 'no-executor' && <span style={{ color: '#fbbf24', fontSize: 11.5 }} data-testid="aa-strategy-fallback-warning">⚠ {status.variant} — 실행 요소 없음</span>}
          {!dirty && status.state === 'unset' && <span style={{ color: '#fbbf24', fontSize: 11.5 }} data-testid="aa-strategy-fallback-warning">⚠ VM 복귀 대상 미지정</span>}
          <input style={input} aria-label="VM 복귀 판단 기준" placeholder="판단 기준 (예: 오류율 > 2% 10분)" value={draft.fallback.trigger} onChange={(ev) => set((d) => { d.fallback!.trigger = ev.target.value; })} />
          <div style={row}>
            <select style={input} aria-label="전환 방식" value={draft.fallback.switchMethod} onChange={(ev) => set((d) => { d.fallback!.switchMethod = ev.target.value as (typeof SWITCH_METHODS)[number]; })}>
              {SWITCH_METHODS.map((x) => <option key={x} value={x}>{x === 'lb-weight' ? 'LB 가중치' : x === 'dns' ? 'DNS' : '수동'}</option>)}
            </select>
            <input style={{ ...input, width: 80 }} aria-label="VM 복귀 책임 역할" placeholder="책임 역할" value={draft.fallback.ownerRole} onChange={(ev) => set((d) => { d.fallback!.ownerRole = ev.target.value; })} />
            <input style={{ ...input, width: 52 }} aria-label="VM 복귀 목표 분" type="number" value={draft.fallback.targetMin} onChange={(ev) => set((d) => { d.fallback!.targetMin = Number(ev.target.value); })} />분
          </div>
          <input style={input} aria-label="VM 복귀 DB 조건" placeholder="DB 호환 조건" value={draft.fallback.dbCondition} onChange={(ev) => set((d) => { d.fallback!.dbCondition = ev.target.value; })} />
          <button style={btn} onClick={() => set((d) => { delete d.fallback; })}>복귀 정책 빼기</button>
        </>)}
      </div>

      <div style={section}>
        <b style={{ fontSize: 12.5 }}>DB 변경 정책</b>
        <select style={input} aria-label="DB 변경 정책" value={draft.dbChange.policy} onChange={(ev) => set((d) => { d.dbChange.policy = ev.target.value as (typeof DB_POLICIES)[number]; })}>
          {DB_POLICIES.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <input style={input} aria-label="DB 변경 메모" placeholder="메모 (선택)" value={draft.dbChange.note ?? ''} onChange={(ev) => set((d) => { if (ev.target.value) d.dbChange.note = ev.target.value; else delete d.dbChange.note; })} />
      </div>

      {errors.length > 0 && <ul role="alert" data-testid="aa-strategy-errors" style={{ margin: 0, paddingLeft: 18, color: '#ff9b9d', fontSize: 11.5 }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      <div style={row}>
        <button style={{ ...btn, background: dirty ? '#c8a96e' : undefined, color: dirty ? '#16130c' : undefined }} data-testid="aa-strategy-apply" disabled={!dirty && !errors.length} onClick={apply}>적용</button>
        {dirty && <button style={btn} onClick={() => { setDraft(saved ? structuredClone(saved) : null); setCanaryText(formatCanary(saved?.release.canary?.steps)); setErrors([]); }}>되돌리기</button>}
        {saved && <button style={{ ...btn, color: '#ff9b9d' }} data-testid="aa-strategy-remove" onClick={() => { s.setStructuredStrategy(null); setDraft(null); setErrors([]); }}>구조화 전략 삭제</button>}
        {dirty && <span style={muted}>적용 전 변경</span>}
      </div>
    </div>
  );
}
