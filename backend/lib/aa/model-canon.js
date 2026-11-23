// 의미 정규화 (Sprint 6 Step 1 · Q3 · 03 §4). 버전 해시와 Diff 요약이 같은 규칙을 쓴다.
// - 컴포넌트·관계·View·노드·엣지는 id로 정렬 → 배열 순서만 바뀌면 같다
// - 집합 필드(requirementIds·decisionIds·tags)는 정렬, 비어 있는 선택 필드(tags·custom)는 없는 것과 같다
// - 좌표·크기·viewport는 뺀다 (배치만 바뀐 것은 layoutChanges로 따로 센다)
// DB·네트워크 없음.
const crypto = require('node:crypto');

const HASH_VERSION = 1;
const SET_FIELDS = ['requirementIds', 'decisionIds', 'tags'];

/** 키를 정렬하고 undefined를 뺀 JSON — 같은 값이면 같은 문자열 */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const isEmpty = (v) => v == null || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);

function entity(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (v === undefined) continue;
    if (SET_FIELDS.includes(k)) {
      const list = Array.isArray(v) ? [...new Set(v)].sort() : v;
      if (k === 'tags' && isEmpty(list)) continue;
      out[k] = list;
    } else if (k === 'custom' && isEmpty(v)) {
      continue;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function canonNode(n) {
  const out = { id: n.id, kind: n.kind };
  for (const k of ['componentId', 'parentId', 'label', 'text']) if (n[k] !== undefined && n[k] !== null) out[k] = n[k];
  return out;
}
function canonEdge(e) {
  const out = { id: e.id, relationId: e.relationId };
  for (const k of ['sourceHandle', 'targetHandle']) if (e[k] !== undefined && e[k] !== null) out[k] = e[k];
  return out;
}

/** 해시·Diff 입력. 좌표·크기·viewport 없음 */
function canonModel(model) {
  const m = model ?? {};
  const views = (m.views ?? []).map((v) => {
    const out = { id: v.id, kind: v.kind, name: v.name };
    if (v.variant !== undefined && v.variant !== null) out.variant = v.variant;
    // Sprint 7: 배포 전략도 의미 변경. 빈 문자열은 없는 것과 같다 → 전략 없는 모델의 해시는 Sprint 6과 같다
    if (typeof v.strategyMd === 'string' && v.strategyMd !== '') out.strategyMd = v.strategyMd;
    out.nodes = (v.nodes ?? []).map(canonNode).sort(byId);
    out.edges = (v.edges ?? []).map(canonEdge).sort(byId);
    return out;
  }).sort(byId);
  const components = Object.values(m.components ?? {}).map(entity).sort(byId);
  const relations = Object.values(m.relations ?? {}).map(entity).sort(byId);
  const out = { schemaVersion: m.schemaVersion ?? 1, components, relations, views };
  // Sprint 8: 흐름은 requirementIds만 정렬(참여·결과 순서는 의미 있음). 키 순서는 canonicalJson이 정렬
  if (!isEmpty(m.flows)) {
    out.flows = Object.fromEntries(Object.entries(m.flows).map(([k, f]) => [k, f && Array.isArray(f.requirementIds) ? { ...f, requirementIds: [...new Set(f.requirementIds)].sort() } : f]));
  }
  return out;
}

/** 의미 해시 (03 DDL 2 model_hash) */
function modelHash(model) {
  return sha256(canonicalJson(canonModel(model)));
}

/** 두 모델에서 같은 View·같은 노드 id인데 좌표·크기만 다른 노드 수 */
function layoutChanges(prev, next) {
  if (!prev || !next) return 0;
  const before = new Map();
  for (const v of prev.views ?? []) for (const n of v.nodes ?? []) before.set(`${v.id}\u0000${n.id}`, n);
  let count = 0;
  for (const v of next.views ?? []) {
    for (const n of v.nodes ?? []) {
      const o = before.get(`${v.id}\u0000${n.id}`);
      if (!o) continue;
      const moved = o.position?.x !== n.position?.x || o.position?.y !== n.position?.y;
      const resized = (o.width ?? null) !== (n.width ?? null) || (o.height ?? null) !== (n.height ?? null);
      if (moved || resized) count++;
    }
  }
  return count;
}

module.exports = { HASH_VERSION, canonicalJson, canonModel, modelHash, layoutChanges, sha256 };
