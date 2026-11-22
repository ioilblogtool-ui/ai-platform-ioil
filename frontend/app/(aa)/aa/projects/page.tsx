'use client';

// SCR-02 Project List
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import Button from '@/components/Button';
import Card, { EmptyState } from '@/components/Card';
import NewProjectModal from '@/components/aa/NewProjectModal';
import ReadmeExportModal from '@/components/aa/ReadmeExportModal';
import { listAaProjects, AaApiError } from '@/lib/aa/architecture-api';
import type { AaProjectSummary } from '@/lib/aa/architecture-types';

function ago(iso: string | null): string {
  if (!iso) return '—';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

export default function AaProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<AaProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [exporting, setExporting] = useState<AaProjectSummary | null>(null);

  // 행 메뉴 바깥을 누르면 닫는다
  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuFor]);

  useEffect(() => {
    const t = setTimeout(() => {
      listAaProjects({ status: 'active', q: q.trim() || undefined, limit: 100 })
        .then((res) => { setProjects(res.data); setError(null); })
        .catch((e) => setError(e instanceof AaApiError ? e.message : '목록을 불러오지 못했습니다.'));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q]);

  const th: React.CSSProperties = { textAlign: 'left', color: '#5a5870', fontWeight: 500, fontSize: 11.5, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' };
  const td: React.CSSProperties = { padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13 };

  return (
    <>
      <PageHeader
        title="Architecture Projects"
        breadcrumbs={[{ label: 'AA Workbench' }]}
        actions={<Button variant="primary" onClick={() => setShowNew(true)}>＋ New Project</Button>}
      />
      <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 220px))', gap: 12 }}>
          <Card><div style={{ fontSize: 12, color: '#7a7888' }}>프로젝트</div><div style={{ fontSize: 24, fontWeight: 650, marginTop: 6 }}>{projects?.length ?? '–'}</div></Card>
          <Card><div style={{ fontSize: 12, color: '#7a7888' }}>Published 버전</div><div style={{ fontSize: 24, fontWeight: 650, marginTop: 6, color: '#5a5870' }}>Phase 2</div></Card>
          <Card><div style={{ fontSize: 12, color: '#7a7888' }}>Open Findings</div><div style={{ fontSize: 24, fontWeight: 650, marginTop: 6, color: '#5a5870' }}>Phase 3</div></Card>
        </div>

        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 프로젝트 검색" aria-label="프로젝트 검색" style={{
          width: 280, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
          padding: '8px 11px', color: 'rgba(255,255,255,0.9)', fontSize: 13, outline: 'none',
        }} />

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {error && <div role="alert" style={{ padding: 16, color: '#f87171', fontSize: 13 }}>{error}</div>}
          {!error && projects === null && <div style={{ padding: 16, color: '#5a5870', fontSize: 13 }}>불러오는 중…</div>}
          {!error && projects?.length === 0 && (
            <div style={{ padding: '12px 0 20px', textAlign: 'center' }}>
              <EmptyState icon="▦" text={q ? '검색 결과가 없습니다' : '첫 아키텍처 프로젝트를 만들어 보세요'} />
              {!q && <Button variant="primary" onClick={() => setShowNew(true)}>＋ New Project</Button>}
            </div>
          )}
          {!error && !!projects?.length && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>이름</th><th style={th}>Draft</th><th style={th}>Draft 수정</th><th style={th}>만든 날</th><th style={{ ...th, width: 44 }} aria-label="메뉴" /></tr></thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} onClick={() => router.push(`/aa/projects/${p.id}`)} style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      {p.description && <div style={{ fontSize: 11.5, color: '#5a5870', marginTop: 2 }}>{p.description}</div>}
                    </td>
                    <td style={{ ...td, color: '#9a98a8' }}>rev {p.draftRevision ?? '–'}</td>
                    <td style={{ ...td, color: '#9a98a8' }}>{ago(p.draftUpdatedAt)}</td>
                    <td style={{ ...td, color: '#5a5870' }}>{new Date(p.createdAt).toLocaleDateString('ko-KR')}</td>
                    <td style={{ ...td, position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                      <button aria-label={`${p.name} 메뉴`} aria-haspopup="menu" aria-expanded={menuFor === p.id} data-testid={`aa-project-menu-${p.id}`}
                        onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === p.id ? null : p.id); }}
                        style={{ background: 'none', border: 'none', color: '#9a98a8', cursor: 'pointer', fontSize: 16, padding: '2px 8px', borderRadius: 6 }}>⋯</button>
                      {menuFor === p.id && (
                        <div role="menu" style={{ position: 'absolute', right: 12, top: 40, zIndex: 10, minWidth: 180, padding: 4, borderRadius: 8, background: '#16161a', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                          <button role="menuitem" data-testid="aa-menu-readme" onClick={() => { setMenuFor(null); setExporting(p); }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 6, background: 'none', border: 'none', color: 'rgba(255,255,255,0.9)', cursor: 'pointer', fontSize: 13 }}>
                            README.md 내보내기
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      {exporting && <ReadmeExportModal projectId={exporting.id} projectName={exporting.name} onClose={() => setExporting(null)} />}
      {showNew && <NewProjectModal onClose={() => setShowNew(false)} onCreated={(id) => router.push(`/aa/projects/${id}/architecture`)} />}
    </>
  );
}
