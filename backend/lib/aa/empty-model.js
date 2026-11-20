// 새 프로젝트의 빈 아키텍처 모델 (03 §2.1, schemaVersion 1)
function emptyModel() {
  return {
    schemaVersion: 1,
    components: {},
    relations: {},
    views: [{ id: 'view_logical', kind: 'logical', name: 'Logical', nodes: [], edges: [] }],
    flows: {},
  };
}

// 새 프로젝트 개요(README) 템플릿 (RDM-01)
const README_TEMPLATE = '## 목적\n\n## 범위\n\n## 가정\n\n## 링크\n';

module.exports = { emptyModel, README_TEMPLATE };
