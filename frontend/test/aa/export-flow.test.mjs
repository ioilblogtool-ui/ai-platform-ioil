// Sprint 4 Step 5 — README 출력 직전 재확인 판단 (S4-9)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyScan, recheckDecision, ruleLabel } from '../../lib/aa/export-flow.ts';

const preview = { contentHash: 'h1', basis: { source: 'draft', revision: 3, readAt: 't' } };
const result = (hash, revision) => ({ filename: 'f', contentType: 'text/markdown', content: 'c', contentHash: hash, sections: {}, basis: { source: 'draft', revision, readAt: 't2' }, approxTokens: 1 });

describe('recheckDecision', () => {
  it('outputs only when hash and revision are unchanged', () => {
    assert.equal(recheckDecision(preview, { kind: 'ok', result: result('h1', 3) }).action, 'output');
    assert.equal(recheckDecision(preview, { kind: 'ok', result: result('h2', 3) }).action, 'refresh');   // 개요만 바뀜
    assert.equal(recheckDecision(preview, { kind: 'ok', result: result('h1', 4) }).action, 'refresh');   // revision만 바뀜
  });

  it('never outputs on a new warning, a block or an error', () => {
    const details = { issues: [], confirmable: true, scanId: 'scn_x' };
    assert.equal(recheckDecision(preview, { kind: 'warn', details }).action, 'warn');
    assert.equal(recheckDecision(preview, { kind: 'block', details: { ...details, confirmable: false, scanId: null } }).action, 'block');
    assert.equal(recheckDecision(preview, { kind: 'error', message: 'x' }).action, 'error');
  });
});

describe('classifyScan', () => {
  it('splits confirmable warnings from blocks and ignores unknown shapes', () => {
    assert.equal(classifyScan({ issues: [{ rule: 'email', path: 'line 3', sample: 'ops@****' }], confirmable: true, scanId: 'scn_a' }).kind, 'warn');
    assert.equal(classifyScan({ issues: [], confirmable: true, scanId: null }).kind, 'block', 'no scanId → cannot confirm');
    assert.equal(classifyScan({ issues: [], confirmable: false, scanId: null }).kind, 'block');
    assert.equal(classifyScan([{ rule: 'V12' }]), null);
    assert.equal(classifyScan(null), null);
    assert.equal(ruleLabel('email'), '이메일');
    assert.equal(ruleLabel('unknown'), 'unknown');
  });
});
