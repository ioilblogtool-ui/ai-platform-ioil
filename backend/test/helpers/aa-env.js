// AA Workbench 테스트 환경 (D-39: 기존 Supabase + 테스트 사용자 2명).
// 반드시 app.js보다 먼저 require 한다 — lib/supabase.js가 로드 시점에 SUPABASE_URL을 읽는다.
//
// 안전장치
//  1. 테스트 사용자 A·B의 ID가 없거나 같으면 DB 테스트 전체를 건너뛴다 (dbSkipReason).
//  2. 테스트는 A·B 두 사용자로만 동작한다 (실제 로그인 토큰 사용).
//  3. 테스트가 만드는 프로젝트 이름은 TEST_PREFIX로 시작하고, 각 파일이 after()에서 직접 지운다.
//  4. DB 직접 접근은 aaDb()로만 하고, aa_ 접두사가 아닌 테이블이면 즉시 실패한다.
const E = process.env;

const REQUIRED = [
  'AA_TEST_SUPABASE_URL', 'AA_TEST_SUPABASE_SERVICE_KEY', 'AA_TEST_SUPABASE_ANON_KEY',
  'AA_TEST_USER_A_ID', 'AA_TEST_USER_B_ID', 'AA_TEST_USER_A_EMAIL', 'AA_TEST_USER_A_PASSWORD',
];
const missing = REQUIRED.filter((k) => !E[k]);

let dbSkipReason = false;
if (missing.length) dbSkipReason = `AA 테스트 설정 없음 (backend/.env.test.local): ${missing.join(', ')}`;
else if (E.AA_TEST_USER_A_ID === E.AA_TEST_USER_B_ID) dbSkipReason = '테스트 사용자 A와 B가 같습니다.';

if (!dbSkipReason) {
  // 앱(lib/supabase.js)이 테스트 설정의 Supabase를 쓰도록 연결
  E.SUPABASE_URL = E.AA_TEST_SUPABASE_URL;
  E.SUPABASE_SERVICE_KEY = E.AA_TEST_SUPABASE_SERVICE_KEY;
} else {
  // DB 없이도 app.js를 불러올 수 있게 더미 값 (DB 테스트는 skip되므로 실제 호출 없음)
  E.SUPABASE_URL = E.SUPABASE_URL || 'http://127.0.0.1:9';
  E.SUPABASE_SERVICE_KEY = E.SUPABASE_SERVICE_KEY || 'test-placeholder';
}

const TEST_PREFIX = '[aa-test]';
const USER_A = E.AA_TEST_USER_A_ID;
const USER_B = E.AA_TEST_USER_B_ID;

let _supabaseJs;
const supabaseJs = () => (_supabaseJs ||= require('@supabase/supabase-js'));

// 서비스 키 클라이언트 — aa_ 테이블만 허용
function aaDb() {
  const client = supabaseJs().createClient(E.AA_TEST_SUPABASE_URL, E.AA_TEST_SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  return {
    from(table) {
      if (!String(table).startsWith('aa_')) throw new Error(`테스트는 aa_ 테이블만 접근할 수 있습니다: ${table}`);
      return client.from(table);
    },
    rpc(fn, args) {
      if (!String(fn).startsWith('aa_')) throw new Error(`테스트는 aa_ 함수만 호출할 수 있습니다: ${fn}`);
      return client.rpc(fn, args);
    },
    auth: client.auth,
  };
}

function anonClient() {
  return supabaseJs().createClient(E.AA_TEST_SUPABASE_URL, E.AA_TEST_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
}

// 실제 로그인 토큰: A는 비밀번호, B는 관리자 매직링크(이메일 발송 없음) → verifyOtp
let _tokens;
async function getTokens() {
  if (_tokens) return _tokens;
  const a = anonClient();
  const la = await a.auth.signInWithPassword({ email: E.AA_TEST_USER_A_EMAIL, password: E.AA_TEST_USER_A_PASSWORD });
  if (la.error) throw new Error('테스트 사용자 A 로그인 실패: ' + la.error.message);

  const admin = aaDb();
  const { data: bUser, error: bErr } = await admin.auth.admin.getUserById(USER_B);
  if (bErr) throw new Error('테스트 사용자 B 조회 실패: ' + bErr.message);
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: bUser.user.email });
  if (linkErr) throw new Error('테스트 사용자 B 링크 생성 실패: ' + linkErr.message);
  const b = anonClient();
  const vb = await b.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
  if (vb.error) throw new Error('테스트 사용자 B 세션 생성 실패: ' + vb.error.message);

  _tokens = { A: la.data.session.access_token, B: vb.data.session.access_token, clients: { A: a, B: b } };
  return _tokens;
}

// 이 파일이 만든 프로젝트만 지운다 (A·B 소유 + TEST_PREFIX 이름 + 지정한 id)
async function deleteProjects(ids) {
  if (!ids.length) return;
  const { error } = await aaDb().from('aa_projects').delete()
    .in('id', ids).in('user_id', [USER_A, USER_B]).like('name', `${TEST_PREFIX}%`);
  if (error) throw error;
}

module.exports = { dbSkipReason, TEST_PREFIX, USER_A, USER_B, aaDb, anonClient, getTokens, deleteProjects };
