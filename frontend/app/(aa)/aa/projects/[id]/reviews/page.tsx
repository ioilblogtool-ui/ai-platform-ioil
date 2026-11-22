'use client';

// SCR-09 Reviews (Sprint 5 Step 4 · P2-10). 외부 AI 수동 리뷰 목록 + 선택한 리뷰의 답변·검토 자료.
// 지적사항(Findings) 추출은 Sprint 6 이후 — 여기서는 답변을 그대로 보여준다.
import { use, useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/Button';
import Card, { EmptyState } from '@/components/Card';
import MarkdownPreview from '@/components/MarkdownPreview';
import PageHeader from '@/components/PageHeader';
import AskAiModal from '@/components/aa/AskAiModal';
import PasteAnswerModal from '@/components/aa/PasteAnswerModal';
import { AaApiError, getAaProject, getReview, listReviews } from '@/lib/aa/architecture-api';
import type { ReviewDetail, ReviewListItem } from '@/lib/aa/architecture-types';
import { TEMPLATE_LABEL } from '@/lib/aa/bundle-store';
import { requirementsRecordNote, staleNote, targetLabel } from '@/lib/aa/review-basis';

const PAGE = 50;
const muted: CSSProperties = { color: 'rgba(255,255,255,0.45)', fontSize: 12.5 };
const fmt = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function errorText(error: unknown) {
  if (error instanceof AaApiError && error.status === 404) return '프로젝트나 리뷰를 찾을 수 없습니다.';
  return error instanceof Error ? error.message : '불러오지 못했습니다.';
}

export default function ReviewsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Reviews key={id} id={id} />;
}

