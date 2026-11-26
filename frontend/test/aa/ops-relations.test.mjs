// Sprint 11 Step 3: 운영 설계 관계 모델 연산 (V17 삭제 동작, C2 복귀 대상 정리, 불러올 때 복구)
// 결과 모델은 백엔드 validator(V17·V18·V19)로 검증한다.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  connect, duplicateDeploymentView, fallbackReferrers, removeDeploymentView, removeEdges, removeNodes, repairOnLoad, setRelationType,
} from '../../lib/aa/model-ops.ts';
import { defaultRelationType, relationLayer, repairOpsRelations } from '../../lib/aa/ops-relations.ts';
import { toFlow } from '../../lib/aa/graph-mapper.ts';

const require = createRequire(import.meta.url);
const { validateModel, placementWarnings } = require('../../../backend/lib/aa/architecture-validator.js');
const sample = require('../../../backend/lib/aa/templates/sample-migration.js');

const OPS = 'view_dep_ops';
const VM = 'view_dep_migration';
const AWS = 'view_aws_migration';
function idGen() { let n = 0; return (prefix) => `${prefix}_${String(++n).padStart(10, '0')}`; }
const comp = (id, type, name) => ({ id, type, layer: 'ops', name, properties: {}, requirementIds: [], decisionIds: [] });
const view = (m, id) => m.views.find((v) => v.id === id);
const nodeOf = (m, vid, cid) => view(m, vid).nodes.find((n) => n.componentId === cid);
const ok = (m) => assert.deepEqual(validateModel(m).errors, []);

/** 샘플 + 빈 운영 설계 배치안(조회 API 참조 노드, Prometheus·CI·Registry 노드). 관계는 connect로 만든다 */
function base() {
  const m = sample.baseModel();
  Object.assign(m.components, {
    cmp_prom: comp('cmp_prom', 'ops.metrics', 'Prometheus'),
    cmp_ci: comp('cmp_ci', 'ops.ci', 'CI'),
    cmp_reg: comp('cmp_reg', 'ops.registry', 'Registry'),
  });
  m.views.push({ id: OPS, kind: 'deployment', name: 'Deployment', variant: '운영 설계', edges: [], nodes: [
    { id: 'nd_o_query', kind: 'component', componentId: 'cmp_query', position: { x: 0, y: 0 } },
    { id: 'nd_o_prom', kind: 'component', componentId: 'cmp_prom', position: { x: 200, y: 0 } },
    { id: 'nd_o_ci', kind: 'component', componentId: 'cmp_ci', position: { x: 0, y: 200 } },
    { id: 'nd_o_reg', kind: 'component', componentId: 'cmp_reg', position: { x: 200, y: 200 } },
  ] });
  return m;
}
function wired() {
  const newId = idGen();
  let m = base();
  const a = connect(m, OPS, 'nd_o_prom', 'nd_o_query', {}, newId);
  const b = connect(a.model, OPS, 'nd_o_ci', 'nd_o_reg', {}, newId);
  m = b.model;
  return { m, scrape: a.relationId, build: b.relationId, newId };
}
const strategy = (targetViewId = VM) => ({
  environments: [{ name: 'prod', promotion: 'same-image' }], release: { type: 'rolling', rolling: { maxSurge: '25%', maxUnavailable: '0' } },
  gates: [], rollback: { method: 'previous-image', targetMin: 10, trigger: '오류율' },
  fallback: { ...(targetViewId ? { targetViewId } : {}), trigger: '오류율 > 2%', switchMethod: 'lb-weight', ownerRole: 'on-call', targetMin: 15, dbCondition: 'expand만' },
  dbChange: { policy: 'expand-contract' },
});

