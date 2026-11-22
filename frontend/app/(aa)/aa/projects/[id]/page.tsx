'use client';

// SCR-04 Project Overview (Sprint 3 Step 4): 프로젝트 개요(README) · 현황 · 읽기 전용 미니 캔버스.
// 개요 저장은 Studio 자동 저장과 별개다 (PATCH readmeMd). 미니 캔버스는 Draft를 읽기만 한다.
import { use, useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/Button';
import Card, { EmptyState } from '@/components/Card';
import MarkdownPreview from '@/components/MarkdownPreview';
import PageHeader from '@/components/PageHeader';
import { AaApiError, getAaProject, getDraft, listRequirements, updateAaProject } from '@/lib/aa/architecture-api';
import type { AaProjectDetail, DraftResponse, Requirement } from '@/lib/aa/architecture-types';
import { miniCanvasLayout, unmappedNfrCount } from '@/lib/aa/overview';
import MiniCanvas from '@/components/aa/MiniCanvas';

const README_MAX_BYTES = 64 * 1024;
const muted: CSSProperties = { color: '#9a98a8', fontSize: 13 };
const textarea: CSSProperties = {
  width: '100%', minHeight: 320, boxSizing: 'border-box', resize: 'vertical', padding: '10px 12px', borderRadius: 8,
  background: '#131316', color: '#e2e0db', border: '1px solid #ffffff20', font: '13px/1.6 Consolas, monospace',
};
const heading: CSSProperties = { margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#e2e0db' };

export default function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ProjectOverview key={id} id={id} />;
}

type Loaded<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; data: T };

function message(error: unknown) {
  if (error instanceof AaApiError && error.code === 'NOT_FOUND') return '프로젝트를 찾을 수 없습니다.';
  return error instanceof Error ? error.message : '불러오지 못했습니다.';
}

function ProjectOverview({ id }: { id: string }) {
  const router = useRouter();
  const [project, setProject] = useState<Loaded<AaProjectDetail>>({ status: 'loading' });
  const [draft, setDraft] = useState<Loaded<DraftResponse>>({ status: 'loading' });
  const [requirements, setRequirements] = useState<Requirement[] | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    getAaProject(id).then((data) => active && setProject({ status: 'ok', data }))
      .catch((error) => active && setProject({ status: 'error', message: message(error) }));
    getDraft(id).then((data) => active && setDraft({ status: 'ok', data }))
      .catch((error) => active && setDraft({ status: 'error', message: message(error) }));
    listRequirements(id, { limit: 200 }).then((res) => active && setRequirements(res.data))
      .catch(() => active && setRequirements(null));
    return () => { active = false; };
  }, [id, refresh]);

  const base = `/aa/projects/${id}`;
  const name = project.status === 'ok' ? project.data.name : '';

  if (project.status === 'error') {
    return <>
      <PageHeader title="프로젝트 개요" breadcrumbs={[{ label: 'AA Workbench', href: '/aa/projects' }]} />
      <main style={{ padding: '24px 28px' }}>
        <Card><div role="alert" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ color: '#f87171' }}>{project.message}</span>
          <Button onClick={() => { setProject({ status: 'loading' }); setDraft({ status: 'loading' }); setRefresh((v) => v + 1); }}>다시 시도</Button>
          <Button onClick={() => router.push('/aa/projects')}>목록으로</Button>
        </div></Card>
      </main>
    </>;
  }

  return (
    <>
      <PageHeader title={name || '프로젝트 개요'}
        breadcrumbs={[{ label: 'AA Workbench', href: '/aa/projects' }]}
        actions={<div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={() => router.push(`${base}/requirements`)}>요구사항</Button>
          <Button variant="primary" onClick={() => router.push(`${base}/architecture`)}>Studio 열기 ▸</Button>
        </div>}
      />
      <main style={{ padding: '24px 28px', display: 'grid', gap: 16, maxWidth: 1280 }}>
        {project.status === 'loading'
          ? <Card><span style={muted}>프로젝트를 불러오는 중…</span></Card>
          : <ReadmeCard key={project.data.updatedAt} project={project.data} onSaved={(data) => setProject({ status: 'ok', data: { ...project.data, ...data } })} />}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 260px', gap: 16, alignItems: 'start' }}>
          <Card>
            <h2 style={heading}>아키텍처 미리보기 · Logical (읽기 전용)</h2>
            <DraftPreview draft={draft} onOpen={() => router.push(`${base}/architecture`)} />
          </Card>
          <Card>
            <h2 style={heading}>현황</h2>
            <Status project={project.status === 'ok' ? project.data : null}
              draft={draft.status === 'ok' ? draft.data : null} requirements={requirements} />
          </Card>
        </div>
      </main>
    </>
  );
}

