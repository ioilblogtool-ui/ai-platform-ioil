'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  getContentStats, getContents, getJobs, getDeployments, getDocuments,
} from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import Card, { CardHeader, CardTitle, LinkButton, EmptyState } from '@/components/Card';
import { ContentStatusBadge, DeployStatusDot, JobStatusBadge, CONTENT_STATUS } from '@/components/StatusBadge';
import Button from '@/components/Button';
import { SkeletonStat, SkeletonTableRows } from '@/components/Skeleton';

type ContentStatus = 'idea' | 'planned' | 'designed' | 'ready_dev' | 'in_dev' | 'deployed';

const PIPELINE_ORDER: ContentStatus[] = ['idea', 'planned', 'designed', 'ready_dev', 'in_dev', 'deployed'];

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Record<string, number>>({});
  const [recentContents, setRecentContents] = useState<any[]>([]);
  const [recentDocs, setRecentDocs] = useState<any[]>([]);
  const [failedJobs, setFailedJobs] = useState<any[]>([]);
  const [recentDeploys, setRecentDeploys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [statsRes, contentsRes, docsRes, jobsRes, deploysRes] = await Promise.allSettled([
      getContentStats(),
      getContents({ limit: 5 }),
      getDocuments(),
      getJobs({ status: 'failed', limit: 5 }),
      getDeployments({ limit: 5 }),
    ]);
    if (statsRes.status === 'fulfilled') setStats(statsRes.value || {});
    if (contentsRes.status === 'fulfilled') setRecentContents((contentsRes.value?.data || []).slice(0, 5));
    if (docsRes.status === 'fulfilled') setRecentDocs((docsRes.value || []).slice(0, 4));
    if (jobsRes.status === 'fulfilled') setFailedJobs(jobsRes.value?.data || []);
    if (deploysRes.status === 'fulfilled') setRecentDeploys((deploysRes.value?.data || []).slice(0, 4));
    setLoading(false);
  }

  const totalActive = PIPELINE_ORDER.reduce((s, k) => s + (stats[k] || 0), 0);
  const pipelineTotal = Math.max(totalActive, 1);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `@keyframes skeleton-shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}.skeleton-shimmer{background:linear-gradient(90deg,rgba(255,255,255,.04) 25%,rgba(255,255,255,.09) 50%,rgba(255,255,255,.04) 75%);background-size:200% 100%;animation:skeleton-shimmer 1.6s ease-in-out infinite}` }} />
      <PageHeader
        title="Dashboard"
        badge="Content Ops"
        actions={
          <Button variant="primary" onClick={() => router.push('/contents/new')}>
            + New Content
          </Button>
        }
      />

      <main style={{ flex: 1, overflow: 'auto', padding: '24px 28px 40px' }}>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
          {PIPELINE_ORDER.map((status, i) => {
            const meta = CONTENT_STATUS[status];
            const count = stats[status] || 0;
            return (
              <Card
                key={status}
                accent={meta.color}
                onClick={() => router.push(`/contents?status=${status}`)}
                style={{ padding: '16px 16px 14px', position: 'relative', overflow: 'hidden' }}
              >
                <div style={{ position: 'absolute', top: -20, right: -20, width: 60, height: 60, borderRadius: '50%', background: `${meta.color}25`, filter: 'blur(20px)', pointerEvents: 'none' }} />
                <div style={{ fontSize: 10, color: '#5a5870', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  {meta.label}
                </div>
                {loading ? (
                  <SkeletonStat />
                ) : (
                  <>
                    <div style={{
                      fontSize: 30, fontWeight: 700, fontFamily: 'monospace', lineHeight: 1,
                      background: `linear-gradient(135deg, ${meta.color}, ${meta.color}80)`,
                      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>
                      {String(count).padStart(2, '0')}
                    </div>
                    <div style={{ display: 'flex', gap: 3, marginTop: 8 }}>
                      {PIPELINE_ORDER.map((_, j) => (
                        <div key={j} style={{
                          height: 2, borderRadius: 1, flex: j === i ? 2 : 1,
                          background: j === i ? meta.color : j < i ? `${meta.color}40` : 'rgba(255,255,255,0.05)',
                        }} />
                      ))}
                    </div>
                  </>
                )}
              </Card>
            );
          })}
        </div>

        {/* Pipeline + Quick Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, marginBottom: 16 }}>

          <Card>
            <CardHeader>
              <CardTitle>Content Pipeline</CardTitle>
              <span style={{ fontSize: 11, color: '#3a3850', fontFamily: 'monospace' }}>{totalActive} active</span>
            </CardHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {PIPELINE_ORDER.map(status => {
                const meta = CONTENT_STATUS[status];
                const count = stats[status] || 0;
                const pct = Math.round((count / pipelineTotal) * 100);
                return (
                  <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 66, fontSize: 11, color: '#5a5870', flexShrink: 0 }}>{meta.label}</div>
                    <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 3,
                        width: `${Math.max(pct, count > 0 ? 3 : 0)}%`,
                        background: `linear-gradient(90deg, ${meta.color}, ${meta.color}70)`,
                        boxShadow: count > 0 ? `0 0 6px ${meta.color}50` : 'none',
                        transition: 'width 0.6s ease',
                      }} />
                    </div>
                    <div style={{ width: 24, textAlign: 'right', fontSize: 12, fontFamily: 'monospace', color: count > 0 ? meta.color : '#3a3850' }}>
                      {count}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                { icon: '+', label: 'New Content',          color: '#c8a96e', href: '/contents/new' },
                { icon: '⚡', label: 'Generate Plan',       color: '#60a5fa', href: '/contents' },
                { icon: '↗', label: 'Register Deployment', color: '#4ade80', href: '/deployments' },
                { icon: '◎', label: 'View All Jobs',        color: '#a78bfa', href: '/jobs' },
                { icon: '≡', label: 'All Documents',        color: '#8b8fa8', href: '/documents' },
              ].map(a => (
                <button key={a.label} onClick={() => router.push(a.href)} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.05)',
                  background: 'rgba(255,255,255,0.02)', cursor: 'pointer',
                  color: '#9a98a8', fontSize: 12, textAlign: 'left',
                }}>
                  <span style={{ color: a.color, fontSize: 13, width: 16, textAlign: 'center', flexShrink: 0 }}>{a.icon}</span>
                  {a.label}
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* Recent Docs + Failed Jobs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

          <Card>
            <CardHeader>
              <CardTitle>Recent Documents</CardTitle>
              <LinkButton onClick={() => router.push('/documents')}>View all →</LinkButton>
            </CardHeader>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton-shimmer" style={{ height: 32, borderRadius: 7, opacity: 1 - i * 0.15 }} />
                ))}
              </div>
            ) : recentDocs.length === 0 ? <EmptyState icon="≡" text="문서가 없습니다" /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {recentDocs.map(doc => {
                  const DT: Record<string, { color: string; label: string }> = {
                    plan:        { color: '#60a5fa', label: 'Plan' },
                    design:      { color: '#a78bfa', label: 'Design' },
                    dev_request: { color: '#fb923c', label: 'Dev Req' },
                  };
                  const dt = DT[doc.doc_type] || { color: '#8b8fa8', label: doc.doc_type };
                  return (
                    <div key={doc.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 10px', borderRadius: 7,
                      background: 'rgba(255,255,255,0.015)',
                      borderLeft: `2px solid ${dt.color}`,
                    }}>
                      <span style={{ fontSize: 10, color: dt.color, background: `${dt.color}15`, padding: '2px 7px', borderRadius: 10, flexShrink: 0 }}>{dt.label}</span>
                      <span style={{ flex: 1, color: '#9a98a8', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.file_path?.split('/').pop() || 'Untitled'}
                      </span>
                      <div style={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        background: doc.status === 'approved' ? '#4ade80' : doc.status === 'reviewed' ? '#fbbf24' : '#3a3850',
                      }} />
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Failed Jobs</CardTitle>
              <LinkButton onClick={() => router.push('/jobs?status=failed')}>
                {failedJobs.length > 0 && <span style={{ color: '#f87171', marginRight: 2 }}>⚠ {failedJobs.length}</span>}
                View all →
              </LinkButton>
            </CardHeader>
            {failedJobs.length === 0 ? (
              <EmptyState icon="◎" text="실패한 Job이 없습니다" positive />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {failedJobs.map(job => (
                  <div key={job.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '7px 10px', borderRadius: 7,
                    background: 'rgba(248,113,113,0.04)', borderLeft: '2px solid #f87171',
                  }}>
                    <span style={{ fontSize: 10, color: '#f87171', flexShrink: 0, marginTop: 2 }}>⚠</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#9a98a8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {job.job_type} — {job.content_items?.title || ''}
                      </div>
                      {job.error_message && (
                        <div style={{ fontSize: 11, color: '#f8717170', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {job.error_message}
                        </div>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" style={{ color: '#fb923c', borderColor: 'rgba(251,146,60,0.2)', flexShrink: 0 }}>Retry</Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Recent Contents */}
        <Card style={{ marginBottom: 16 }}>
          <CardHeader>
            <CardTitle>Recent Contents</CardTitle>
            <LinkButton onClick={() => router.push('/contents')}>View all →</LinkButton>
          </CardHeader>
          {loading ? (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody><SkeletonTableRows rows={5} cols={5} /></tbody>
              </table>
            ) : recentContents.length === 0 ? <EmptyState icon="▤" text="콘텐츠를 추가해보세요" /> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {['Title', 'Type', 'Category', 'Status', 'Updated'].map(h => (
                    <th key={h} style={{ padding: '5px 10px', textAlign: 'left', fontSize: 10, color: '#3a3850', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentContents.map(c => (
                  <tr key={c.id} onClick={() => router.push(`/contents/${c.id}/overview`)}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.025)', cursor: 'pointer' }}>
                    <td style={{ padding: '9px 10px', fontSize: 13, color: '#c8c6c0', maxWidth: 240 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{c.title}</span>
                    </td>
                    <td style={{ padding: '9px 10px', fontSize: 11, color: '#5a5870' }}>{c.content_type}</td>
                    <td style={{ padding: '9px 10px', fontSize: 11, color: '#5a5870' }}>{c.category}</td>
                    <td style={{ padding: '9px 10px' }}><ContentStatusBadge value={c.status} size="sm" /></td>
                    <td style={{ padding: '9px 10px', fontSize: 11, color: '#3a3850', fontFamily: 'monospace' }}>
                      {c.updated_at ? new Date(c.updated_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Recent Deployments */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Deployments</CardTitle>
            <LinkButton onClick={() => router.push('/deployments')}>View all →</LinkButton>
          </CardHeader>
          {recentDeploys.length === 0 ? <EmptyState icon="↗" text="배포 이력이 없습니다" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recentDeploys.map(dep => (
                <div key={dep.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '8px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.015)',
                }}>
                  <DeployStatusDot value={dep.status} />
                  <span style={{ flex: 1, color: '#9a98a8', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {dep.content_items?.title || 'Unknown'}
                  </span>
                  <span style={{ fontSize: 10, color: '#3a3850', padding: '2px 7px', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 5 }}>
                    {dep.platform}
                  </span>
                  {dep.deploy_url && (
                    <span style={{ fontSize: 11, color: '#5a5870', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                      {dep.deploy_url}
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: '#3a3850', fontFamily: 'monospace', flexShrink: 0 }}>
                    {dep.deployed_at ? new Date(dep.deployed_at).toLocaleDateString('ko-KR') : '-'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

      </main>
    </>
  );
}
