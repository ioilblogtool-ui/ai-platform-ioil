const { emptyModel } = require('../empty-model');

const defaultName = 'TIDAMUNGU 조회 API (사례·합성)';
const readmeMd = [
  '**사례용 가정: 실제 환경 값이 아닌 합성 데이터**',
  '',
  '## VM → EKS 병행 전환',
  '',
  '기존 VM과 목표 EKS의 조회 API는 같은 Logical 조회 API를 구현한다. 병행 기간에는 두 경로가 모두 RDS를 조회한다고 가정한다. 정산 배치는 VM에 남는다.',
  '',
  '## 운영 설계 (사례용 가정)',
  '',
  '- 판단 지표: 조회 API p95 < 300ms(NFR-001). Prometheus가 수집하고, p95 > 300ms가 5분 이어지면 on-call에게 알린다.',
  '- 로그·트레이스: Collector에서 이메일·토큰을 가리고 14일 보존한 뒤 Datadog으로 보낸다.',
  '- 배포 경로: CI → Registry → 배포 Git → Argo CD(prod는 수동 승인). 목표 · EKS 배치안의 구조화 전략에 canary 단계·중단 기준·롤백·VM 복귀를 적었다.',
].join('\n');

// Sprint 11 (Q10): 새로 만드는 샘플에만 NFR-001을 시드한다. 모든 값은 사례용 가정
const REQUIREMENTS = Object.freeze([
  {
    key: 'nfr_query_latency', kind: 'nfr', category: 'performance', priority: 'must',
    title: '조회 API 응답 시간 (사례용 가정)', target: 'p95 < 300ms', metric: '업무 시간대 조회 API 응답 시간 p95',
    description: '사례용 가정: 목표 EKS의 조회 API는 업무 시간대 부하에서 p95 300ms 안에 응답한다.',
  },
]);

