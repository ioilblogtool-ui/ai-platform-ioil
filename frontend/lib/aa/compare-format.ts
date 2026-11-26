// Version Compare (Sprint 7 Step 4) 화면 계산. React·네트워크 import 없음 — node --test로 바로 검증한다.
// 다른 lib 모듈을 런타임 import하지 않는다 (node --test가 확장자 없는 .ts import를 풀지 못함).
import type { ArchitectureModel, CompareChange, CompareViewMeta, FieldChange } from './architecture-types';

export type Tone = 'added' | 'removed' | 'modified';
export type GroupKey = 'component' | 'relation' | 'flow' | 'links' | 'view' | 'requirement' | 'layout';
export interface CompareItem { change: CompareChange; text: string; detail?: string; tone: Tone; viewId?: string; /** Sprint 11: 주의 문구 */ warning?: string }

/** Sprint 11 (Q7): view.strategy의 parts → 화면 문구. 순서는 서버 parts 순서 */
const STRATEGY_PART_LABEL: Record<string, string> = {
  markdown: 'Markdown', release: '릴리스 방식', gates: '중단 기준', rollback: '이미지 롤백',
  fallback: 'VM 복귀', environments: '환경·승격', dbChange: 'DB 변경',
};
export const strategyPartLabels = (parts: readonly string[] | undefined) => (parts ?? []).map((p) => STRATEGY_PART_LABEL[p] ?? p);
export const FALLBACK_UNSET = '⚠ VM 복귀 대상 미지정';
export interface CompareGroup { key: GroupKey; title: string; items: CompareItem[] }

const GROUPS: { key: GroupKey; title: string }[] = [
  { key: 'component', title: '컴포넌트' },
  { key: 'relation', title: '관계' },
  { key: 'flow', title: 'API Flow' },
  { key: 'links', title: '요구사항 연결' },
  { key: 'view', title: 'View · 배치안' },
  { key: 'requirement', title: '요구사항 (발행 당시 값)' },
  { key: 'layout', title: '배치 (좌표·크기)' },
];

const FIELD_LABEL: Record<string, string> = {
  name: '이름', type: '타입', technology: '기술', description: '설명', tags: '태그',
  protocol: '프로토콜', mode: '방식', label: '설명', from: '출발', to: '도착',
  timeoutMs: 'timeout(ms)', retry: 'retry', onFailure: '실패 시 동작', credential: '자격증명 유형', dataClass: '데이터 등급',
  endpoint: '엔드포인트', participants: '참여', outcomes: '결과', auth: '인증 역할',
  title: '제목', target: '목표', metric: '측정', priority: '우선순위', kind: '종류', category: '분류', code: '코드',
};

