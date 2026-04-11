'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getDeployments, createDeployment, updateDeployment, markDeploymentSuccess } from '@/lib/api';
import Card, { CardHeader, CardTitle, EmptyState } from '@/components/Card';
import Button from '@/components/Button';
import { DeployStatusDot } from '@/components/StatusBadge';

type Platform = 'cloudflare' | 'vercel' | 'railway' | 'other';
type Environment = 'prod' | 'staging' | 'dev';
type DeployStatus = 'pending' | 'success' | 'failed';

const PLATFORM_META: Record<Platform, { label: string; color: string }> = {
  cloudflare: { label: 'Cloudflare', color: '#f97316' },
  vercel:     { label: 'Vercel',     color: '#e2e0db' },
  railway:    { label: 'Railway',    color: '#a78bfa' },
  other:      { label: 'Other',      color: '#8b8fa8' },
};

const ENV_META: Record<Environment, { label: string; color: string }> = {
  prod:    { label: 'Production', color: '#4ade80' },
  staging: { label: 'Staging',   color: '#fbbf24' },
  dev:     { label: 'Dev',       color: '#60a5fa' },
};

const STATUS_META: Record<DeployStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#fbbf24' },
  success: { label: 'Success', color: '#4ade80' },
  failed:  { label: 'Failed',  color: '#f87171' },
};

const EMPTY_FORM = {
  platform: 'vercel' as Platform,
  environment: 'prod' as Environment,
  status: 'pending' as DeployStatus,
  deploy_url: '',
  notes: '',
};

