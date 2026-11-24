// 아키텍처 모델 저장 전 검증 (03 데이터 모델 §2.2)
// V1~V6, V7(경고), V8, V11(경고), V12, V13. Sprint 10: V15, V16(경고). Sprint 11: V17(운영 설계 관계), V18(구조화 전략), V19(경고). Sprint 8: calls 운영·보안 속성(V2), API Flow(V10·V14).
// Sprint 7: realizes 규칙(V2), 컨테이너 컴포넌트 부모(V5), Deployment View 한도(V13).
// V6: 타입 레지스트리(type-registry.json — /api/aa/meta/types와 같은 원본) 기준 컴포넌트 타입·속성 검증.
//     모든 속성은 선택 항목이다. 있는 키만 검사하고, 기본값을 채우거나 값을 바꾸지 않는다 (Sprint 1 저장본 호환).
const { isIP } = require('node:net');
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
// Sprint 11 (OPS-02, V17): 운영 설계 관계 — 양 끝 중 하나 이상이 ops layer, 표시 엣지는 deployment View에만
const OPS_RELATION_TYPES = new Set(['scrapes', 'ships_logs', 'exports_traces', 'alerts_to', 'builds', 'pushes', 'syncs']);
const RELATION_TYPES = new Set(['calls', 'realizes', 'depends_on', ...OPS_RELATION_TYPES]);
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

// Sprint 8 (REL-05·06): calls 운영·보안 속성. 수치는 Sprint 8에서 정한 제한 (03 §2.2)
const TIMEOUT_MAX_MS = 600000;
const RETRY_MAX = 10;
const RELATION_ATTRS = ['timeoutMs', 'retry', 'onFailure', 'credential', 'dataClass'];
const BACKOFFS = new Set(['none', 'fixed', 'exponential']);
const ON_FAILURE = new Set(['propagate', 'fallback', 'queue_retry', 'ignore']);
const CREDENTIALS = new Set(['none', 'session-cookie', 'jwt-bearer', 'api-key', 'service-role', 'mtls']);
const DATA_CLASSES = new Set(['public', 'internal', 'personal', 'sensitive']);

function checkRelationAttrs(r, p, err) {
  const present = RELATION_ATTRS.filter((k) => r[k] !== undefined);
  if (r.type !== 'calls') {
    for (const k of present) err('V2', `${p}.${k}`, `${k}는 calls 관계에만 둘 수 있습니다.`);
    return;
  }
  if (r.timeoutMs !== undefined && !(Number.isInteger(r.timeoutMs) && r.timeoutMs >= 1 && r.timeoutMs <= TIMEOUT_MAX_MS)) {
    err('V2', `${p}.timeoutMs`, `timeout은 1~${TIMEOUT_MAX_MS}ms 정수여야 합니다.`);
  }
  if (r.retry !== undefined) {
    const ok = isObj(r.retry) && Object.keys(r.retry).every((k) => k === 'max' || k === 'backoff')
      && Number.isInteger(r.retry.max) && r.retry.max >= 0 && r.retry.max <= RETRY_MAX && BACKOFFS.has(r.retry.backoff);
    if (!ok) err('V2', `${p}.retry`, `retry는 { max: 0~${RETRY_MAX} 정수, backoff: none|fixed|exponential }여야 합니다.`);
  }
  if (r.onFailure !== undefined && !ON_FAILURE.has(r.onFailure)) err('V2', `${p}.onFailure`, `실패 시 동작은 ${[...ON_FAILURE].join('/')} 중 하나여야 합니다.`);
  if (r.credential !== undefined && !CREDENTIALS.has(r.credential)) err('V2', `${p}.credential`, `자격증명 유형은 ${[...CREDENTIALS].join('/')} 중 하나여야 합니다.`);
  if (r.dataClass !== undefined && !DATA_CLASSES.has(r.dataClass)) err('V2', `${p}.dataClass`, `데이터 등급은 ${[...DATA_CLASSES].join('/')} 중 하나여야 합니다.`);
}

