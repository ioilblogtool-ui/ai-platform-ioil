// Sprint 7 Step 4 — Version Compare 화면 문구·강조
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fieldText, groupChanges, highlightNodes, onlyLayout, viewLabel } from '../../lib/aa/compare-format.ts';
import { miniCanvasLayout } from '../../lib/aa/overview.ts';
import { summaryParts } from '../../lib/aa/version-format.ts';

const views = [
  { id: 'view_logical', kind: 'logical', name: 'Logical', variant: null },
  { id: 'view_dep_vm', kind: 'deployment', name: 'Deployment', variant: '대안 · VM×2 + LB' },
];
const model = {
  schemaVersion: 1, components: {
    c1: { id: 'c1', type: 'service', name: 'API', properties: {}, requirementIds: [] },
    c2: { id: 'c2', type: 'database', name: 'DB', properties: {}, requirementIds: [] },
    vm: { id: 'vm', type: 'dep.vm', layer: 'deployment', name: 'vm-1', properties: {}, requirementIds: [] },
  }, relations: {},
  views: [
    { id: 'view_logical', kind: 'logical', name: 'Logical', nodes: [
      { id: 'n1', kind: 'component', componentId: 'c1', position: { x: 0, y: 0 } },
      { id: 'n2', kind: 'component', componentId: 'c2', position: { x: 300, y: 0 } }], edges: [] },
    { id: 'view_dep_vm', kind: 'deployment', name: 'Deployment', variant: 'x', nodes: [
      { id: 'nv', kind: 'component', componentId: 'vm', position: { x: 0, y: 0 }, width: 400, height: 200 },
      { id: 'np', kind: 'component', componentId: 'c1', parentId: 'nv', position: { x: 20, y: 40 } }], edges: [] },
  ],
};

describe('compare-format', () => {
  it('groups changes by kind in a fixed order and labels them in Korean', () => {
    const groups = groupChanges([
      { kind: 'view.renamed', viewId: 'view_dep_vm', viewKind: 'deployment', before: '대안 · VM×2 + LB', after: '대안 · VM×3' },
      { kind: 'component.modified', componentId: 'c1', name: 'API', type: 'service', fields: [{ path: 'technology', before: 'Node', after: 'Go' }, { path: 'description', before: 'a', after: 'b' }], viewIds: ['view_logical'] },
      { kind: 'relation.removed', relationId: 'r', relationType: 'realizes', from: 'api · 1', to: 'API', fromId: 'x', toId: 'c1', protocol: null },
      { kind: 'component.requirements', componentId: 'c2', name: 'DB', added: ['NFR-001'], removed: ['NFR-002'], viewIds: ['view_logical'] },
      { kind: 'view.strategy', viewId: 'view_dep_vm', variant: '대안 · VM×3', change: 'removed' },
      { kind: 'layout.moved', viewId: 'view_dep_vm', nodeId: 'np', name: 'API' },
    ], views);
    assert.deepEqual(groups.map((g) => g.key), ['component', 'relation', 'links', 'view', 'layout']);
    assert.equal(groups[0].items[0].detail, '기술: Node → Go / 설명 변경');
    assert.equal(groups[1].items[0].text, '삭제 · api · 1 → API (구현)');
    assert.equal(groups[2].items[0].detail, '+ NFR-001 · − NFR-002');
    assert.deepEqual(groups[3].items.map((i) => [i.text, i.tone]), [['배치안 이름 · 대안 · VM×2 + LB → 대안 · VM×3', 'modified'], ['배포 전략 삭제 · 대안 · VM×3', 'removed']]);
    assert.equal(groups[4].items[0].text, '배치안 · 대안 · VM×2 + LB · API 이동');
    assert.equal(fieldText({ path: 'properties.port', before: null, after: 4000 }), 'port: 없음 → 4000');
    assert.equal(viewLabel(views[0]), 'Logical');
  });

  it('highlights added nodes green and changed nodes orange in the chosen view', () => {
    const changes = [
      { kind: 'component.modified', componentId: 'c1', name: 'API', type: 'service', fields: [], viewIds: [] },
      { kind: 'component.added', componentId: 'c2', name: 'DB', type: 'database', viewIds: ['view_logical'] },
      { kind: 'view.node.reparented', viewId: 'view_dep_vm', nodeId: 'np', name: 'API', before: null, after: 'vm-1' },
    ];
    const logical = highlightNodes(changes, model, 'view_logical');
    assert.deepEqual([[...logical.added], [...logical.modified]], [['n2'], ['n1']]);
    const dep = highlightNodes(changes, model, 'view_dep_vm');
    assert.deepEqual([[...dep.added], [...dep.modified]], [[], ['np']]);
    assert.equal(onlyLayout([{ kind: 'layout.moved' }]), true);
    assert.equal(onlyLayout([]), false);
  });

  it('draws deployment containers as boxes in the mini canvas', () => {
    const l = miniCanvasLayout(model, 'view_dep_vm');
    assert.deepEqual(l.boxes.map((b) => [b.id, b.kind, b.w]), [['nv', 'group', 400], ['np', 'component', 168]]);
    assert.equal(l.boxes[1].x, 20, 'child placed inside the container');
  });

  it('summary mentions strategy changes', () => {
    const s = { hashVersion: 1, componentsAdded: 0, componentsRemoved: 0, componentsModified: 0, requirementLinksChanged: 0, relationsAdded: 0, relationsRemoved: 0,
      relationsModified: 0, nodesReparented: 0, viewChanges: 0, layoutOnly: 0, requirementsChanged: 0, strategiesChanged: 2 };
    assert.deepEqual(summaryParts(s), ['배포 전략 2']);
  });
});

