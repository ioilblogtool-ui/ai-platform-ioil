'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getContent, transitionContent } from '@/lib/api';
import Card, { CardHeader, CardTitle, EmptyState } from '@/components/Card';
import Button from '@/components/Button';
import { CONTENT_STATUS } from '@/components/StatusBadge';
import { DocStatusBadge } from '@/components/StatusBadge';

type ContentStatus = 'idea' | 'planned' | 'designed' | 'ready_dev' | 'in_dev' | 'deployed' | 'archived';

const NEXT_ACTIONS: Record<ContentStatus, { label: string; icon: string; href: string; color: string }[]> = {
  idea:      [{ label: 'Generate Plan',       icon: '⚡', href: 'plan',        color: '#60a5fa' }],
  planned:   [{ label: 'Generate Design',     icon: '⚡', href: 'design',      color: '#a78bfa' }],
  designed:  [{ label: 'Generate Dev Request',icon: '⚡', href: 'dev-request', color: '#fb923c' }],
  ready_dev: [{ label: 'Link Git Branch',     icon: '⎇',  href: 'git',         color: '#fbbf24' }],
  in_dev:    [{ label: 'Register Deployment', icon: '↗',  href: 'deploy',      color: '#4ade80' }],
  deployed:  [{ label: 'View Deployment',     icon: '↗',  href: 'deploy',      color: '#4ade80' }],
  archived:  [],
};

