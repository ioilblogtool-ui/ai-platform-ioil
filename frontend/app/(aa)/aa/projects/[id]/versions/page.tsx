'use client';

// 버전 목록·열람·복원 (Sprint 6 Step 3 · VER-05·07 · Q6·Q8).
// 왼쪽: 발행한 버전 목록(최신 먼저). 오른쪽: 선택한 버전의 읽기 전용 구성도·컴포넌트·관계·발행 당시 요구사항·개요.
// 복원은 확인 창을 거쳐 Draft를 그 버전으로 덮어쓴다(revision +1). 지금 없는 요구사항 연결은 같은 저장에서 빠진다.
import { use, useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/Button';
import Card, { EmptyState } from '@/components/Card';
import MarkdownPreview from '@/components/MarkdownPreview';
import PageHeader from '@/components/PageHeader';
import MiniCanvas from '@/components/aa/MiniCanvas';
import { AaApiError, getAaProject, getDraft, getVersion, listVersions, restoreVersion } from '@/lib/aa/architecture-api';
import type { DraftResponse, VersionDetail, VersionListItem } from '@/lib/aa/architecture-types';
import { miniCanvasLayout } from '@/lib/aa/overview';
import { layoutNote, summaryParts } from '@/lib/aa/version-format';

const muted: CSSProperties = { color: 'rgba(255,255,255,0.45)', fontSize: 12.5 };
const cell: CSSProperties = { padding: '7px 10px', textAlign: 'left', borderBottom: '1px solid #ffffff0d', fontSize: 12.5, verticalAlign: 'top' };
const fmt = (iso: string) => new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function errorText(error: unknown) {
  if (error instanceof AaApiError && error.status === 404) return '프로젝트나 버전을 찾을 수 없습니다.';
  return error instanceof Error ? error.message : '불러오지 못했습니다.';
}

export default function VersionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Versions key={id} id={id} />;
}