// Sprint 8 (V14): API Flow 구조·한도 — Sprint 8에서 정한 제한 (03 §2.2)
const FLOW_LIMITS = { flows: 30, name: 80, description: 2000, path: 200, participantsMin: 2, participantsMax: 12, outcomesMax: 10, outcomeLabel: 60, mermaidBytes: 32 * 1024 };
const FLOW_ID_RE = /^flw_[A-Za-z0-9]{10}$/;
const OUTCOME_ID_RE = /^out_[A-Za-z0-9]{6}$/;
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const OUTCOME_KINDS = new Set(['success', 'failure']);
const OUTCOME_CAUSES = new Set(['auth', 'validation', 'timeout', 'dependency_down', 'queue_retry', 'other']);
const AUTH_ROLES = ['tokenIssuer', 'tokenVerifier', 'dataAccessor'];
const FLOW_KEYS = new Set(['id', 'name', 'endpoint', 'description', 'participantIds', 'outcomes', 'requirementIds', 'auth', 'mermaid']);

function checkFlows(flows, components, err) {
  const entries = Object.entries(flows);
  if (entries.length > FLOW_LIMITS.flows) err('V14', 'flows', `흐름은 최대 ${FLOW_LIMITS.flows}개입니다.`);
  for (const [key, f] of entries) {
    const p = `flows.${key}`;
    if (!isObj(f)) { err('V14', p, '흐름은 객체여야 합니다.'); continue; }
    if (!FLOW_ID_RE.test(key) || f.id !== key) err('V14', `${p}.id`, '흐름 id는 flw_+영숫자 10자이고 키와 같아야 합니다.');
    for (const k of Object.keys(f)) if (!FLOW_KEYS.has(k)) err('V14', `${p}.${k}`, `알 수 없는 흐름 속성입니다: ${k}`);
    const name = typeof f.name === 'string' ? f.name.trim() : '';
    if (!name || name.length > FLOW_LIMITS.name) err('V14', `${p}.name`, `흐름 이름은 1~${FLOW_LIMITS.name}자여야 합니다.`);
    if (f.description !== undefined && (typeof f.description !== 'string' || f.description.length > FLOW_LIMITS.description)) {
      err('V14', `${p}.description`, `설명은 ${FLOW_LIMITS.description}자 이하 문자열이어야 합니다.`);
    }
    if (f.endpoint !== undefined) {
      const e = f.endpoint;
      const ok = isObj(e) && HTTP_METHODS.has(e.method) && typeof e.path === 'string' && e.path.startsWith('/') && !/\s/.test(e.path)
        && e.path.length <= FLOW_LIMITS.path && Object.keys(e).every((k) => k === 'method' || k === 'path');
      if (!ok) err('V14', `${p}.endpoint`, `엔드포인트는 { method: GET|POST|PUT|PATCH|DELETE, path: '/…'(공백 없음, ${FLOW_LIMITS.path}자 이하) }여야 합니다.`);
    }
    // V10: 참여·역할은 있는 Logical 컴포넌트, 역할은 참여 안, 참여 중복 없음
    const parts = Array.isArray(f.participantIds) ? f.participantIds : null;
    if (!parts) err('V14', `${p}.participantIds`, '참여 컴포넌트는 배열이어야 합니다.');
    else {
      if (parts.length < FLOW_LIMITS.participantsMin || parts.length > FLOW_LIMITS.participantsMax) {
        err('V14', `${p}.participantIds`, `참여 컴포넌트는 ${FLOW_LIMITS.participantsMin}~${FLOW_LIMITS.participantsMax}개여야 합니다.`);
      }
      if (new Set(parts).size !== parts.length) err('V10', `${p}.participantIds`, '참여 컴포넌트가 겹칩니다.');
      parts.forEach((cid, i) => {
        const c = typeof cid === 'string' && Object.prototype.hasOwnProperty.call(components, cid) ? components[cid] : null;
        if (!c) err('V10', `${p}.participantIds[${i}]`, `존재하지 않는 컴포넌트입니다: ${cid}`);
        else if (c.layer !== 'logical') err('V10', `${p}.participantIds[${i}]`, '흐름 참여는 Logical 컴포넌트만 가능합니다.');
      });
    }
    if (f.auth !== undefined) {
      if (!isObj(f.auth)) err('V14', `${p}.auth`, 'auth는 객체여야 합니다.');
      else for (const [role, cid] of Object.entries(f.auth)) {
        if (!AUTH_ROLES.includes(role)) { err('V14', `${p}.auth.${role}`, `알 수 없는 인증 역할입니다: ${role}`); continue; }
        if (!parts || !parts.includes(cid)) err('V10', `${p}.auth.${role}`, '인증 역할은 참여 컴포넌트 중 하나여야 합니다.');
      }
    }
    const outs = Array.isArray(f.outcomes) ? f.outcomes : null;
    if (!outs || outs.length < 1 || outs.length > FLOW_LIMITS.outcomesMax) err('V14', `${p}.outcomes`, `결과 분기는 1~${FLOW_LIMITS.outcomesMax}개여야 합니다.`);
    else {
      const ids = new Set();
      outs.forEach((o, i) => {
        const op = `${p}.outcomes[${i}]`;
        if (!isObj(o)) { err('V14', op, '결과는 객체여야 합니다.'); return; }
        if (!OUTCOME_ID_RE.test(String(o.id)) || ids.has(o.id)) err('V14', `${op}.id`, '결과 id는 out_+영숫자 6자이고 흐름 안에서 유일해야 합니다.');
        ids.add(o.id);
        if (!OUTCOME_KINDS.has(o.kind)) err('V14', `${op}.kind`, '결과 종류는 success 또는 failure여야 합니다.');
        const label = typeof o.label === 'string' ? o.label.trim() : '';
        if (!label || label.length > FLOW_LIMITS.outcomeLabel) err('V14', `${op}.label`, `결과 라벨은 1~${FLOW_LIMITS.outcomeLabel}자여야 합니다.`);
        if (o.cause !== undefined && !OUTCOME_CAUSES.has(o.cause)) err('V14', `${op}.cause`, `원인은 ${[...OUTCOME_CAUSES].join('/')} 중 하나여야 합니다.`);
      });
      if (!outs.some((o) => isObj(o) && o.kind === 'success')) err('V14', `${p}.outcomes`, '성공 결과가 하나 이상 있어야 합니다.');
    }
    checkRequirementIds(f, p, err);
    if (typeof f.mermaid !== 'string') err('V14', `${p}.mermaid`, 'mermaid는 문자열이어야 합니다.');
    else if (Buffer.byteLength(f.mermaid, 'utf8') > FLOW_LIMITS.mermaidBytes) err('V14', `${p}.mermaid`, 'Mermaid 본문은 UTF-8 32KB 이하여야 합니다.');
  }
}