/** Sprint 10까지의 샘플(VM·AWS·K8s). 운영 설계·전략·요구사항 연결 없음 — 기존 테스트의 기준 모델 */
function baseModel() {
  const m = emptyModel();
  const logical = m.views[0];
  const vm = { id: 'view_dep_migration', name: 'Deployment', kind: 'deployment', variant: '현재 · VM', nodes: [], edges: [] };
  const aws = { id: 'view_aws_migration', name: 'AWS', kind: 'aws', variant: '목표 · EKS', nodes: [], edges: [] };
  const k8s = { id: 'view_k8s_migration', name: 'Kubernetes', kind: 'kubernetes', variant: 'tidamungu-prod', clusterRef: 'cmp_eks', nodes: [], edges: [] };
  m.views.push(vm, aws, k8s);

  function add(view, key, type, name, x, y, { parent, size, properties = {} } = {}) {
    const id = `cmp_${key}`;
    m.components[id] = { id, type, layer: view.kind, name, properties, requirementIds: [], decisionIds: [] };
    view.nodes.push({
      id: `nd_${key}`, kind: 'component', componentId: id, position: { x, y },
      ...(parent ? { parentId: `nd_${parent}` } : {}),
      ...(size ? { width: size[0], height: size[1] } : {}),
    });
  }
  function connect(from, to, { view, type = 'calls', label } = {}) {
    const id = `rel_${from}_${to}`;
    m.relations[id] = { id, from: `cmp_${from}`, to: `cmp_${to}`, type, requirementIds: [], ...(label ? { label } : {}) };
    if (view) view.edges.push({ id: `ed_${from}_${to}`, relationId: id });
  }

  add(logical, 'client', 'client', 'Web Client', 0, 100);
  add(logical, 'query', 'service', '조회 API', 260, 100);
  add(logical, 'db', 'database', '조회 DB', 540, 100);
  add(logical, 'settle', 'worker', '정산 배치', 260, 280);
  connect('client', 'query', { view: logical });
  connect('query', 'db', { view: logical });
  connect('settle', 'db', { view: logical });

  add(vm, 'vm_lb', 'dep.lb', '기존 LB', 0, 125);
  for (let index = 1; index <= 2; index++) {
    add(vm, `vm_${index}`, 'dep.vm', `VM ${index}`, 250, 200 * (index - 1), { size: [330, 160] });
    add(vm, `vm_query_${index}`, 'dep.process', '조회 API', 45, 60, { parent: `vm_${index}`, properties: { instances: 1 } });
    connect('vm_lb', `vm_query_${index}`, { view: vm });
    connect(`vm_query_${index}`, 'query', { type: 'realizes' });
  }
  add(vm, 'vm_batch', 'dep.vm', '정산 VM', 620, 200, { size: [330, 160] });
  add(vm, 'vm_settle', 'dep.process', '정산 배치', 45, 60, { parent: 'vm_batch', properties: { instances: 1 } });
  connect('vm_settle', 'settle', { type: 'realizes' });

  add(aws, 'region', 'aws.region', '서울 리전', 0, 0, { size: [1080, 790], properties: { region: 'ap-northeast-2' } });
  add(aws, 'vpc', 'aws.vpc', '목표 VPC', 24, 44, { parent: 'region', size: [1030, 720], properties: { cidr: '10.0.0.0/16' } });
  for (const [index, suffix] of ['a', 'c'].entries()) {
    add(aws, `az_${suffix}`, 'aws.az', `AZ ${suffix}`, 24 + index * 510, 48, { parent: 'vpc', size: [470, 635], properties: { zone: `ap-northeast-2${suffix}` } });
    for (const [row, tier] of ['public', 'private-app', 'private-data'].entries()) {
      add(aws, `subnet_${suffix}_${row}`, 'aws.subnet', tier, 20, 48 + row * 188, {
        parent: `az_${suffix}`, size: [430, 160], properties: { tier, cidr: `10.0.${index * 10 + row}.0/24` },
      });
    }
  }
  add(aws, 'alb', 'aws.alb', '조회 ALB', 420, 130, { parent: 'vpc', properties: { scheme: 'internet-facing' } });
  add(aws, 'eks', 'aws.eks', '목표 EKS', 420, 318, { parent: 'vpc', properties: { nodeGroups: 2 } });
  add(aws, 'rds', 'aws.rds', '공유 조회 RDS', 65, 55, { parent: 'subnet_c_2', properties: { engine: 'PostgreSQL', multiAz: true } });
  connect('alb', 'eks', { view: aws });
  connect('eks', 'rds', { view: aws });
  connect('rds', 'db', { type: 'realizes' });

  add(k8s, 'namespace', 'k8s.namespace', 'tidamungu', 0, 0, { size: [840, 390] });
  add(k8s, 'ingress', 'k8s.ingress', '조회 Ingress', 30, 90, { parent: 'namespace', properties: { host: 'query.example', path: '/' } });
  add(k8s, 'service', 'k8s.service', '조회 Service', 295, 90, { parent: 'namespace', properties: { type: 'ClusterIP', port: 80, targetPort: 8080 } });
  add(k8s, 'workload', 'k8s.deployment', 'query-api', 570, 90, { parent: 'namespace', properties: {
    replicas: 3, image: 'registry.example/query-api:1.0.0', readinessPath: '/healthz', livenessPath: '/healthz', containerPort: 8080,
  } });
  add(k8s, 'hpa', 'k8s.hpa', '조회 HPA', 295, 265, { parent: 'namespace', properties: { min: 3, max: 10, targetCPU: 70 } });
  connect('ingress', 'service', { view: k8s });
  connect('service', 'workload', { view: k8s, type: 'depends_on', label: 'selects' });
  connect('hpa', 'workload', { view: k8s, type: 'depends_on', label: 'scales' });
  connect('workload', 'query', { type: 'realizes' });
  return m;
}

/**
 * Sprint 11 (Q10): 운영 설계 배치안 + 목표 AWS 배치안의 구조화 전략 + NFR-001 연결.
 * links: { [요구사항 key]: UUID } — 없으면 요구사항 연결만 빠진 같은 모델
 */
