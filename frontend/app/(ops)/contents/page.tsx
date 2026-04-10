'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getContents, deleteContent } from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { ContentStatusBadge, CONTENT_STATUS } from '@/components/StatusBadge';

type ContentStatus = 'idea' | 'planned' | 'designed' | 'ready_dev' | 'in_dev' | 'deployed' | 'archived';

const STATUS_LIST: ContentStatus[] = ['idea', 'planned', 'designed', 'ready_dev', 'in_dev', 'deployed', 'archived'];
const TYPE_LIST = ['calculator', 'report'];
const PRIORITY_LABEL: Record<number, { label: string; color: string }> = {
  2: { label: '높음', color: '#f87171' },
  1: { label: '보통', color: '#fbbf24' },
  0: { label: '낮음', color: '#4ade80' },
};

export default function ContentsPage() {
  return (
    <Suspense fallback={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a3850', fontSize: 13 }}>Loading...</div>}>
      <ContentsInner />
    </Suspense>
  );
}

function ContentsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>(searchParams.get('status') || '');
  const [contentType, setContentType] = useState('');
  const [page, setPage] = useState(0);
  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getContents({
        search: search || undefined,
        status: (status as ContentStatus) || undefined,
        content_type: (contentType as any) || undefined,
        limit: LIMIT,
        offset: page * LIMIT,
      });
      setItems(res.data || []);
      setTotal(res.total || 0);
    } catch (e: any) {
      setError(e.message || '데이터 로드 실패');
      setItems([]);
    }
    setLoading(false);
  }, [search, status, contentType, page]);

  useEffect(() => { load(); }, [load]);

  // 검색 debounce
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const clearFilters = () => {
    setSearchInput(''); setSearch('');
    setStatus(''); setContentType(''); setPage(0);
  };

  const hasFilter = searchInput || status || contentType;
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <>
      <PageHeader
        title="Contents"
        badge={`${total} items`}
        actions={
          <Button variant="primary" onClick={() => router.push('/contents/new')}>
            + New Content
          </Button>
        }
      />

      <main style={{ flex: 1, overflow: 'auto', padding: '20px 28px 40px' }}>

        {/* Error Banner */}
        {error && (
          <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 8, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ color: '#f87171', fontSize: 13, flexShrink: 0 }}>⚠</span>
            <div>
              <div style={{ color: '#f87171', fontSize: 12, fontWeight: 500 }}>데이터 로드 실패</div>
              <div style={{ color: '#f8717180', fontSize: 11, marginTop: 2, fontFamily: 'monospace' }}>{error}</div>
              {error.includes('relation') && (
                <div style={{ color: '#fbbf24', fontSize: 11, marginTop: 6 }}>
                  → Supabase에 Phase 1 SQL 스키마가 적용되지 않았을 수 있습니다. <code>supabase/schema_content_ops.sql</code>을 SQL Editor에서 실행해주세요.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
          flexWrap: 'wrap',
        }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '0 0 220px' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#3a3850', fontSize: 13 }}>⌕</span>
            <input
              value={searchInput}
              onChange={e => { setSearchInput(e.target.value); setPage(0); }}
              placeholder="검색..."
              style={filterInput}
            />
          </div>

          {/* Status */}
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }} style={filterSelect}>
            <option value="">All Status</option>
            {STATUS_LIST.map(s => <option key={s} value={s}>{CONTENT_STATUS[s].label}</option>)}
          </select>

          {/* Type */}
          <select value={contentType} onChange={e => { setContentType(e.target.value); setPage(0); }} style={filterSelect}>
            <option value="">All Types</option>
            {TYPE_LIST.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {hasFilter && (
            <button onClick={clearFilters} style={{ fontSize: 11, color: '#5a5870', background: 'none', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>
              Reset ✕
            </button>
          )}

          <div style={{ marginLeft: 'auto', fontSize: 11, color: '#3a3850' }}>
            {loading ? 'Loading...' : `${total} results`}
          </div>
        </div>

        {/* Saved Filters (Quick) */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {[
            { label: 'Plan 미작성', filter: () => { setStatus('idea'); setPage(0); } },
            { label: 'Ready Dev', filter: () => { setStatus('ready_dev'); setPage(0); } },
            { label: 'Deployed', filter: () => { setStatus('deployed'); setPage(0); } },
          ].map(f => (
            <button key={f.label} onClick={f.filter} style={{
              fontSize: 11, color: '#5a5870', background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20,
              padding: '3px 10px', cursor: 'pointer',
            }}>{f.label}</button>
          ))}
        </div>

        {/* Table */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
                {['Title', 'Type', 'Category', 'Status', 'Plan', 'Design', 'Dev Req', 'Priority', 'Updated', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, color: '#3a3850', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#3a3850', fontSize: 13 }}>Loading...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: '48px', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, opacity: 0.1, marginBottom: 10 }}>▤</div>
                  <div style={{ color: '#3a3850', fontSize: 13 }}>콘텐츠가 없습니다</div>
                  <button onClick={() => router.push('/contents/new')} style={{ marginTop: 12, fontSize: 12, color: '#c8a96e', background: 'none', border: '1px solid rgba(200,169,110,0.3)', borderRadius: 7, padding: '6px 14px', cursor: 'pointer' }}>
                    + 첫 번째 콘텐츠 만들기
                  </button>
                </td></tr>
              ) : items.map(item => {
                const docs = item.documents || [];
                const hasPlan = docs.some((d: any) => d.doc_type === 'plan');
                const hasDesign = docs.some((d: any) => d.doc_type === 'design');
                const hasDevReq = docs.some((d: any) => d.doc_type === 'dev_request');
                const pri = PRIORITY_LABEL[item.priority] || PRIORITY_LABEL[1];

                return (
                  <tr key={item.id}
                    onClick={() => router.push(`/contents/${item.id}/overview`)}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '11px 14px', maxWidth: 260 }}>
                      <span style={{ fontSize: 13, color: '#c8c6c0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                        {item.title}
                      </span>
                      {item.seo_keyword && (
                        <span style={{ fontSize: 10, color: '#3a3850', marginTop: 2, display: 'block' }}>{item.seo_keyword}</span>
                      )}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 11, color: '#5a5870', whiteSpace: 'nowrap' }}>{item.content_type}</td>
                    <td style={{ padding: '11px 14px', fontSize: 11, color: '#5a5870', whiteSpace: 'nowrap' }}>{item.category}</td>
                    <td style={{ padding: '11px 14px' }}><ContentStatusBadge value={item.status} size="sm" /></td>
                    <td style={{ padding: '11px 14px' }}><DocDot exists={hasPlan} /></td>
                    <td style={{ padding: '11px 14px' }}><DocDot exists={hasDesign} /></td>
                    <td style={{ padding: '11px 14px' }}><DocDot exists={hasDevReq} /></td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontSize: 10, color: pri.color }}>{pri.label}</span>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 11, color: '#3a3850', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      {item.updated_at ? new Date(item.updated_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '-'}
                    </td>
                    <td style={{ padding: '11px 14px' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => router.push(`/contents/${item.id}/overview`)} style={{
                        fontSize: 11, color: '#5a5870', background: 'none',
                        border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5,
                        padding: '3px 8px', cursor: 'pointer',
                      }}>→</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={pageBtn(page === 0)}>‹ Prev</button>
              <span style={{ fontSize: 11, color: '#5a5870' }}>{page + 1} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={pageBtn(page >= totalPages - 1)}>Next ›</button>
            </div>
          )}
        </Card>
      </main>
    </>
  );
}

function DocDot({ exists }: { exists: boolean }) {
  return (
    <div style={{
      width: 7, height: 7, borderRadius: '50%',
      background: exists ? '#4ade80' : '#1e1e24',
      border: `1px solid ${exists ? '#4ade8050' : '#2a2a30'}`,
      boxShadow: exists ? '0 0 5px #4ade8060' : 'none',
    }} />
  );
}

const filterInput: React.CSSProperties = {
  width: '100%', paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 7, color: '#e2e0db', fontSize: 12, outline: 'none', fontFamily: 'inherit',
};
const filterSelect: React.CSSProperties = {
  padding: '6px 10px', background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7,
  color: '#9a98a8', fontSize: 12, outline: 'none', cursor: 'pointer',
};
const pageBtn = (disabled: boolean): React.CSSProperties => ({
  fontSize: 12, color: disabled ? '#3a3850' : '#9a98a8',
  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 6, padding: '4px 12px', cursor: disabled ? 'not-allowed' : 'pointer',
});
