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
};

// Sprint 1 팔레트: 컴포넌트 노드만 (group·note는 Sprint 2)
export const SPRINT1_TYPES = Object.keys(TYPE_FALLBACK);

export const DND_MIME = 'application/aa-type';