describe('연결: 기본 관계 유형', () => {
  it('ops 끝점이면 유형을 정하고, 아니면 calls (기존 동작)', () => {
    const c = (type) => ({ type, layer: type.startsWith('ops.') ? 'ops' : 'logical' });
    assert.equal(defaultRelationType(c('ops.metrics'), c('service')), 'scrapes');
    assert.equal(defaultRelationType(c('ops.metrics'), c('ops.alerting')), 'alerts_to');
    assert.equal(defaultRelationType(c('service'), c('ops.collector')), 'ships_logs');
    assert.equal(defaultRelationType(c('ops.collector'), c('ops.telemetry')), 'exports_traces');
    assert.equal(defaultRelationType(c('ops.ci'), c('ops.registry')), 'builds');
    assert.equal(defaultRelationType(c('ops.ci'), c('ops.config_repo')), 'pushes');
    assert.equal(defaultRelationType(c('ops.gitops'), c('service')), 'syncs');
    assert.equal(defaultRelationType(c('service'), c('database')), null);
  });

  it('운영 설계 배치안에서 이으면 운영 설계 관계(protocol·mode 없음)가 생기고 서버 검증을 통과한다', () => {
    const { m, scrape, build } = wired();
    assert.equal(m.relations[scrape].type, 'scrapes');
    assert.equal(m.relations[build].type, 'builds');
    assert.equal(m.relations[scrape].protocol, undefined);
    ok(m);
  });

  it('deployment가 아닌 View에서는 운영 설계 관계를 만들지 않는다', () => {
    const m = base();
    view(m, 'view_logical').nodes.push({ id: 'nd_l_prom', kind: 'component', componentId: 'cmp_prom', position: { x: 0, y: 400 } });
    const logicalQuery = nodeOf(m, 'view_logical', 'cmp_query').id;
    const r = connect(m, 'view_logical', 'nd_l_prom', logicalQuery, {}, idGen());
    assert.equal(r.model, m);
    assert.equal(r.relationId, null);
  });

  it('유형은 7종 안에서만 바꾼다', () => {
    const { m, scrape } = wired();
    const next = setRelationType(m, scrape, 'alerts_to');
    assert.equal(next.relations[scrape].type, 'alerts_to');
    assert.equal(setRelationType(m, scrape, 'calls'), m);
  });

  it('레이어 토글: 숨긴 레이어의 엣지는 hidden', () => {
    const { m, scrape, build } = wired();
    assert.equal(relationLayer('scrapes'), 'metrics');
    const { edges } = toFlow(m, OPS, new Set(), new Map(), new Map(), null, new Set(['metrics']));
    assert.equal(edges.find((e) => e.data.relationId === scrape).hidden, true);
    assert.equal(edges.find((e) => e.data.relationId === build).hidden, undefined);
    assert.equal(edges.find((e) => e.data.relationId === build).data.layer, 'deploy');
  });
});

describe('V17 삭제 동작 (S11-6 ①-b)', () => {
  it('마지막 표시 엣지를 지우면 관계도 같은 변경에서 지운다 → 저장 가능', () => {
    const { m, scrape } = wired();
    const edge = view(m, OPS).edges.find((e) => e.relationId === scrape).id;
    const next = removeEdges(m, OPS, [edge], { deleteRelations: false });
    assert.equal(next.relations[scrape], undefined);
    ok(next);
  });

  it('다른 배치안에 표시 엣지가 남으면 관계를 유지한다', () => {
    const { m, scrape, newId } = wired();
    const vm = view(m, VM);
    vm.nodes.push({ id: 'nd_vm_prom', kind: 'component', componentId: 'cmp_prom', position: { x: 0, y: 600 } },
      { id: 'nd_vm_qref', kind: 'component', componentId: 'cmp_query', position: { x: 200, y: 600 } });
    const twice = connect(m, VM, 'nd_vm_prom', 'nd_vm_qref', {}, newId).model;
    assert.equal(Object.values(twice.relations).filter((r) => r.type === 'scrapes').length, 1, '같은 관계를 재사용');
    const edge = view(twice, OPS).edges.find((e) => e.relationId === scrape).id;
    const next = removeEdges(twice, OPS, [edge]);
    assert.ok(next.relations[scrape]);
    ok(next);
  });

  it('마지막 엣지의 노드만 지워도 관계를 지운다', () => {
    const { m, scrape } = wired();
    const next = removeNodes(m, OPS, ['nd_o_query'], { deleteComponents: false });   // 조회 API 참조 노드만
    assert.ok(next.components.cmp_query, '컴포넌트는 그대로 (Logical·VM에 있음)');
    assert.equal(next.relations[scrape], undefined);
    ok(next);
  });

  it('운영 설계 배치안 삭제: ops 컴포넌트·관계를 지우고 공유 Logical은 남긴다', () => {
    const { m } = wired();
    const next = removeDeploymentView(m, OPS);
    assert.equal(Object.values(next.components).filter((c) => c.layer === 'ops').length, 0);
    assert.equal(Object.values(next.relations).filter((r) => ['scrapes', 'builds'].includes(r.type)).length, 0);
    assert.ok(next.components.cmp_query);
    ok(next);
  });

  it('운영 설계 배치안 복제: ops 컴포넌트는 새 id, 참조 노드와 잇는 관계도 복사', () => {
    const { m } = wired();
    const r = duplicateDeploymentView(m, OPS, '운영 설계 복제', idGen());
    assert.equal(r.error, undefined);
    assert.equal(Object.values(r.model.relations).filter((x) => x.type === 'scrapes').length, 2);
    assert.equal(Object.values(r.model.components).filter((c) => c.type === 'ops.metrics').length, 2);
    ok(r.model);
  });
});

