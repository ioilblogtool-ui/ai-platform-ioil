// 아키텍처 모델 저장 전 검증 (03 데이터 모델 §2.2)
// V1~V6, V7(경고), V8, V11(경고), V12, V13.
// Sprint 7: realizes 규칙(V2), 컨테이너 컴포넌트 부모(V5), Deployment View 한도(V13).
// V6: 타입 레지스트리(type-registry.json — /api/aa/meta/types와 같은 원본) 기준 컴포넌트 타입·속성 검증.
//     모든 속성은 선택 항목이다. 있는 키만 검사하고, 기본값을 채우거나 값을 바꾸지 않는다 (Sprint 1 저장본 호환).
const { isUuid } = require('./requirement-refs');
const { scanForSecrets } = require('./sensitive-scan');
const REGISTRY = require('./type-registry.json');

const MODEL_MAX_BYTES = 1024 * 1024;   // V8: 모델 1MB
const MODEL_MAX_COMPONENTS = 500;      // V8: 컴포넌트 500개
const MAX_ERRORS = 50;

const ID_RE = {
  component: /^cmp_[A-Za-z0-9_-]{1,64}$/,
  relation:  /^rel_[A-Za-z0-9_-]{1,64}$/,
  view:      /^view_[A-Za-z0-9_-]{1,64}$/,
  node:      /^nd_[A-Za-z0-9_-]{1,64}$/,
  edge:      /^ed_[A-Za-z0-9_-]{1,64}$/,
};
const RELATION_TYPES = new Set(['calls', 'realizes', 'depends_on']);
const NODE_KINDS = new Set(['component', 'group', 'note']);
const VIEW_KINDS = new Set(['logical', 'deployment', 'kubernetes', 'aws', 'apiflow']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);

const NOTE_TEXT_MAX = 2000;
const GROUP_MIN_SIZE = 80;
const STRING_MAX = 500;
const TEXT_MAX = 5000;
const LIST_MAX_ITEMS = 50;
// Sprint 7 (V13): 배치안 = deployment View
const MAX_DEPLOYMENT_VIEWS = 5;
const VARIANT_MAX = 60;
const STRATEGY_MAX_BYTES = 64 * 1024;

const typeDef = (type) => (typeof type === 'string' && Object.prototype.hasOwnProperty.call(REGISTRY.types, type) ? REGISTRY.types[type] : null);

// V6: 속성 값 하나를 스키마 정의로 검사. 문제 없으면 null, 있으면 메시지
function checkPropertyValue(def, value) {
  switch (def.type) {
    case 'string':
      if (typeof value !== 'string') return '문자열이어야 합니다.';
      if (value.length > STRING_MAX) return `${STRING_MAX}자 이하여야 합니다.`;
      if (def.pattern && !new RegExp(def.pattern).test(value)) return '형식이 맞지 않습니다.';
      return null;
    case 'text':
      if (typeof value !== 'string') return '문자열이어야 합니다.';
      return value.length > TEXT_MAX ? `${TEXT_MAX}자 이하여야 합니다.` : null;
    case 'number':
      if (!isFiniteNum(value)) return '숫자여야 합니다.';
      if (def.integer && !Number.isInteger(value)) return '정수여야 합니다.';
      if (def.min !== undefined && value < def.min) return `${def.min} 이상이어야 합니다.`;
      if (def.max !== undefined && value > def.max) return `${def.max} 이하여야 합니다.`;
      return null;
    case 'boolean':
      return typeof value === 'boolean' ? null : 'true 또는 false여야 합니다.';
    case 'enum':
      return def.options.includes(value) ? null : `다음 중 하나여야 합니다: ${def.options.join(', ')}`;
    case 'list':
      if (!Array.isArray(value) || value.length > LIST_MAX_ITEMS) return `문자열 ${LIST_MAX_ITEMS}개 이하의 배열이어야 합니다.`;
      return value.every((x) => typeof x === 'string' && x.length <= 200) ? null : '각 항목은 200자 이하 문자열이어야 합니다.';
    default:
      return `알 수 없는 속성 타입입니다: ${def.type}`;
  }
}

/**
 * @returns {{ errors: {rule,path,message}[], warnings: {rule,path,message}[], tooLarge: null | {bytes,components} }}
 */