// Sprint 11 (DEP-04, V18·V19): 구조화 배포 전략 — 03 "Sprint 11 모델 계약"
const STRATEGY_LIMITS = { environments: 5, gates: 10, steps: 10, text: STRING_MAX, minutes: 1440 };
const STRATEGY_KEYS = new Set(['environments', 'release', 'gates', 'rollback', 'fallback', 'dbChange']);
const STRATEGY_RESERVED = 'path는 후속(DEP-05) 필드이고, ADR·Validation 연결은 Phase 3에서 엽니다.';
const RELEASE_TYPES = new Set(['rolling', 'blue-green', 'canary', 'recreate']);
const PROMOTIONS = new Set(['same-image', 'rebuild']);
const SWITCH_BY = new Set(['service-selector', 'lb', 'dns']);
const ROLLBACK_METHODS = new Set(['previous-image', 'redeploy']);
const SWITCH_METHODS = new Set(['lb-weight', 'dns', 'manual']);
const DB_POLICIES = new Set(['expand-contract', 'backward-compatible', 'downtime', 'none']);

function checkStrategy(st, sp, viewsById, err) {
  const text = (v, path, { required = false } = {}) => {
    if (v === undefined || v === null) { if (required) err('V18', path, '값이 필요합니다.'); return; }
    if (typeof v !== 'string' || v.length > STRATEGY_LIMITS.text || (required && !v.trim())) err('V18', path, `1~${STRATEGY_LIMITS.text}자 문자열이어야 합니다.`);
  };
  const minutes = (v, path, min = 1) => {
    if (!(Number.isInteger(v) && v >= min && v <= STRATEGY_LIMITS.minutes)) err('V18', path, `${min}~${STRATEGY_LIMITS.minutes} 사이 정수(분)여야 합니다.`);
  };
  const oneOf = (set, v, path) => { if (!set.has(v)) err('V18', path, `다음 중 하나여야 합니다: ${[...set].join(', ')}`); };
  if (!isObj(st)) { err('V18', sp, 'strategy는 객체여야 합니다.'); return; }
  if (st.path !== undefined) err('V18', `${sp}.path`, STRATEGY_RESERVED);
  for (const k of Object.keys(st)) if (k !== 'path' && !STRATEGY_KEYS.has(k)) err('V18', `${sp}.${k}`, `알 수 없는 전략 항목입니다: ${k}`);

  if (!Array.isArray(st.environments) || st.environments.length > STRATEGY_LIMITS.environments) {
    err('V18', `${sp}.environments`, `환경은 ${STRATEGY_LIMITS.environments}개 이하 배열이어야 합니다.`);
  } else st.environments.forEach((e, i) => {
    const ep = `${sp}.environments[${i}]`;
    if (!isObj(e)) { err('V18', ep, '환경은 객체여야 합니다.'); return; }
    text(e.name, `${ep}.name`, { required: true });
    text(e.approvalRole, `${ep}.approvalRole`);
    oneOf(PROMOTIONS, e.promotion, `${ep}.promotion`);
  });

  const rel = st.release;
  if (!isObj(rel)) err('V18', `${sp}.release`, 'release는 객체여야 합니다.');
  else {
    oneOf(RELEASE_TYPES, rel.type, `${sp}.release.type`);
    if (rel.decisionId !== undefined) err('V18', `${sp}.release.decisionId`, STRATEGY_RESERVED);
    if (rel.rolling !== undefined) {
      if (!isObj(rel.rolling)) err('V18', `${sp}.release.rolling`, 'rolling은 객체여야 합니다.');
      else { text(rel.rolling.maxSurge, `${sp}.release.rolling.maxSurge`, { required: true }); text(rel.rolling.maxUnavailable, `${sp}.release.rolling.maxUnavailable`, { required: true }); }
    }
    if (rel.canary !== undefined) {
      const steps = isObj(rel.canary) ? rel.canary.steps : null;
      if (!Array.isArray(steps) || !steps.length || steps.length > STRATEGY_LIMITS.steps) err('V18', `${sp}.release.canary.steps`, `canary 단계는 1~${STRATEGY_LIMITS.steps}개여야 합니다.`);
      else {
        let prev = 0;
        steps.forEach((step, i) => {
          const pp = `${sp}.release.canary.steps[${i}]`;
          if (!isObj(step) || !Number.isInteger(step.weight) || step.weight < 1 || step.weight > 100 || step.weight <= prev) {
            err('V18', `${pp}.weight`, 'canary 비율은 1~100 정수이고 단계마다 커져야 합니다.');
          } else prev = step.weight;
          if (isObj(step)) minutes(step.pauseMin, `${pp}.pauseMin`, 0);
        });
      }
    }
    if (rel.blueGreen !== undefined) {
      if (!isObj(rel.blueGreen)) err('V18', `${sp}.release.blueGreen`, 'blueGreen은 객체여야 합니다.');
      else oneOf(SWITCH_BY, rel.blueGreen.switchBy, `${sp}.release.blueGreen.switchBy`);
    }
  }

  if (!Array.isArray(st.gates) || st.gates.length > STRATEGY_LIMITS.gates) {
    err('V18', `${sp}.gates`, `진행·중단 기준은 ${STRATEGY_LIMITS.gates}개 이하 배열이어야 합니다.`);
  } else st.gates.forEach((g, i) => {
    const gp = `${sp}.gates[${i}]`;
    if (!isObj(g)) { err('V18', gp, '기준은 객체여야 합니다.'); return; }
    text(g.name, `${gp}.name`, { required: true });
    text(g.metric, `${gp}.metric`, { required: true });
    text(g.threshold, `${gp}.threshold`, { required: true });
    minutes(g.observeMin, `${gp}.observeMin`);
    if (g.validationId !== undefined) err('V18', `${gp}.validationId`, STRATEGY_RESERVED);
    if (!Array.isArray(g.requirementIds)) err('V9', `${gp}.requirementIds`, 'requirementIds는 배열이어야 합니다.');
    else checkRequirementIds(g, gp, err);
  });

  const rb = st.rollback;
  if (!isObj(rb)) err('V18', `${sp}.rollback`, 'rollback은 객체여야 합니다.');
  else { oneOf(ROLLBACK_METHODS, rb.method, `${sp}.rollback.method`); minutes(rb.targetMin, `${sp}.rollback.targetMin`); text(rb.trigger, `${sp}.rollback.trigger`, { required: true }); }

  const fb = st.fallback;
  if (fb !== undefined) {
    if (!isObj(fb)) err('V18', `${sp}.fallback`, 'fallback은 객체여야 합니다.');
    else {
      if (fb.targetViewId !== undefined && viewsById.get(fb.targetViewId)?.kind !== 'deployment') {
        err('V18', `${sp}.fallback.targetViewId`, 'VM 복귀 대상은 같은 모델의 Deployment 배치안이어야 합니다.');
      }
      text(fb.trigger, `${sp}.fallback.trigger`, { required: true });
      oneOf(SWITCH_METHODS, fb.switchMethod, `${sp}.fallback.switchMethod`);
      text(fb.ownerRole, `${sp}.fallback.ownerRole`, { required: true });
      minutes(fb.targetMin, `${sp}.fallback.targetMin`);
      text(fb.dbCondition, `${sp}.fallback.dbCondition`, { required: true });
    }
  }

  const dbc = st.dbChange;
  if (!isObj(dbc)) err('V18', `${sp}.dbChange`, 'dbChange는 객체여야 합니다.');
  else { oneOf(DB_POLICIES, dbc.policy, `${sp}.dbChange.policy`); text(dbc.note, `${sp}.dbChange.note`); }
}

