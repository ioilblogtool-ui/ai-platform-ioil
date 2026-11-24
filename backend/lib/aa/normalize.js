// 내보내기 공통 정규화 (Sprint 4 Step 1, D-30 · 05 "AI Review와의 공유 범위").
// Draft 모델 → 사람이 읽는 구조. 좌표·스타일·내부 ID(cmp_·rel_·nd_)는 결과에 넣지 않는다.
// README(Sprint 4)와 Ask AI Export(Sprint 5)가 같이 쓴다. 범위 선택·별칭은 각 빌더가 정한다.
const REGISTRY = require('./type-registry.json');

const LOGICAL = 'view_logical';
// RDM-04: 이름이 이런 단어로 시작하거나 끝나는 custom 속성은 내보내지 않는다
const SECRET_KEY_RE = /^(password|secret|token|key|env)|(password|secret|token|key|env)$/i;
// 환경변수 값처럼 보이는 custom 값(KEY=value)도 내보내지 않는다
const ENV_VALUE_RE = /^[A-Z][A-Z0-9_]*=\S/;
const DESCRIPTION_MAX = 120;

const typeLabel = (type) => REGISTRY.types[type]?.label ?? type;

function displayValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function firstLine(text) {
  const line = String(text ?? '').split(/\r?\n/).map((s) => s.trim()).find(Boolean) ?? '';
  return line.length > DESCRIPTION_MAX ? `${line.slice(0, DESCRIPTION_MAX - 1)}…` : line;
}

/**
 * @param {object} model Draft 모델
 * @param {{ requirements?: Array<{id:string,code:string,kind:string,title:string,status?:string,category?:string|null,target?:string|null,metric?:string|null}> }} [context]
 */
