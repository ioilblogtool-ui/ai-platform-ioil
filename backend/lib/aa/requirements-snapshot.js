// 발행 시점 요구사항 스냅샷 (Sprint 6 Step 1 · 03 §6.2).
// 모델(컴포넌트·관계)이 참조하는 요구사항만, 지금 프로젝트에 있는 것만 담는다.
// 형식: { "<uuid>": { code, kind, category, title, target, metric, priority } }
const { canonicalJson, sha256 } = require('./model-canon');

const FIELDS = ['code', 'kind', 'category', 'title', 'target', 'metric', 'priority'];

function referencedRequirementIds(model) {
  const ids = new Set();
  for (const c of Object.values(model?.components ?? {})) for (const id of c.requirementIds ?? []) ids.add(id);
  for (const r of Object.values(model?.relations ?? {})) for (const id of r.requirementIds ?? []) ids.add(id);
  return ids;
}

/** @param {Array<object>} requirements 프로젝트 요구사항 (DB 행 또는 API 형태 — 필드 이름이 같다) */
function buildSnapshot(model, requirements) {
  const ids = referencedRequirementIds(model);
  const snapshot = {};
  for (const r of requirements ?? []) {
    if (!ids.has(r.id)) continue;
    snapshot[r.id] = Object.fromEntries(FIELDS.map((f) => [f, r[f] ?? null]));
  }
  return snapshot;
}

const snapshotHash = (snapshot) => sha256(canonicalJson(snapshot ?? {}));

/** 두 스냅샷 사이의 변경 수: 같은 uuid의 필드 차이 + 추가 + 제외 */
function compareSnapshots(prev, next) {
  const a = prev ?? {}, b = next ?? {};
  let changed = 0, added = 0, removed = 0;
  for (const id of Object.keys(b)) {
    if (!(id in a)) { added++; continue; }
    if (FIELDS.some((f) => (a[id][f] ?? null) !== (b[id][f] ?? null))) changed++;
  }
  for (const id of Object.keys(a)) if (!(id in b)) removed++;
  return { changed, added, removed, total: changed + added + removed };
}

module.exports = { FIELDS, referencedRequirementIds, buildSnapshot, snapshotHash, compareSnapshots };