function Versions({ id }: { id: string }) {
  const router = useRouter();
  const base = `/aa/projects/${id}`;
  const [name, setName] = useState('');
  const [items, setItems] = useState<VersionListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<DraftResponse | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [notice, setNotice] = useState<{ text: string; warn?: boolean } | null>(null);

  const loadList = useCallback(async () => {
    try {
      const res = await listVersions(id, { limit: 200 });
      setItems(res.data ?? []);
      setListError(null);
      setSelectedId((cur) => cur ?? res.data?.[0]?.id ?? null);
    } catch (error) {
      setListError(errorText(error));
    }
  }, [id]);

  useEffect(() => {
    getAaProject(id).then((p) => setName(p.name)).catch(() => {});
    void loadList();
  }, [id, loadList]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let alive = true;
    setDetailError(null);
    getVersion(id, selectedId)
      .then((d) => { if (alive) setDetail(d); })
      .catch((e) => { if (alive) { setDetail(null); setDetailError(errorText(e)); } });
    return () => { alive = false; };
  }, [id, selectedId]);

  async function askRestore() {
    setNotice(null);
    try {
      setConfirming(await getDraft(id));   // 확인 창에 지금 Draft revision·base를 보여준다
    } catch (e) {
      setNotice({ text: errorText(e), warn: true });
    }
  }

  async function doRestore() {
    if (!detail || !confirming) return;
    setRestoring(true);
    try {
      const r = await restoreVersion(id, detail.id, confirming.revision);
      const removed = r.warnings.flatMap((w) => w.removedIds ?? []);
      setNotice({
        text: `${detail.label}으로 복원했습니다 (Draft rev ${r.revision}).${removed.length ? ` 지금 프로젝트에 없는 요구사항 연결 ${removed.length}개는 뺐습니다.` : ''}`,
        warn: removed.length > 0,
      });
      setConfirming(null);
    } catch (e) {
      setConfirming(null);
      setNotice({ text: e instanceof AaApiError && e.code === 'REVISION_CONFLICT' ? '그 사이 Draft가 저장되었습니다. 다시 복원을 눌러 최신 revision으로 확인하세요.' : errorText(e), warn: true });
    } finally {
      setRestoring(false);
    }
  }

  const latestId = items?.[0]?.id;

  return (
    <>
      <PageHeader title="버전" badge={name || undefined}
        breadcrumbs={[{ label: 'AA Workbench', href: '/aa/projects' }, { label: name || '프로젝트', href: base }]}
        actions={<div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={() => router.push(`${base}/reviews`)}>리뷰</Button>
          <Button variant="primary" onClick={() => router.push(`${base}/architecture`)}>Studio 열기 ▸</Button>
        </div>}
      />
      <main style={{ padding: '20px 28px', display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
            <b style={{ fontSize: 14 }}>발행한 버전</b>
            <span style={{ ...muted, marginLeft: 8 }} data-testid="aa-versions-total">{items ? `${items.length}개` : ''}</span>
          </div>
          {listError && <div role="alert" style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#f87171', fontSize: 13 }}>{listError}<Button size="sm" onClick={() => void loadList()}>다시 시도</Button></div>}
          {!items && !listError && <span style={muted}>불러오는 중…</span>}
          {items && items.length === 0 && <EmptyState icon="◇" text="아직 발행한 버전이 없습니다. Studio의 [Publish]로 지금 Draft를 버전으로 남기세요." />}
          <div style={{ display: 'grid', gap: 6 }} data-testid="aa-versions-list">
            {items?.map((v) => {
              const active = v.id === selectedId;
              return (
                <button key={v.id} onClick={() => setSelectedId(v.id)} data-testid="aa-version-item"
                  style={{ textAlign: 'left', cursor: 'pointer', padding: '10px 12px', borderRadius: 8, color: 'rgba(255,255,255,0.88)', font: 'inherit',
                    background: active ? 'rgba(200,169,110,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${active ? 'rgba(200,169,110,0.45)' : 'rgba(255,255,255,0.06)'}` }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                    <b>{v.label}</b>
                    {v.id === latestId && <span style={{ fontSize: 10.5, color: '#c8a96e', border: '1px solid rgba(200,169,110,0.4)', borderRadius: 4, padding: '0 5px' }}>최신</span>}
                    <span style={{ flex: 1 }} />
                    <span style={{ ...muted, fontSize: 11.5 }}>{fmt(v.createdAt)}</span>
                  </div>
                  {v.note && <div style={{ fontSize: 12, marginTop: 4, color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.note}</div>}
                  <div style={{ ...muted, fontSize: 11.5, marginTop: 4 }}>{summaryParts(v.diffSummary).join(' · ') || '—'}</div>
                </button>
              );
            })}
          </div>
        </Card>

        <div style={{ display: 'grid', gap: 16 }}>
          {notice && <div role="status" data-testid="aa-versions-notice" style={{ color: notice.warn ? '#f5a524' : '#f3c97a', fontSize: 13, display: 'flex', gap: 10, alignItems: 'center' }}>
            {notice.text}<Button size="sm" onClick={() => router.push(`${base}/architecture`)}>Studio에서 보기</Button>
          </div>}
          {detailError && <Card><div role="alert" style={{ color: '#f87171' }}>{detailError}</div></Card>}
          {selectedId && !detail && !detailError && <Card><span style={muted}>버전을 불러오는 중…</span></Card>}
          {detail && <VersionDetailView detail={detail} onRestore={() => void askRestore()}
            onCompare={(from, to) => router.push(`${base}/compare?from=${from}&to=${to}`)}
            previousId={items?.[(items?.findIndex((v) => v.id === detail.id) ?? -1) + 1]?.id ?? null} />}
        </div>
      </main>

      {confirming && detail && (
        <div onClick={() => !restoring && setConfirming(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
          <div role="dialog" aria-modal="true" aria-label="버전 복원" data-testid="aa-restore-dialog" onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(500px, 94vw)', background: '#111114', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 20, display: 'grid', gap: 12, color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>
            <b style={{ fontSize: 15 }}>{detail.label}으로 복원</b>
            <div>지금 Draft(rev {confirming.revision}{confirming.baseVersion ? ` · base ${confirming.baseVersion.label}` : ''})를 {detail.label}의 설계로 덮어씁니다. Draft revision이 하나 올라갑니다.</div>
            <div style={{ color: '#f5a524' }}>
              {confirming.baseVersion?.id === latestId
                ? '최신 버전 이후 Draft에서 바꾼 내용은 발행하지 않았다면 사라집니다.'
                : '아직 버전으로 발행하지 않은 Draft 변경은 사라집니다. 필요하면 먼저 Studio에서 Publish하세요.'}
            </div>
            <div style={muted}>다른 탭에서 Studio를 열어 두었다면 그 탭의 저장은 충돌로 멈추고, 그 탭의 편집은 브라우저 복구본으로 남습니다. 지금 프로젝트에 없는 요구사항 연결은 복원하지 않습니다.</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button disabled={restoring} onClick={() => setConfirming(null)}>취소</Button>
              <Button variant="danger" disabled={restoring} onClick={() => void doRestore()} data-testid="aa-restore-confirm">{restoring ? '복원 중…' : '복원'}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function VersionDetailView({ detail, onRestore, onCompare, previousId }: { detail: VersionDetail; onRestore: () => void; onCompare: (from: string, to: string) => void; previousId: string | null }) {
  const [showReadme, setShowReadme] = useState(false);
  const layout = miniCanvasLayout(detail.model);
  const components = Object.values(detail.model.components).sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = (cid: string) => detail.model.components[cid]?.name ?? '?';
  const relations = Object.values(detail.model.relations);
  const reqCode = new Map(detail.requirements.map((r) => [r.id, r.code]));
  const codes = (ids: string[]) => ids.map((rid) => reqCode.get(rid)).filter(Boolean).join(', ') || '—';
  const parts = summaryParts(detail.diffSummary);
  const note = layoutNote(detail.diffSummary);
  return (
    <>
      <Card>
        <div data-testid="aa-version-detail" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 16 }}>{detail.label}</b>
          <span style={muted}>#{detail.versionNo} · {fmt(detail.createdAt)} · Draft rev {detail.sourceRevision}에서 발행</span>
          <span style={{ flex: 1 }} />
          {previousId && <Button size="sm" onClick={() => onCompare(previousId, detail.id)} data-testid="aa-version-compare-prev">이전 버전과 비교</Button>}
          <Button size="sm" onClick={() => onCompare(detail.id, 'draft')} data-testid="aa-version-compare-draft">Draft와 비교</Button>
          <Button size="sm" variant="danger" onClick={onRestore} data-testid="aa-version-restore">이 버전으로 복원</Button>
        </div>
        {detail.note && <div style={{ marginTop: 10, fontSize: 13 }} data-testid="aa-version-note">{detail.note}</div>}
        <div style={{ ...muted, marginTop: 8 }}>{parts.join(' · ') || '—'}{note ? ` (${note})` : ''}</div>
        <div style={{ ...muted, marginTop: 4, fontSize: 11.5 }}>읽기 전용 — 발행한 버전은 고칠 수 없습니다.</div>
      </Card>

      <Card>
        <b style={{ fontSize: 13.5 }}>구성도 · Logical</b>
        <div style={{ marginTop: 10 }}>
          {layout ? <MiniCanvas layout={layout} label={`${detail.label} Logical View`} testId="aa-version-canvas" /> : <span style={muted}>그린 컴포넌트가 없습니다.</span>}
        </div>
      </Card>

      <Card>
        <b style={{ fontSize: 13.5 }}>발행 당시 요구사항</b>
        {detail.requirements.length === 0
          ? <div style={{ ...muted, marginTop: 8 }}>설계에 연결된 요구사항이 없었습니다.</div>
          : <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }} data-testid="aa-version-requirements">
              <thead><tr><th style={cell}>코드</th><th style={cell}>제목</th><th style={cell}>목표</th><th style={cell}>측정</th><th style={cell}>지금</th></tr></thead>
              <tbody>
                {detail.requirements.map((r) => (
                  <tr key={r.id}>
                    <td style={cell}>{r.code}</td>
                    <td style={cell}>{r.title}</td>
                    <td style={cell}>{r.target ?? '—'}</td>
                    <td style={cell}>{r.metric ?? '—'}</td>
                    <td style={{ ...cell, color: r.deleted || r.current ? '#f5a524' : 'rgba(255,255,255,0.45)' }}>
                      {r.deleted ? '삭제됨' : r.current ? `현재: ${[r.current.title !== r.title ? r.current.title : null, r.current.target !== r.target ? r.current.target ?? '목표 없음' : null, r.current.metric !== r.metric ? r.current.metric ?? '측정 없음' : null, r.current.priority !== r.priority ? r.current.priority : null].filter(Boolean).join(' · ')}` : '같음'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>}
      </Card>

      <Card>
        <b style={{ fontSize: 13.5 }}>컴포넌트 {components.length} · 관계 {relations.length}</b>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
          <thead><tr><th style={cell}>이름</th><th style={cell}>타입</th><th style={cell}>기술</th><th style={cell}>요구사항</th></tr></thead>
          <tbody>{components.map((c) => <tr key={c.id}><td style={cell}>{c.name}</td><td style={cell}>{c.type}</td><td style={cell}>{c.technology ?? '—'}</td><td style={cell}>{codes(c.requirementIds)}</td></tr>)}</tbody>
        </table>
        {relations.length > 0 && <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
          <thead><tr><th style={cell}>관계</th><th style={cell}>프로토콜</th><th style={cell}>설명</th><th style={cell}>요구사항</th></tr></thead>
          <tbody>{relations.map((r) => <tr key={r.id}><td style={cell}>{nameOf(r.from)} → {nameOf(r.to)}</td><td style={cell}>{[r.protocol, r.mode === 'async' ? '비동기' : r.mode === 'sync' ? '동기' : null].filter(Boolean).join(' · ') || '—'}</td><td style={cell}>{r.label ?? '—'}</td><td style={cell}>{codes(r.requirementIds)}</td></tr>)}</tbody>
        </table>}
      </Card>

      <Card>
        <button onClick={() => setShowReadme((v) => !v)} style={{ background: 'none', border: 'none', color: '#c8a96e', cursor: 'pointer', fontSize: 12.5, padding: 0 }} data-testid="aa-version-readme-toggle">
          {showReadme ? '발행 당시 개요 접기' : '발행 당시 개요 보기'}
        </button>
        {showReadme && <div style={{ marginTop: 10 }}>{detail.readmeMd ? <MarkdownPreview content={detail.readmeMd} /> : <span style={muted}>개요가 비어 있었습니다.</span>}</div>}
      </Card>
    </>
  );
}
