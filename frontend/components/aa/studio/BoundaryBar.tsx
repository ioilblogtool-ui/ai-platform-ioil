'use client';

// 경계·데이터 표시 막대 (Sprint 8 · REL-07 · 04 §6.7(b)).
// [경계·데이터 표시] 토글(기본 켬), Logical에서는 "경계 기준 배치안" 선택, 범례.
// 선택은 브라우저에만 저장(모델 밖) — 읽기·쓰기 실패해도 기본값으로 동작한다.
import { useCallback, useEffect, useState } from 'react';
import type { ArchitectureModel } from '@/lib/aa/architecture-types';
import { DATA_CLASS_COLOR } from '@/lib/aa/boundary';

type Prefs = { show: boolean; baseViewId: string | null };
const KEY = (projectId: string) => `aa:boundary:${projectId}`;

export function useBoundaryPrefs(projectId: string | null | undefined) {
  const [prefs, setPrefs] = useState<Prefs>({ show: true, baseViewId: null });
  useEffect(() => {
    if (!projectId) return;
    try {
      const raw = localStorage.getItem(KEY(projectId));
      const parsed = raw ? JSON.parse(raw) : null;
      setPrefs({ show: parsed?.show !== false, baseViewId: typeof parsed?.baseViewId === 'string' ? parsed.baseViewId : null });
    } catch { /* 기본값 유지 */ }
  }, [projectId]);
  const update = useCallback((next: Partial<Prefs>) => {
    setPrefs((cur) => {
      const merged = { ...cur, ...next };
      try { if (projectId) localStorage.setItem(KEY(projectId), JSON.stringify(merged)); } catch { /* 저장 실패는 무시 */ }
      return merged;
    });
  }, [projectId]);
  return { ...prefs, update };
}

export default function BoundaryBar({ model, viewId, baseViewId, prefs }: {
  model: ArchitectureModel; viewId: string; baseViewId: string | null; prefs: ReturnType<typeof useBoundaryPrefs>;
}) {
  const view = model.views.find((v) => v.id === viewId);
  const deps = model.views.filter((v) => v.kind === 'deployment');
  const isLogical = view?.kind === 'logical';
  const chip = (color: string, text: string) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 14, height: 2, background: color }} />{text}</span>;
  return (
    <div data-testid="aa-boundary-bar" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 14px', fontSize: 11.5, color: 'rgba(255,255,255,0.55)', borderBottom: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap' }}>
      <label style={{ display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
        <input type="checkbox" checked={prefs.show} onChange={(e) => prefs.update({ show: e.target.checked })} data-testid="aa-boundary-toggle" />
        경계·데이터 표시
      </label>
      {prefs.show && isLogical && (
        deps.length ? (
          <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}>경계 기준
            <select aria-label="경계 기준 배치안" data-testid="aa-boundary-base" value={baseViewId ?? ''} onChange={(e) => prefs.update({ baseViewId: e.target.value })}
              style={{ background: '#141417', color: '#e8e6e1', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5, padding: '2px 6px', fontSize: 11.5 }}>
              {deps.map((v) => <option key={v.id} value={v.id}>{v.variant}</option>)}
            </select>
          </label>
        ) : <span>배치안이 없어 경계는 표시하지 않습니다</span>
      )}
      {prefs.show && (
        <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }} data-testid="aa-boundary-legend">
          {isLogical
            ? <><span>🛡 경계 통과(추론 — 점선)</span><span>🛡? 경계 통과 가능</span></>
            : <span>🛡 경계 통과(확정)</span>}
          {chip(DATA_CLASS_COLOR.personal!, 'personal')}
          {chip(DATA_CLASS_COLOR.sensitive!, 'sensitive')}
          <span title="구역(dep.zone)의 trust 등급이 다를 때만 경계입니다. 구역을 모르면 표시하지 않습니다.">ⓘ trust 등급이 다를 때만</span>
        </span>
      )}
    </div>
  );
}
