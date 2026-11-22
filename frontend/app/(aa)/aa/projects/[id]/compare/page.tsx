'use client';

// Version Compare (Sprint 7 Step 4 · VER-06 · 05 §4).
// 위: 비교 대상(from 버전 → to 버전 또는 Draft)과 [배치 포함] 토글. 왼쪽: 종류별 변경 목록. 오른쪽: View 선택 + 미니 캔버스
// (to 기준, 새로 생긴 노드는 초록·바뀐 노드는 주황). to에서 지운 View는 from 모델로 그린다. 읽기 전용.
import { Suspense, use, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Button from '@/components/Button';
import Card, { EmptyState } from '@/components/Card';
import PageHeader from '@/components/PageHeader';
import MiniCanvas from '@/components/aa/MiniCanvas';
import { AaApiError, compareVersions, getAaProject, getDraft, getVersion, listVersions } from '@/lib/aa/architecture-api';
import type { ArchitectureModel, CompareResult, VersionListItem } from '@/lib/aa/architecture-types';
import { groupChanges, highlightNodes, onlyLayout, viewLabel, type Tone } from '@/lib/aa/compare-format';
import { miniCanvasLayout } from '@/lib/aa/overview';
import { layoutNote, summaryParts } from '@/lib/aa/version-format';

const muted: CSSProperties = { color: 'rgba(255,255,255,0.45)', fontSize: 12.5 };
const select: CSSProperties = { background: '#111114', color: 'rgba(255,255,255,0.88)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '5px 8px', fontSize: 12.5 };
const TONE: Record<Tone, { mark: string; color: string }> = {
  added: { mark: '+', color: '#4ade80' },
  removed: { mark: '−', color: '#f87171' },
  modified: { mark: '~', color: '#f5a524' },
};

function errorText(error: unknown) {
  if (error instanceof AaApiError && error.status === 404) return '프로젝트나 버전을 찾을 수 없습니다.';
  return error instanceof Error ? error.message : '불러오지 못했습니다.';
}

export default function ComparePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense fallback={null}><Compare key={id} id={id} /></Suspense>;
}

function Compare({ id }: { id: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const base = `/aa/projects/${id}`;
  const [name, setName] = useState('');
  const [versions, setVersions] = useState<VersionListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const from = search.get('from') ?? '';
  const to = search.get('to') ?? '';
  const includeLayout = search.get('layout') === '1';
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<{ from: ArchitectureModel | null; to: ArchitectureModel | null }>({ from: null, to: null });
  const [viewId, setViewId] = useState('view_logical');

  const go = (next: { from?: string; to?: string; layout?: boolean }) => {
    const q = new URLSearchParams();
    q.set('from', next.from ?? from);
    q.set('to', next.to ?? to);
    if (next.layout ?? includeLayout) q.set('layout', '1');
    router.replace(`${base}/compare?${q.toString()}`);
  };

  useEffect(() => {
    getAaProject(id).then((p) => setName(p.name)).catch(() => {});
    listVersions(id, { limit: 200 }).then((r) => setVersions(r.data ?? [])).catch((e) => setListError(errorText(e)));
  }, [id]);

  // 대상이 비었으면 기본값: 최신 버전 → Draft
  useEffect(() => {
    if (!versions?.length || (from && to)) return;
    go({ from: from || versions[0].id, to: to || 'draft' });
  }, [versions]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!from || !to) return;
    let alive = true;
    setError(null);
    setResult(null);
    if (from === to) { setError('같은 대상끼리는 비교할 수 없습니다. 다른 버전을 고르세요.'); return; }
    compareVersions(id, { from, to, includeLayout })
      .then((r) => { if (alive) setResult(r); })
      .catch((e) => { if (alive) setError(errorText(e)); });
    return () => { alive = false; };
  }, [id, from, to, includeLayout]);

  // 미니 캔버스용 모델 (비교 응답에는 모델이 없다)
  useEffect(() => {
    if (!from || !to || from === to) return;
    let alive = true;
    Promise.all([getVersion(id, from).then((v) => v.model), to === 'draft' ? getDraft(id).then((d) => d.model) : getVersion(id, to).then((v) => v.model)])
      .then(([a, b]) => { if (alive) setModels({ from: a, to: b }); })
      .catch(() => { if (alive) setModels({ from: null, to: null }); });
    return () => { alive = false; };
  }, [id, from, to]);

  const allViews = useMemo(() => {
    if (!result) return [];
    const seen = new Set(result.views.to.map((v) => v.id));
    return [...result.views.to.map((v) => ({ ...v, removed: false })), ...result.views.from.filter((v) => !seen.has(v.id)).map((v) => ({ ...v, removed: true }))];
  }, [result]);
  const groups = useMemo(() => (result ? groupChanges(result.changes, [...(result.views.from ?? []), ...(result.views.to ?? [])]) : []), [result]);
  const current = allViews.find((v) => v.id === viewId) ?? allViews[0];
  const canvasModel = current?.removed ? models.from : models.to;
  const layout = current ? miniCanvasLayout(canvasModel, current.id) : null;
  const marks = current && !current.removed && result ? highlightNodes(result.changes, models.to, current.id) : { added: new Set<string>(), modified: new Set<string>() };
  const toLabel = result ? (result.to.type === 'draft' ? `Draft rev ${result.to.revision}` : result.to.label) : '';

  return (
    <>
      <PageHeader title="버전 비교" badge={name || undefined}
        breadcrumbs={[{ label: 'AA Workbench', href: '/aa/projects' }, { label: name || '프로젝트', href: base }, { label: '버전', href: `${base}/versions` }]}
        actions={<div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={() => router.push(`${base}/versions`)}>버전</Button>
          <Button variant="primary" onClick={() => router.push(`${base}/architecture`)}>Studio 열기 ▸</Button>
        </div>}
      />
      <main style={{ padding: '20px 28px', display: 'grid', gap: 16 }}>
        {listError && <Card><div role="alert" style={{ color: '#f87171' }}>{listError}</div></Card>}
        {versions && versions.length === 0 && <Card><EmptyState icon="◇" text="발행한 버전이 없어 비교할 수 없습니다. Studio의 [Publish]로 먼저 버전을 남기세요." /></Card>}
        {versions && versions.length > 0 && (
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>이전
                <select aria-label="이전 (from)" data-testid="aa-compare-from" value={from} onChange={(e) => go({ from: e.target.value })} style={select}>
                  {versions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              </label>
              <span style={muted}>→</span>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>이후
                <select aria-label="이후 (to)" data-testid="aa-compare-to" value={to} onChange={(e) => go({ to: e.target.value })} style={select}>
                  <option value="draft">Draft (발행 전 작업본)</option>
                  {versions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 8 }}>
                <input type="checkbox" data-testid="aa-compare-layout" checked={includeLayout} onChange={(e) => go({ layout: e.target.checked })} />
                배치(좌표·크기) 변경도 보기
              </label>
              <span style={{ flex: 1 }} />
              {result && <span style={muted} data-testid="aa-compare-summary">{summaryParts(result.summary).join(' · ') || '의미 변경 없음'}{!includeLayout && layoutNote(result.summary) ? ` (${layoutNote(result.summary)} · 토글을 켜면 목록)` : ''}</span>}
            </div>
          </Card>
        )}
        {error && <Card><div role="alert" data-testid="aa-compare-error" style={{ color: '#f87171' }}>{error}</div></Card>}
        {from && to && !result && !error && <Card><span style={muted}>비교하는 중…</span></Card>}

        {result && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: 16, alignItems: 'start' }}>
            <Card>
              <b style={{ fontSize: 14 }}>{result.from.label} → {toLabel}</b>
              <span style={{ ...muted, marginLeft: 8 }} data-testid="aa-compare-count">변경 {result.changes.length}건</span>
              {result.changes.length === 0 && <div style={{ ...muted, marginTop: 10 }} data-testid="aa-compare-empty">
                달라진 내용이 없습니다.{!includeLayout ? ' 좌표·크기 변경은 [배치 변경도 보기]를 켜면 보입니다.' : ''}
              </div>}
              {onlyLayout(result.changes) && <div style={{ ...muted, marginTop: 10 }}>배치만 바뀌었습니다. 발행할 의미 변경은 없습니다.</div>}
              <div style={{ display: 'grid', gap: 14, marginTop: 12 }} data-testid="aa-compare-groups">
                {groups.map((g) => (
                  <section key={g.key} data-testid={`aa-compare-group-${g.key}`}>
                    <div style={{ fontSize: 12, color: '#c8a96e', marginBottom: 6 }}>{g.title} · {g.items.length}</div>
                    <div style={{ display: 'grid', gap: 4 }}>
                      {g.items.map((it, i) => (
                        <button key={i} data-testid="aa-compare-item" data-kind={it.change.kind} disabled={!it.viewId}
                          onClick={() => it.viewId && setViewId(it.viewId)}
                          style={{ textAlign: 'left', font: 'inherit', fontSize: 12.5, color: 'rgba(255,255,255,0.86)', padding: '6px 9px', borderRadius: 6,
                            cursor: it.viewId ? 'pointer' : 'default', background: it.viewId && it.viewId === current?.id ? 'rgba(200,169,110,0.08)' : 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.06)' }}>
                          <span style={{ color: TONE[it.tone].color, fontWeight: 700, marginRight: 6 }}>{TONE[it.tone].mark}</span>{it.text}
                          {it.detail && <div style={{ ...muted, fontSize: 11.5, marginTop: 2, paddingLeft: 14 }}>{it.detail}</div>}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </Card>

            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <b style={{ fontSize: 13.5 }}>구성도</b>
                <select aria-label="View 선택" data-testid="aa-compare-view" value={current?.id ?? ''} onChange={(e) => setViewId(e.target.value)} style={select}>
                  {allViews.map((v) => <option key={v.id} value={v.id}>{viewLabel(v)}{v.removed ? ' (삭제됨)' : ''}</option>)}
                </select>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11.5, color: '#4ade80' }}>■ 새로 생김</span>
                <span style={{ fontSize: 11.5, color: '#f5a524' }}>■ 바뀜</span>
              </div>
              <div style={{ ...muted, fontSize: 11.5, marginTop: 6 }}>
                {current?.removed ? `${toLabel}에서 지운 View입니다. ${result.from.label}의 모습을 보여줍니다.` : `${toLabel} 기준. 지운 항목은 왼쪽 목록에서 확인하세요.`}
              </div>
              <div style={{ marginTop: 10 }}>
                {layout ? <MiniCanvas layout={layout} height={380} highlight={marks.added} modified={marks.modified} label={`${current ? viewLabel(current) : ''} 비교`} testId="aa-compare-canvas" />
                  : <span style={muted}>{canvasModel ? '이 View에 그린 노드가 없습니다.' : '구성도를 불러오는 중…'}</span>}
              </div>
            </Card>
          </div>
        )}
      </main>
    </>
  );
}
