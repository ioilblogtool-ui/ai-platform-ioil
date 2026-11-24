const { emptyModel } = require('../empty-model');

const defaultName = 'TIDAMUNGU 조회 API (사례·합성)';
const readmeMd = [
  '**사례용 가정: 실제 환경 값이 아닌 합성 데이터**',
  '',
  '## VM → EKS 병행 전환',
  '',
  '기존 VM과 목표 EKS의 조회 API는 같은 Logical 조회 API를 구현한다. 병행 기간에는 두 경로가 모두 RDS를 조회한다고 가정한다. 정산 배치는 VM에 남는다.',
].join('\n');

function model() {
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

module.exports = { key: 'sample-migration', defaultName, readmeMd, model, requirements: [] };
