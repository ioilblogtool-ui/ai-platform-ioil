// 안전망: 테스트가 중간에 실패해 남은 데이터를 지운다.
// 대상: 테스트 사용자 A·B 소유 + 이름이 "[aa-test]"(또는 샘플 시드 실패 표시 "[샘플 생성 실패] [aa-test]")로 시작하는 aa_projects (Draft·요구사항은 cascade)
// 실행: npm run test:aa:cleanup
const { dbSkipReason, aaDb, USER_A, USER_B, TEST_PREFIX } = require('../helpers/aa-env');
const { FAILED_PREFIX } = require('../../lib/aa/sample-project');

(async () => {
  if (dbSkipReason) { console.log('건너뜀:', dbSkipReason); return; }
  const { data, error } = await aaDb().from('aa_projects')
    .delete()
    .in('user_id', [USER_A, USER_B])
    .or(`name.like.${TEST_PREFIX}%,name.like.${FAILED_PREFIX}${TEST_PREFIX}%`)
    .select('id');
  if (error) throw error;
  console.log(`테스트 프로젝트 ${data.length}건 삭제`);
})().catch((e) => { console.error('정리 실패:', e.message); process.exitCode = 1; });
