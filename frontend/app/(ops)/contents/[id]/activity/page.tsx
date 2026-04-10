'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getActivity } from '@/lib/api';
import Card, { EmptyState } from '@/components/Card';

type ActivityItem = {
  id: string;
  action: string;
  actor: string;
  metadata?: Record<string, any>;
  created_at: string;
};

const ACTION_META: Record<string, { icon: string; label: string; color: string }> = {
  created:            { icon: '◈', label: '생성',               color: '#c8a96e' },
  status_changed:     { icon: '→', label: '상태 변경',           color: '#60a5fa' },
  plan_generated:     { icon: '⚡', label: 'Plan 생성',          color: '#60a5fa' },
  design_generated:   { icon: '⚡', label: 'Design 생성',        color: '#a78bfa' },
  dev_request_generated: { icon: '⚡', label: 'Dev Request 생성', color: '#fb923c' },
  ideas_generated:    { icon: '⚡', label: 'Ideas 생성',         color: '#c8a96e' },
  document_approved:  { icon: '✓', label: '문서 승인',           color: '#4ade80' },
  document_updated:   { icon: '✎', label: '문서 수정',           color: '#8b8fa8' },
  git_linked:         { icon: '⎇', label: 'Git 연결',           color: '#fbbf24' },
  deployed:           { icon: '↗', label: '배포',               color: '#4ade80' },
  updated:            { icon: '✎', label: '정보 수정',           color: '#8b8fa8' },
};

function getActionMeta(action: string) {
  return ACTION_META[action] || { icon: '●', label: action, color: '#5a5870' };
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(dateStr).toLocaleDateString('ko-KR');
}

function renderMetadata(action: string, meta?: Record<string, any>): string | null {
  if (!meta) return null;
  if (action === 'status_changed' && meta.from && meta.to) return `${meta.from} → ${meta.to}`;
  if (action === 'git_linked' && meta.branch_name) return `branch: ${meta.branch_name}`;
  if (action === 'deployed' && meta.platform) return `${meta.platform} / ${meta.environment || 'prod'}`;
  if (meta.doc_type) return `${meta.doc_type} 문서`;
  return null;
}

export default function ContentActivityPage() {
  const params = useParams();
  const id = params.id as string;

  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const PAGE_SIZE = 30;

  useEffect(() => { loadData(0); }, [id]);

  async function loadData(offset: number) {
    setLoading(true);
    try {
      const data = await getActivity({ content_item_id: id, limit: PAGE_SIZE + 1, offset });
      const items: ActivityItem[] = Array.isArray(data) ? data : [];
      if (offset === 0) {
        setActivities(items.slice(0, PAGE_SIZE));
      } else {
        setActivities(prev => [...prev, ...items.slice(0, PAGE_SIZE)]);
      }
      setHasMore(items.length > PAGE_SIZE);
      setPage(offset);
    } catch {}
    setLoading(false);
  }

  // Group by date
  const grouped: Record<string, ActivityItem[]> = {};
  for (const act of activities) {
    const date = new Date(act.created_at).toLocaleDateString('ko-KR');
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(act);
  }

  return (
    <div style={{ padding: '24px 28px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {loading && activities.length === 0 ? (
        <Card><EmptyState icon="◎" text="로딩 중..." /></Card>
      ) : activities.length === 0 ? (
        <Card><EmptyState icon="◎" text="아직 활동 기록이 없습니다." /></Card>
      ) : (
        <div style={{ position: 'relative' }}>
          {/* Timeline line */}
          <div style={{ position: 'absolute', left: 19, top: 32, bottom: 0, width: 1, background: 'rgba(255,255,255,0.04)', zIndex: 0 }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {Object.entries(grouped).map(([date, items]) => (
              <div key={date}>
                {/* Date separator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 0 10px', position: 'relative', zIndex: 1 }}>
                  <div style={{ width: 38, flexShrink: 0 }} />
                  <div style={{ fontSize: 10, color: '#3a3850', letterSpacing: '0.06em', textTransform: 'uppercase', background: '#080809', padding: '2px 8px' }}>
                    {date}
                  </div>
                </div>

                {items.map(act => {
                  const meta = getActionMeta(act.action);
                  const detail = renderMetadata(act.action, act.metadata);
                  return (
                    <div key={act.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingBottom: 14, position: 'relative', zIndex: 1 }}>
                      {/* Icon dot */}
                      <div style={{
                        width: 38, height: 38, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: '50%',
                        background: `${meta.color}10`,
                        border: `1px solid ${meta.color}25`,
                        fontSize: 13, color: meta.color,
                      }}>
                        {meta.icon}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, paddingTop: 8, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, color: '#c8c6c0', fontWeight: 500 }}>{meta.label}</span>
                          {detail && (
                            <span style={{ fontSize: 11, color: '#5a5870', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '1px 8px' }}>
                              {detail}
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: '#3a3850', marginLeft: 'auto' }}>{formatRelative(act.created_at)}</span>
                        </div>
                        {act.actor && (
                          <div style={{ fontSize: 11, color: '#3a3850', marginTop: 3 }}>{act.actor}</div>
                        )}
                        {act.metadata?.notes && (
                          <div style={{ fontSize: 12, color: '#5a5870', marginTop: 6, padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, borderLeft: '2px solid rgba(255,255,255,0.05)' }}>
                            {act.metadata.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {hasMore && (
            <div style={{ marginTop: 8, textAlign: 'center' }}>
              <button
                onClick={() => loadData(page + PAGE_SIZE)}
                disabled={loading}
                style={{ fontSize: 12, color: '#5a5870', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '7px 18px', cursor: 'pointer' }}
              >
                {loading ? '로딩 중...' : '더 보기'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
