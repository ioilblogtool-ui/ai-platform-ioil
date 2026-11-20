// AA Workbench 도메인 타입 (docs/aa-workbench/03_data-model.md §2.1과 1:1)
// Phase 2 이후 필드는 optional로 미리 둔다.

export const MODEL_SCHEMA_VERSION = 1;

export type ViewKind = 'logical' | 'deployment' | 'kubernetes' | 'aws' | 'apiflow';
export type ComponentLayer = 'logical' | 'deployment' | 'kubernetes' | 'aws' | 'general';
export type RelationType = 'calls' | 'realizes' | 'depends_on';
export type NodeKind = 'component' | 'group' | 'note';
export type Protocol = 'HTTP' | 'HTTPS' | 'gRPC' | 'TCP' | 'AMQP' | 'Kafka' | 'JDBC' | 'RESP' | 'Other';

export interface ArchitectureModel {
  schemaVersion: number;
  components: Record<string, Component>;   // key = componentId
  relations: Record<string, Relation>;     // key = relationId
  views: View[];
  flows?: Record<string, unknown>;         // Phase 2 (API Flow)
}

/** 도메인 엔티티 — 버전 안에서 유일 ('cmp_…') */
export interface Component {
  id: string;
  type: string;                 // 타입 레지스트리 key
  layer: ComponentLayer;
  name: string;
  technology?: string;
  description?: string;         // Markdown (NOTE-01)
  properties: Record<string, unknown>;
  custom?: Record<string, string>;
  requirementIds: string[];
  decisionIds: string[];
  tags?: string[];
}

/** 컴포넌트 간 관계 ('rel_…') */
export interface Relation {
  id: string;
  type: RelationType;
  from: string;                 // componentId
  to: string;                   // componentId
  protocol?: Protocol;
  mode?: 'sync' | 'async';
  label?: string;
  requirementIds: string[];
}

/** View — 표현 계층 ('view_…') */
export interface View {
  id: string;
  kind: ViewKind;
  name: string;
  nodes: ViewNode[];
  edges: ViewEdge[];
  viewport?: { x: number; y: number; zoom: number };
  variant?: string;             // deployment 배치안 이름 (Phase 2)
}

export interface ViewNode {
  id: string;                   // 'nd_…' (React Flow node id)
  componentId?: string;
  kind: NodeKind;
  parentId?: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  text?: string;                // note 전용
}

export interface ViewEdge {
  id: string;                   // 'ed_…' (React Flow edge id)
  relationId: string;
  sourceHandle?: string;
  targetHandle?: string;
}

// ── API 응답 타입 ─────────────────────────────────────────
export type ProjectStatus = 'active' | 'archived';

export interface AaProject {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  readmeMd: string;
  createdAt: string;
  updatedAt: string;
}

export interface AaProjectSummary extends AaProject {
  latestVersion: null | { id: string; label: string; createdAt: string };
  draftRevision: number | null;
  draftUpdatedAt: string | null;
  openFindings: { high: number; medium: number; low: number };
}

export interface AaProjectDetail extends AaProject {
  counts: {
    fr: number; nfr: number; versions: number; openFindings: number;
    validations: { total: number; passed: number }; decisions: number;
  };
}

export interface DraftResponse {
  model: ArchitectureModel;
  revision: number;
  baseVersion: null | { id: string; label: string };
  updatedAt: string;
}

export interface ValidationIssue {
  rule: string;
  path: string;
  message: string;
}

export interface SaveDraftResult {
  revision: number;
  updatedAt: string;
  warnings: ValidationIssue[];
}

export interface TypeRegistry {
  version: number;
  categories: { key: string; label: string }[];
  types: Record<string, {
    label: string; category: string; layer: ComponentLayer; icon: string;
    nodeKind: NodeKind; views: ViewKind[]; properties: unknown[];
  }>;
}

export interface ListProjectsParams {
  status?: ProjectStatus;
  q?: string;
  limit?: number;
  offset?: number;
}
