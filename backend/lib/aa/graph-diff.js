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
  // Sprint 7: 같은 View id의 배포 전략 변경·삭제 (추가·삭제된 배치안은 viewChanges)
  const beforeViews = new Map(a.views.map((v) => [v.id, v.strategyMd ?? '']));
  const strategiesChanged = b.views.filter((v) => beforeViews.has(v.id) && beforeViews.get(v.id) !== (v.strategyMd ?? '')).length;
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
    strategiesChanged,
  };
}

/** 의미 변경이 하나라도 있는가 (layoutOnly 제외) */
function hasSemanticChanges(summary) {
  if (summary.first) return true;
  return Object.entries(summary).some(([k, v]) => !['hashVersion', 'layoutOnly'].includes(k) && typeof v === 'number' && v > 0);
}

// ── 상세 변경 목록 (Sprint 7 Step 4 · 05 §4 compare · 03 §4) ─────────────────────
const SNAP_FIELDS = ['code', 'kind', 'category', 'title', 'target', 'metric', 'priority'];
const COMPONENT_FIELDS = ['name', 'type', 'technology', 'description'];
const RELATION_FIELDS = ['type', 'from', 'to', 'protocol', 'mode', 'label'];

/** 두 값의 경로별 차이 (객체는 한 단계 펼침: properties.port, custom.key) */
function fieldDiffs(a, b, fields, nested = []) {
  const out = [];
  for (const f of fields) if (!same(a[f] ?? null, b[f] ?? null)) out.push({ path: f, before: a[f] ?? null, after: b[f] ?? null });
  for (const key of nested) {
    const x = a[key] ?? {}, y = b[key] ?? {};
    for (const k of [...new Set([...Object.keys(x), ...Object.keys(y)])].sort()) {
      if (!same(x[k] ?? null, y[k] ?? null)) out.push({ path: `${key}.${k}`, before: x[k] ?? null, after: y[k] ?? null });
    }
  }
  if (!same([...(a.tags ?? [])].sort(), [...(b.tags ?? [])].sort()) && (a.tags || b.tags)) out.push({ path: 'tags', before: a.tags ?? [], after: b.tags ?? [] });
  return out;
}

/**
 * 두 모델의 상세 변경 목록. 화면이 그대로 보여줄 수 있게 이름을 함께 담는다.
 * @param {{ model, snapshot }} prev @param {{ model, snapshot }} next
 * @param {{ includeLayout?: boolean }} [opts]
 */