function model(links = {}) {
  const m = baseModel();
  const nfr = links.nfr_query_latency ? [links.nfr_query_latency] : [];
  const ops = { id: 'view_dep_ops', name: 'Deployment', kind: 'deployment', variant: '운영 설계 · 관측·배포', nodes: [], edges: [] };
  m.views.splice(2, 0, ops);   // 현재 · VM 다음

  const comp = (key, type, name, x, y, properties = {}, requirementIds = []) => {
    const id = `cmp_${key}`;
    m.components[id] = { id, type, layer: 'ops', name, properties, requirementIds, decisionIds: [] };
    ops.nodes.push({ id: `nd_ops_${key}`, kind: 'component', componentId: id, position: { x, y } });
  };
  const link = (key, type, from, to) => {
    const id = `rel_ops_${key}`;
    m.relations[id] = { id, type, from, to, requirementIds: [] };
    ops.edges.push({ id: `ed_ops_${key}`, relationId: id });
  };

  // 조회 API는 Logical 컴포넌트의 참조 노드 (Sprint 11 Step 3 결정: 운영 설계 배치안에만 허용)
  ops.nodes.push({ id: 'nd_ops_query', kind: 'component', componentId: 'cmp_query', position: { x: 380, y: 220 } });

  comp('prom', 'ops.metrics', 'Prometheus', 80, 60, { scrapeInterval: '30s', target: '/metrics', metrics: ['http_request_duration_seconds', 'http_requests_total'] });
  comp('alert', 'ops.alerting', 'p95 지연 알림', 80, 220, {
    expr: 'histogram_quantile(0.95, http_request_duration_seconds) > 0.3', threshold: '300ms', for: '5m', channel: 'pagerduty', receiverRole: 'on-call',
  }, nfr);
  comp('collector', 'ops.collector', 'Collector', 680, 60, { maskingAt: 'collector', maskFields: ['email', 'token'], retentionDays: 14, sampleRate: 0.1 });
  comp('datadog', 'ops.telemetry', 'Datadog', 960, 60, { provider: 'Datadog', retentionDays: 14 });
  comp('ci', 'ops.ci', 'CI', 80, 420, { provider: 'GitHub Actions', stages: ['test', 'build', 'push'] });
  comp('registry', 'ops.registry', '이미지 Registry', 380, 420, { provider: 'ECR', tagRule: 'git sha, digest 고정' });
  comp('config', 'ops.config_repo', '배포 Git', 680, 420, { repo: 'deploy-config', path: 'apps/query-api' });
  comp('argo', 'ops.gitops', 'Argo CD', 680, 220, {
    provider: 'Argo CD', stagingSync: 'auto', prodSync: 'manual', approvalRole: 'owner', healthCheck: '/healthz, Rollout Healthy', rollbackRule: '배포 후 10분 오류율 > 2%',
  });

  link('scrape', 'scrapes', 'cmp_prom', 'cmp_query');
  link('alert', 'alerts_to', 'cmp_prom', 'cmp_alert');
  link('logs', 'ships_logs', 'cmp_query', 'cmp_collector');
  link('traces', 'exports_traces', 'cmp_collector', 'cmp_datadog');
  link('build', 'builds', 'cmp_ci', 'cmp_registry');
  link('push', 'pushes', 'cmp_ci', 'cmp_config');
  link('sync', 'syncs', 'cmp_argo', 'cmp_query');

  m.views.find((v) => v.id === 'view_aws_migration').strategy = {
    environments: [{ name: 'staging', promotion: 'same-image' }, { name: 'prod', approvalRole: 'owner', promotion: 'same-image' }],
    release: { type: 'canary', canary: { steps: [{ weight: 10, pauseMin: 10 }, { weight: 50, pauseMin: 10 }, { weight: 100, pauseMin: 0 }] } },
    gates: [
      { name: '오류율 (사례용 가정)', metric: '5xx 비율', threshold: '≤ 1%', observeMin: 10, requirementIds: [] },
      { name: '응답 시간 (사례용 가정)', metric: '조회 API p95', threshold: '< 300ms', observeMin: 10, requirementIds: nfr },
    ],
    rollback: { method: 'previous-image', targetMin: 10, trigger: '게이트 하나라도 실패 (사례용 가정)' },
    fallback: {
      targetViewId: 'view_dep_migration', trigger: '오류율 > 2%가 10분 지속 (사례용 가정)', switchMethod: 'lb-weight',
      ownerRole: 'on-call', targetMin: 15, dbCondition: 'DB는 RDS 공유 — 스키마 expand만 (사례용 가정)',
    },
    dbChange: { policy: 'expand-contract', note: 'RDS를 VM과 공유하므로 expand만 먼저 배포 (사례용 가정)' },
  };
  return m;
}

module.exports = { key: 'sample-migration', defaultName, readmeMd, model, baseModel, requirements: REQUIREMENTS };
