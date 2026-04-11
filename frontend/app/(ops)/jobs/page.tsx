'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getJobs, retryJob } from '@/lib/api';
import Card, { CardHeader, CardTitle, EmptyState } from '@/components/Card';
import Button from '@/components/Button';
import { JobStatusBadge, JOB_STATUS } from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import { SkeletonRows } from '@/components/Skeleton';

type JobStatus = 'queued' | 'running' | 'done' | 'failed';

const JOB_TYPE_LABEL: Record<string, string> = {
  plan:        '⚡ Plan 생성',
  design:      '⚡ Design 생성',
  dev_request: '⚡ Dev Request 생성',
  ideas:       '⚡ Ideas 생성',
};

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<JobStatus | 'all'>('all');
  const [retrying, setRetrying] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadJobs = useCallback(async () => {
    try {
      const params = filter !== 'all' ? { status: filter as JobStatus, limit: 50 } : { limit: 50 };
      const res = await getJobs(params);
      setJobs(Array.isArray(res) ? res : (res?.data ?? []));
    } catch {}
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  // Auto-refresh when there are running/queued jobs
  useEffect(() => {
    if (!autoRefresh) return;
    const hasActive = jobs.some(j => j.status === 'running' || j.status === 'queued');
    if (!hasActive) return;
    const timer = setInterval(loadJobs, 4000);
    return () => clearInterval(timer);
  }, [jobs, autoRefresh, loadJobs]);

  async function handleRetry(jobId: string) {
    setRetrying(jobId);
    try {
      await retryJob(jobId);
      await loadJobs();
    } catch (e: any) { alert(e.message); }
    setRetrying(null);
  }

  const stats = {
    queued:  jobs.filter(j => j.status === 'queued').length,
    running: jobs.filter(j => j.status === 'running').length,
    done:    jobs.filter(j => j.status === 'done').length,
    failed:  jobs.filter(j => j.status === 'failed').length,
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader title="Jobs" badge="AI 생성 작업 이력" />

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {(Object.keys(stats) as JobStatus[]).map(s => {
            const m = JOB_STATUS[s];
            return (
              <div key={s} onClick={() => setFilter(filter === s ? 'all' : s)} style={{
                padding: '14px 18px', borderRadius: 12, cursor: 'pointer',
                background: filter === s ? `${m.color}10` : 'linear-gradient(135deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))',
                border: filter === s ? `1px solid ${m.color}30` : '1px solid rgba(255,255,255,0.06)',
                transition: 'all 0.15s',
              }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: m.color, fontFamily: 'monospace' }}>{stats[s]}</div>
                <div style={{ fontSize: 11, color: '#5a5870', marginTop: 4 }}>{m.label}</div>
              </div>
            );
          })}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'queued', 'running', 'done', 'failed'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 11,
                background: filter === f ? 'rgba(200,169,110,0.12)' : 'rgba(255,255,255,0.02)',
                border: filter === f ? '1px solid rgba(200,169,110,0.3)' : '1px solid rgba(255,255,255,0.07)',
                color: filter === f ? '#c8a96e' : '#5a5870',
              }}>{f === 'all' ? '전체' : JOB_STATUS[f]?.label || f}</button>
            ))}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => setAutoRefresh(p => !p)} style={{
              fontSize: 11, color: autoRefresh ? '#4ade80' : '#5a5870',
              background: autoRefresh ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${autoRefresh ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 7, padding: '5px 12px', cursor: 'pointer',
            }}>
              {autoRefresh ? '● Auto Refresh' : '○ Auto Refresh'}
            </button>
            <Button variant="ghost" size="sm" onClick={loadJobs}>↺ 새로고침</Button>
          </div>
        </div>

        {/* Jobs Table */}
        {loading ? (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <SkeletonRows rows={8} cols={6} />
          </Card>
        ) : jobs.length === 0 ? (
          <Card><EmptyState icon="◎" text="작업이 없습니다" /></Card>
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '160px 1fr 140px 100px 120px 80px',
              padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)',
              fontSize: 10, color: '#3a3850', textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              <span>Status</span><span>Content</span><span>Type</span><span>Model</span><span>Time</span><span></span>
            </div>
            {jobs.map((job, i) => (
              <div key={job.id} style={{
                display: 'grid', gridTemplateColumns: '160px 1fr 140px 100px 120px 80px',
                padding: '12px 18px', alignItems: 'center', gap: 0,
                borderBottom: i < jobs.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.008)',
              }}>
                <div><JobStatusBadge value={job.status} size="sm" /></div>
                <div
                  onClick={() => job.content_item_id && router.push(`/contents/${job.content_item_id}/overview`)}
                  style={{ fontSize: 12, color: '#c8c6c0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: job.content_item_id ? 'pointer' : 'default', paddingRight: 12 }}
                >
                  {job.content_item?.title || job.content_item_id || '—'}
                </div>
                <div style={{ fontSize: 11, color: '#6a6880' }}>{JOB_TYPE_LABEL[job.job_type] || job.job_type || '—'}</div>
                <div style={{ fontSize: 11, color: '#5a5870', fontFamily: 'monospace' }}>{job.model || '—'}</div>
                <div style={{ fontSize: 11, color: '#3a3850' }}>{new Date(job.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {job.status === 'failed' && (
                    <button onClick={() => handleRetry(job.id)} disabled={retrying === job.id} style={{
                      fontSize: 10, color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
                      borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
                    }}>
                      {retrying === job.id ? '...' : '↺ 재시도'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </Card>
        )}

        {/* Error details for failed jobs */}
        {jobs.some(j => j.status === 'failed' && j.error_message) && (
          <Card>
            <CardHeader><CardTitle>실패한 작업 오류</CardTitle></CardHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {jobs.filter(j => j.status === 'failed' && j.error_message).map(job => (
                <div key={job.id} style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.15)' }}>
                  <div style={{ fontSize: 11, color: '#f87171', marginBottom: 4 }}>{JOB_TYPE_LABEL[job.job_type] || job.job_type}</div>
                  <div style={{ fontSize: 12, color: '#9a98a8', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{job.error_message}</div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