function Reviews({ id }: { id: string }) {
  const router = useRouter();
  const base = `/aa/projects/${id}`;
  const [name, setName] = useState('');
  const [items, setItems] = useState<ReviewListItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [modal, setModal] = useState<null | 'askai' | 'paste' | 'add'>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadList = useCallback(async (selectAfter?: string) => {
    try {
      const res = await listReviews(id, { limit: PAGE });
      setItems(res.data ?? []);
      setTotal(res.total ?? 0);
      setListError(null);
      setSelectedId((cur) => selectAfter ?? cur ?? res.data?.[0]?.id ?? null);
    } catch (error) {
      setListError(errorText(error));
    }
  }, [id]);

  const loadDetail = useCallback(async (reviewId: string) => {
    setDetailError(null);
    try {
      const d = await getReview(id, reviewId);
      setDetail(d);
    } catch (error) {
      setDetail(null);
      setDetailError(errorText(error));
    }
  }, [id]);

  useEffect(() => {
    getAaProject(id).then((p) => setName(p.name)).catch(() => {});
    void loadList();
  }, [id, loadList]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    if (detail?.id !== selectedId) setDetail(null);
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function saved(result: { reviewId: string; existing: boolean }, kind: 'new' | 'add') {
    setModal(null);
    setNotice(result.existing ? '이미 저장된 요청입니다 (중복 저장하지 않음).' : kind === 'new' ? '리뷰를 저장했습니다.' : '답변을 추가했습니다.');
    await loadList(result.reviewId);
    if (result.reviewId === selectedId) void loadDetail(result.reviewId);
  }

  return (
    <>
      <PageHeader title="리뷰" badge={name || undefined}
        breadcrumbs={[{ label: 'AA Workbench', href: '/aa/projects' }, { label: name || '프로젝트', href: base }]}
        actions={<div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={() => router.push(`${base}/architecture`)}>Studio</Button>
          <Button onClick={() => setModal('askai')} data-testid="aa-reviews-askai">검토 자료 복사</Button>
          <Button variant="primary" onClick={() => setModal('paste')} data-testid="aa-reviews-paste">답변 붙여넣기</Button>
        </div>}
      />
      <main style={{ padding: '20px 28px', display: 'grid', gridTemplateColumns: '360px minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
            <b style={{ fontSize: 14 }}>외부 AI 리뷰</b>
            <span style={{ ...muted, marginLeft: 8 }} data-testid="aa-reviews-total">{items ? `${total}건` : ''}</span>
          </div>
          {notice && <div role="status" data-testid="aa-reviews-notice" style={{ color: '#f3c97a', fontSize: 12.5, marginBottom: 10 }}>{notice}</div>}
          {listError && <div role="alert" style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#f87171', fontSize: 13 }}>{listError}<Button size="sm" onClick={() => void loadList()}>다시 시도</Button></div>}
          {!items && !listError && <span style={muted}>불러오는 중…</span>}
          {items && items.length === 0 && (
            <EmptyState icon="◇" text="아직 리뷰가 없습니다. [검토 자료 복사]로 외부 AI에 물어본 뒤 [답변 붙여넣기]로 저장하세요." />
          )}
          <div style={{ display: 'grid', gap: 6 }} data-testid="aa-reviews-list">
            {items?.map((r) => {
              const active = r.id === selectedId;
              return (
                <button key={r.id} onClick={() => setSelectedId(r.id)} data-testid="aa-review-item"
                  style={{ textAlign: 'left', cursor: 'pointer', padding: '10px 12px', borderRadius: 8, color: 'rgba(255,255,255,0.88)', font: 'inherit',
                    background: active ? 'rgba(200,169,110,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${active ? 'rgba(200,169,110,0.45)' : 'rgba(255,255,255,0.06)'}` }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                    <b>{r.tools.join(' · ') || '외부 AI'}</b>
                    <span style={{ ...muted, fontSize: 11.5 }}>답변 {r.answerCount}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ ...muted, fontSize: 11.5 }}>{fmt(r.createdAt)}</span>
                  </div>
                  <div style={{ ...muted, fontSize: 12, marginTop: 4 }}>
                    {r.bundleLinked ? `${r.scopeLabel ?? ''} · ${r.template ? TEMPLATE_LABEL[r.template] ?? r.template : ''} · ` : ''}
                    {targetLabel(r)}
                    {staleNote(r) && <span data-testid="aa-review-stale" style={{ marginLeft: 6, color: '#f5a524' }}>이전 기준 · {staleNote(r)}</span>}
                  </div>
                  {r.question && <div style={{ fontSize: 12, marginTop: 4, color: 'rgba(255,255,255,0.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Q. {r.question}</div>}
                </button>
              );
            })}
          </div>
          {items && total > items.length && <div style={{ ...muted, marginTop: 8 }}>최근 {items.length}건만 표시합니다.</div>}
        </Card>

        <div style={{ display: 'grid', gap: 16 }}>
          {detailError && <Card><div role="alert" style={{ color: '#f87171' }}>{detailError}</div></Card>}
          {selectedId && !detail && !detailError && <Card><span style={muted}>리뷰를 불러오는 중…</span></Card>}
          {detail && <ReviewPanel detail={detail} onAdd={() => setModal('add')} />}
        </div>
      </main>

      {modal === 'askai' && <AskAiModal projectId={id} projectName={name} onClose={() => setModal(null)} />}
      {modal === 'paste' && <PasteAnswerModal projectId={id} onClose={() => setModal(null)} onSaved={(r) => void saved(r, 'new')} />}
      {modal === 'add' && detail && (
        <PasteAnswerModal projectId={id} reviewId={detail.id} answers={detail.answers} onClose={() => setModal(null)} onSaved={(r) => void saved(r, 'add')} />
      )}
    </>
  );
}

function ReviewPanel({ detail, onAdd }: { detail: ReviewDetail; onAdd: () => void }) {
  const [showBundle, setShowBundle] = useState(false);
  const indexOf = new Map(detail.answers.map((a, i) => [a.id, i + 1]));
  return (
    <>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }} data-testid="aa-review-detail">
          <b style={{ fontSize: 15 }}>{detail.source.replace(/^external_ai:/, '외부 AI · ')}</b>
          <span style={muted}>{fmt(detail.createdAt)}</span>
          <span style={{ ...muted, color: '#c8a96e' }} data-testid="aa-review-basis">{targetLabel(detail)}</span>
          {staleNote(detail) && <span data-testid="aa-review-detail-stale" style={{ fontSize: 11.5, color: '#f5a524', border: '1px solid rgba(245,165,36,0.4)', borderRadius: 4, padding: '1px 6px' }}>이전 기준 · {staleNote(detail)}</span>}
          <span style={{ flex: 1 }} />
          <Button size="sm" variant="primary" onClick={onAdd} data-testid="aa-review-add">답변 추가</Button>
        </div>
        <div style={{ ...muted, marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <span>범위: {detail.scopeLabel ?? '번들 없음'}</span>
          {detail.template && <span>요청: {TEMPLATE_LABEL[detail.template] ?? detail.template}</span>}
          {detail.format && <span>형식: {detail.format === 'ai-md' ? 'Markdown' : 'JSON'}</span>}
        </div>
        {detail.question && <div style={{ marginTop: 8, fontSize: 13 }}>Q. {detail.question}</div>}
        <div role="note" style={{ marginTop: 10, fontSize: 12, color: '#f5a524' }}>AI 의견이며 검증된 결과가 아닙니다. 지적사항 정리는 다음 단계에서 지원합니다.</div>
        <div style={{ ...muted, marginTop: 6, fontSize: 12 }} data-testid="aa-review-req-record">{requirementsRecordNote(detail)}</div>
        {detail.bundleMd && (
          <div style={{ marginTop: 10 }}>
            <button onClick={() => setShowBundle((v) => !v)} data-testid="aa-review-bundle-toggle" style={{ background: 'none', border: 'none', color: '#c8a96e', cursor: 'pointer', fontSize: 12, padding: 0 }}>
              {showBundle ? '보낸 검토 자료 접기' : '보낸 검토 자료 보기'}
            </button>
            {showBundle && <pre data-testid="aa-review-bundle" style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, lineHeight: 1.55, marginTop: 8, padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.03)', maxHeight: 360, overflow: 'auto' }}>{detail.bundleMd}</pre>}
          </div>
        )}
      </Card>
      {detail.answers.map((a, i) => (
        <Card key={a.id}>
          <div data-testid="aa-review-answer" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <b style={{ fontSize: 13.5 }}>#{i + 1} {a.tool}</b>
            {a.followUpOf && <span style={{ ...muted, fontSize: 11.5 }}>#{indexOf.get(a.followUpOf) ?? '?'}의 후속</span>}
            <span style={{ flex: 1 }} />
            <span style={muted}>{fmt(a.createdAt)}</span>
          </div>
          {a.followUpQuestion && <div style={{ fontSize: 12.5, marginBottom: 8, color: 'rgba(255,255,255,0.7)' }}>Q. {a.followUpQuestion}</div>}
          <MarkdownPreview content={a.answerMd} />
        </Card>
      ))}
    </>
  );
}
