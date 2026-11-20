import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { miniCanvasLayout, unmappedNfrCount } from '../../lib/aa/overview.ts';

const NFR1 = 'AAAAAAAA-1111-4111-8111-111111111111';
const NFR2 = 'bbbbbbbb-2222-4222-8222-222222222222';

function model() {
  const comp = (id, name, extra = {}) => ({ id, layer: 'logical', type: 'service', name, properties: {}, requirementIds: [], ...extra });
  return {
    schemaVersion: 1,
    components: { cmp_a: comp('cmp_a', 'API', { technology: 'Spring Boot' }), cmp_b: comp('cmp_b', 'DB', { requirementIds: [NFR1.toLowerCase()] }) },
    relations: { rel_a: { id: 'rel_a', type: 'calls', from: 'cmp_a', to: 'cmp_b', protocol: 'JDBC', requirementIds: [] } },
    views: [{
      id: 'view_logical', kind: 'logical', name: 'Logical',
      nodes: [
        { id: 'nd_g', kind: 'group', position: { x: 0, y: 0 }, width: 600, height: 200, label: 'VPC' },
        { id: 'nd_a', kind: 'component', componentId: 'cmp_a', parentId: 'nd_g', position: { x: 20, y: 40 } },
        { id: 'nd_b', kind: 'component', componentId: 'cmp_b', position: { x: 400, y: 300 } },
        { id: 'nd_n', kind: 'note', position: { x: 700, y: 0 }, text: '첫 줄\n둘째 줄' },
        { id: 'nd_x', kind: 'component', componentId: 'cmp_missing', position: { x: 0, y: 0 } },
      ],
      edges: [{ id: 'ed_a', relationId: 'rel_a' }, { id: 'ed_x', relationId: 'rel_missing' }],
    }],
  };
}

describe('Overview mini canvas', () => {
  it('lays out groups first, uses absolute positions and skips dangling refs', () => {
    const input = model();
    const snapshot = structuredClone(input);
    const layout = miniCanvasLayout(input);
    assert.deepEqual(input, snapshot);
    assert.deepEqual(layout.boxes.map((b) => b.id), ['nd_g', 'nd_a', 'nd_b', 'nd_n']);
    const api = layout.boxes.find((b) => b.id === 'nd_a');
    assert.deepEqual([api.x, api.y, api.sub], [20, 40, 'Spring Boot']);
    assert.equal(layout.boxes.find((b) => b.id === 'nd_n').label, '첫 줄');
    assert.deepEqual(layout.lines.map((l) => [l.id, l.x1, l.label]), [['ed_a', 188, 'JDBC']]);
    assert.ok(layout.viewBox.w > 900 && layout.viewBox.h > 356);
  });

  it('returns null for an empty or missing view', () => {
    const empty = model();
    empty.views[0].nodes = [];
    assert.equal(miniCanvasLayout(empty), null);
    assert.equal(miniCanvasLayout(null), null);
    assert.equal(miniCanvasLayout(model(), 'view_k8s'), null);
  });

  it('counts active NFRs not linked from components or relations', () => {
    const req = (id, kind, status = 'active') => ({ id, kind, status, code: '', title: '', category: null, description: null, target: null, metric: null, priority: 'should', sortOrder: 0 });
    const list = [req(NFR1, 'nfr'), req(NFR2, 'nfr'), req('cccccccc-3333-4333-8333-333333333333', 'nfr', 'deprecated'), req('dddddddd-4444-4444-8444-444444444444', 'fr')];
    assert.equal(unmappedNfrCount(model(), list), 1);
    assert.equal(unmappedNfrCount(null, list), 2);
  });
});
