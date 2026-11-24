import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { parsePropertyInput, updateComponentProperty, updateComponentText, updateCustomProperty, updateRelationField } from '../../lib/aa/model-ops.ts';
import { toFlow } from '../../lib/aa/graph-mapper.ts';

const require = createRequire(import.meta.url);
const { REGISTRY, validateModel } = require('../../../backend/lib/aa/architecture-validator.js');

function draft() {
  const component = (id) => ({ id, layer: 'logical', type: 'service', name: id, properties: {} });
  return {
    schemaVersion: 1,
    components: { cmp_a: component('cmp_a'), cmp_b: component('cmp_b') },
    relations: { rel_a: { id: 'rel_a', from: 'cmp_a', to: 'cmp_b', type: 'calls', protocol: 'HTTP', mode: 'sync' } },
    views: [{
      id: 'view_logical', kind: 'logical', name: 'Logical',
      nodes: ['a', 'b'].map((id, i) => ({ id: `nd_${id}`, kind: 'component', componentId: `cmp_${id}`, position: { x: i * 240, y: 0 } })),
      edges: [{ id: 'ed_a', relationId: 'rel_a' }],
    }],
  };
}

describe('Inspector model edits', () => {
  it('keeps untouched Sprint 1 properties and saves false and zero', () => {
    const original = draft();
    assert.equal(updateComponentProperty(original, REGISTRY, 'cmp_a', 'stateless', ''), original);
    const withBoolean = updateComponentProperty(original, REGISTRY, 'cmp_a', 'stateless', 'false');
    const edited = updateComponentProperty(withBoolean, REGISTRY, 'cmp_a', 'replicas', '0');
    assert.deepEqual(original.components.cmp_a.properties, {});
    assert.deepEqual(edited.components.cmp_a.properties, { stateless: false, replicas: 0 });
    assert.deepEqual(validateModel(edited).errors, []);
    const cleared = updateComponentProperty(edited, REGISTRY, 'cmp_a', 'replicas', '');
    assert.deepEqual(cleared.components.cmp_a.properties, { stateless: false });
  });

  it('rejects invalid numbers, enums, formats and lists', () => {
    const model = draft();
    for (const value of ['0', '65536', '3.2', 'x']) assert.equal(updateComponentProperty(model, REGISTRY, 'cmp_a', 'port', value), model);
    assert.ok(parsePropertyInput({ type: 'enum', options: ['one'] }, 'two').error);
    assert.ok(parsePropertyInput({ type: 'string', pattern: '^ok$' }, 'invalid').error);
    assert.ok(parsePropertyInput({ type: 'list' }, 'a'.repeat(201)).error);
    assert.deepEqual(parsePropertyInput({ type: 'list' }, 'first\r\nsecond'), { value: ['first', 'second'] });
  });

  it('maps component name, Markdown and changed relationship to the model and graph', () => {
    const initial = draft();
    assert.equal(updateComponentText(initial, 'cmp_a', 'name', ''), initial);
    assert.equal(updateComponentText(initial, 'cmp_a', 'description', '가'.repeat(5500)), initial);
    assert.equal(updateRelationField(initial, 'rel_a', 'mode', 'bad'), initial);
    const renamed = updateComponentText(initial, 'cmp_a', 'name', 'Reports API');
    const markdown = updateComponentText(renamed, 'cmp_a', 'description', '**보고서** 설명');
    const asyncModel = updateRelationField(markdown, 'rel_a', 'mode', 'async');
    const kafkaModel = updateRelationField(asyncModel, 'rel_a', 'protocol', 'Kafka');
    const edited = updateRelationField(kafkaModel, 'rel_a', 'label', 'report.ready');
    assert.equal(updateRelationField(edited, 'rel_a', 'label', 'report.ready'), edited);
    assert.equal(edited.components.cmp_a.description, '**보고서** 설명');
    const graph = toFlow(edited, 'view_logical');
    assert.equal(graph.nodes.find((node) => node.id === 'nd_a').data.name, 'Reports API');
    const { relation, ...edgeData } = graph.edges[0].data;
    assert.deepEqual(edgeData, { relationId: 'rel_a', protocol: 'Kafka', mode: 'async', label: 'report.ready', layer: 'api' });   // Sprint 11: 레이어
    assert.equal(relation.id, 'rel_a');
    assert.deepEqual(validateModel(edited).errors, []);
  });

  it('rejects registry collisions and preserves legacy values until explicitly renamed', () => {
    const initial = draft();
    assert.equal(updateCustomProperty(initial, REGISTRY, 'cmp_a', undefined, 'port', 'abc'), initial);
    initial.components.cmp_a.custom = { port: 'legacy' };
    assert.equal(updateCustomProperty(initial, REGISTRY, 'cmp_a', 'port', 'port', 'new'), initial);
    assert.equal(validateModel(initial).errors[0].rule, 'V6');
    const renamed = updateCustomProperty(initial, REGISTRY, 'cmp_a', 'port', 'legacyPort', 'legacy');
    assert.deepEqual(initial.components.cmp_a.custom, { port: 'legacy' });
    assert.deepEqual(renamed.components.cmp_a.custom, { legacyPort: 'legacy' });
    assert.deepEqual(validateModel(renamed).errors, []);
  });

  it('keeps an existing long description when editing an unrelated field', () => {
    const initial = draft();
    const existingDescription = '가'.repeat(5500);
    initial.components.cmp_a.description = existingDescription;
    const edited = updateComponentText(initial, 'cmp_a', 'name', 'Updated name');
    assert.equal(edited.components.cmp_a.description, existingDescription);
    assert.deepEqual(validateModel(edited).errors, []);
  });

  it('rejects secret-shaped custom keys without echoing them in errors', () => {
    const initial = draft();
    const syntheticKey = 'sk-' + 'x'.repeat(24);
    initial.components.cmp_a.custom = { [syntheticKey]: syntheticKey };
    const errors = validateModel(initial).errors;
    assert.ok(errors.some((error) => error.rule === 'V12' && error.path === 'components.cmp_a.custom'));
    assert.ok(!JSON.stringify(errors).includes(syntheticKey));
  });
});