describe('VM 복귀 대상 (C2)', () => {
  it('대상 배치안 삭제: targetViewId만 비우고 정책 문구는 남긴다 → V19 "미지정"', () => {
    const m = base();
    view(m, AWS).strategy = strategy();
    assert.deepEqual(fallbackReferrers(m, VM), ['목표 · EKS']);
    const next = removeDeploymentView(m, VM);
    const fb = view(next, AWS).strategy.fallback;
    assert.equal(fb.targetViewId, undefined);
    assert.equal(fb.trigger, '오류율 > 2%');
    ok(next);
    assert.match(placementWarnings(next).find((w) => w.rule === 'V19').message, /미지정/);
  });

  it('불러올 때: 끊긴 복귀 대상·표시 엣지 없는 운영 설계 관계를 정리하고 수를 알린다', () => {
    const { m, scrape } = wired();
    view(m, AWS).strategy = strategy('view_dep_gone');
    view(m, OPS).edges = view(m, OPS).edges.filter((e) => e.relationId !== scrape);   // 엣지만 사라진 저장본
    const r = repairOnLoad(m);
    assert.equal(r.fallbackCleared, 1);
    assert.equal(r.opsRemoved, 1);
    assert.equal(view(r.model, AWS).strategy.fallback.targetViewId, undefined);
    assert.equal(r.model.relations[scrape], undefined);
    assert.ok(m.relations[scrape], '입력 모델은 그대로');
    ok(r.model);
    assert.equal(repairOnLoad(r.model).model, r.model, '정리할 것이 없으면 같은 모델');
    assert.equal(repairOpsRelations(r.model).removed, 0);
  });
});

describe('Logical 참조 노드 (Q1)', async () => {
  const { addReferenceNode, referenceCandidates } = await import('../../lib/aa/model-ops.ts');
  const REGISTRY = require('../../../backend/lib/aa/type-registry.json');
  it('운영 설계 배치안(ops 노드가 있는 배치안)에만 Logical 참조 노드를 놓는다 — 일반 배치안·AWS는 아니다', () => {
    const m = base();
    view(m, OPS).nodes = view(m, OPS).nodes.filter((n) => n.componentId !== 'cmp_query');
    assert.ok(referenceCandidates(m, OPS, REGISTRY).some((c) => c.componentId === 'cmp_query'));
    const r = addReferenceNode(m, OPS, 'cmp_query', REGISTRY, { x: 0, y: 0 }, idGen());
    assert.ok(r.nodeId);
    ok(r.model);
    assert.ok(!referenceCandidates(m, AWS, REGISTRY).some((c) => c.componentId === 'cmp_query'));
    assert.ok(!referenceCandidates(m, VM, REGISTRY).some((c) => c.componentId === 'cmp_client'), '일반 배치안(VM)은 Sprint 8 규칙 그대로');
    assert.equal(addReferenceNode(m, VM, 'cmp_client', REGISTRY, { x: 0, y: 0 }, idGen()).nodeId, null);
    const empty = base();
    view(empty, OPS).nodes = [];   // ops 노드 없음
    assert.ok(!referenceCandidates(empty, OPS, REGISTRY).some((c) => c.componentId === 'cmp_query'), 'ops 노드가 없으면 아직 운영 설계 배치안이 아니다');
    assert.equal(addReferenceNode(m, AWS, 'cmp_query', REGISTRY, { x: 0, y: 0 }, idGen()).nodeId, null);
  });
});
