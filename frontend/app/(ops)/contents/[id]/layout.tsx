'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname, useParams } from 'next/navigation';
import { getContent, transitionContent } from '@/lib/api';
import { ContentStatusBadge, CONTENT_STATUS } from '@/components/StatusBadge';
import { PipelineStepperFull } from '@/components/PipelineStepper';
import Button from '@/components/Button';

const TABS = [
  { label: 'Overview',    href: 'overview' },
  { label: 'Ideas',       href: 'ideas' },
  { label: 'Plan',        href: 'plan' },
  { label: 'Design',      href: 'design' },
  { label: 'Dev Request', href: 'dev-request' },
  { label: 'Git',         href: 'git' },
  { label: 'Deploy',      href: 'deploy' },
  { label: 'Activity',    href: 'activity' },
];

export default function ContentDetailLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const id = params.id as string;

  const [content, setContent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    if (id) loadContent();
  }, [id]);

  async function loadContent() {
    try {
      const data = await getContent(id);
      setContent(data);
    } catch {}
    setLoading(false);
  }

  async function handleTransition(status: string) {
    setTransitioning(true);
    try {
      await transitionContent(id, status as any);
      await loadContent();
    } catch (e: any) {
      alert(e.message);
    }
    setTransitioning(false);
  }

  const activeTab = TABS.find(t => pathname.endsWith(t.href))?.href || 'overview';
  const meta = content ? CONTENT_STATUS[content.status as keyof typeof CONTENT_STATUS] : null;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Content Header */}
      <div style={{
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(8,8,9,0.9)', backdropFilter: 'blur(12px)',
        flexShrink: 0,
      }}>
        {/* Breadcrumb + Title row */}
        <div style={{ padding: '14px 28px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <button onClick={() => router.push('/contents')} style={{ fontSize: 11, color: '#5a5870', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Contents</button>
              <span style={{ color: '#3a3850', fontSize: 11 }}>/</span>
              <span style={{ fontSize: 11, color: '#3a3850' }}>{loading ? '...' : content?.title?.slice(0, 30)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 16, fontWeight: 600, color: '#e2e0db', margin: 0, lineHeight: 1.3 }}>
                {loading ? '...' : content?.title}
              </h1>
              {content && <ContentStatusBadge value={content.status} />}
              {content && (
                <span style={{ fontSize: 11, color: '#5a5870', padding: '2px 8px', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10 }}>
                  {content.content_type} / {content.category}
                </span>
              )}
            </div>
          </div>

          {/* Header Actions */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
            {content?.status === 'deployed' && (
              <Button variant="ghost" size="sm" onClick={() => handleTransition('archived')} disabled={transitioning}>
                🗄 Archive
              </Button>
            )}
            {content?.status === 'archived' && (
              <Button variant="ghost" size="sm" onClick={() => handleTransition('idea')} disabled={transitioning}>
                ↩ Restore
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => router.push(`/contents/${id}/plan`)}>
              ⚡ Generate Plan
            </Button>
            <Button variant="ghost" size="sm" onClick={loadContent}>↺</Button>
          </div>
        </div>

        {/* Pipeline Stepper */}
        {content && (
          <div style={{ padding: '12px 28px 0' }}>
            <PipelineStepperFull
              current={content.status}
              onTransition={handleTransition}
              transitioning={transitioning}
            />
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, padding: '12px 28px 0', overflowX: 'auto' }}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.href;
            return (
              <button
                key={tab.href}
                onClick={() => router.push(`/contents/${id}/${tab.href}`)}
                style={{
                  padding: '7px 14px', fontSize: 12, cursor: 'pointer',
                  background: 'none', border: 'none',
                  color: isActive ? '#c8a96e' : '#5a5870',
                  fontWeight: isActive ? 500 : 400,
                  borderBottom: isActive ? '2px solid #c8a96e' : '2px solid transparent',
                  marginBottom: -1, whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  );
}
