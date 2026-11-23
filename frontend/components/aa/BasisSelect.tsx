'use client';

// 내보내기 기준 고르기 (Sprint 6 Step 4 · Q12). README는 "최신 발행본"(기본)·버전·Draft, Ask AI는 Draft(기본)·버전.
// 값: 'latest' | 'draft' | 버전 id
import { useEffect, useState, type CSSProperties } from 'react';
import { getDraft, getVersion, listVersions } from '@/lib/aa/architecture-api';
import type { ApiFlow, VersionListItem } from '@/lib/aa/architecture-types';

/** Sprint 8: 고른 원본(Draft·버전·최신 발행본)의 흐름 목록 — README apiFlows·Ask AI flow 범위 선택용 */
export function useBasisFlows(projectId: string, basis: BasisValue): ApiFlow[] | null {
  const [flows, setFlows] = useState<ApiFlow[] | null>(null);
  useEffect(() => {
    let alive = true;
    setFlows(null);
    (async () => {
      let model;
      if (basis === 'draft') model = (await getDraft(projectId)).model;
      else if (basis === 'latest') {
        const latest = (await listVersions(projectId, { limit: 1 })).data?.[0];
        model = latest ? (await getVersion(projectId, latest.id)).model : (await getDraft(projectId)).model;
      } else model = (await getVersion(projectId, basis)).model;
      if (alive) setFlows(Object.values(model?.flows ?? {}));
    })().catch(() => { if (alive) setFlows([]); });
    return () => { alive = false; };
  }, [projectId, basis]);
  return flows;
}

export type BasisValue = 'latest' | 'draft' | string;

export default function BasisSelect({ projectId, value, onChange, allowLatest, testId, style }: {
  projectId: string;
  value: BasisValue;
  onChange: (v: BasisValue) => void;
  allowLatest: boolean;
  testId?: string;
  style?: CSSProperties;
}) {
  const [versions, setVersions] = useState<VersionListItem[] | null>(null);
  useEffect(() => {
    let alive = true;
    listVersions(projectId, { limit: 200 }).then((r) => { if (alive) setVersions(r.data ?? []); }).catch(() => { if (alive) setVersions([]); });
    return () => { alive = false; };
  }, [projectId]);

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} aria-label="내보내기 기준"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'rgba(255,255,255,0.9)', padding: '5px 8px', fontSize: 12.5, ...style }}>
      {allowLatest && <option value="latest">최신 발행본{versions && !versions.length ? ' (없음 → Draft)' : versions?.[0] ? ` (${versions[0].label})` : ''}</option>}
      <option value="draft">Draft (작업 중)</option>
      {versions?.map((v) => <option key={v.id} value={v.id}>{v.label} · {v.createdAt.slice(0, 10)}</option>)}
    </select>
  );
}

/** 선택 값 → 요청의 source */
export function toSource(v: BasisValue) {
  if (v === 'latest') return { type: 'latest' as const };
  if (v === 'draft') return { type: 'draft' as const };
  return { type: 'version' as const, versionId: v };
}