describe('compare-format · Sprint 8', () => {
  it('groups flow changes, flags security changes and words retry/auth objects', () => {
    const groups = groupChanges([
      { kind: 'relation.modified', relationId: 'r', relationType: 'calls', from: 'API', to: 'DB', fromId: 'a', toId: 'b', security: true,
        fields: [{ path: 'credential', before: 'jwt-bearer', after: 'service-role' }, { path: 'retry', before: { max: 1, backoff: 'fixed' }, after: null }] },
      { kind: 'flow.added', flowId: 'f', name: '리포트 목록 조회', endpoint: 'GET /api/my-ai/reports' },
      { kind: 'flow.modified', flowId: 'f', name: '리포트 목록 조회', fields: [{ path: 'auth', before: { tokenIssuer: 'Auth' }, after: {} }] },
      { kind: 'flow.mermaid', flowId: 'f', name: '리포트 목록 조회' },
      { kind: 'flow.requirements', flowId: 'f', name: '리포트 목록 조회', added: ['NFR-001'], removed: [] },
    ], []);
    assert.deepEqual(groups.map((g) => g.key), ['relation', 'flow', 'links']);
    assert.equal(groups[0].items[0].text, '🛡 보안 수정 · API → DB');
    assert.equal(groups[0].items[0].detail, '자격증명 유형: jwt-bearer → service-role / retry: 1회 fixed → 없음');
    assert.deepEqual(groups[1].items.map((i) => i.text), ['추가 · 리포트 목록 조회 (GET /api/my-ai/reports)', '수정 · 리포트 목록 조회', '표현 변경 · 리포트 목록 조회']);
    assert.equal(groups[1].items[1].detail, '인증 역할: 발급 Auth → 없음');
    assert.equal(groups[2].items[0].detail, '+ NFR-001');
  });

  it('summary lists API Flow counts', () => {
    const s = { hashVersion: 1, componentsAdded: 0, componentsRemoved: 0, componentsModified: 0, requirementLinksChanged: 0, relationsAdded: 0, relationsRemoved: 0,
      relationsModified: 0, nodesReparented: 0, viewChanges: 0, layoutOnly: 0, requirementsChanged: 0, flowsAdded: 1, flowsModified: 2 };
    assert.deepEqual(summaryParts(s), ['+ API Flow 1', '~ API Flow 2']);
  });
});

describe('Sprint 11 Step 5: view.strategy parts·미지정 경고 (Q7·C2)', () => {
  const sv = [{ id: 'view_aws_migration', kind: 'aws', name: 'AWS', variant: '목표 · EKS' }];
  it('수정이면 바뀐 하위 항목을 문구로 — "배포 전략 변경 · 중단 기준" (S11-4a)', () => {
    const [g] = groupChanges([{ kind: 'view.strategy', viewId: 'view_aws_migration', variant: '목표 · EKS', change: 'modified', parts: ['gates'] }], sv);
    assert.equal(g.items[0].text, '배포 전략 변경 · 중단 기준 — 목표 · EKS');
    assert.equal(g.items[0].warning, undefined);
  });
  it('VM 복귀만 바뀌고 대상이 비면 경고를 붙인다 (S11-4b)', () => {
    const [g] = groupChanges([{ kind: 'view.strategy', viewId: 'view_aws_migration', variant: '목표 · EKS', change: 'modified', parts: ['fallback'], warnings: ['fallback-unset'] }], sv);
    assert.equal(g.items[0].text, '배포 전략 변경 · VM 복귀 — 목표 · EKS');
    assert.equal(g.items[0].warning, '⚠ VM 복귀 대상 미지정');
  });
  it('여러 부분은 서버 순서대로, parts 없는 옛 응답·작성은 기존 문구 (S11-4e)', () => {
    const items = groupChanges([
      { kind: 'view.strategy', viewId: 'v', variant: 'A', change: 'modified', parts: ['release', 'environments', 'dbChange', 'markdown'] },
      { kind: 'view.strategy', viewId: 'v', variant: 'A', change: 'modified' },
      { kind: 'view.strategy', viewId: 'v', variant: 'A', change: 'added', parts: ['gates'] },
    ])[0].items.map((i) => i.text);
    assert.deepEqual(items, ['배포 전략 변경 · 릴리스 방식 · 환경·승격 · DB 변경 · Markdown — A', '배포 전략 수정 · A', '배포 전략 작성 · A']);
  });
});
