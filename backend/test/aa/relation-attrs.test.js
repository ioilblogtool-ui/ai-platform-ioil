// Sprint 8 Step 1 — calls 운영·보안 속성 (REL-05·06, D-26, S8-1)
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const sample = require('../../lib/aa/templates/sample-reports');
const { validateModel } = require('../../lib/aa/architecture-validator');
const { modelHash } = require('../../lib/aa/model-canon');
const { diffModels, summarize, hasSemanticChanges } = require('../../lib/aa/graph-diff');

const base = () => sample.model();
const errorsOf = (m) => validateModel(m).errors.map((e) => `${e.rule}:${e.path}`);

describe('V2: calls 운영·보안 속성', () => {
  it('accepts the sample attributes and retry max 0', () => {
    const m = base();
    m.relations.rel_web_api.retry = { max: 0, backoff: 'none' };
    assert.deepEqual(validateModel(m).errors, []);
    assert.deepEqual(m.relations.rel_api_db.retry, { max: 1, backoff: 'fixed' });
  });

  for (const [name, change, path] of [
    ['timeout 0', (m) => { m.relations.rel_web_api.timeoutMs = 0; }, 'relations.rel_web_api.timeoutMs'],
    ['timeout over 600000', (m) => { m.relations.rel_web_api.timeoutMs = 600001; }, 'relations.rel_web_api.timeoutMs'],
    ['timeout not integer', (m) => { m.relations.rel_web_api.timeoutMs = 1.5; }, 'relations.rel_web_api.timeoutMs'],
    ['retry 11', (m) => { m.relations.rel_web_api.retry = { max: 11, backoff: 'fixed' }; }, 'relations.rel_web_api.retry'],
    ['retry without backoff', (m) => { m.relations.rel_web_api.retry = { max: 1 }; }, 'relations.rel_web_api.retry'],
    ['retry extra key', (m) => { m.relations.rel_web_api.retry = { max: 1, backoff: 'fixed', jitter: true }; }, 'relations.rel_web_api.retry'],
    ['unknown onFailure', (m) => { m.relations.rel_web_api.onFailure = 'crash'; }, 'relations.rel_web_api.onFailure'],
    ['unknown credential', (m) => { m.relations.rel_web_api.credential = 'password'; }, 'relations.rel_web_api.credential'],
    ['unknown dataClass', (m) => { m.relations.rel_web_api.dataClass = 'secret'; }, 'relations.rel_web_api.dataClass'],
    ['realizes with credential', (m) => { m.relations.rel_rz_paas_be.credential = 'jwt-bearer'; }, 'relations.rel_rz_paas_be.credential'],
    ['realizes with timeout', (m) => { m.relations.rel_rz_paas_be.timeoutMs = 1000; }, 'relations.rel_rz_paas_be.timeoutMs'],
  ]) {
    it(`rejects ${name}`, () => {
      const m = base();
      change(m);
      assert.ok(errorsOf(m).includes(`V2:${path}`), JSON.stringify(validateModel(m).errors));
    });
  }

  it('rejects attributes on depends_on', () => {
    const m = base();
    m.relations.rel_dep = { id: 'rel_dep', type: 'depends_on', from: 'cmp_reports_api', to: 'cmp_reports_db', requirementIds: [], dataClass: 'personal' };
    assert.ok(errorsOf(m).includes('V2:relations.rel_dep.dataClass'));
  });
});

describe('의미 해시·Diff', () => {
  it('keeps the hash of models without the new fields (Sprint 7 fixture)', () => {
    const fixture = require('../fixtures/sprint6-model.json');
    assert.equal(modelHash(fixture), 'f3f0e7a7e8ba9ae95de93a3ba80aa81e541dda0b7957a75a116fc2a7333589d5');
  });

  it('lists attribute changes as relation.modified fields and flags security changes', () => {
    const a = base();
    const b = structuredClone(a);
    b.relations.rel_web_api.timeoutMs = 5000;
    delete b.relations.rel_api_db.retry;
    b.relations.rel_api_auth.credential = 'mtls';
    const changes = diffModels({ model: a, snapshot: {} }, { model: b, snapshot: {} }).changes;
    const byId = Object.fromEntries(changes.map((c) => [c.relationId, c]));
    assert.deepEqual(byId.rel_web_api.fields, [{ path: 'timeoutMs', before: 3000, after: 5000 }]);
    assert.equal(byId.rel_web_api.security, undefined);
    assert.deepEqual(byId.rel_api_db.fields, [{ path: 'retry', before: { max: 1, backoff: 'fixed' }, after: null }]);
    assert.equal(byId.rel_api_auth.security, true);
    const s = summarize({ model: a, snapshot: {} }, { model: b, snapshot: {} });
    assert.equal(s.relationsModified, 3);
    assert.ok(hasSemanticChanges(s));
  });
});
