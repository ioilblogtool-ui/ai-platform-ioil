// Sprint 7 Q5 — 저장된 버전의 model_hash가 지금 model-canon으로 다시 계산해도 같은가 (운영과 같은 DB)
// 같아야 hashVersion 1을 유지한다. 다르면 이 테스트가 실패하고 hashVersion을 올려야 한다.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { dbSkipReason, aaDb, USER_A, USER_B } = require('../helpers/aa-api');
const { modelHash } = require('../../lib/aa/model-canon');

describe('stored version hashes', { skip: dbSkipReason }, () => {
  it('recomputes every stored version hash of the test users byte-for-byte', async () => {
    const { data, error } = await aaDb().from('aa_architecture_versions')
      .select('id, label, model, model_hash, diff_summary').in('user_id', [USER_A, USER_B]).limit(500);
    assert.ifError(error);
    for (const v of data) {
      assert.equal(v.diff_summary?.hashVersion ?? 1, 1, v.label);
      assert.equal(modelHash(v.model), v.model_hash, `${v.label} (${v.id})`);
    }
    console.log(`checked ${data.length} stored versions`);
  });
});
