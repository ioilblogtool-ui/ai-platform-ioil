// Sprint 8 Step 4 — Requirement Trace 계산 (TRC-01·02, S8-5)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { computeTrace } from '../../lib/aa/trace.ts';

const require = createRequire(import.meta.url);
const sample = require('../../../backend/lib/aa/templates/sample-reports.js');
const R1 = '11111111-1111-4111-8111-111111111111';
const R2 = '22222222-2222-4222-8222-222222222222';
const R3 = '33333333-3333-4333-8333-333333333333';
const model = () => sample.model({ nfr_latency: R1, nfr_db_availability: R2, fr_monthly_report: R3 });
const measurement = { flowId: 'flw_reportlist', endpoint: 'GET /api/my-ai/reports', environment: 'staging', load: '동시 20명 · 5분', method: 'k6 http_req_duration p95' };

describe('computeTrace', () => {
  it('NFR-001: components, the flow as both linked and measured, no gaps', () => {
    const t = computeTrace({ id: R1, kind: 'nfr', measurement }, model());
    assert.deepEqual(t.components.map((c) => c.name), ['Reports API']);
    assert.ok(t.components[0].nodeId, 'node id for Studio focus');
    assert.deepEqual(t.flows.map((f) => [f.name, f.linked, f.measured]), [['리포트 목록 조회', true, true]]);
    assert.deepEqual(t.gaps, []);
  });

  it('NFR-002: no flow and no measurement are gaps', () => {
    const t = computeTrace({ id: R2, kind: 'nfr', measurement: {} }, model());
    assert.deepEqual(t.gaps, ['no-flow', 'no-measurement']);
  });

  it('flow only as measurement target shows its source; dangling target is a gap and keeps conditions', () => {
    const m = model();
    m.flows.flw_reportlist.requirementIds = [];
    const t = computeTrace({ id: R1, kind: 'nfr', measurement }, m);
    assert.deepEqual(t.flows.map((f) => [f.linked, f.measured]), [[false, true]]);
    delete m.flows.flw_reportlist;
    const gone = computeTrace({ id: R1, kind: 'nfr', measurement }, m);
    assert.equal(gone.measurementFlowMissing, true);
    assert.deepEqual(gone.gaps, ['no-flow', 'measurement-flow-missing']);
    assert.equal(gone.measurement.environment, 'staging');
  });

  it('FR: relations count as design links; flow/measurement are not required', () => {
    const t = computeTrace({ id: R3, kind: 'fr' }, model());
    assert.deepEqual(t.relations.map((r) => `${r.from} → ${r.to}`), ['Web App → Reports API']);
    assert.deepEqual(t.gaps, []);
    const lonely = computeTrace({ id: '44444444-4444-4444-8444-444444444444', kind: 'fr' }, model());
    assert.deepEqual(lonely.gaps, ['no-component']);
  });
});
