// 팔레트 메타 — 런타임 import 없음 (Node 테스트에서 바로 불러온다)
import type { TypeRegistry } from '@/lib/aa/architecture-types';

// 카테고리 색 (04 §1) — 레지스트리를 받기 전에도 노드를 그릴 수 있게 기본값을 둔다
export const CATEGORY_COLOR: Record<string, string> = {
  application: '#c8a96e',
  data: '#4f9cf9',
  networking: '#a78bfa',
  general: 'rgba(255,255,255,0.4)',
  deployment: '#5ec4b6',
  aws: '#ffb547',
  kubernetes: '#82aaff',
  operations: '#3ecf8e',   // Sprint 11 운영 설계
};

// 배치안 신뢰 구역 색 (04 §6.10: external 회색 · dmz 보라 · internal teal · data 파랑)
export const TRUST_COLOR: Record<string, string> = {
  external: 'rgba(255,255,255,0.45)', dmz: '#a78bfa', internal: '#5ec4b6', data: '#4f9cf9',
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
  'aws.region': { icon: '◎', category: 'aws' },
  'aws.vpc': { icon: '⬚', category: 'aws' },
  'aws.az': { icon: '▥', category: 'aws' },
  'aws.subnet': { icon: '▦', category: 'aws' },
  'aws.alb': { icon: '⇋', category: 'aws' },
  'aws.eks': { icon: '⬡', category: 'aws' },
  'aws.rds': { icon: '⛁', category: 'aws' },
  'k8s.namespace': { icon: '⬚', category: 'kubernetes' },
  'k8s.deployment': { icon: '⬡', category: 'kubernetes' },
  'k8s.service': { icon: '⇋', category: 'kubernetes' },
  'k8s.ingress': { icon: '⇲', category: 'kubernetes' },
  'k8s.hpa': { icon: '↗', category: 'kubernetes' },
  // Sprint 7 배치안 (레지스트리 v3와 같은 아이콘)
  'dep.environment': { icon: '▣', category: 'deployment' },
  'dep.zone': { icon: '▦', category: 'deployment' },
  'dep.platform': { icon: '☁', category: 'deployment' },
  'dep.vm': { icon: '▭', category: 'deployment' },
  'dep.lb': { icon: '⇋', category: 'deployment' },
  'dep.managed_db': { icon: '⛁', category: 'deployment' },
  'dep.managed_auth': { icon: '⚿', category: 'deployment' },
  'dep.process': { icon: '⚙', category: 'deployment' },
  // Sprint 11 운영 설계 (레지스트리 v5와 같은 아이콘)
  'ops.metrics': { icon: '📈', category: 'operations' },
  'ops.alerting': { icon: '🔔', category: 'operations' },
  'ops.collector': { icon: '⇲', category: 'operations' },
  'ops.telemetry': { icon: '🐾', category: 'operations' },
  'ops.ci': { icon: '⚙', category: 'operations' },
  'ops.registry': { icon: '▤', category: 'operations' },
  'ops.config_repo': { icon: '⎇', category: 'operations' },
  'ops.gitops': { icon: '⟳', category: 'operations' },
};

/**
 * Sprint 11 (Q11) 호환 배포 플래그: NEXT_PUBLIC_AA_OPS_STRATEGY=false면 운영 설계 팔레트·레이어 토글·구조화 전략 폼만 숨긴다.
 * v5 타입·관계 읽기/보존, V17~V19, strategy 정규화·Diff·저장·발행·복원은 그대로 동작한다(S11-6).
 */
export const OPS_UI_ENABLED = process.env.NEXT_PUBLIC_AA_OPS_STRATEGY !== 'false';

/**
 * 팔레트에 그리는 분류 순서. 여기에 없는 분류의 항목은 화면에 나오지 않는다.
 * Sprint 11 Step 6: 'operations'가 빠져 운영 설계 팔레트가 보이지 않던 Step 3 누락을 고쳤다(테스트로 레지스트리 분류 전부를 확인).
 */
export const PALETTE_CATEGORY_ORDER = ['deployment', 'operations', 'aws', 'kubernetes', 'application', 'data', 'general'] as const;

export const DND_MIME = 'application/aa-type';
/** Sprint 8 (VIEW-05): 다른 View의 컴포넌트를 참조 노드로 끌어 놓을 때 */
export const REF_MIME = 'application/aa-ref';

export type PaletteItem = { type: string; label: string; icon: string; category: string; nodeKind: string };

/**
 * 한 View의 팔레트 항목. query가 있으면 label·type key·별칭으로 거른다 (대소문자 무시, 부분 일치).
 * 예: postgres → Database, redis → Cache, kafka → Queue
 */
export function paletteItems(registry: TypeRegistry | null, viewKind: string, query = '', { ops = OPS_UI_ENABLED }: { ops?: boolean } = {}): PaletteItem[] {
  const q = query.trim().toLowerCase();
  const out: PaletteItem[] = [];
  const hidden = (category: string) => !ops && category === 'operations';   // Sprint 11 (Q11) 숨김 빌드
  if (!registry) {
    for (const [type, f] of Object.entries(TYPE_FALLBACK)) {
      // 레지스트리가 없을 때: 배치안 타입은 배치안에서만, 나머지는 Logical에서만
      const view = f.category === 'operations' ? 'deployment' : f.category === 'aws' || f.category === 'kubernetes' || f.category === 'deployment' ? f.category : 'logical';
      if (view !== viewKind && type !== 'group' && type !== 'note') continue;
      if (hidden(f.category)) continue;
      if (!q || type.includes(q)) out.push({ type, label: type, icon: f.icon, category: f.category, nodeKind: type === 'group' || type === 'note' ? type : 'component' });
    }
    return out;
  }
  for (const [type, d] of Object.entries(registry.types)) {
    if (!d.views.includes(viewKind as never)) continue;
    if (hidden(d.category)) continue;
    const hay = [d.label, type, ...(d.aliases ?? [])].map((s) => s.toLowerCase());
    if (q && !hay.some((s) => s.includes(q))) continue;
    out.push({ type, label: d.label, icon: (viewKind === 'aws' || viewKind === 'kubernetes' ? TYPE_FALLBACK[type]?.icon : undefined) || d.icon || TYPE_FALLBACK[type]?.icon || '▭', category: d.category, nodeKind: d.nodeKind });
  }
  return out;
}