function checkRequirementIds(item, path, err) {
  const { requirementIds } = item;
  if (requirementIds === undefined) return;
  const field = `${path}.requirementIds`;
  if (!Array.isArray(requirementIds)) {
    err('V9', field, 'requirementIds는 배열이어야 합니다.');
    return;
  }
  requirementIds.forEach((id, index) => {
    if (!isUuid(id)) err('V9', `${field}[${index}]`, '요구사항 ID는 UUID여야 합니다.');
  });
}

function validateModel(model) {
  const errors = [];
  const warnings = [];
  const err = (rule, path, message) => { if (errors.length < MAX_ERRORS) errors.push({ rule, path, message }); };

  // 기본 구조
  if (!isObj(model)) return { errors: [{ rule: 'STRUCTURE', path: '(root)', message: 'model은 객체여야 합니다.' }], warnings, tooLarge: null };

  // V8: 크기 (구조 검사보다 먼저 — 큰 모델을 끝까지 돌지 않음)
  const bytes = Buffer.byteLength(JSON.stringify(model), 'utf8');
  const componentCount = isObj(model.components) ? Object.keys(model.components).length : 0;
  if (bytes > MODEL_MAX_BYTES || componentCount > MODEL_MAX_COMPONENTS) {
    return { errors, warnings, tooLarge: { bytes, limit: MODEL_MAX_BYTES, components: componentCount, componentLimit: MODEL_MAX_COMPONENTS } };
  }

  if (!Number.isInteger(model.schemaVersion)) err('STRUCTURE', 'schemaVersion', 'schemaVersion은 정수여야 합니다.');
  if (!isObj(model.components)) err('STRUCTURE', 'components', 'components는 객체여야 합니다.');
  if (!isObj(model.relations)) err('STRUCTURE', 'relations', 'relations는 객체여야 합니다.');
  if (!Array.isArray(model.views)) err('STRUCTURE', 'views', 'views는 배열이어야 합니다.');
  if (model.flows !== undefined && !isObj(model.flows)) err('STRUCTURE', 'flows', 'flows는 객체여야 합니다.');
  if (errors.length) return { errors, warnings, tooLarge: null };

  // V1: id 형식·유일성 (모델 전체)
  const seen = new Set();
  const claim = (id, path) => {
    if (seen.has(id)) err('V1', path, `id가 중복됩니다: ${id}`);
    seen.add(id);
  };

  const components = model.components;
  for (const [key, c] of Object.entries(components)) {
    const p = `components.${key}`;
    if (!isObj(c)) { err('STRUCTURE', p, '컴포넌트는 객체여야 합니다.'); continue; }
    if (c.id !== key) err('V1', `${p}.id`, 'components의 키와 id가 같아야 합니다.');
    if (!ID_RE.component.test(key)) err('V1', p, '컴포넌트 id는 cmp_ 로 시작해야 합니다.');
    claim(key, p);
    if (typeof c.type !== 'string' || !c.type) err('STRUCTURE', `${p}.type`, 'type이 필요합니다.');
    if (typeof c.name !== 'string' || !c.name.trim() || c.name.length > 120) err('STRUCTURE', `${p}.name`, 'name은 1~120자 문자열이어야 합니다.');
    if (c.properties !== undefined && !isObj(c.properties)) err('STRUCTURE', `${p}.properties`, 'properties는 객체여야 합니다.');
    checkRequirementIds(c, p, err);
    if (c.custom !== undefined && !(isObj(c.custom) && Object.values(c.custom).every((v) => typeof v === 'string' && v.length <= STRING_MAX))) {
      err('STRUCTURE', `${p}.custom`, `custom은 ${STRING_MAX}자 이하 문자열 값의 객체여야 합니다.`);
    }

    // V6: 타입·layer·속성
    if (typeof c.type === 'string' && c.type) {
      const def = Object.prototype.hasOwnProperty.call(REGISTRY.types, c.type) ? REGISTRY.types[c.type] : null;
      if (!def) {
        err('V6', `${p}.type`, `등록되지 않은 컴포넌트 타입입니다: ${c.type}`);
      } else if (def.nodeKind !== 'component') {
        err('V6', `${p}.type`, `${c.type}은(는) 컴포넌트가 아니라 ${def.nodeKind} 노드입니다.`);
      } else {
        if (c.layer !== def.layer) err('V6', `${p}.layer`, `${c.type}의 layer는 ${def.layer}여야 합니다.`);
        const schema = new Map(def.properties.map((d) => [d.key, d]));
        if (isObj(c.custom)) {
          for (const key of Object.keys(c.custom)) {
            if (scanForSecrets(key).length) err('V12', `${p}.custom`, '자유 속성 키에 민감정보로 보이는 값이 있습니다.');
            if (schema.has(key)) err('V6', `${p}.custom.${key}`, '등록된 속성 키와 같은 이름은 사용할 수 없습니다.');
          }
        }
        if (isObj(c.properties)) {
          for (const [key, value] of Object.entries(c.properties)) {
            const pd = schema.get(key);
            if (!pd) { err('V6', `${p}.properties.${key}`, `${c.type}에 없는 속성입니다: ${key} (자유 속성은 custom에 넣으세요)`); continue; }
            const problem = checkPropertyValue(pd, value);
            if (problem) err('V6', `${p}.properties.${key}`, `${pd.label || key}: ${problem}`);
          }
        }
      }
    }
  }

  // V2: 관계 끝점
  const relations = model.relations;
  const realizesPairs = new Set();
  for (const [key, r] of Object.entries(relations)) {
    const p = `relations.${key}`;
    if (!isObj(r)) { err('STRUCTURE', p, '관계는 객체여야 합니다.'); continue; }
    checkRequirementIds(r, p, err);
    if (r.id !== key) err('V1', `${p}.id`, 'relations의 키와 id가 같아야 합니다.');
    if (!ID_RE.relation.test(key)) err('V1', p, '관계 id는 rel_ 로 시작해야 합니다.');
    claim(key, p);
    if (!RELATION_TYPES.has(r.type)) err('V2', `${p}.type`, `지원하지 않는 관계 유형입니다: ${r.type}`);
    if (!Object.prototype.hasOwnProperty.call(components, r.from)) err('V2', `${p}.from`, `존재하지 않는 컴포넌트입니다: ${r.from}`);
    if (!Object.prototype.hasOwnProperty.call(components, r.to)) err('V2', `${p}.to`, `존재하지 않는 컴포넌트입니다: ${r.to}`);
    // Sprint 7: realizes = 구현체(레지스트리 realizes: true) → Logical 컴포넌트. 속성 없음, 같은 쌍 하나
    if (r.type === 'realizes' && isObj(components[r.from]) && isObj(components[r.to])) {
      if (!typeDef(components[r.from].type)?.realizes) err('V2', `${p}.from`, 'realizes의 시작은 Process·Managed DB·Managed Auth여야 합니다.');
      if (components[r.to].layer !== 'logical') err('V2', `${p}.to`, 'realizes의 대상은 Logical 컴포넌트여야 합니다.');
      for (const k of ['protocol', 'mode', 'label']) if (r[k] !== undefined && r[k] !== null) err('V2', `${p}.${k}`, `realizes에는 ${k}를 두지 않습니다.`);
      const pair = `${r.from}>${r.to}`;
      if (realizesPairs.has(pair)) err('V2', p, '같은 구현체·대상의 realizes가 이미 있습니다.');
      realizesPairs.add(pair);
    }
  }

  // 뷰·노드·엣지
  const componentsWithNode = new Set();
  // V13: 배치안 수·이름
  const deploymentViews = model.views.filter((v) => isObj(v) && v.kind === 'deployment');
  if (deploymentViews.length > MAX_DEPLOYMENT_VIEWS) err('V13', 'views', `배치안은 최대 ${MAX_DEPLOYMENT_VIEWS}개입니다.`);
  const variants = new Set();
  model.views.forEach((v, vi) => {
    const vp = `views[${vi}]`;
    if (!isObj(v)) { err('STRUCTURE', vp, 'view는 객체여야 합니다.'); return; }
    if (!ID_RE.view.test(String(v.id))) err('V1', `${vp}.id`, 'view id는 view_ 로 시작해야 합니다.');
    else claim(v.id, `${vp}.id`);
    if (!VIEW_KINDS.has(v.kind)) err('STRUCTURE', `${vp}.kind`, `지원하지 않는 view 종류입니다: ${v.kind}`);
    if (!Array.isArray(v.nodes) || !Array.isArray(v.edges)) { err('STRUCTURE', vp, 'nodes와 edges는 배열이어야 합니다.'); return; }
    const isDeployment = v.kind === 'deployment';
    if (isDeployment) {
      const name = typeof v.variant === 'string' ? v.variant.trim() : '';
      if (!name || name.length > VARIANT_MAX) err('V13', `${vp}.variant`, `배치안 이름은 1~${VARIANT_MAX}자여야 합니다.`);
      else if (variants.has(name)) err('V13', `${vp}.variant`, `배치안 이름이 겹칩니다: ${name}`);
      else variants.add(name);
    }
    if (v.strategyMd !== undefined && v.strategyMd !== null) {
      if (!isDeployment) err('V13', `${vp}.strategyMd`, '배포 전략은 배치안(deployment View)에만 둘 수 있습니다.');
      else if (typeof v.strategyMd !== 'string' || Buffer.byteLength(v.strategyMd, 'utf8') > STRATEGY_MAX_BYTES) err('V13', `${vp}.strategyMd`, '배포 전략은 64KB 이하 문자열이어야 합니다.');
    }

    const nodesById = new Map();
    const componentNodeInView = new Map();
    v.nodes.forEach((n, ni) => {
      const np = `${vp}.nodes[${ni}]`;
      if (!isObj(n)) { err('STRUCTURE', np, '노드는 객체여야 합니다.'); return; }
      if (!ID_RE.node.test(String(n.id))) err('V1', `${np}.id`, '노드 id는 nd_ 로 시작해야 합니다.');
      else claim(n.id, `${np}.id`);
      nodesById.set(n.id, n);
      if (!NODE_KINDS.has(n.kind)) err('STRUCTURE', `${np}.kind`, `지원하지 않는 노드 종류입니다: ${n.kind}`);
      if (!isObj(n.position) || !isFiniteNum(n.position.x) || !isFiniteNum(n.position.y)) err('STRUCTURE', `${np}.position`, 'position.x, position.y는 숫자여야 합니다.');
      // V3: 노드 → 컴포넌트
      if (n.componentId !== undefined && n.componentId !== null) {
        if (!Object.prototype.hasOwnProperty.call(components, n.componentId)) err('V3', `${np}.componentId`, `존재하지 않는 컴포넌트입니다: ${n.componentId}`);
        else if (componentNodeInView.has(n.componentId)) err('V3', `${np}.componentId`, '한 View에 같은 컴포넌트의 노드는 하나만 둘 수 있습니다.');
        else { componentNodeInView.set(n.componentId, n.id); componentsWithNode.add(n.componentId); }
      } else if (n.kind === 'component') {
        err('V3', `${np}.componentId`, 'component 노드에는 componentId가 필요합니다.');
      }
      // Sprint 7: 컨테이너 컴포넌트 노드는 group처럼 크기가 필요하다
      if (n.kind === 'component' && typeDef(components[n.componentId]?.type)?.container) {
        if (!isDeployment) err('V5', `${np}`, '컨테이너 컴포넌트는 배치안(deployment View)에만 둘 수 있습니다.');
        if (!isFiniteNum(n.width) || !isFiniteNum(n.height) || n.width < GROUP_MIN_SIZE || n.height < GROUP_MIN_SIZE) {
          err('V3', `${np}`, `컨테이너에는 ${GROUP_MIN_SIZE} 이상의 width·height가 필요합니다.`);
        }
      }
      // group·note는 컴포넌트가 아닌 노드 — 자체 규칙
      if (n.kind === 'note') {
        if (n.componentId) err('V3', `${np}.componentId`, 'note 노드는 컴포넌트를 가리키지 않습니다.');
        if (typeof n.text !== 'string' || !n.text.trim() || n.text.length > NOTE_TEXT_MAX) err('V3', `${np}.text`, `note에는 1~${NOTE_TEXT_MAX}자 text가 필요합니다.`);
      }
      if (n.kind === 'group') {
        if (!isFiniteNum(n.width) || !isFiniteNum(n.height) || n.width < GROUP_MIN_SIZE || n.height < GROUP_MIN_SIZE) {
          err('V3', `${np}`, `group에는 ${GROUP_MIN_SIZE} 이상의 width·height가 필요합니다.`);
        }
        if (n.label !== undefined && (typeof n.label !== 'string' || n.label.length > 120)) err('V3', `${np}.label`, 'group label은 120자 이하 문자열이어야 합니다.');
      }
    });

    // V5: parentId = 같은 View의 group 노드 (배치안에서는 컨테이너 컴포넌트 노드도), 순환 없음
    const canContain = (node) => node.kind === 'group'
      || (isDeployment && node.kind === 'component' && Boolean(typeDef(components[node.componentId]?.type)?.container));
    for (const n of nodesById.values()) {
      if (n.parentId === undefined || n.parentId === null) continue;
      const parent = nodesById.get(n.parentId);
      if (!parent || parent.id === n.id || !canContain(parent)) {
        err('V5', `${vp}.nodes(${n.id}).parentId`, 'parentId는 같은 View의 group 노드 또는 (배치안에서) 컨테이너 컴포넌트 노드여야 합니다.');
        continue;
      }
      const visited = new Set([n.id]);
      let cur = parent;
      while (cur) {
        if (visited.has(cur.id)) { err('V5', `${vp}.nodes(${n.id}).parentId`, 'parentId에 순환이 있습니다.'); break; }
        visited.add(cur.id);
        cur = cur.parentId ? nodesById.get(cur.parentId) : null;
      }
    }

    // V11 (경고): 배치안의 Process는 조상 체인에 VM 또는 Platform이 있어야 한다
    if (isDeployment) {
      for (const n of nodesById.values()) {
        if (n.kind !== 'component' || components[n.componentId]?.type !== 'dep.process') continue;
        let cur = n.parentId ? nodesById.get(n.parentId) : null;
        let ok = false;
        const seenUp = new Set();
        while (cur && !seenUp.has(cur.id)) {
          seenUp.add(cur.id);
          const t = components[cur.componentId]?.type;
          if (t === 'dep.vm' || t === 'dep.platform') { ok = true; break; }
          cur = cur.parentId ? nodesById.get(cur.parentId) : null;
        }
        if (!ok) warnings.push({ rule: 'V11', code: 'V11', path: `${vp}.nodes(${n.id})`, viewId: v.id, nodeId: n.id, message: 'Process는 VM 또는 Platform 안에 두세요.' });
      }
    }

    // V4: 엣지 → 관계, 양 끝 컴포넌트의 노드가 이 View에 있어야 함
    v.edges.forEach((e, ei) => {
      const ep = `${vp}.edges[${ei}]`;
      if (!isObj(e)) { err('STRUCTURE', ep, '엣지는 객체여야 합니다.'); return; }
      if (!ID_RE.edge.test(String(e.id))) err('V1', `${ep}.id`, '엣지 id는 ed_ 로 시작해야 합니다.');
      else claim(e.id, `${ep}.id`);
      const rel = Object.prototype.hasOwnProperty.call(relations, e.relationId) ? relations[e.relationId] : null;
      if (!rel) { err('V4', `${ep}.relationId`, `존재하지 않는 관계입니다: ${e.relationId}`); return; }
      if (rel.type === 'realizes') { err('V4', `${ep}.relationId`, 'realizes 관계는 캔버스 엣지로 그리지 않습니다.'); return; }
      if (!componentNodeInView.has(rel.from) || !componentNodeInView.has(rel.to)) {
        err('V4', `${ep}.relationId`, '관계 양 끝 컴포넌트의 노드가 이 View에 있어야 합니다.');
      }
    });
  });

  // V7: 어느 View에도 노드가 없는 컴포넌트 → 경고
  for (const id of Object.keys(components)) {
    if (!componentsWithNode.has(id)) warnings.push({ rule: 'V7', path: `components.${id}`, message: '어느 View에도 표시되지 않는 컴포넌트입니다.' });
  }

  // V12: 키·토큰·PEM이 들어 있으면 저장 거부
  for (const hit of scanForSecrets(model)) {
    const path = hit.path.replace(/^(components\.[^.]+\.custom)(?:\..*)?$/, '$1');
    err('V12', path, `민감정보로 보이는 값이 있어 저장할 수 없습니다 (${hit.rule}: ${hit.sample}).`);
  }

  return { errors, warnings, tooLarge: null };
}

module.exports = { validateModel, MODEL_MAX_BYTES, MODEL_MAX_COMPONENTS, REGISTRY, NOTE_TEXT_MAX, GROUP_MIN_SIZE, MAX_DEPLOYMENT_VIEWS, VARIANT_MAX, STRATEGY_MAX_BYTES };
