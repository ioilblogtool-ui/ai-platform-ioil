// 발행 시 저장하는 Diff 요약 (Sprint 6 Step 1 · Q5 · 03 §4).
// 버전은 불변이라 발행 때 요약을 확정한다. 상세 changes·Compare 화면은 Sprint 7.
// 입력은 model-canon과 같은 정규화를 거친다 → 해시가 다르면 요약의 어느 수든 0보다 크다.
const { HASH_VERSION, canonModel, canonicalJson, layoutChanges } = require('./model-canon');
const { compareSnapshots } = require('./requirements-snapshot');

const withoutReqs = ({ requirementIds, ...rest }) => rest;   // eslint-disable-line no-unused-vars
const same = (a, b) => canonicalJson(a) === canonicalJson(b);

function diffEntities(prevList, nextList) {
  const before = new Map(prevList.map((e) => [e.id, e]));
  const after = new Map(nextList.map((e) => [e.id, e]));
  let added = 0, removed = 0, modified = 0, linksChanged = 0;
  for (const [id, e] of after) {
    const o = before.get(id);
    if (!o) { added++; continue; }
    if (!same(withoutReqs(o), withoutReqs(e))) modified++;
    if (!same(o.requirementIds ?? [], e.requirementIds ?? [])) linksChanged++;
  }
  for (const id of before.keys()) if (!after.has(id)) removed++;
  return { added, removed, modified, linksChanged };
}

/** 표현(View) 변경: View 추가·삭제·이름/종류 변경, 노드 추가·삭제·라벨/텍스트/연결 컴포넌트 변경, 엣지 변경. 부모 변경은 따로 센다 */
function diffViews(prevViews, nextViews) {
  const before = new Map(prevViews.map((v) => [v.id, v]));
  let viewChanges = 0, nodesReparented = 0;
  const seen = new Set();
  for (const v of nextViews) {
    seen.add(v.id);
    const o = before.get(v.id);
    if (!o) { viewChanges++; continue; }
    if (o.kind !== v.kind || o.name !== v.name || (o.variant ?? null) !== (v.variant ?? null)) viewChanges++;
    const oldNodes = new Map(o.nodes.map((n) => [n.id, n]));
    const newIds = new Set();
    for (const n of v.nodes) {
      newIds.add(n.id);
      const on = oldNodes.get(n.id);
      if (!on) { viewChanges++; continue; }
      if ((on.parentId ?? null) !== (n.parentId ?? null)) nodesReparented++;
      const { parentId: _a, ...restOld } = on;   // eslint-disable-line no-unused-vars
      const { parentId: _b, ...restNew } = n;    // eslint-disable-line no-unused-vars
      if (!same(restOld, restNew)) viewChanges++;
    }
    for (const id of oldNodes.keys()) if (!newIds.has(id)) viewChanges++;
    if (!same(o.edges, v.edges)) {
      const oldEdges = new Map(o.edges.map((e) => [e.id, canonicalJson(e)]));
      const newEdges = new Map(v.edges.map((e) => [e.id, canonicalJson(e)]));
      for (const [id, e] of newEdges) if (oldEdges.get(id) !== e) viewChanges++;
      for (const id of oldEdges.keys()) if (!newEdges.has(id)) viewChanges++;
    }
  }
  for (const id of before.keys()) if (!seen.has(id)) viewChanges++;
  return { viewChanges, nodesReparented };
}

/**
 * @param {{ model: object, snapshot: object } | null} prev 직전 버전 (없으면 첫 버전)
 * @param {{ model: object, snapshot: object }} next 발행할 Draft
 */
function summarize(prev, next) {
  const b = canonModel(next.model);
  if (!prev) {
    return { hashVersion: HASH_VERSION, first: true, components: b.components.length, relations: b.relations.length };
  }
  const a = canonModel(prev.model);
  const comp = diffEntities(a.components, b.components);
  const rel = diffEntities(a.relations, b.relations);
  const views = diffViews(a.views, b.views);
  const reqs = compareSnapshots(prev.snapshot, next.snapshot);
  return {
    hashVersion: HASH_VERSION,
    componentsAdded: comp.added,
    componentsRemoved: comp.removed,
    componentsModified: comp.modified,
    requirementLinksChanged: comp.linksChanged + rel.linksChanged,
    relationsAdded: rel.added,
    relationsRemoved: rel.removed,
    relationsModified: rel.modified,
    nodesReparented: views.nodesReparented,
    viewChanges: views.viewChanges + (same(a.flows ?? null, b.flows ?? null) ? 0 : 1),
    layoutOnly: layoutChanges(prev.model, next.model),
    requirementsChanged: reqs.total,
  };
}

/** 의미 변경이 하나라도 있는가 (layoutOnly 제외) */
function hasSemanticChanges(summary) {
  if (summary.first) return true;
  return Object.entries(summary).some(([k, v]) => !['hashVersion', 'layoutOnly'].includes(k) && typeof v === 'number' && v > 0);
}

module.exports = { summarize, hasSemanticChanges };