export default function ContentOverviewPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [content, setContent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => { loadContent(); }, [id]);

  async function loadContent() {
    try { setContent(await getContent(id)); } catch {}
    setLoading(false);
  }

  async function handleTransition(status: ContentStatus) {
    setTransitioning(true);
    try {
      await transitionContent(id, status);
      await loadContent();
    } catch (e: any) { alert(e.message); }
    setTransitioning(false);
  }

  if (loading) return <LoadingState />;
  if (!content) return <div style={{ padding: 40, color: '#3a3850' }}>콘텐츠를 찾을 수 없습니다.</div>;

  const docs = content.documents || [];
  const planDoc = docs.find((d: any) => d.doc_type === 'plan');
  const designDoc = docs.find((d: any) => d.doc_type === 'design');
  const devReqDoc = docs.find((d: any) => d.doc_type === 'dev_request');
  const deployment = content.deployments?.[0];
  const gitChange = content.git_changes?.[0];
  const status = content.status as ContentStatus;
  const nextActions = NEXT_ACTIONS[status] || [];
  const meta = CONTENT_STATUS[status];

  return (
    <div style={{ padding: '24px 28px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Info + Next Action Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>

        {/* Basic Info */}
        <Card>
          <CardHeader><CardTitle>기본 정보</CardTitle></CardHeader>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: 'Title',    value: content.title },
              { label: 'Type',     value: content.content_type },
              { label: 'Category', value: content.category },
              { label: 'Keyword',  value: content.seo_keyword || '—' },
              { label: 'Repo',     value: content.target_repo || '—' },
              { label: 'Path',     value: content.target_path || '—' },
            ].map(f => (
              <div key={f.label}>
                <div style={{ fontSize: 10, color: '#3a3850', marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{f.label}</div>
                <div style={{ fontSize: 13, color: '#c8c6c0' }}>{f.value}</div>
              </div>
            ))}
          </div>
          {content.raw_idea && (
            <div style={{ marginTop: 16, padding: '12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: 10, color: '#3a3850', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Idea</div>
              <div style={{ fontSize: 12, color: '#9a98a8', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{content.raw_idea}</div>
            </div>
          )}
        </Card>

        {/* Next Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card style={{ flex: 1 }}>
            <CardHeader><CardTitle>Next Actions</CardTitle></CardHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {nextActions.map(a => (
                <button key={a.href} onClick={() => router.push(`/contents/${id}/${a.href}`)} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                  background: `${a.color}0d`, border: `1px solid ${a.color}30`,
                  color: a.color, fontSize: 13, fontWeight: 500, textAlign: 'left',
                }}>
                  <span style={{ fontSize: 15 }}>{a.icon}</span>
                  {a.label}
                </button>
              ))}
              {nextActions.length === 0 && (
                <div style={{ fontSize: 12, color: '#3a3850', textAlign: 'center', padding: '12px 0' }}>모든 단계 완료</div>
              )}
            </div>
          </Card>

          {/* Status Transition */}
          <Card>
            <CardHeader><CardTitle>상태 변경</CardTitle></CardHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(CONTENT_STATUS[status] ? Object.keys(CONTENT_STATUS) : []).filter(s => s !== status).slice(0, 4).map(s => {
                const sm = CONTENT_STATUS[s as ContentStatus];
                return (
                  <button key={s} onClick={() => handleTransition(s as ContentStatus)} disabled={transitioning} style={{
                    fontSize: 11, color: sm.color, background: sm.bg, border: `1px solid ${sm.border}`,
                    borderRadius: 6, padding: '5px 10px', cursor: 'pointer', textAlign: 'left',
                  }}>
                    → {sm.label}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      {/* Document Status */}
      <Card>
        <CardHeader><CardTitle>Document Status</CardTitle></CardHeader>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { type: 'plan', label: 'Plan', icon: '≡', href: 'plan', doc: planDoc, color: '#60a5fa' },
            { type: 'design', label: 'Design', icon: '▦', href: 'design', doc: designDoc, color: '#a78bfa' },
            { type: 'dev_request', label: 'Dev Request', icon: '◎', href: 'dev-request', doc: devReqDoc, color: '#fb923c' },
          ].map(item => (
            <div key={item.type} onClick={() => router.push(`/contents/${id}/${item.href}`)} style={{
              padding: '14px', borderRadius: 10, cursor: 'pointer',
              background: item.doc ? `${item.color}08` : 'rgba(255,255,255,0.015)',
              border: `1px solid ${item.doc ? item.color + '25' : 'rgba(255,255,255,0.05)'}`,
              transition: 'all 0.15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 14, color: item.doc ? item.color : '#3a3850' }}>{item.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: item.doc ? '#c8c6c0' : '#5a5870' }}>{item.label}</span>
                </div>
                {item.doc ? <DocStatusBadge value={item.doc.status} size="sm" /> : (
                  <span style={{ fontSize: 10, color: '#3a3850' }}>없음</span>
                )}
              </div>
              {item.doc ? (
                <div style={{ fontSize: 11, color: '#5a5870', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.doc.file_path?.split('/').pop() || `${item.type}.md`}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: item.color, opacity: 0.7 }}>+ Generate {item.label}</div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Git + Deploy */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <CardHeader>
            <CardTitle>Git</CardTitle>
            <button onClick={() => router.push(`/contents/${id}/git`)} style={{ fontSize: 11, color: '#5a5870', background: 'none', border: 'none', cursor: 'pointer' }}>→</button>
          </CardHeader>
          {gitChange ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Branch', value: gitChange.branch_name },
                { label: 'PR',     value: gitChange.pr_url },
                { label: 'Status', value: gitChange.merge_status },
              ].map(f => f.value && (
                <div key={f.label} style={{ display: 'flex', gap: 10 }}>
                  <span style={{ fontSize: 10, color: '#3a3850', width: 44, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: 2 }}>{f.label}</span>
                  <span style={{ fontSize: 12, color: '#9a98a8', fontFamily: f.label === 'Branch' ? 'monospace' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.value}</span>
                </div>
              ))}
            </div>
          ) : <EmptyState icon="⎇" text="Git 정보 없음" />}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deployment</CardTitle>
            <button onClick={() => router.push(`/contents/${id}/deploy`)} style={{ fontSize: 11, color: '#5a5870', background: 'none', border: 'none', cursor: 'pointer' }}>→</button>
          </CardHeader>
          {deployment ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: deployment.status === 'success' ? '#4ade80' : deployment.status === 'failed' ? '#f87171' : '#fbbf24',
                  boxShadow: deployment.status === 'success' ? '0 0 6px #4ade8080' : 'none',
                }} />
                <span style={{ fontSize: 12, color: '#9a98a8' }}>{deployment.platform} / {deployment.environment}</span>
              </div>
              {deployment.deploy_url && (
                <div style={{ fontSize: 11, color: '#5a5870', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {deployment.deploy_url}
                </div>
              )}
            </div>
          ) : <EmptyState icon="↗" text="배포 정보 없음" />}
        </Card>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ padding: 40, display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
      <div style={{ fontSize: 12, color: '#3a3850' }}>Loading...</div>
    </div>
  );
}