function ReadmeCard({ project, onSaved }: { project: AaProjectDetail; onSaved: (data: { readmeMd: string; updatedAt: string }) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(project.readmeMd ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dirty = editing && text !== (project.readmeMd ?? '');
  const tooLarge = new TextEncoder().encode(text).length > README_MAX_BYTES;

  // 저장하지 않은 개요 편집이 있으면 이탈 경고
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save() {
    if (tooLarge || saving) return;
    setSaving(true);
    setError('');
    try {
      // 빈 문자열도 그대로 저장한다 (템플릿을 다시 붙이지 않음)
      const saved = await updateAaProject(project.id, { readmeMd: text });
      onSaved({ readmeMd: saved.readmeMd, updatedAt: saved.updatedAt });
      setEditing(false);
    } catch (err) {
      // 실패해도 입력한 내용은 남긴다
      setError(err instanceof Error ? err.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <h2 style={{ ...heading, margin: 0, flex: 1 }}>프로젝트 개요</h2>
        {editing ? <>
          <span style={{ ...muted, color: tooLarge ? '#f87171' : '#9a98a8' }}>{Math.ceil(new TextEncoder().encode(text).length / 1024)}KB / 64KB</span>
          <Button size="sm" disabled={saving} onClick={() => { setEditing(false); setText(project.readmeMd ?? ''); setError(''); }}>취소</Button>
          <Button size="sm" variant="primary" disabled={saving || tooLarge || !dirty} onClick={() => void save()}>{saving ? '저장 중…' : '저장'}</Button>
        </> : <Button size="sm" onClick={() => setEditing(true)}>편집</Button>}
      </div>
      {error && <div role="alert" style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>{error}</div>}
      {tooLarge && <div role="alert" style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>개요는 UTF-8 기준 64KB 이하여야 합니다.</div>}
      {editing ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <textarea aria-label="프로젝트 개요 Markdown" style={textarea} value={text} onChange={(event) => setText(event.target.value)} />
          <div aria-label="개요 미리보기" style={{ minHeight: 320, padding: '4px 4px 4px 12px', borderLeft: '1px solid #ffffff14', overflow: 'auto' }}>
            {text.trim() ? <MarkdownPreview content={text} /> : <span style={muted}>미리볼 내용이 없습니다.</span>}
          </div>
        </div>
      ) : (project.readmeMd ?? '').trim()
        ? <div data-testid="aa-readme-view"><MarkdownPreview content={project.readmeMd} /></div>
        : <span style={muted}>개요가 비어 있습니다. [편집]을 눌러 목적·범위·가정을 적어 두세요.</span>}
    </Card>
  );
}

function DraftPreview({ draft, onOpen }: { draft: Loaded<DraftResponse>; onOpen: () => void }) {
  if (draft.status === 'loading') return <span style={muted}>설계를 불러오는 중…</span>;
  if (draft.status === 'error') return <span role="alert" style={{ color: '#f87171', fontSize: 13 }}>설계를 불러오지 못했습니다: {draft.message}</span>;
  const layout = miniCanvasLayout(draft.data.model);
  if (!layout) {
    return <div style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
      <EmptyState icon="◇" text="아직 그린 컴포넌트가 없습니다." />
      <Button size="sm" onClick={onOpen}>Studio에서 그리기 ▸</Button>
    </div>;
  }
  return <MiniCanvas layout={layout} />;
}

function Status({ project, draft, requirements }: { project: AaProjectDetail | null; draft: DraftResponse | null; requirements: Requirement[] | null }) {
  const view = draft?.model.views.find((entry) => entry.id === 'view_logical');
  const rows: [string, string][] = [
    ['상태', project ? (project.status === 'archived' ? '보관됨' : '진행 중') : '…'],
    ['요구사항', project ? `FR ${project.counts.fr} / NFR ${project.counts.nfr}` : '…'],
    ['연결 안 된 NFR', draft && requirements ? String(unmappedNfrCount(draft.model, requirements)) : '–'],
    ['컴포넌트', draft ? String(Object.keys(draft.model.components).length) : '…'],
    ['관계', draft ? String(Object.keys(draft.model.relations).length) : '…'],
    ['Logical 노드', view ? String(view.nodes.length) : '…'],
    ['Draft', draft ? `rev ${draft.revision}` : '…'],
  ];
  return (
    <dl data-testid="aa-overview-status" style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 12px', fontSize: 13 }}>
      {rows.map(([label, value]) => <Row key={label} label={label} value={value} />)}
      <dt style={{ ...muted, gridColumn: '1 / -1', marginTop: 6 }}>버전 · Findings · Validation · ADR은 Phase 2~3에서 표시합니다.</dt>
    </dl>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <>
    <dt style={muted}>{label}</dt>
    <dd style={{ margin: 0, textAlign: 'right', color: '#e2e0db' }}>{value}</dd>
  </>;
}
