// Sprint 6 Step 5 — 리뷰 기준·이전 기준 표시 (REV-M6, Q13·Q16)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requirementsRecordNote, staleNote, targetLabel } from '../../lib/aa/review-basis.ts';

describe('review-basis', () => {
  it('labels version and Draft bases, with unlinked marker', () => {
    const v = { target: { type: 'version', versionId: 'x', label: 'v1.0' }, current: { type: 'version', id: 'y', label: 'v1.1' }, staleBasis: true, bundleLinked: true };
    assert.equal(targetLabel(v), 'v1.0 기준');
    assert.equal(staleNote(v), '현재 v1.1');
    const d = { target: { type: 'draft', revision: 3 }, current: { type: 'draft', revision: 7 }, staleBasis: true, bundleLinked: false };
    assert.equal(targetLabel(d), '번들 미연결 · Draft rev 3 기준');
    assert.equal(staleNote(d), '현재 rev 7');
    assert.equal(staleNote({ ...d, staleBasis: false }), null);
  });

  it('explains where publish-time requirements live', () => {
    assert.match(requirementsRecordNote({ requirementsRecord: 'version' }), /발행 기록/);
    assert.match(requirementsRecordNote({ requirementsRecord: 'bundle' }), /보낸 검토 자료/);
    assert.match(requirementsRecordNote({ requirementsRecord: 'none' }), /기록이 없습니다/);
  });
});