export default function ContentDeployPage() {
  const params = useParams();
  const id = params.id as string;

  const [deployments, setDeployments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [markingSuccess, setMarkingSuccess] = useState<string | null>(null);

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    try {
      const res = await getDeployments({ content_item_id: id });
      setDeployments(Array.isArray(res) ? res : (res?.data ?? []));
    } catch {}
    setLoading(false);
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      if (editingId) {
        await updateDeployment(editingId, form);
      } else {
        await createDeployment({ content_item_id: id, ...form });
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      setEditingId(null);
      await loadData();
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  }

  async function handleMarkSuccess(depId: string) {
    setMarkingSuccess(depId);
    try {
      const url = prompt('배포 URL을 입력하세요 (선택사항):') || undefined;
      await markDeploymentSuccess(depId, url);
      await loadData();
    } catch (e: any) { alert(e.message); }
    setMarkingSuccess(null);
  }

  function startEdit(dep: any) {
    setForm({
      platform: dep.platform || 'vercel',
      environment: dep.environment || 'prod',
      status: dep.status || 'pending',
      deploy_url: dep.deploy_url || '',
      notes: dep.notes || '',
    });
    setEditingId(dep.id);
    setShowForm(true);
  }

  function cancelForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  }

  const latestSuccess = deployments.find(d => d.status === 'success');

  return (
    <div style={{ padding: '24px 28px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Live deployment banner */}
      {latestSuccess?.deploy_url && (
        <div style={{ padding: '10px 16px', borderRadius: 10, background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 8px #4ade8080', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: '#4ade80', flex: 1 }}>배포 완료</span>
          <a href={latestSuccess.deploy_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#4ade80', fontFamily: 'monospace', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {latestSuccess.deploy_url} ↗
          </a>
        </div>
      )}

      {/* Header */}
      <Card style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, color: '#9a98a8' }}>배포 이력을 등록하고 추적합니다</div>
          {!showForm && (
            <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>+ 배포 등록</Button>
          )}
        </div>
      </Card>

      {/* Form */}
      {showForm && (
        <Card accent="#4ade80">
          <CardHeader>
            <CardTitle>{editingId ? '배포 수정' : '배포 등록'}</CardTitle>
            <button onClick={cancelForm} style={{ background: 'none', border: 'none', color: '#5a5870', cursor: 'pointer', fontSize: 14 }}>✕</button>
          </CardHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Platform */}
            <div>
              <div style={{ fontSize: 10, color: '#3a3850', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Platform</div>
              <div style={{ display: 'flex', gap: 7 }}>
                {(Object.keys(PLATFORM_META) as Platform[]).map(p => {
                  const m = PLATFORM_META[p];
                  return (
                    <button key={p} onClick={() => setForm(f => ({ ...f, platform: p }))} style={{
                      padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 11,
                      background: form.platform === p ? `${m.color}12` : 'rgba(255,255,255,0.02)',
                      border: form.platform === p ? `1px solid ${m.color}40` : '1px solid rgba(255,255,255,0.07)',
                      color: form.platform === p ? m.color : '#5a5870',
                    }}>{m.label}</button>
                  );
                })}
              </div>
            </div>

            {/* Environment + Status */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <div style={{ fontSize: 10, color: '#3a3850', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Environment</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(Object.keys(ENV_META) as Environment[]).map(e => {
                    const m = ENV_META[e];
                    return (
                      <button key={e} onClick={() => setForm(f => ({ ...f, environment: e }))} style={{
                        padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                        background: form.environment === e ? `${m.color}12` : 'rgba(255,255,255,0.02)',
                        border: form.environment === e ? `1px solid ${m.color}40` : '1px solid rgba(255,255,255,0.07)',
                        color: form.environment === e ? m.color : '#5a5870',
                      }}>{m.label}</button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#3a3850', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(Object.keys(STATUS_META) as DeployStatus[]).map(s => {
                    const m = STATUS_META[s];
                    return (
                      <button key={s} onClick={() => setForm(f => ({ ...f, status: s }))} style={{
                        padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                        background: form.status === s ? `${m.color}12` : 'rgba(255,255,255,0.02)',
                        border: form.status === s ? `1px solid ${m.color}40` : '1px solid rgba(255,255,255,0.07)',
                        color: form.status === s ? m.color : '#5a5870',
                      }}>{m.label}</button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* URL + Notes */}
            <div>
              <div style={{ fontSize: 10, color: '#3a3850', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deploy URL</div>
              <input value={form.deploy_url} onChange={e => setForm(f => ({ ...f, deploy_url: e.target.value }))} placeholder="https://..." style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#3a3850', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</div>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="메모 (선택사항)" style={inputStyle} />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={cancelForm}>취소</Button>
              <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving}>
                {saving ? '저장 중...' : editingId ? '수정 저장' : '등록'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Deployments List */}
      {loading ? (
        <Card><EmptyState icon="↗" text="로딩 중..." /></Card>
      ) : deployments.length === 0 ? (
        <Card><EmptyState icon="↗" text="배포 이력이 없습니다. 배포 후 등록하세요." /></Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {deployments.map(dep => {
            const pm = PLATFORM_META[dep.platform as Platform] || PLATFORM_META.other;
            const em = ENV_META[dep.environment as Environment] || ENV_META.prod;
            return (
              <Card key={dep.id}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                      <DeployStatusDot value={dep.status} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: pm.color }}>{pm.label}</span>
                      <span style={{ fontSize: 11, color: em.color, background: `${em.color}12`, border: `1px solid ${em.color}30`, borderRadius: 8, padding: '2px 8px' }}>{em.label}</span>
                      <span style={{ fontSize: 11, color: STATUS_META[dep.status as DeployStatus]?.color || '#8b8fa8' }}>
                        {STATUS_META[dep.status as DeployStatus]?.label || dep.status}
                      </span>
                    </div>
                    {dep.deploy_url && (
                      <a href={dep.deploy_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#60a5fa', fontFamily: 'monospace', display: 'block', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {dep.deploy_url} ↗
                      </a>
                    )}
                    {dep.notes && (
                      <div style={{ fontSize: 12, color: '#5a5870', marginTop: 4 }}>{dep.notes}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {dep.status === 'pending' && (
                      <Button variant="secondary" size="sm" onClick={() => handleMarkSuccess(dep.id)} disabled={markingSuccess === dep.id}>
                        {markingSuccess === dep.id ? '...' : '✓ 성공'}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => startEdit(dep)}>수정</Button>
                  </div>
                </div>
                <div style={{ marginTop: 10, fontSize: 10, color: '#2a2840' }}>
                  {dep.deployed_at ? new Date(dep.deployed_at).toLocaleString('ko-KR') : new Date(dep.created_at).toLocaleString('ko-KR')}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8, color: '#c8c6c0', fontSize: 12, padding: '8px 12px', outline: 'none', fontFamily: 'inherit',
};
