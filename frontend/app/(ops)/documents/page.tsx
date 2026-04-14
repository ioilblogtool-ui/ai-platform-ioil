'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getDocuments, deleteDocument } from '@/lib/api';
import Card, { CardHeader, CardTitle, EmptyState } from '@/components/Card';
import Button from '@/components/Button';
import { DocStatusBadge } from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import { SkeletonRows } from '@/components/Skeleton';

type DocType = 'plan' | 'design' | 'dev_request';
type DocStatus = 'draft' | 'reviewed' | 'approved';

const DOC_TYPE_META: Record<DocType, { label: string; icon: string; color: string }> = {
  plan:        { label: 'Plan',        icon: '≡', color: '#60a5fa' },
  design:      { label: 'Design',      icon: '▦', color: '#a78bfa' },
  dev_request: { label: 'Dev Request', icon: '◎', color: '#fb923c' },
};

export default function DocumentsPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<DocType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<DocStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => { loadDocs(); }, [typeFilter, statusFilter]);

  async function loadDocs() {
    setLoading(true);
    try {
      const params: any = {};
      if (typeFilter !== 'all') params.doc_type = typeFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await getDocuments(params);
      setDocs(res?.data ?? (Array.isArray(res) ? res : []));
    } catch {}
    setLoading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('이 문서를 삭제하시겠습니까?')) return;
    setDeleting(id);
    try {
      await deleteDocument(id);
      setDocs(prev => prev.filter(d => d.id !== id));
    } catch (e: any) { alert(e.message); }
    setDeleting(null);
  }

  const filtered = docs.filter(d => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (d.file_path || '').toLowerCase().includes(q) || (d.content || '').toLowerCase().includes(q);
  });

  const stats = {
    total:    docs.length,
    approved: docs.filter(d => d.status === 'approved').length,
    draft:    docs.filter(d => d.status === 'draft').length,
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader title="Documents" badge={`${docs.length}개`} />

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            { label: '전체', value: stats.total, color: '#c8a96e' },
            { label: 'Approved', value: stats.approved, color: '#4ade80' },
            { label: 'Draft', value: stats.draft, color: '#8b8fa8' },
          ].map(s => (
            <div key={s.label} style={{ padding: '14px 18px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#5a5870', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Type filter */}
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'plan', 'design', 'dev_request'] as const).map(t => {
              const m = t !== 'all' ? DOC_TYPE_META[t] : null;
              return (
                <button key={t} onClick={() => setTypeFilter(t)} style={{
                  padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 11,
                  background: typeFilter === t ? 'rgba(200,169,110,0.12)' : 'rgba(255,255,255,0.02)',
                  border: typeFilter === t ? '1px solid rgba(200,169,110,0.3)' : '1px solid rgba(255,255,255,0.07)',
                  color: typeFilter === t ? '#c8a96e' : '#5a5870',
                }}>
                  {m ? `${m.icon} ${m.label}` : '전체'}
                </button>
              );
            })}
          </div>

          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.06)' }} />

          {/* Status filter */}
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'draft', 'reviewed', 'approved'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} style={{
                padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 11,
                background: statusFilter === s ? 'rgba(200,169,110,0.12)' : 'rgba(255,255,255,0.02)',
                border: statusFilter === s ? '1px solid rgba(200,169,110,0.3)' : '1px solid rgba(255,255,255,0.07)',
                color: statusFilter === s ? '#c8a96e' : '#5a5870',
              }}>{s === 'all' ? '전체 상태' : s}</button>
            ))}
          </div>

          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="파일명/내용 검색..."
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 8, color: '#c8c6c0', fontSize: 12, padding: '6px 12px', outline: 'none', width: 200,
            }}
          />
        </div>

        {/* Documents list */}
        {loading ? (
          <Card style={{ padding: 0, overflow: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
            <SkeletonRows rows={8} cols={6} />
          </Card>
        ) : filtered.length === 0 ? (
          <Card><EmptyState icon="≡" text="문서가 없습니다" /></Card>
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '110px 1fr 160px 100px 120px 80px',
              padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)',
              fontSize: 10, color: '#3a3850', textTransform: 'uppercase', letterSpacing: '0.06em',
              position: 'sticky', top: 0, zIndex: 1, background: '#111114',
            }}>
              <span>Type</span><span>File Path</span><span>Content</span><span>Status</span><span>Updated</span><span></span>
            </div>
            {filtered.map((doc, i) => {
              const tm = DOC_TYPE_META[doc.doc_type as DocType] || { label: doc.doc_type, icon: '●', color: '#8b8fa8' };
              const preview = doc.content ? doc.content.slice(0, 80).replace(/\n/g, ' ') : '—';
              return (
                <div key={doc.id} style={{
                  display: 'grid', gridTemplateColumns: '110px 1fr 160px 100px 120px 80px',
                  padding: '12px 18px', alignItems: 'center',
                  borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.008)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: tm.color }}>{tm.icon}</span>
                    <span style={{ fontSize: 11, color: tm.color }}>{tm.label}</span>
                  </div>
                  <div
                    onClick={() => doc.content_item_id && router.push(`/contents/${doc.content_item_id}/${doc.doc_type === 'dev_request' ? 'dev-request' : doc.doc_type}`)}
                    style={{ fontSize: 12, color: '#c8c6c0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: doc.content_item_id ? 'pointer' : 'default', fontFamily: 'monospace', paddingRight: 12 }}
                  >
                    {doc.file_path || '—'}
                  </div>
                  <div style={{ fontSize: 11, color: '#5a5870', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>
                    {preview}
                  </div>
                  <div><DocStatusBadge value={doc.status} size="sm" /></div>
                  <div style={{ fontSize: 11, color: '#3a3850' }}>
                    {new Date(doc.updated_at || doc.created_at).toLocaleDateString('ko-KR')}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={() => handleDelete(doc.id)} disabled={deleting === doc.id} style={{
                      fontSize: 10, color: '#5a5870', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 6px',
                    }}>
                      {deleting === doc.id ? '...' : '✕'}
                    </button>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
