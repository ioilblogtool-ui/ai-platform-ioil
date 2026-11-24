// Sprint 11 Step 1 (Sprint 10 이월): V16 AWS 배치 경고 — 검증기(오프라인)와 Draft 조회 응답(DB)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { validateModel, placementWarnings } = require('../../lib/aa/architecture-validator');
const sample = require('../../lib/aa/templates/sample-migration');
const { dbSkipReason, getTokens, deleteProjects, api, createProject } = require('../helpers/aa-api');

const awsView = (m) => m.views.find((v) => v.kind === 'aws');
const nodeOf = (view, componentId) => view.nodes.find((n) => n.componentId === componentId);
const byType = (m, type) => Object.values(m.components).find((c) => c.type === type);

/** 샘플의 public 서브넷 노드 하나 (tier 속성 기준) */
function publicSubnetNode(m) {
  const view = awsView(m);
  return view.nodes.find((n) => m.components[n.componentId]?.type === 'aws.subnet'
    && m.components[n.componentId].properties?.tier === 'public');
}

describe('V16 AWS placement warnings (offline)', () => {
  it('샘플 그대로는 V16 경고가 없다', () => {
    const r = validateModel(sample.model());
    assert.equal(r.errors.length, 0);
    assert.deepEqual(r.warnings.filter((w) => w.rule === 'V16'), []);
  });

  it('RDS Multi-AZ가 꺼지면 경고, 저장은 막지 않는다', () => {
    const m = sample.model();
    const rds = byType(m, 'aws.rds');
    rds.properties.multiAz = false;
    const r = validateModel(m);
    assert.equal(r.errors.length, 0);
    const w = r.warnings.filter((x) => x.rule === 'V16');
    assert.equal(w.length, 1);
    assert.equal(w[0].code, 'V16');
    assert.equal(w[0].viewId, awsView(m).id);
    assert.equal(w[0].nodeId, nodeOf(awsView(m), rds.id).id);
    assert.match(w[0].message, /Multi-AZ/);
  });

  it('RDS의 가장 가까운 서브넷이 public이면 경고', () => {
    const m = sample.model();
    const rdsNode = nodeOf(awsView(m), byType(m, 'aws.rds').id);
    rdsNode.parentId = publicSubnetNode(m).id;
    const w = validateModel(m).warnings.filter((x) => x.rule === 'V16');
    assert.ok(w.some((x) => /Public subnet/.test(x.message)), JSON.stringify(w));
  });

  it('VPC 안 AZ가 하나뿐이면 경고', () => {
    const m = sample.model();
    const view = awsView(m);
    const azNodes = view.nodes.filter((n) => m.components[n.componentId]?.type === 'aws.az');
    assert.ok(azNodes.length >= 2);
    const [keep, drop] = azNodes;
    // 두 번째 AZ 아래 노드를 첫 번째 AZ로 옮긴 뒤 AZ 노드만 제거한다 (컴포넌트는 정본 규칙 때문에 함께 제거)
    for (const n of view.nodes) if (n.parentId === drop.id) n.parentId = keep.id;
    view.nodes = view.nodes.filter((n) => n.id !== drop.id);
    delete m.components[drop.componentId];
    const r = validateModel(m);
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
    assert.ok(r.warnings.some((x) => x.rule === 'V16' && /가용 영역이 하나/.test(x.message)));
  });

  it('placementWarnings는 V11·V16만 돌려준다', () => {
    const m = sample.model();
    byType(m, 'aws.rds').properties.multiAz = false;
    const rules = new Set(placementWarnings(m).map((w) => w.rule));
    assert.deepEqual([...rules], ['V16']);
  });
});

describe('V16 on Draft GET (S11-7)', { skip: dbSkipReason }, () => {
  const created = [];
  let A, url;
  before(async () => {
    A = (await getTokens()).A;
    const project = await createProject(A, created, 'v16-get');
    url = `/api/aa/projects/${project.id}/architecture`;
  });
  after(async () => { await deleteProjects(created); });

  it('저장 응답과 조회 응답 모두 V16을 돌려준다', async () => {
    const m = sample.model();
    byType(m, 'aws.rds').properties.multiAz = false;
    const g0 = await api(A).get(url);
    const s = await api(A).put(`${url}/draft`, { baseRevision: g0.body.data.revision, model: m });
    assert.equal(s.status, 200, JSON.stringify(s.body));
    assert.equal(s.body.warnings.filter((w) => w.rule === 'V16').length, 1);
    const g = await api(A).get(url);
    assert.equal(g.status, 200);
    const w = (g.body.warnings ?? []).filter((x) => x.rule === 'V16');
    assert.equal(w.length, 1, JSON.stringify(g.body.warnings));
    assert.equal(w[0].nodeId, s.body.warnings.find((x) => x.rule === 'V16').nodeId);
  });

  it('경고 원인을 고치면 조회 응답에서 V16이 사라진다', async () => {
    const g = await api(A).get(url);
    const m = g.body.data.model;
    byType(m, 'aws.rds').properties.multiAz = true;
    const s = await api(A).put(`${url}/draft`, { baseRevision: g.body.data.revision, model: m });
    assert.equal(s.status, 200, JSON.stringify(s.body));
    const g2 = await api(A).get(url);
    assert.deepEqual((g2.body.warnings ?? []).filter((x) => x.rule === 'V16'), []);
  });
});
