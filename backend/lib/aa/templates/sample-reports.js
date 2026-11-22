// 샘플 프로젝트 `sample-reports` (Sprint 4 Step 4 · D-27 · Q4).
// AI Platform 리포트 조회(Vercel → Railway → Supabase)를 비식별로 옮긴 Logical 설계와 개요.
// 실제 URL·키·IP·계정은 넣지 않는다. 요구사항 시드(NFR 2·FR 1)와 모델 연결은 Sprint 5 Step 5 (Q10).
const { emptyModel } = require('../empty-model');

const README = [
  '## 목적',
  '리포트 조회 기능의 구성 요소와 인증·데이터 경계를 한눈에 보고, 성능·가용성 관점의 검토 자료로 쓴다.',
  '',
  '## 범위',
  '- 웹 앱에서 월별 리포트를 조회하는 흐름 (Logical View)',
  '- 배치·배포 구성(PaaS, VM×2 + LB 대안)은 Deployment View가 생긴 뒤 추가한다',
  '',
  '## 가정',
  '- 사용자는 로그인 후 자기 리포트만 본다',
  '- Reports API는 토큰을 검증한 뒤 DB를 조회한다',
  '- 트래픽은 업무 시간에 몰린다',
  '',
  '## 링크',
  '- (운영 주소·계정은 넣지 않는다)',
  '',
].join('\n');

// 시드 요구사항 (Sprint 5 Q10). 코드는 생성 시 aa_next_code로 받는다 — 새 프로젝트라 NFR-001·NFR-002·FR-001.
const REQUIREMENTS = Object.freeze([
  {
    key: 'nfr_latency', kind: 'nfr', category: 'performance', priority: 'must',
    title: '리포트 조회 응답 시간', target: 'p95 < 300ms', metric: '업무 시간대 Reports API 응답 시간 p95',
    description: '월별 리포트 조회 API는 업무 시간대 부하에서도 p95 300ms 안에 응답한다.',
    components: ['cmp_reports_api'],
  },
  {
    key: 'nfr_db_availability', kind: 'nfr', category: 'availability', priority: 'should',
    title: '리포트 DB 가용성', target: '월 99.9%', metric: '월간 DB 접속 가능 시간 비율',
    description: 'Reports DB 장애가 리포트 조회 중단으로 이어지는 시간을 월 43분 이내로 줄인다.',
    components: ['cmp_reports_db'],
  },
  {
    key: 'fr_monthly_report', kind: 'fr', category: null, priority: 'must',
    title: '월별 리포트 조회', target: null, metric: null,
    description: '로그인한 사용자는 자기 월별 리포트만 조회한다.',
    components: ['cmp_web_app', 'cmp_reports_api'], relations: ['rel_web_api'],
  },
]);

/** links: { [요구사항 key]: 요구사항 UUID } — 없으면 연결 없는 모델 (Sprint 4와 같음) */
function model(links = {}) {
  const m = emptyModel();
  const c = (id, type, name, technology, properties = {}) => ({
    id, type, layer: 'logical', name, technology, properties, requirementIds: [], decisionIds: [],
  });
  m.components = {
    cmp_web_app: c('cmp_web_app', 'client', 'Web App', 'Next.js', { channel: 'web' }),
    cmp_reports_api: c('cmp_reports_api', 'service', 'Reports API', 'Node.js / Express', { runtime: 'Node.js 24', stateless: true }),
    cmp_reports_db: c('cmp_reports_db', 'database', 'Reports DB', 'PostgreSQL', { engine: 'postgres' }),
    cmp_auth: c('cmp_auth', 'external', 'Auth', 'Supabase Auth'),
  };
  const r = (id, from, to, protocol, label) => ({
    id, type: 'calls', from, to, protocol, mode: 'sync', requirementIds: [], ...(label ? { label } : {}),
  });
  m.relations = {
    rel_web_api: r('rel_web_api', 'cmp_web_app', 'cmp_reports_api', 'HTTPS'),
    rel_api_db: r('rel_api_db', 'cmp_reports_api', 'cmp_reports_db', 'JDBC'),
    rel_web_auth: r('rel_web_auth', 'cmp_web_app', 'cmp_auth', 'HTTPS', '로그인·토큰 발급'),
    rel_api_auth: r('rel_api_auth', 'cmp_reports_api', 'cmp_auth', 'HTTPS', '토큰 검증'),
  };
  m.views[0].nodes = [
    { id: 'nd_backend', kind: 'group', label: 'Backend', position: { x: 320, y: 48 }, width: 528, height: 192 },
    { id: 'nd_web_app', kind: 'component', componentId: 'cmp_web_app', position: { x: 48, y: 112 } },
    { id: 'nd_reports_api', kind: 'component', componentId: 'cmp_reports_api', parentId: 'nd_backend', position: { x: 32, y: 64 } },
    { id: 'nd_reports_db', kind: 'component', componentId: 'cmp_reports_db', parentId: 'nd_backend', position: { x: 320, y: 64 } },
    { id: 'nd_auth', kind: 'component', componentId: 'cmp_auth', position: { x: 352, y: 320 } },
  ];
  m.views[0].edges = Object.keys(m.relations).map((relationId) => ({ id: `ed_${relationId.slice(4)}`, relationId }));
  for (const req of REQUIREMENTS) {
    const id = links[req.key];
    if (!id) continue;
    for (const cid of req.components ?? []) m.components[cid].requirementIds.push(id);
    for (const rid of req.relations ?? []) m.relations[rid].requirementIds.push(id);
  }
  return m;
}

module.exports = { key: 'sample-reports', defaultName: 'AI Platform Reports (샘플)', readmeMd: README, model, requirements: REQUIREMENTS };
