'use client';

// Requirement Trace (Sprint 8 · SCR-13 · TRC-01·02 Phase 2 부분 · P2-5).
// 기준은 Draft. 요구사항 → 컴포넌트(+관계) → API Flow(출처: 연결 / 측정 대상) → 설계 결정·검증·결과(Phase 3 — 빈칸).
// 빈칸에는 기존 화면으로 가는 액션을 둔다. 측정 대상 흐름이 Draft에 없으면 "흐름 없음 ⚠" + 연결 해제.
import { use, useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/Button';
import Card from '@/components/Card';
import PageHeader from '@/components/PageHeader';
import { AaApiError, getAaProject, getDraft, getRequirement, updateRequirement } from '@/lib/aa/architecture-api';
import type { ArchitectureModel, Requirement } from '@/lib/aa/architecture-types';
import { computeTrace, GAP_LABEL, MEASUREMENT_FIELDS } from '@/lib/aa/trace';

const muted: CSSProperties = { color: 'rgba(255,255,255,0.45)', fontSize: 12.5 };
const col: CSSProperties = { display: 'grid', gap: 8, alignContent: 'start', minWidth: 0 };
const item: CSSProperties = { textAlign: 'left', font: 'inherit', fontSize: 12.5, padding: '7px 9px', borderRadius: 7, cursor: 'pointer', color: 'rgba(255,255,255,0.88)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' };
const gapBox: CSSProperties = { fontSize: 12.5, color: '#f5a524', padding: '7px 9px', borderRadius: 7, border: '1px dashed rgba(245,165,36,0.45)', display: 'grid', gap: 6 };

export default function TracePage({ params }: { params: Promise<{ id: string; reqId: string }> }) {
  const { id, reqId } = use(params);
  return <Trace key={`${id}:${reqId}`} id={id} reqId={reqId} />;
}

function Trace({ id, reqId }: { id: string; reqId: string }) {
  const router = useRouter();
  const base = `/aa/projects/${id}`;
  const [name, setName] = useState('');
  const [req, setReq] = useState<Requirement | null>(null);
  const [model, setModel] = useState<ArchitectureModel | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // 후속 수정: 목록(최대 200건)에서 찾지 않고 하나를 직접 읽는다 — 뒤쪽 페이지에서 연 항목도 열린다
      const [found, draft] = await Promise.all([getRequirement(id, reqId), getDraft(id)]);
      setReq(found); setModel(draft.model); setRevision(draft.revision); setError(null);
    } catch (e) {
      setError(e instanceof AaApiError && e.status === 404 ? '요구사항이나 프로젝트를 찾을 수 없습니다.' : e instanceof Error ? e.message : '불러오지 못했습니다.');
    }
  }, [id, reqId]);
  useEffect(() => { getAaProject(id).then((p) => setName(p.name)).catch(() => {}); void load(); }, [id, load]);

  async function unlinkFlow() {
    if (!req) return;
    const { flowId: _gone, ...rest } = req.measurement ?? {};   // eslint-disable-line @typescript-eslint/no-unused-vars
    try {
      setReq(await updateRequirement(id, req.id, { measurement: rest }));
      setNotice('측정 대상 흐름 연결을 해제했습니다. 나머지 조건은 그대로입니다.');
    } catch (e) { setNotice(e instanceof Error ? e.message : '저장하지 못했습니다.'); }
  }

  const trace = req ? computeTrace(req, model) : null;
  const studio = (q: string) => router.push(`${base}/architecture?${q}`);
  const measurementText = trace ? MEASUREMENT_FIELDS.filter((f) => trace.measurement[f.key]).map((f) => `${f.label} ${trace.measurement[f.key]}`) : [];

  return (
    <>
      <PageHeader title={req ? `${req.code} 추적` : 'Requirement Trace'} badge={name || undefined}
        breadcrumbs={[{ label: 'AA Workbench', href: '/aa/projects' }, { label: name || '프로젝트', href: base }, { label: '요구사항', href: `${base}/requirements` }]}
        actions={<div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={() => router.push(`${base}/requirements`)}>요구사항</Button>
          <Button variant="primary" onClick={() => router.push(`${base}/architecture`)}>Studio 열기 ▸</Button>
        </div>}
      />
      <main style={{ padding: '20px 28px', display: 'grid', gap: 16 }}>
        {error && <Card><div role="alert" style={{ color: '#f87171' }}>{error}</div></Card>}
        {notice && <div role="status" style={{ color: '#f3c97a', fontSize: 13 }}>{notice}</div>}
        {req && trace && (
          <>
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }} data-testid="aa-trace-head">
                <b style={{ fontSize: 16 }}>{req.code}</b>
                <span style={{ fontSize: 15 }}>{req.title}</span>
                {req.target && <span style={{ color: '#c8a96e' }}>{req.target}</span>}
                <span style={muted}>[{req.priority}]{req.category ? ` [${req.category}]` : ''}</span>
                <span style={{ flex: 1 }} />
                <span style={muted}>Draft rev {revision} 기준</span>
              </div>
              {req.kind === 'nfr' && (
                <div style={{ marginTop: 10, fontSize: 13 }} data-testid="aa-trace-measurement">
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>측정 기준 </span>
                  {measurementText.length || trace.measurement.flowId
                    ? <>
                        {trace.measurement.flowId && (trace.measurementFlowMissing
                          ? <span style={{ color: '#f5a524' }} data-testid="aa-trace-flow-missing">대상 흐름 ⚠ 흐름 없음 </span>
                          : <span>대상 {model?.flows?.[trace.measurement.flowId]?.name} · </span>)}
                        {measurementText.join(' · ')}
                        {trace.measurementFlowMissing && <span style={{ marginLeft: 8 }}><Button size="sm" onClick={() => void unlinkFlow()} data-testid="aa-trace-unlink">연결 해제</Button> <Button size="sm" onClick={() => router.push(`${base}/requirements`)}>다시 선택</Button></span>}
                      </>
                    : <span style={{ color: '#f5a524' }}>⚠ 없음 <Button size="sm" onClick={() => router.push(`${base}/requirements`)} data-testid="aa-trace-add-measurement">측정 기준 입력</Button></span>}
                </div>
              )}
              {trace.gaps.length > 0 && <div style={{ ...muted, marginTop: 8 }} data-testid="aa-trace-gaps">빈칸: {trace.gaps.map((g) => GAP_LABEL[g]).join(' · ')}</div>}
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }} data-testid="aa-trace-columns">
              <Card><div style={col}>
                <b style={{ fontSize: 13 }}>컴포넌트 · 관계</b>
                {trace.components.map((c) => (
                  <button key={c.id} style={item} onClick={() => studio(`focus=${encodeURIComponent(c.id)}`)} data-testid="aa-trace-component">◫ {c.name} <span style={muted}>{c.type}</span></button>
                ))}
                {trace.relations.map((r) => (
                  <div key={r.id} style={{ ...item, cursor: 'default' }}>{r.from} → {r.to} {r.label && <span style={muted}>{r.label}</span>}</div>
                ))}
                {trace.strategyGates.map((g, i) => (
                  <div key={`${g.viewId}:${i}`} style={{ ...item, cursor: 'default' }} data-testid="aa-trace-gate">◆ {g.variant} · {g.name} <span style={muted}>{g.metric} {g.threshold} · 관찰 {g.observeMin}분</span></div>
                ))}
                {!trace.components.length && !trace.relations.length && (
                  <div style={gapBox}>⚠ 연결된 컴포넌트 없음<Button size="sm" onClick={() => studio('')}>Studio에서 연결</Button></div>
                )}
              </div></Card>
              <Card><div style={col}>
                <b style={{ fontSize: 13 }}>API Flow</b>
                {trace.flows.map((f) => (
                  <button key={f.id} style={item} onClick={() => studio(`flow=${encodeURIComponent(f.id)}`)} data-testid="aa-trace-flow">
                    ⇄ {f.name}{f.endpoint && <div style={{ ...muted, fontFamily: 'Consolas, monospace' }}>{f.endpoint}</div>}
                    <div style={{ ...muted, fontSize: 11.5 }}>{[f.linked ? '흐름이 연결' : null, f.measured ? '측정 대상' : null].filter(Boolean).join(' · ')}</div>
                  </button>
                ))}
                {!trace.flows.length && (req.kind === 'nfr'
                  ? <div style={gapBox}>⚠ 연결된 흐름 없음<Button size="sm" onClick={() => studio('flow=')}>API Flow 탭</Button></div>
                  : <span style={muted}>연결된 흐름 없음</span>)}
              </div></Card>
              <Card><div style={col}>
                <b style={{ fontSize: 13 }}>설계 결정 (ADR)</b>
                <div style={{ ...gapBox, color: 'rgba(245,165,36,0.85)' }}>⚠ 아직 없음 — Phase 3</div>
              </div></Card>
              <Card><div style={col}>
                <b style={{ fontSize: 13 }}>검증 · 결과</b>
                <div style={{ ...gapBox, color: 'rgba(245,165,36,0.85)' }} data-testid="aa-trace-phase3">⚠ 검증 없음 · 결과 없음 — Phase 3</div>
              </div></Card>
            </div>
            <div style={muted}>ADR·Validation·Evidence는 Phase 3에서 만듭니다. 지금은 빈칸으로만 보여줍니다.</div>
          </>
        )}
      </main>
    </>
  );
}
