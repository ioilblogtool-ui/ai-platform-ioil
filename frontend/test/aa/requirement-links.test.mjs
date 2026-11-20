import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { removeRequirementRefs, setRequirementLink } from '../../lib/aa/model-ops.ts';

const R1 = '11111111-1111-4111-8111-111111111111';
const R2 = '22222222-2222-4222-8222-222222222222';

function draft() {
  return {
    schemaVersion: 1,
    components: {
      cmp_a: { id: 'cmp_a', layer: 'logical', type: 'service', name: 'A', properties: {}, requirementIds: [R1] },
      cmp_old: { id: 'cmp_old', layer: 'logical', type: 'service', name: 'Sprint1', properties: {} },
    },
    relations: { rel_a: { id: 'rel_a', from: 'cmp_a', to: 'cmp_old', type: 'calls', requirementIds: [] } },
    views: [],
  };
}

describe('requirement links', () => {
  it('links and unlinks on components and relations without mutating input', () => {
    const model = draft();
    const linked = setRequirementLink(model, 'relations', 'rel_a', R2, true);
    assert.deepEqual(linked.relations.rel_a.requirementIds, [R2]);
    assert.deepEqual(model.relations.rel_a.requirementIds, []);
    const unlinked = setRequirementLink(linked, 'components', 'cmp_a', R1, false);
    assert.deepEqual(unlinked.components.cmp_a.requirementIds, []);
    assert.equal(unlinked.relations, linked.relations);
  });

  it('returns the same model for no-op, missing target or empty id', () => {
    const model = draft();
    assert.equal(setRequirementLink(model, 'components', 'cmp_a', R1, true), model);
    assert.equal(setRequirementLink(model, 'components', 'cmp_a', R2, false), model);
    assert.equal(setRequirementLink(model, 'components', 'cmp_x', R1, true), model);
    assert.equal(setRequirementLink(model, 'components', 'cmp_a', '', true), model);
  });

  it('adds to Sprint 1 components that have no requirementIds', () => {
    const next = setRequirementLink(draft(), 'components', 'cmp_old', R1, true);
    assert.deepEqual(next.components.cmp_old.requirementIds, [R1]);
  });

  it('removes only the refs reported by the save warning and keeps newer edits', () => {
    let model = setRequirementLink(draft(), 'components', 'cmp_a', R2, true);   // edit made during save
    model = { ...model, components: { ...model.components, cmp_a: { ...model.components.cmp_a, name: 'A2' } } };
    const cleaned = removeRequirementRefs(model, [
      { path: 'components.cmp_a.requirementIds', removedIds: [R1.toUpperCase()] },
      { path: 'views.0', removedIds: [R2] },
      { path: 'relations.rel_a.requirementIds' },
    ]);
    assert.deepEqual(cleaned.components.cmp_a.requirementIds, [R2]);
    assert.equal(cleaned.components.cmp_a.name, 'A2');
    assert.equal(removeRequirementRefs(model, [{ path: 'components.cmp_x.requirementIds', removedIds: [R1] }]), model);
  });
});