function diffModels(prev, next, opts = {}) {
  const A = prev.model ?? {}, B = next.model ?? {};
  const ca = A.components ?? {}, cb = B.components ?? {};
  const ra = A.relations ?? {}, rb = B.relations ?? {};
  const snapA = prev.snapshot ?? {}, snapB = next.snapshot ?? {};
  const codeOf = (id) => snapB[id]?.code ?? snapA[id]?.code ?? '(지운 요구사항)';
  const compName = (id) => cb[id]?.name ?? ca[id]?.name ?? '?';
  const viewsOf = (model, cid) => (model.views ?? []).filter((v) => v.nodes.some((n) => n.componentId === cid)).map((v) => v.id);
  const changes = [];
  const reqDiff = (x, y) => {
    const before = new Set(x ?? []), after = new Set(y ?? []);
    return { added: [...after].filter((id) => !before.has(id)).map(codeOf).sort(), removed: [...before].filter((id) => !after.has(id)).map(codeOf).sort() };
  };

  // 컴포넌트
  for (const [id, c] of Object.entries(cb)) {
    const o = ca[id];
    if (!o) { changes.push({ kind: 'component.added', componentId: id, name: c.name, type: c.type, viewIds: viewsOf(B, id) }); continue; }
    const fields = fieldDiffs(o, c, COMPONENT_FIELDS, ['properties', 'custom']);
    if (fields.length) changes.push({ kind: 'component.modified', componentId: id, name: c.name, type: c.type, fields, viewIds: viewsOf(B, id) });
    const r = reqDiff(o.requirementIds, c.requirementIds);
    if (r.added.length || r.removed.length) changes.push({ kind: 'component.requirements', componentId: id, name: c.name, ...r, viewIds: viewsOf(B, id) });
  }
  for (const [id, c] of Object.entries(ca)) {
    if (!cb[id]) changes.push({ kind: 'component.removed', componentId: id, name: c.name, type: c.type, viewIds: viewsOf(A, id) });
  }

  // 관계
  const relInfo = (r) => ({ relationId: r.id, relationType: r.type, from: compName(r.from), to: compName(r.to), fromId: r.from, toId: r.to });
  for (const [id, r] of Object.entries(rb)) {
    const o = ra[id];
    if (!o) { changes.push({ kind: 'relation.added', ...relInfo(r), protocol: r.protocol ?? null }); continue; }
    const fields = fieldDiffs(o, r, RELATION_FIELDS).filter((f) => f.path !== 'tags');
    if (fields.length) changes.push({ kind: 'relation.modified', ...relInfo(r), fields });
    const q = reqDiff(o.requirementIds, r.requirementIds);
    if (q.added.length || q.removed.length) changes.push({ kind: 'relation.requirements', ...relInfo(r), ...q });
  }
  for (const [id, r] of Object.entries(ra)) if (!rb[id]) changes.push({ kind: 'relation.removed', ...relInfo(r), protocol: r.protocol ?? null });

  // View·배치안·노드
  const va = new Map((A.views ?? []).map((v) => [v.id, v])), vb = new Map((B.views ?? []).map((v) => [v.id, v]));
  const nodeName = (model, v, n) => (n?.componentId ? model.components?.[n.componentId]?.name ?? '?' : n?.kind === 'group' ? n.label || 'Boundary' : n?.kind === 'note' ? 'Note' : '?');
  for (const [id, v] of vb) {
    const o = va.get(id);
    if (!o) { changes.push({ kind: 'view.added', viewId: id, viewKind: v.kind, variant: v.variant ?? v.name }); continue; }
    if ((o.variant ?? null) !== (v.variant ?? null) || o.name !== v.name) {
      changes.push({ kind: 'view.renamed', viewId: id, viewKind: v.kind, before: o.variant ?? o.name, after: v.variant ?? v.name });
    }
    if ((o.strategyMd ?? '') !== (v.strategyMd ?? '')) {
      changes.push({ kind: 'view.strategy', viewId: id, variant: v.variant ?? v.name, change: !o.strategyMd ? 'added' : !v.strategyMd ? 'removed' : 'modified' });
    }
    const on = new Map(o.nodes.map((n) => [n.id, n]));
    const parentName = (model, view, pid) => (pid ? nodeName(model, view, view.nodes.find((x) => x.id === pid)) : null);
    for (const n of v.nodes) {
      const p = on.get(n.id);
      if (!p) { changes.push({ kind: 'view.node.added', viewId: id, nodeId: n.id, name: nodeName(B, v, n) }); continue; }
      if ((p.parentId ?? null) !== (n.parentId ?? null)) {
        changes.push({ kind: 'view.node.reparented', viewId: id, nodeId: n.id, name: nodeName(B, v, n), before: parentName(A, o, p.parentId), after: parentName(B, v, n.parentId) });
      }
      if (opts.includeLayout) {
        if (p.position?.x !== n.position?.x || p.position?.y !== n.position?.y) changes.push({ kind: 'layout.moved', viewId: id, nodeId: n.id, name: nodeName(B, v, n) });
        if ((p.width ?? null) !== (n.width ?? null) || (p.height ?? null) !== (n.height ?? null)) changes.push({ kind: 'layout.resized', viewId: id, nodeId: n.id, name: nodeName(B, v, n) });
      }
    }
    const nb = new Set(v.nodes.map((n) => n.id));
    for (const n of o.nodes) if (!nb.has(n.id)) changes.push({ kind: 'view.node.removed', viewId: id, nodeId: n.id, name: nodeName(A, o, n) });
  }
  for (const [id, v] of va) if (!vb.has(id)) changes.push({ kind: 'view.removed', viewId: id, viewKind: v.kind, variant: v.variant ?? v.name });

  // 요구사항 스냅샷 (발행 당시 값의 차이)
  for (const id of [...new Set([...Object.keys(snapA), ...Object.keys(snapB)])]) {
    const x = snapA[id], y = snapB[id];
    if (x && y) {
      const fields = SNAP_FIELDS.filter((f) => (x[f] ?? null) !== (y[f] ?? null)).map((f) => ({ path: f, before: x[f] ?? null, after: y[f] ?? null }));
      if (fields.length) changes.push({ kind: 'requirement.snapshot_changed', code: y.code, change: 'modified', fields });
    } else {
      changes.push({ kind: 'requirement.snapshot_changed', code: (y ?? x).code, change: y ? 'added' : 'removed', fields: [] });
    }
  }
  return { summary: summarize(prev, next), changes };
}

module.exports = { summarize, hasSemanticChanges, diffModels };
