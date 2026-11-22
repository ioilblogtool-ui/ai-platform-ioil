// 샘플 프로젝트 `sample-reports` (Sprint 4 Step 4 · D-27 · Q4).
// AI Platform 리포트 조회(Vercel → Railway → Supabase)를 비식별로 옮긴 Logical 설계와 개요.
// 실제 URL·키·IP·계정은 넣지 않는다. 요구사항 시드(NFR 2·FR 1)와 모델 연결은 Sprint 5 Step 5 (Q10).
// 배치안 2개(현재 · PaaS / 대안 · VM×2 + LB)와 배포 전략은 Sprint 7 Step 3 (Q8, P2-2·P2-3·P2-11).
const { emptyModel } = require('../empty-model');

const README = [
  '## 목적',
  '리포트 조회 기능의 구성 요소와 인증·데이터 경계를 한눈에 보고, 성능·가용성 관점의 검토 자료로 쓴다.',
  '',
  '## 범위',
  '- 웹 앱에서 월별 리포트를 조회하는 흐름 (Logical View)',
  '- 배치안 2개(현재 · PaaS, 대안 · VM×2 + LB)와 배포 전략은 Studio의 배치안 탭에서 본다',
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
  addDeploymentViews(m);
  for (const req of REQUIREMENTS) {
    const id = links[req.key];
    if (!id) continue;
    for (const cid of req.components ?? []) m.components[cid].requirementIds.push(id);
    for (const rid of req.relations ?? []) m.relations[rid].requirementIds.push(id);
  }
  return m;
}


const PAAS_STRATEGY = [
  '## 배포 경로',
  '- main 병합 → Vercel(frontend)·Railway(backend)가 자동으로 빌드·배포한다.',
  '- DB 스키마 변경은 Supabase SQL Editor에서 사람이 적용한다 (앱 배포보다 먼저, 하위 호환으로).',
  '',
  '## 환경과 승인',
  '- 운영 배포 승인: **서비스 오너(개발 리드)** — PR 리뷰 1명 승인 후 main 병합이 곧 운영 배포다.',
  '- 미리보기: Vercel Preview·Railway PR 환경에서 화면과 API를 먼저 확인한다.',
  '',
  '## 릴리스 방식과 이유',
  '- 플랫폼 기본 무중단 교체(롤링). 단일 인스턴스·트래픽이 작아 카나리는 두지 않는다.',
  '',
  '## 성공·중단 기준',
  '- 확인 항목: 로그인 → 월별 리포트 조회 200, Reports API p95 < 300ms(NFR-001), 5xx 비율 1% 미만을 **10분** 관찰.',
  '- 중단: 5xx 증가·로그인 실패·p95 초과가 10분 안에 보이면 바로 롤백.',
  '',
  '## 롤백과 DB 변경',
  '- 롤백 범위: **앱만** — Vercel·Railway를 직전 배포로 되돌린다. DB는 되돌리지 않는다.',
  '- 그래서 스키마 변경은 expand → 앱 배포 → contract 순서로 하위 호환을 지킨다.',
  '',
].join('\n');

const VM_STRATEGY = [
  '## 배포 경로',
  '- CI가 이미지(또는 빌드 산출물)를 만들고, vm-api-1 → vm-api-2 순서로 한 대씩 교체한다.',
  '',
  '## 환경과 승인',
  '- 운영 배포 승인: **서비스 오너** + 운영 담당 1명 (VM 접근 권한이 있는 사람).',
  '',
  '## 릴리스 방식과 이유',
  '- 롤링: LB에서 한 대를 빼고(drain) 교체 → 상태 확인 → 다시 넣는다. 두 대라 한 대씩만 바꾼다.',
  '',
  '## 성공·중단 기준',
  '- 확인 항목: 교체한 VM의 헬스 체크 통과, Reports API p95 < 300ms(NFR-001), 5xx 1% 미만을 대당 **5분** 관찰.',
  '- 중단: 첫 VM에서 기준을 못 넘으면 두 번째 VM은 건드리지 않는다.',
  '',
  '## 롤백과 DB 변경',
  '- 롤백 범위: 교체한 VM만 직전 버전으로, LB에 다시 넣는다. DB는 되돌리지 않는다 (expand → migrate → contract).',
  '',
].join('\n');

