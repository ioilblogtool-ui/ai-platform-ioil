// Sprint 6 Step 3 — 버전 요약·발행 오류 문구
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { layoutNote, publishError, summaryParts } from '../../lib/aa/version-format.ts';

const zero = {
  hashVersion: 1, componentsAdded: 0, componentsRemoved: 0, componentsModified: 0, requirementLinksChanged: 0,
  relationsAdded: 0, relationsRemoved: 0, relationsModified: 0, nodesReparented: 0, viewChanges: 0, layoutOnly: 0, requirementsChanged: 0,
};

describe('version-format', () => {
  it('summarizes the first version', () => {
    assert.deepEqual(summaryParts({ hashVersion: 1, first: true, components: 4, relations: 4 }), ['첫 버전 · 컴포넌트 4 · 관계 4']);
    assert.equal(layoutNote({ hashVersion: 1, first: true, components: 4, relations: 4 }), null);
  });

  it('lists only non-zero changes, layout separately', () => {
    const s = { ...zero, componentsAdded: 1, componentsModified: 2, relationsAdded: 1, requirementsChanged: 1, layoutOnly: 5 };
    assert.deepEqual(summaryParts(s), ['+ 컴포넌트 1', '~ 컴포넌트 수정 2', '+ 관계 1', '요구사항 변경 1']);
    assert.equal(layoutNote(s), '배치만 바뀐 노드 5개는 제외');
    assert.deepEqual(summaryParts(zero), []);
    assert.deepEqual(summaryParts(null), []);
  });

  it('maps publish errors and says when a new preview is needed', () => {
    for (const code of ['REVISION_CONFLICT', 'VERSION_CHANGED', 'PREVIEW_STALE', 'NO_CHANGES']) assert.equal(publishError(code, 'x').refresh, true, code);
    assert.deepEqual(publishError('LABEL_TAKEN', 'x'), { message: '이미 쓰인 라벨입니다. 다른 라벨을 입력하세요.', refresh: false });
    assert.deepEqual(publishError('HTTP_500', '서버 오류'), { message: '서버 오류', refresh: false });
  });
});