function fieldName(path: string) {
  if (path.startsWith('properties.')) return path.slice('properties.'.length);
  if (path.startsWith('custom.')) return `사용자 속성 ${path.slice('custom.'.length)}`;
  return FIELD_LABEL[path] ?? path;
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '없음';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '없음';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('max' in o && 'backoff' in o) return `${o.max}회 ${o.backoff}`;   // retry
    const ROLE: Record<string, string> = { tokenIssuer: '발급', tokenVerifier: '검증', dataAccessor: 'DB 접근' };
    const entries = Object.entries(o);
    return entries.length ? entries.map(([k, x]) => `${ROLE[k] ?? k} ${String(x)}`).join(', ') : '없음';
  }
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 59)}…` : s;
}

/** 설명(description)처럼 긴 값은 바뀌었다고만 쓴다 */
export function fieldText(f: FieldChange): string {
  if (f.path === 'description') return '설명 변경';
  return `${fieldName(f.path)}: ${show(f.before)} → ${show(f.after)}`;
}

const linkText = (added: string[], removed: string[]) =>
  [added.length ? `+ ${added.join(', ')}` : null, removed.length ? `− ${removed.join(', ')}` : null].filter(Boolean).join(' · ');

export function viewLabel(meta: Pick<CompareViewMeta, 'kind' | 'name'> & { variant?: string | null }): string {
  if (meta.kind === 'deployment') return `배치안 · ${meta.variant ?? meta.name}`;
  if (meta.kind === 'aws' || meta.kind === 'kubernetes') {
    return meta.variant ? `${meta.kind === 'aws' ? 'AWS' : 'K8s'} · ${meta.variant}` : meta.name;
  }
  return meta.name;
}

function describe(c: CompareChange, viewName: (id: string) => string): { group: GroupKey; item: CompareItem } {
  switch (c.kind) {
    case 'component.added':
      return { group: 'component', item: { change: c, tone: 'added', text: `추가 · ${c.name} (${c.type})`, viewId: c.viewIds[0] } };
    case 'component.removed':
      return { group: 'component', item: { change: c, tone: 'removed', text: `삭제 · ${c.name} (${c.type})`, viewId: c.viewIds[0] } };
    case 'component.modified':
      return { group: 'component', item: { change: c, tone: 'modified', text: `수정 · ${c.name}`, detail: c.fields.map(fieldText).join(' / '), viewId: c.viewIds[0] } };
    case 'component.requirements':
      return { group: 'links', item: { change: c, tone: 'modified', text: c.name, detail: linkText(c.added, c.removed), viewId: c.viewIds[0] } };
    case 'relation.added':
      return { group: 'relation', item: { change: c, tone: 'added', text: `추가 · ${c.from} → ${c.to}${c.relationType === 'realizes' ? ' (구현)' : c.protocol ? ` (${c.protocol})` : ''}` } };
    case 'relation.removed':
      return { group: 'relation', item: { change: c, tone: 'removed', text: `삭제 · ${c.from} → ${c.to}${c.relationType === 'realizes' ? ' (구현)' : c.protocol ? ` (${c.protocol})` : ''}` } };
    case 'relation.modified':
      return { group: 'relation', item: { change: c, tone: 'modified', text: `${c.security ? '🛡 보안 ' : ''}수정 · ${c.from} → ${c.to}`, detail: c.fields.map(fieldText).join(' / ') } };
    case 'flow.added':
      return { group: 'flow', item: { change: c, tone: 'added', text: `추가 · ${c.name}${c.endpoint ? ` (${c.endpoint})` : ''}` } };
    case 'flow.removed':
      return { group: 'flow', item: { change: c, tone: 'removed', text: `삭제 · ${c.name}${c.endpoint ? ` (${c.endpoint})` : ''}` } };
    case 'flow.modified':
      return { group: 'flow', item: { change: c, tone: 'modified', text: `수정 · ${c.name}`, detail: c.fields.map(fieldText).join(' / ') } };
    case 'flow.requirements':
      return { group: 'links', item: { change: c, tone: 'modified', text: `흐름 ${c.name}`, detail: linkText(c.added, c.removed) } };
    case 'flow.mermaid':
      return { group: 'flow', item: { change: c, tone: 'modified', text: `표현 변경 · ${c.name}`, detail: '시퀀스 본문만 바뀜' } };
    case 'relation.requirements':
      return { group: 'links', item: { change: c, tone: 'modified', text: `${c.from} → ${c.to}`, detail: linkText(c.added, c.removed) } };
    case 'view.added':
      return { group: 'view', item: { change: c, tone: 'added', text: `${c.viewKind === 'deployment' ? '배치안' : 'View'} 추가 · ${c.variant}`, viewId: c.viewId } };
    case 'view.removed':
      return { group: 'view', item: { change: c, tone: 'removed', text: `${c.viewKind === 'deployment' ? '배치안' : 'View'} 삭제 · ${c.variant}`, viewId: c.viewId } };
    case 'view.renamed':
      return { group: 'view', item: { change: c, tone: 'modified', text: `${c.viewKind === 'deployment' ? '배치안' : 'View'} 이름 · ${c.before} → ${c.after}`, viewId: c.viewId } };
    case 'view.cluster':
      return { group: 'view', item: { change: c, tone: 'modified', text: `K8s 클러스터 연결 · ${viewName(c.viewId)}`,
        detail: `${c.before ?? '미지정'} → ${c.after ?? '미지정'}`, viewId: c.viewId } };
    case 'view.strategy': {
      const tone: Tone = c.change === 'added' ? 'added' : c.change === 'removed' ? 'removed' : 'modified';
      // Sprint 11 (Q7): 수정이면 바뀐 하위 항목을 붙인다 — "배포 전략 변경 · 중단 기준"
      const labels = c.change === 'modified' ? strategyPartLabels(c.parts) : [];
      const text = labels.length
        ? `배포 전략 변경 · ${labels.join(' · ')} — ${c.variant}`
        : `배포 전략 ${c.change === 'added' ? '작성' : c.change === 'removed' ? '삭제' : '수정'} · ${c.variant}`;
      const warning = c.warnings?.includes('fallback-unset') ? FALLBACK_UNSET : undefined;
      return { group: 'view', item: { change: c, tone, text, viewId: c.viewId, ...(warning ? { warning } : {}) } };
    }
    case 'view.node.added':
      return { group: 'view', item: { change: c, tone: 'added', text: `${viewName(c.viewId)}에 ${c.name} 추가`, viewId: c.viewId } };
    case 'view.node.removed':
      return { group: 'view', item: { change: c, tone: 'removed', text: `${viewName(c.viewId)}에서 ${c.name} 빠짐`, viewId: c.viewId } };
    case 'view.node.reparented':
      return { group: 'view', item: { change: c, tone: 'modified', text: `${viewName(c.viewId)} · ${c.name} 위치 이동`, detail: `${c.before ?? '최상위'} → ${c.after ?? '최상위'}`, viewId: c.viewId } };
    case 'requirement.snapshot_changed':
      return { group: 'requirement', item: { change: c, tone: c.change === 'added' ? 'added' : c.change === 'removed' ? 'removed' : 'modified',
        text: `${c.code} ${c.change === 'added' ? '새로 연결' : c.change === 'removed' ? '연결 없음' : '값 변경'}`, detail: c.fields.map(fieldText).join(' / ') || undefined } };
    case 'layout.moved':
      return { group: 'layout', item: { change: c, tone: 'modified', text: `${viewName(c.viewId)} · ${c.name} 이동`, viewId: c.viewId } };
    case 'layout.resized':
      return { group: 'layout', item: { change: c, tone: 'modified', text: `${viewName(c.viewId)} · ${c.name} 크기`, viewId: c.viewId } };
  }
  const unknown = c as { kind: string };
  return { group: 'view', item: { change: c, tone: 'modified', text: `기타 변경 · ${unknown.kind}` } };
}

/** 종류별로 묶은 변경 목록 (빈 묶음은 뺀다) */
export function groupChanges(changes: CompareChange[], views: CompareViewMeta[] = []): CompareGroup[] {
  const names = new Map(views.map((v) => [v.id, viewLabel(v)]));
  const viewName = (id: string) => names.get(id) ?? id;
  const byKey = new Map<GroupKey, CompareItem[]>();
  for (const c of changes) {
    const { group, item } = describe(c, viewName);
    if (!byKey.has(group)) byKey.set(group, []);
    byKey.get(group)!.push(item);
  }
  return GROUPS.filter((g) => byKey.has(g.key)).map((g) => ({ ...g, items: byKey.get(g.key)! }));
}

/** 선택한 View에서 칠할 노드: 새로 생긴 것(초록)·바뀐 것(주황). 기준은 to 모델 */
export function highlightNodes(changes: CompareChange[], model: ArchitectureModel | null | undefined, viewId: string) {
  const added = new Set<string>();
  const modified = new Set<string>();
  const view = model?.views.find((v) => v.id === viewId);
  if (!view) return { added, modified };
  const nodesOf = (componentId: string) => view.nodes.filter((n) => n.componentId === componentId).map((n) => n.id);
  for (const c of changes) {
    if (c.kind === 'component.added') nodesOf(c.componentId).forEach((id) => added.add(id));
    else if (c.kind === 'component.modified' || c.kind === 'component.requirements') nodesOf(c.componentId).forEach((id) => modified.add(id));
    else if (c.kind === 'view.node.added' && c.viewId === viewId) added.add(c.nodeId);
    else if (c.kind === 'view.node.reparented' && c.viewId === viewId) modified.add(c.nodeId);
  }
  for (const id of added) modified.delete(id);
  return { added, modified };
}

/** 모든 변경이 배치뿐인가 */
export const onlyLayout = (changes: CompareChange[]) => changes.length > 0 && changes.every((c) => c.kind.startsWith('layout.'));