const ON_FAILURE_LABEL = { propagate: '오류 전파', fallback: '대체 응답', queue_retry: '큐 재처리', ignore: '무시' };
/** calls 운영·보안 속성 한 줄 (없으면 null). 자격증명은 유형만 */
function relationOps(r) {
  const timeout = r.timeoutMs === undefined ? null : r.timeoutMs % 1000 === 0 ? `timeout ${r.timeoutMs / 1000}s` : `timeout ${r.timeoutMs}ms`;
  const parts = [timeout, r.retry ? `retry ${r.retry.max}회 ${r.retry.backoff}` : null, r.onFailure ? `실패 시 ${ON_FAILURE_LABEL[r.onFailure] ?? r.onFailure}` : null,
    r.credential ? `자격증명 ${r.credential}` : null, r.dataClass ? `데이터 ${r.dataClass}` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function normalizeModel(model, context = {}) {
  const requirements = context.requirements ?? [];
  const codeOf = new Map(requirements.map((r) => [String(r.id).toLowerCase(), r.code]));
  const codes = (ids) => (Array.isArray(ids) ? ids : [])
    .map((id) => codeOf.get(String(id).toLowerCase()))
    .filter(Boolean)
    .sort();

  const view = (model?.views ?? []).find((v) => v.id === LOGICAL);
  const viewNodes = view?.nodes ?? [];
  const byNodeId = new Map(viewNodes.map((n) => [n.id, n]));
  const groupLabel = (node) => {
    const seen = new Set();
    let parent = node.parentId ? byNodeId.get(node.parentId) : undefined;
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id);
      if (parent.kind === 'group') return parent.label || 'Boundary';
      parent = parent.parentId ? byNodeId.get(parent.parentId) : undefined;
    }
    return null;
  };

  // 순서: Logical에 그려진 순서 → 그려지지 않은 컴포넌트(이름순)
  // Sprint 7 Q6: Logical 기준 출력 — 배치안(deployment 레이어) 컴포넌트는 뺀다. 그 끝점의 관계(realizes 포함)도 자연히 빠진다.
  // 기존 Logical의 calls·depends_on·그룹·요구사항 집계는 그대로라 배치안이 없던 모델의 출력은 바뀌지 않는다.
  const components = Object.fromEntries(Object.entries(model?.components ?? {}).filter(([, c]) => !['deployment', 'kubernetes', 'aws', 'ops'].includes(c?.layer)));   // Sprint 11: 운영 설계(ops)도 Logical 출력에서 뺀다
  const drawn = viewNodes.filter((n) => n.kind === 'component' && components[n.componentId]);
  const drawnIds = new Set(drawn.map((n) => n.componentId));
  const order = [
    ...drawn.map((n) => ({ id: n.componentId, node: n })),
    ...Object.keys(components).filter((id) => !drawnIds.has(id))
      .sort((a, b) => String(components[a].name).localeCompare(String(components[b].name)))
      .map((id) => ({ id, node: null })),
  ];
  const seenComponents = new Set();
  const list = [];
  const nameOf = new Map();
  for (const { id, node } of order) {
    if (seenComponents.has(id)) continue;
    seenComponents.add(id);
    const c = components[id];
    const defs = REGISTRY.types[c.type]?.properties ?? [];
    const properties = defs
      .filter((def) => c.properties && c.properties[def.key] !== undefined && c.properties[def.key] !== null && c.properties[def.key] !== '')
      .map((def) => ({ label: def.label, value: displayValue(c.properties[def.key]) }));
    const custom = Object.entries(c.custom ?? {})
      .filter(([key, value]) => !SECRET_KEY_RE.test(key) && !ENV_VALUE_RE.test(String(value)))
      .map(([label, value]) => ({ label, value: String(value) }));
    const entry = {
      ref: `c${list.length + 1}`,                // 내보내기 안에서만 쓰는 순번 (내부 ID 아님)
      name: c.name,
      type: c.type,
      typeLabel: typeLabel(c.type),
      technology: c.technology || null,
      summary: firstLine(c.description) || null,
      properties,
      custom,
      group: node ? groupLabel(node) : null,
      inLogical: Boolean(node),
      requirementCodes: codes(c.requirementIds),
    };
    nameOf.set(id, entry);
    list.push(entry);
  }

  const relations = Object.values(model?.relations ?? {})
    .filter((r) => nameOf.has(r.from) && nameOf.has(r.to))
    .map((r) => ({
      from: nameOf.get(r.from).ref,
      to: nameOf.get(r.to).ref,
      fromName: nameOf.get(r.from).name,
      toName: nameOf.get(r.to).name,
      type: r.type,
      protocol: r.protocol || null,
      mode: r.mode || null,
      label: r.label || null,
      requirementCodes: codes(r.requirementIds),
      // Sprint 8 (REL-05·06): 있을 때만 — 없는 모델의 출력이 Sprint 7과 같게
      ...(r.type === 'calls' && relationOps(r) ? { ops: relationOps(r) } : {}),
    }));

  // 그룹 ref도 내부 노드 ID 대신 순번(g1, g2…)을 쓴다. parent는 바로 위 그룹
  const groupNodes = viewNodes.filter((n) => n.kind === 'group');
  const groupRef = new Map(groupNodes.map((g, i) => [g.id, `g${i + 1}`]));
  const normalizedGroups = groupNodes.map((g) => ({
    ref: groupRef.get(g.id),
    label: g.label || 'Boundary',
    parent: (g.parentId && groupRef.get(g.parentId)) || null,
  }));
  for (const n of drawn) {
    const entry = nameOf.get(n.componentId);
    if (entry && entry.groupRef === undefined) entry.groupRef = (n.parentId && groupRef.get(n.parentId)) || null;
  }
  for (const entry of list) entry.groupRef ??= null;

  const techStack = [...new Set(list.flatMap((c) => [c.technology, ...c.properties.filter((p) => p.label === 'Runtime').map((p) => p.value)]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  const reqs = requirements
    .filter((r) => r.status !== 'deprecated')
    .map((r) => ({
      code: r.code, kind: r.kind, title: r.title, category: r.category ?? null, target: r.target ?? null, metric: r.metric ?? null,
      // Sprint 8 (REQ-06): 측정 기준(Draft 기준일 때만 들어온다 — 버전 스냅샷에는 없음)
      ...(r.measurement && Object.keys(r.measurement).length ? { measurement: r.measurement } : {}),
    }))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const result = {
    components: list,
    relations,
    groups: normalizedGroups,
    techStack,
    requirements: { fr: reqs.filter((r) => r.kind === 'fr'), nfr: reqs.filter((r) => r.kind === 'nfr') },
  };
  // 범위 선택용 내부 색인 (Ask AI 빌더 전용). 출력 구조에 넣지 않도록 열거되지 않는 속성으로 둔다
  if (context.withIndex) {
    Object.defineProperty(result, 'index', {
      enumerable: false,
      value: {
        componentRefById: new Map([...nameOf].map(([id, entry]) => [id, entry.ref])),
        // Sprint 8: 흐름의 requirementIds → 코드 (사용 중단 포함 — 연결 표시는 코드만)
        requirementCodeById: new Map(requirements.map((r) => [String(r.id).toLowerCase(), r.code])),
      },
    });
  }
  return result;
}

module.exports = { normalizeModel, SECRET_KEY_RE, ENV_VALUE_RE };