/** 배치안 2개 (Sprint 7 Q8). Logical 컴포넌트는 공유하고, 배치안마다 자기 deployment 컴포넌트를 갖는다 */
function addDeploymentViews(m) {
  const d = (id, type, name, technology, properties = {}) => ({
    id, type, layer: 'deployment', name, ...(technology ? { technology } : {}), properties, requirementIds: [], decisionIds: [],
  });
  const calls = (id, from, to, protocol) => ({ id, type: 'calls', from, to, protocol, mode: 'sync', requirementIds: [] });
  const realizes = (id, from, to) => ({ id, type: 'realizes', from, to, requirementIds: [] });
  Object.assign(m.components, {
    // 현재 · PaaS
    cmp_paas_ext: d('cmp_paas_ext', 'dep.zone', 'external', null, { trust: 'external' }),
    cmp_paas_int: d('cmp_paas_int', 'dep.zone', 'internal', null, { trust: 'internal' }),
    cmp_paas_data: d('cmp_paas_data', 'dep.zone', 'data', null, { trust: 'data' }),
    cmp_paas_vercel: d('cmp_paas_vercel', 'dep.platform', 'Vercel', null, { provider: 'Vercel' }),
    cmp_paas_railway: d('cmp_paas_railway', 'dep.platform', 'Railway', null, { provider: 'Railway' }),
    cmp_paas_frontend: d('cmp_paas_frontend', 'dep.process', 'frontend (next)', 'Next.js', { runtime: 'Node.js 24', instances: 1 }),
    cmp_paas_backend: d('cmp_paas_backend', 'dep.process', 'backend (node)', 'Express', { runtime: 'Node.js 24', startCommand: 'npm start', instances: 1 }),
    cmp_paas_db: d('cmp_paas_db', 'dep.managed_db', 'Supabase Postgres', null, { provider: 'Supabase', engine: 'PostgreSQL' }),
    cmp_paas_auth: d('cmp_paas_auth', 'dep.managed_auth', 'Supabase Auth', null, { provider: 'Supabase Auth' }),
    // 대안 · VM×2 + LB
    cmp_vm_int: d('cmp_vm_int', 'dep.zone', 'internal', null, { trust: 'internal' }),
    cmp_vm_data: d('cmp_vm_data', 'dep.zone', 'data', null, { trust: 'data' }),
    cmp_vm_lb: d('cmp_vm_lb', 'dep.lb', 'api-lb', 'nginx', { layer: 'L7' }),
    cmp_vm_1: d('cmp_vm_1', 'dep.vm', 'vm-api-1', null, { os: 'Ubuntu 24.04', count: 1 }),
    cmp_vm_2: d('cmp_vm_2', 'dep.vm', 'vm-api-2', null, { os: 'Ubuntu 24.04', count: 1 }),
    cmp_vm_api_1: d('cmp_vm_api_1', 'dep.process', 'api (node) · 1', 'Express', { runtime: 'Node.js 24', port: 4000, instances: 1 }),
    cmp_vm_api_2: d('cmp_vm_api_2', 'dep.process', 'api (node) · 2', 'Express', { runtime: 'Node.js 24', port: 4000, instances: 1 }),
    cmp_vm_db: d('cmp_vm_db', 'dep.managed_db', 'Supabase Postgres', null, { provider: 'Supabase', engine: 'PostgreSQL' }),
    cmp_vm_auth: d('cmp_vm_auth', 'dep.managed_auth', 'Supabase Auth', null, { provider: 'Supabase Auth' }),
  });
  Object.assign(m.relations, {
    rel_paas_fe_be: calls('rel_paas_fe_be', 'cmp_paas_frontend', 'cmp_paas_backend', 'HTTPS'),
    rel_paas_be_db: calls('rel_paas_be_db', 'cmp_paas_backend', 'cmp_paas_db', 'JDBC'),
    rel_vm_lb_1: calls('rel_vm_lb_1', 'cmp_vm_lb', 'cmp_vm_api_1', 'HTTP'),
    rel_vm_lb_2: calls('rel_vm_lb_2', 'cmp_vm_lb', 'cmp_vm_api_2', 'HTTP'),
    rel_rz_paas_fe: realizes('rel_rz_paas_fe', 'cmp_paas_frontend', 'cmp_web_app'),
    rel_rz_paas_be: realizes('rel_rz_paas_be', 'cmp_paas_backend', 'cmp_reports_api'),
    rel_rz_paas_db: realizes('rel_rz_paas_db', 'cmp_paas_db', 'cmp_reports_db'),
    rel_rz_paas_auth: realizes('rel_rz_paas_auth', 'cmp_paas_auth', 'cmp_auth'),
    rel_rz_vm_1: realizes('rel_rz_vm_1', 'cmp_vm_api_1', 'cmp_reports_api'),
    rel_rz_vm_2: realizes('rel_rz_vm_2', 'cmp_vm_api_2', 'cmp_reports_api'),
    rel_rz_vm_db: realizes('rel_rz_vm_db', 'cmp_vm_db', 'cmp_reports_db'),
    rel_rz_vm_auth: realizes('rel_rz_vm_auth', 'cmp_vm_auth', 'cmp_auth'),
  });
  const box = (id, componentId, x, y, width, height, parentId) => ({ id, kind: 'component', componentId, position: { x, y }, width, height, ...(parentId ? { parentId } : {}) });
  const node = (id, componentId, x, y, parentId) => ({ id, kind: 'component', componentId, position: { x, y }, ...(parentId ? { parentId } : {}) });
  m.views.push({
    id: 'view_dep_paas', kind: 'deployment', name: 'Deployment', variant: '현재 · PaaS', strategyMd: PAAS_STRATEGY,
    nodes: [
      box('nd_paas_ext', 'cmp_paas_ext', 0, 0, 220, 320),
      { id: 'nd_paas_browser', kind: 'note', text: 'Browser (사용자)', position: { x: 24, y: 120 }, parentId: 'nd_paas_ext' },
      box('nd_paas_int', 'cmp_paas_int', 260, 0, 600, 320),
      box('nd_paas_vercel', 'cmp_paas_vercel', 24, 48, 260, 150, 'nd_paas_int'),
      node('nd_paas_frontend', 'cmp_paas_frontend', 40, 60, 'nd_paas_vercel'),
      box('nd_paas_railway', 'cmp_paas_railway', 312, 48, 260, 150, 'nd_paas_int'),
      node('nd_paas_backend', 'cmp_paas_backend', 40, 60, 'nd_paas_railway'),
      box('nd_paas_data', 'cmp_paas_data', 900, 0, 260, 320),
      node('nd_paas_db', 'cmp_paas_db', 40, 60, 'nd_paas_data'),
      node('nd_paas_auth', 'cmp_paas_auth', 40, 180, 'nd_paas_data'),
    ],
    edges: [
      { id: 'ed_paas_fe_be', relationId: 'rel_paas_fe_be' },
      { id: 'ed_paas_be_db', relationId: 'rel_paas_be_db' },
    ],
  });
  m.views.push({
    id: 'view_dep_vm', kind: 'deployment', name: 'Deployment', variant: '대안 · VM×2 + LB', strategyMd: VM_STRATEGY,
    nodes: [
      box('nd_vm_int', 'cmp_vm_int', 0, 0, 660, 400),
      node('nd_vm_lb', 'cmp_vm_lb', 24, 170, 'nd_vm_int'),
      box('nd_vm_1', 'cmp_vm_1', 260, 40, 360, 150, 'nd_vm_int'),
      node('nd_vm_api_1', 'cmp_vm_api_1', 60, 56, 'nd_vm_1'),
      box('nd_vm_2', 'cmp_vm_2', 260, 220, 360, 150, 'nd_vm_int'),
      node('nd_vm_api_2', 'cmp_vm_api_2', 60, 56, 'nd_vm_2'),
      box('nd_vm_data', 'cmp_vm_data', 700, 0, 260, 400),
      node('nd_vm_db', 'cmp_vm_db', 40, 80, 'nd_vm_data'),
      node('nd_vm_auth', 'cmp_vm_auth', 40, 220, 'nd_vm_data'),
    ],
    edges: [
      { id: 'ed_vm_lb_1', relationId: 'rel_vm_lb_1' },
      { id: 'ed_vm_lb_2', relationId: 'rel_vm_lb_2' },
    ],
  });
}

module.exports = { key: 'sample-reports', defaultName: 'AI Platform Reports (샘플)', readmeMd: README, model, requirements: REQUIREMENTS };
