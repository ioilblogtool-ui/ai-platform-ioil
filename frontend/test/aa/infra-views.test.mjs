// Sprint 11 Step 1 (Sprint 10 이월): AWS·K8s View 모델 연산과 EKS ↔ K8s clusterRef 수명주기 (Sprint 10 Q1·Q4)
// 결과 모델은 백엔드 validator(V5·V6·V13·V15)로도 검증한다.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  addInfrastructureView, duplicateAwsView, eksPlacements, removeAwsView, removeKubernetesView, removeNodes,
  renameDeploymentView, repairClusterRefs, setClusterRef,
} from '../../lib/aa/model-ops.ts';

const require = createRequire(import.meta.url);
const { validateModel } = require('../../../backend/lib/aa/architecture-validator.js');
const sample = require('../../../backend/lib/aa/templates/sample-migration.js');

const AWS = 'view_aws_migration';
const K8S = 'view_k8s_migration';
const EKS = 'cmp_eks';

function idGen() {
  let n = 0;
  return (prefix) => `${prefix}_${String(++n).padStart(10, '0')}`;
}
const view = (m, id) => m.views.find((v) => v.id === id);
const ok = (m) => {
  const r = validateModel(m);
  assert.deepEqual(r.errors, [], JSON.stringify(r.errors));
};
const eksNode = (m) => view(m, AWS).nodes.find((n) => n.componentId === EKS);

describe('AWS·K8s View 추가·이름 변경', () => {
  it('AWS View는 최대 3개, id 접두사 view_aws_, name 고정 AWS', () => {
    const newId = idGen();
    let m = sample.baseModel();
    for (const name of ['대안 A', '대안 B']) {
      const r = addInfrastructureView(m, 'aws', name, newId);
      assert.equal(r.error, undefined);
      assert.match(r.viewId, /^view_aws_/);
      assert.equal(view(r.model, r.viewId).name, 'AWS');
      m = r.model;
    }
    const over = addInfrastructureView(m, 'aws', '대안 C', newId);
    assert.equal(over.viewId, null);
    assert.match(over.error, /최대 3/);
    ok(m);
  });

  it('K8s View는 최대 5개, 같은 종류 안에서 이름 중복 불가, 미지정 clusterRef 허용', () => {
    const newId = idGen();
    let m = sample.baseModel();
    const dup = addInfrastructureView(m, 'kubernetes', 'tidamungu-prod', newId);
    assert.ok(dup.error, '같은 이름은 거부');
    for (const name of ['k2', 'k3', 'k4', 'k5']) m = addInfrastructureView(m, 'kubernetes', name, newId).model;
    assert.equal(m.views.filter((v) => v.kind === 'kubernetes').length, 5);
    assert.match(addInfrastructureView(m, 'kubernetes', 'k6', newId).error, /최대 5/);
    assert.equal(view(m, m.views.at(-1).id).clusterRef, undefined);
    ok(m);
  });

  it('이름 변경은 같은 종류 안에서만 중복을 본다', () => {
    const m = sample.baseModel();
    assert.equal(renameDeploymentView(m, AWS, '현재 · VM').error, undefined, 'deployment와 같은 이름은 허용');
    const r = renameDeploymentView(m, K8S, 'eks-prod-workloads');
    assert.equal(view(r.model, K8S).variant, 'eks-prod-workloads');
    ok(r.model);
  });
});

describe('EKS ↔ K8s clusterRef 수명주기 (Sprint 10 Q4)', () => {
  it('EKS 컴포넌트 삭제는 K8s View 연결만 해제하고 워크로드를 보존한다', () => {
    const m = sample.baseModel();
    const before = view(m, K8S).nodes.length;
    const next = removeNodes(m, AWS, [eksNode(m).id], { deleteComponents: true });
    assert.equal(next.components[EKS], undefined);
    assert.equal(view(next, K8S).clusterRef, undefined);
    assert.equal(view(next, K8S).nodes.length, before);
    assert.equal(view(m, K8S).clusterRef, EKS, '입력 모델은 바뀌지 않는다');
    ok(next);
  });

  it('EKS "노드만 제거"는 하지 않는다 (입력 모델 그대로)', () => {
    const m = sample.baseModel();
    assert.equal(removeNodes(m, AWS, [eksNode(m).id], { deleteComponents: false }), m);
  });

  it('EKS를 가진 AWS 배치안 삭제도 연결을 해제하고 K8s·Logical·VM 배치를 보존한다', () => {
    const m = sample.baseModel();
    const next = removeAwsView(m, AWS);
    assert.equal(view(next, AWS), undefined);
    assert.equal(next.components[EKS], undefined);
    assert.equal(view(next, K8S).clusterRef, undefined);
    assert.equal(view(next, K8S).nodes.length, view(m, K8S).nodes.length);
    assert.ok(view(next, 'view_dep_migration'));
    assert.equal(view(next, 'view_logical').nodes.length, view(m, 'view_logical').nodes.length);
    ok(next);
  });

  it('AWS 배치안 복제: 복제본 EKS는 새 id·미연결, 원본 연결 유지, K8s View는 복사하지 않음', () => {
    const m = sample.baseModel();
    const r = duplicateAwsView(m, AWS, '목표 · EKS 복제', idGen());
    assert.equal(r.error, undefined);
    const copy = view(r.model, r.viewId);
    const copyEks = copy.nodes.map((n) => r.model.components[n.componentId]).find((c) => c?.type === 'aws.eks');
    assert.ok(copyEks && copyEks.id !== EKS);
    assert.equal(view(r.model, K8S).clusterRef, EKS);
    assert.equal(r.model.views.filter((v) => v.kind === 'kubernetes').length, 1);
    assert.equal(r.model.views.filter((v) => v.clusterRef === copyEks.id).length, 0);
    assert.equal(eksPlacements(r.model).length, 2);
    ok(r.model);
  });

  it('K8s View 삭제는 Logical·AWS·VM 배치를 보존한다', () => {
    const m = sample.baseModel();
    const next = removeKubernetesView(m, K8S);
    assert.equal(view(next, K8S), undefined);
    assert.ok(next.components[EKS]);
    assert.equal(view(next, 'view_logical').nodes.length, view(m, 'view_logical').nodes.length);
    ok(next);
  });

  it('setClusterRef: 한 EKS에 K8s View 하나, 해제는 언제나 가능', () => {
    const newId = idGen();
    let m = addInfrastructureView(sample.baseModel(), 'kubernetes', 'second', newId).model;
    const second = m.views.at(-1).id;
    assert.equal(setClusterRef(m, second, EKS), m, '이미 다른 View가 쓰는 EKS는 거부');
    m = setClusterRef(m, K8S);
    assert.equal(view(m, K8S).clusterRef, undefined);
    m = setClusterRef(m, second, EKS);
    assert.equal(view(m, second).clusterRef, EKS);
    ok(m);
  });

  it('repairClusterRefs: 끊긴 연결만 해제한다 (Draft 복구)', () => {
    const m = sample.baseModel();
    assert.equal(repairClusterRefs(m).detached, 0);
    const broken = structuredClone(m);
    view(broken, AWS).nodes = view(broken, AWS).nodes.filter((n) => n.componentId !== EKS);
    const { model, detached } = repairClusterRefs(broken);
    assert.equal(detached, 1);
    assert.equal(view(model, K8S).clusterRef, undefined);
    assert.equal(view(model, K8S).nodes.length, view(m, K8S).nodes.length);
  });
});
