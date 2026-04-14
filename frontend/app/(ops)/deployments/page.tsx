'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getDeployments, markDeploymentSuccess } from '@/lib/api';
import Card, { EmptyState } from '@/components/Card';
import Button from '@/components/Button';
import { DeployStatusDot } from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import { SkeletonRows } from '@/components/Skeleton';

type Platform = 'cloudflare' | 'vercel' | 'railway' | 'other';
type Environment = 'prod' | 'staging' | 'dev';
type DeployStatus = 'pending' | 'success' | 'failed';

const PLATFORM_META: Record<string, { label: string; color: string }> = {
  cloudflare: { label: 'Cloudflare', color: '#f97316' },
  vercel:     { label: 'Vercel',     color: '#e2e0db' },
  railway:    { label: 'Railway',    color: '#a78bfa' },
  other:      { label: 'Other',      color: '#8b8fa8' },
};

const ENV_META: Record<string, { label: string; color: string }> = {
  prod:    { label: 'Production', color: '#4ade80' },
  staging: { label: 'Staging',   color: '#fbbf24' },
  dev:     { label: 'Dev',       color: '#60a5fa' },
};

const STATUS_LABEL: Record<string, string> = { pending: 'Pending', success: 'Success', failed: 'Failed' };

export default function DeploymentsPage() {
  const router = useRouter();
  const [deployments, setDeployments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<DeployStatus | 'all'>('all');
  const [markingSuccess, setMarkingSuccess] = useState<string | null>(null);

  useEffect(() => { loadDeployments(); }, [statusFilter]);

  async function loadDeployments() {
    setLoading(true);
    try {
      const params: any = { limit: 100 };
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await getDeployments(params);
      setDeployments(Array.isArray(res) ? res : (res?.data ?? []));
    } catch {}
    setLoading(false);
  }

  async function handleMarkSuccess(depId: string) {
    setMarkingSuccess(depId);
    try {
      const url = prompt('배포 URL을 입력하세요 (선택사항):') || undefined;
      await markDeploymentSuccess(depId, url);
      await loadDeployments();
    } catch (e: any) { alert(e.message); }
    setMarkingSuccess(null);
  }

  const stats = {
    total:   deployments.length,
    success: deployments.filter(d => d.status === 'success').length,
    pending: deployments.filter(d => d.status === 'pending').length,
    failed:  deployments.filter(d => d.status === 'failed').length,
  };

  const byPlatform: Record<string, number> = deployments.reduce((acc: Record<string, number>, d) => {
    acc[d.platform] = (acc[d.platform] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader title="Deployments" badge={`${stats.total}개`} />

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            { label: '전체', value: stats.total, color: '#c8a96e' },
            { label: 'Success', value: stats.success, color: '#4ade80' },
            { label: 'Pending', value: stats.pending, color: '#fbbf24' },
            { label: 'Failed', value: stats.failed, color: '#f87171' },
          ].map(s => (
            <div key={s.label} style={{ padding: '14px 18px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#5a5870', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Platform breakdown */}
        {Object.keys(byPlatform).length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            {Object.entries(byPlatform).map(([platform, count]) => {
              const m = PLATFORM_META[platform] || PLATFORM_META.other;
              return (
                <div key={platform} style={{ padding: '6px 14px', borderRadius: 8, background: `${m.color}08`, border: `1px solid ${m.color}25`, fontSize: 12 }}>
                  <span style={{ color: m.color }}>{m.label}</span>
                  <span style={{ color: '#5a5870', marginLeft: 8 }}>{count}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Filters + Refresh */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(['all', 'success', 'pending', 'failed'] as const).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} style={{
              padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 11,
              background: statusFilter === f ? 'rgba(200,169,110,0.12)' : 'rgba(255,255,255,0.02)',
              border: statusFilter === f ? '1px solid rgba(200,169,110,0.3)' : '1px solid rgba(255,255,255,0.07)',
              color: statusFilter === f ? '#c8a96e' : '#5a5870',
            }}>{f === 'all' ? '전체' : STATUS_LABEL[f]}</button>
          ))}
          <div style={{ marginLeft: 'auto' }}>
            <Button variant="ghost" size="sm" onClick={loadDeployments}>↺ 새로고침</Button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <SkeletonRows rows={7} cols={6} />
          </Card>
        ) : deployments.length === 0 ? (
          <Card><EmptyState icon="↗" text="배포 이력이 없습니다" /></Card>
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '36px 120px 100px 100px 1fr 160px 80px',
              padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)',
              fontSize: 10, color: '#3a3850', textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              <span></span><span>Platform</span><span>Env</span><span>Status</span><span>URL</span><span>Content</span><span></span>
            </div>
            {deployments.map((dep, i) => {
              const pm = PLATFORM_META[dep.platform] || PLATFORM_META.other;
              const em = ENV_META[dep.environment] || ENV_META.prod;
              return (
                <div key={dep.id} style={{
                  display: 'grid', gridTemplateColumns: '36px 120px 100px 100px 1fr 160px 80px',
                  padding: '12px 18px', alignItems: 'center',
                  borderBottom: i < deployments.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.008)',
                }}>
                  <div><DeployStatusDot value={dep.status} /></div>
                  <div style={{ fontSize: 12, color: pm.color, fontWeight: 500 }}>{pm.label}</div>
                  <div style={{ fontSize: 11, color: em.color, background: `${em.color}10`, border: `1px solid ${em.color}25`, borderRadius: 6, padding: '2px 8px', display: 'inline-block', width: 'fit-content' }}>{em.label}</div>
                  <div style={{ fontSize: 11, color: dep.status === 'success' ? '#4ade80' : dep.status === 'failed' ? '#f87171' : '#fbbf24' }}>
                    {STATUS_LABEL[dep.status] || dep.status}
                  </div>
                  <div style={{ paddingRight: 12 }}>
                    {dep.deploy_url ? (
                      <a href={dep.deploy_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#60a5fa', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                        {dep.deploy_url}
                      </a>
                    ) : <span style={{ fontSize: 11, color: '#3a3850' }}>—</span>}
                  </div>
                  <div
                    onClick={() => dep.content_item_id && router.push(`/contents/${dep.content_item_id}/deploy`)}
                    style={{ fontSize: 11, color: '#6a6880', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: dep.content_item_id ? 'pointer' : 'default' }}
                  >
                    {dep.content_item?.title || dep.content_item_id?.slice(0, 8) || '—'}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {dep.status === 'pending' && (
                      <button onClick={() => handleMarkSuccess(dep.id)} disabled={markingSuccess === dep.id} style={{
                        fontSize: 10, color: '#4ade80', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)',
                        borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
                      }}>
                        {markingSuccess === dep.id ? '...' : '✓ 성공'}
                      </button>
                    )}
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
