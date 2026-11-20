// 팔레트 메타 — 런타임 import 없음 (Node 테스트에서 바로 불러온다)
import type { TypeRegistry } from '@/lib/aa/architecture-types';

// 카테고리 색 (04 §1) — 레지스트리를 받기 전에도 노드를 그릴 수 있게 기본값을 둔다
export const CATEGORY_COLOR: Record<string, string> = {
  application: '#c8a96e',
  data: '#4f9cf9',
  networking: '#a78bfa',
  general: 'rgba(255,255,255,0.4)',
};

export const TYPE_FALLBACK: Record<string, { icon: string; category: string }> = {
  client: { icon: '▭', category: 'application' },
  gateway: { icon: '⇲', category: 'application' },
  service: { icon: '⬢', category: 'application' },
  worker: { icon: '⚙', category: 'application' },
  external: { icon: '◌', category: 'application' },
  database: { icon: '◫', category: 'data' },
  cache: { icon: '⚡', category: 'data' },
  queue: { icon: '☰', category: 'data' },
  storage: { icon: '▥', category: 'data' },
  group: { icon: '⬚', category: 'general' },
  note: { icon: '✎', category: 'general' },
};

export const DND_MIME = 'application/aa-type';

export type PaletteItem = { type: string; label: string; icon: string; category: string; nodeKind: string };

/**
 * 한 View의 팔레트 항목. query가 있으면 label·type key·별칭으로 거른다 (대소문자 무시, 부분 일치).
 * 예: postgres → Database, redis → Cache, kafka → Queue
 */
export function paletteItems(registry: TypeRegistry | null, viewKind: string, query = ''): PaletteItem[] {
  const q = query.trim().toLowerCase();
  const out: PaletteItem[] = [];
  if (!registry) {
    for (const [type, f] of Object.entries(TYPE_FALLBACK)) {
      if (!q || type.includes(q)) out.push({ type, label: type, icon: f.icon, category: f.category, nodeKind: type === 'group' || type === 'note' ? type : 'component' });
    }
    return out;
  }
  for (const [type, d] of Object.entries(registry.types)) {
    if (!d.views.includes(viewKind as never)) continue;
    const hay = [d.label, type, ...(d.aliases ?? [])].map((s) => s.toLowerCase());
    if (q && !hay.some((s) => s.includes(q))) continue;
    out.push({ type, label: d.label, icon: d.icon || TYPE_FALLBACK[type]?.icon || '▭', category: d.category, nodeKind: d.nodeKind });
  }
  return out;
}