/** V19 (경고): VM 복귀 대상이 비었거나, 대상 배치안에 realizes 실행 요소가 없다 */
function fallbackWarnings(v, vp, viewsById, relations, warnings) {
  const fb = v.strategy?.fallback;
  if (!isObj(fb)) return;
  const base = { rule: 'V19', code: 'V19', path: `${vp}.strategy.fallback`, viewId: v.id };
  if (fb.targetViewId === undefined) { warnings.push({ ...base, message: 'VM 복귀 대상이 미지정입니다.' }); return; }
  const target = viewsById.get(fb.targetViewId);
  if (target?.kind !== 'deployment') return;   // V18 오류로 처리
  const implementers = new Set(Object.values(relations).filter((r) => isObj(r) && r.type === 'realizes').map((r) => r.from));
  const hasExecutor = (target.nodes ?? []).some((n) => isObj(n) && implementers.has(n.componentId));
  if (!hasExecutor) warnings.push({ ...base, targetViewId: target.id, message: `복귀 대상 '${target.variant ?? target.name}'에 실행 요소가 없습니다.` });
}

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

    if (c.type === 'k8s.hpa' && isFiniteNum(c.properties?.min) && isFiniteNum(c.properties?.max)
        && c.properties.min > c.properties.max) {
      err('V6', `${p}.properties.max`, 'HPA max는 min 이상이어야 합니다.');
    }
    if (c.type === 'aws.subnet' && c.properties?.tier === undefined) {
      err('V6', `${p}.properties.tier`, 'Subnet tier가 필요합니다.');
    }

    if ((c.type === 'aws.vpc' || c.type === 'aws.subnet') && typeof c.properties?.cidr === 'string') {
      const match = /^([^/]+)\/(\d{1,3})$/.exec(c.properties.cidr);
      const version = match ? isIP(match[1]) : 0;
      if (!version || Number(match[2]) > (version === 4 ? 32 : 128)) {
        err('V6', p + '.properties.cidr', '유효한 IPv4 또는 IPv6 CIDR이 필요합니다.');
      }
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
    // Sprint 8 (REL-05·06, D-26): calls 운영·보안 속성 — 모두 선택, calls에만
    checkRelationAttrs(r, p, err);
    // Sprint 11 (V17): 운영 설계 관계는 양 끝 중 하나 이상이 ops layer. protocol·mode 없음
    if (OPS_RELATION_TYPES.has(r.type) && isObj(components[r.from]) && isObj(components[r.to])) {
      if (components[r.from].layer !== 'ops' && components[r.to].layer !== 'ops') err('V17', p, `${r.type} 관계는 한쪽 끝이 운영 설계(ops) 컴포넌트여야 합니다.`);
      for (const k of ['protocol', 'mode']) if (r[k] !== undefined && r[k] !== null) err('V17', `${p}.${k}`, `${r.type} 관계에는 ${k}를 두지 않습니다.`);
    }
    // Sprint 7: realizes = 구현체(레지스트리 realizes: true) → Logical 컴포넌트. 속성 없음, 같은 쌍 하나
    if (r.type === 'realizes' && isObj(components[r.from]) && isObj(components[r.to])) {
      if (!typeDef(components[r.from].type)?.realizes) err('V2', `${p}.from`, 'realizes의 시작은 레지스트리가 허용하는 구현 컴포넌트여야 합니다.');
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
  const eksNodes = new Map();
  const linkedClusters = new Set();
  const viewsById = new Map(model.views.filter(isObj).map((v) => [v.id, v]));
  const opsEdgeCount = new Map();   // Sprint 11 (V17): 운영 설계 관계별 표시 엣지 수
  for (const [kind, limit] of [['aws', 3], ['kubernetes', 5]]) {
    if (model.views.filter((view) => view?.kind === kind).length > limit) {
      err('V13', 'views', `${kind} View는 최대 ${limit}개입니다.`);
    }
  }
  model.views.forEach((v, vi) => {
    const vp = `views[${vi}]`;
    if (!isObj(v)) { err('STRUCTURE', vp, 'view는 객체여야 합니다.'); return; }
    if (!ID_RE.view.test(String(v.id))) err('V1', `${vp}.id`, 'view id는 view_ 로 시작해야 합니다.');
    else claim(v.id, `${vp}.id`);
    if (!VIEW_KINDS.has(v.kind)) err('STRUCTURE', `${vp}.kind`, `지원하지 않는 view 종류입니다: ${v.kind}`);
    if (!Array.isArray(v.nodes) || !Array.isArray(v.edges)) { err('STRUCTURE', vp, 'nodes와 edges는 배열이어야 합니다.'); return; }
    const isDeployment = v.kind === 'deployment';
    if (isDeployment || v.kind === 'aws' || v.kind === 'kubernetes') {
      const name = typeof v.variant === 'string' ? v.variant.trim() : '';
      if (!name || name.length > VARIANT_MAX) err('V13', `${vp}.variant`, `배치안 이름은 1~${VARIANT_MAX}자여야 합니다.`);
      else if (variants.has(v.kind + ':' + name)) err('V13', `${vp}.variant`, `배치안 이름이 겹칩니다: ${name}`);
      else variants.add(v.kind + ':' + name);
    }
    if (v.strategyMd !== undefined && v.strategyMd !== null) {
      if (!isDeployment) err('V13', `${vp}.strategyMd`, '배포 전략은 배치안(deployment View)에만 둘 수 있습니다.');
      else if (typeof v.strategyMd !== 'string' || Buffer.byteLength(v.strategyMd, 'utf8') > STRATEGY_MAX_BYTES) err('V13', `${vp}.strategyMd`, '배포 전략은 64KB 이하 문자열이어야 합니다.');
    }

    // Sprint 11 (V18·V19): 구조화 전략은 deployment·aws 배치안에만
    if (v.strategy !== undefined) {
      if (!isDeployment && v.kind !== 'aws') err('V18', `${vp}.strategy`, '구조화 배포 전략은 Deployment·AWS 배치안에만 둘 수 있습니다.');
      else { checkStrategy(v.strategy, `${vp}.strategy`, viewsById, err); fallbackWarnings(v, vp, viewsById, relations, warnings); }
    }

    if (v.clusterRef !== undefined) {
      if (v.kind !== 'kubernetes' || typeof v.clusterRef !== 'string'
          || components[v.clusterRef]?.type !== 'aws.eks' || linkedClusters.has(v.clusterRef)) {
        err('V15', `${vp}.clusterRef`, 'K8s View에는 같은 모델의 미연결 EKS만 지정할 수 있습니다.');
      } else {
        linkedClusters.add(v.clusterRef);
      }
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
      if (components[n.componentId]?.type === 'aws.eks') {
        if (v.kind !== 'aws' || n.kind !== 'component' || eksNodes.has(n.componentId)) {
          err('V15', np, 'EKS는 AWS View 하나에 정본 노드 하나만 둘 수 있습니다.');
        } else {
          eksNodes.set(n.componentId, n.id);
        }
      }
      // Sprint 7: 컨테이너 컴포넌트 노드는 group처럼 크기가 필요하다
      if (n.kind === 'component' && typeDef(components[n.componentId]?.type)?.container) {
        if (![ 'deployment', 'aws', 'kubernetes' ].includes(v.kind)) err('V5', np, '이 View에서는 컨테이너 컴포넌트를 사용할 수 없습니다.');
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
      || (['deployment', 'aws', 'kubernetes'].includes(v.kind) && node.kind === 'component' && Boolean(typeDef(components[node.componentId]?.type)?.container));
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
    if (v.kind === 'aws') {
      const nearest = (node, type) => {
        const visited = new Set([node.id]);
        let parent = nodesById.get(node.parentId);
        while (parent && !visited.has(parent.id)) {
          if (components[parent.componentId]?.type === type) return parent;
          visited.add(parent.id);
          parent = nodesById.get(parent.parentId);
        }
        return null;
      };
      const warn = (node, message) => warnings.push({ rule: 'V16', code: 'V16', path: `${vp}.nodes(${node.id})`, viewId: v.id, nodeId: node.id, message });
      const zones = new Map();
      for (const node of nodesById.values()) {
        if (components[node.componentId]?.type !== 'aws.az') continue;
        const vpc = nearest(node, 'aws.vpc');
        if (vpc) zones.set(vpc.id, (zones.get(vpc.id) ?? 0) + 1);
      }
      for (const node of nodesById.values()) {
        const component = components[node.componentId];
        if (component?.type === 'aws.vpc' && zones.get(node.id) === 1) warn(node, 'VPC에 가용 영역이 하나만 배치되었습니다.');
        if (component?.type !== 'aws.rds') continue;
        const subnet = nearest(node, 'aws.subnet');
        if (subnet && components[subnet.componentId]?.properties?.tier === 'public') warn(node, 'RDS가 Public subnet에 배치되었습니다.');
        if (component.properties?.multiAz === false) warn(node, 'RDS의 Multi-AZ가 꺼져 있습니다.');
      }
    }

    v.edges.forEach((e, ei) => {
      const ep = `${vp}.edges[${ei}]`;
      if (!isObj(e)) { err('STRUCTURE', ep, '엣지는 객체여야 합니다.'); return; }
      if (!ID_RE.edge.test(String(e.id))) err('V1', `${ep}.id`, '엣지 id는 ed_ 로 시작해야 합니다.');
      else claim(e.id, `${ep}.id`);
      const rel = Object.prototype.hasOwnProperty.call(relations, e.relationId) ? relations[e.relationId] : null;
      if (!rel) { err('V4', `${ep}.relationId`, `존재하지 않는 관계입니다: ${e.relationId}`); return; }
      if (rel.type === 'realizes') { err('V4', `${ep}.relationId`, 'realizes 관계는 캔버스 엣지로 그리지 않습니다.'); return; }
      if (OPS_RELATION_TYPES.has(rel.type)) {
        if (!isDeployment) err('V17', `${ep}.relationId`, '운영 설계 관계는 Deployment 배치안에만 그릴 수 있습니다.');
        // 표시 엣지로 인정: deployment View이고 그 View에 양 끝 컴포넌트의 노드가 있을 때만 (끝점 불일치는 아래 V4)
        else if (componentNodeInView.has(rel.from) && componentNodeInView.has(rel.to)) {
          opsEdgeCount.set(e.relationId, (opsEdgeCount.get(e.relationId) ?? 0) + 1);
        }
      }
      if (!componentNodeInView.has(rel.from) || !componentNodeInView.has(rel.to)) {
        err('V4', `${ep}.relationId`, '관계 양 끝 컴포넌트의 노드가 이 View에 있어야 합니다.');
      }
    });
  });

  // Sprint 11 (V17): 운영 설계 관계는 표시 엣지가 하나 이상 (두 끝이 서로 다른 View에만 있으면 여기서 거부)
  for (const [id, r] of Object.entries(relations)) {
    if (isObj(r) && OPS_RELATION_TYPES.has(r.type) && !opsEdgeCount.get(id)) {
      err('V17', `relations.${id}`, '운영 설계 관계는 Deployment 배치안에 표시 엣지가 하나 이상 있어야 합니다.');
    }
  }

  for (const [id, component] of Object.entries(components)) {
    if (component?.type === 'aws.eks' && !eksNodes.has(id)) {
      err('V15', `components.${id}`, 'EKS에는 AWS View의 정본 노드가 필요합니다.');
    }
  }

  // V10·V14 (Sprint 8, D-25): API Flow
  if (isObj(model.flows)) checkFlows(model.flows, components, err);

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

// 저장된 값이 아니라 모델에서 매번 다시 계산하는 배치 경고. Draft 조회(GET)도 저장 응답과 같은 규칙을 돌려준다
// (V11: Sprint 7 Process 위치, V16: Sprint 10 AWS 배치 — Sprint 11 Step 1에서 조회 누락 수정, V19: Sprint 11 VM 복귀)
const PLACEMENT_RULES = new Set(['V11', 'V16', 'V19']);   // Sprint 11: V19 VM 복귀 대상 경고
const placementWarnings = (model) => validateModel(model).warnings.filter((w) => PLACEMENT_RULES.has(w.rule));

module.exports = { FLOW_LIMITS, STRATEGY_LIMITS, OPS_RELATION_TYPES, validateModel, placementWarnings, PLACEMENT_RULES, MODEL_MAX_BYTES, MODEL_MAX_COMPONENTS, REGISTRY, NOTE_TEXT_MAX, GROUP_MIN_SIZE, MAX_DEPLOYMENT_VIEWS, VARIANT_MAX, STRATEGY_MAX_BYTES };
