export type ContentStatus = 'idea' | 'planned' | 'designed' | 'ready_dev' | 'in_dev' | 'deployed' | 'archived';
export type DocStatus = 'draft' | 'reviewed' | 'approved';
export type JobStatus = 'queued' | 'running' | 'done' | 'failed';
export type DeployStatus = 'pending' | 'success' | 'failed';

export const CONTENT_STATUS: Record<ContentStatus, { label: string; color: string; bg: string; border: string }> = {
  idea:      { label: 'Idea',      color: '#8b8fa8', bg: '#8b8fa810', border: '#8b8fa830' },
  planned:   { label: 'Planned',   color: '#60a5fa', bg: '#60a5fa10', border: '#60a5fa30' },
  designed:  { label: 'Designed',  color: '#a78bfa', bg: '#a78bfa10', border: '#a78bfa30' },
  ready_dev: { label: 'Ready Dev', color: '#fb923c', bg: '#fb923c10', border: '#fb923c30' },
  in_dev:    { label: 'In Dev',    color: '#fbbf24', bg: '#fbbf2410', border: '#fbbf2430' },
  deployed:  { label: 'Deployed',  color: '#4ade80', bg: '#4ade8010', border: '#4ade8030' },
  archived:  { label: 'Archived',  color: '#6b7280', bg: '#6b728010', border: '#6b728030' },
};

export const DOC_STATUS: Record<DocStatus, { label: string; color: string; bg: string; border: string }> = {
  draft:    { label: 'Draft',    color: '#8b8fa8', bg: '#8b8fa810', border: '#8b8fa830' },
  reviewed: { label: 'Reviewed', color: '#fbbf24', bg: '#fbbf2410', border: '#fbbf2430' },
  approved: { label: 'Approved', color: '#4ade80', bg: '#4ade8010', border: '#4ade8030' },
};

export const JOB_STATUS: Record<JobStatus, { label: string; color: string; bg: string; border: string }> = {
  queued:  { label: 'Queued',  color: '#8b8fa8', bg: '#8b8fa810', border: '#8b8fa830' },
  running: { label: 'Running', color: '#fbbf24', bg: '#fbbf2410', border: '#fbbf2430' },
  done:    { label: 'Done',    color: '#4ade80', bg: '#4ade8010', border: '#4ade8030' },
  failed:  { label: 'Failed',  color: '#f87171', bg: '#f8717110', border: '#f8717130' },
};

export const DEPLOY_STATUS: Record<DeployStatus, { label: string; color: string; glow: string }> = {
  pending: { label: 'Pending', color: '#fbbf24', glow: '#fbbf2480' },
  success: { label: 'Success', color: '#4ade80', glow: '#4ade8080' },
  failed:  { label: 'Failed',  color: '#f87171', glow: '#f8717180' },
};

interface BadgeProps { value: string; size?: 'sm' | 'md' }

export function ContentStatusBadge({ value, size = 'md' }: BadgeProps) {
  const meta = CONTENT_STATUS[value as ContentStatus] || CONTENT_STATUS.idea;
  const pad = size === 'sm' ? '2px 7px' : '3px 10px';
  const fs = size === 'sm' ? 10 : 11;
  return (
    <span style={{
      fontSize: fs, padding: pad, borderRadius: 10, whiteSpace: 'nowrap',
      background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
    }}>
      {meta.label}
    </span>
  );
}

export function DocStatusBadge({ value, size = 'md' }: BadgeProps) {
  const meta = DOC_STATUS[value as DocStatus] || DOC_STATUS.draft;
  const pad = size === 'sm' ? '2px 7px' : '3px 10px';
  const fs = size === 'sm' ? 10 : 11;
  return (
    <span style={{
      fontSize: fs, padding: pad, borderRadius: 10, whiteSpace: 'nowrap',
      background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
    }}>
      {meta.label}
    </span>
  );
}

export function JobStatusBadge({ value, size = 'md' }: BadgeProps) {
  const meta = JOB_STATUS[value as JobStatus] || JOB_STATUS.queued;
  const pad = size === 'sm' ? '2px 7px' : '3px 10px';
  const fs = size === 'sm' ? 10 : 11;
  return (
    <span style={{
      fontSize: fs, padding: pad, borderRadius: 10, whiteSpace: 'nowrap',
      background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
      display: 'inline-flex', alignItems: 'center', gap: 5,
    }}>
      {value === 'running' && <span style={{ width: 5, height: 5, borderRadius: '50%', background: meta.color, display: 'inline-block', animation: 'pulse 1.2s infinite' }} />}
      {meta.label}
    </span>
  );
}

export function DeployStatusDot({ value }: { value: string }) {
  const meta = DEPLOY_STATUS[value as DeployStatus] || DEPLOY_STATUS.pending;
  return (
    <div style={{
      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
      background: meta.color, boxShadow: `0 0 6px ${meta.glow}`,
    }} />
  );
}
