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
  flows?: Record<string, ApiFlow>;         // Sprint 8 (API Flow, D-25)
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
  // Sprint 8 (REL-05·06, D-26): calls 운영·보안 속성 — 값 칸 없음(유형만)
  timeoutMs?: number;
  retry?: { max: number; backoff: RetryBackoff };
  onFailure?: OnFailure;
  credential?: Credential;
  dataClass?: DataClass;
  requirementIds: string[];
}
/** API Flow (Sprint 8 · 03 ApiFlow · D-25). 본문 participant id = componentId */
export interface ApiFlow {
  id: string;                                   // 'flw_' + 영숫자 10
  name: string;
  endpoint?: { method: HttpMethod; path: string };
  description?: string;
  participantIds: string[];                     // Logical 컴포넌트, 순서 = participant 순서
  outcomes: FlowOutcome[];
  requirementIds: string[];
  auth?: { tokenIssuer?: string; tokenVerifier?: string; dataAccessor?: string };
  mermaid: string;
}
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export interface FlowOutcome { id: string; kind: 'success' | 'failure'; label: string; cause?: OutcomeCause }
export type OutcomeCause = 'auth' | 'validation' | 'timeout' | 'dependency_down' | 'queue_retry' | 'other';
export type RetryBackoff = 'none' | 'fixed' | 'exponential';
export type OnFailure = 'propagate' | 'fallback' | 'queue_retry' | 'ignore';
export type Credential = 'none' | 'session-cookie' | 'jwt-bearer' | 'api-key' | 'service-role' | 'mtls';
export type DataClass = 'public' | 'internal' | 'personal' | 'sensitive';

/** View — 표현 계층 ('view_…') */
export interface View {
  id: string;
  kind: ViewKind;
  name: string;
  nodes: ViewNode[];
  edges: ViewEdge[];
  viewport?: { x: number; y: number; zoom: number };
  variant?: string;             // deployment 배치안 이름 (Sprint 7: 필수 1~60자)
  strategyMd?: string;          // deployment 배포 전략 Markdown (Sprint 7, 64KB)
}

export interface ViewNode {
  id: string;                   // 'nd_…' (React Flow node id)
  componentId?: string;
  kind: NodeKind;
  parentId?: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  label?: string;               // group 전용 (≤120자)
  text?: string;                // note 전용 (1~2,000자)
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
  baseVersion: null | VersionRef;
  updatedAt: string;
  /** V9·V11 경고 (Sprint 7: V11은 조회할 때마다 다시 계산) */
  warnings?: ValidationIssue[];
}

// ── 버전 (Sprint 6) ──
export interface VersionRef { id: string; label: string; versionNo: number }
/** 발행 때 저장한 변경 요약 (03 §4). 첫 버전은 first: true */
export type DiffSummary =
  | { hashVersion: number; first: true; components: number; relations: number }
  | {
      hashVersion: number; first?: false;
      componentsAdded: number; componentsRemoved: number; componentsModified: number; requirementLinksChanged: number;
      relationsAdded: number; relationsRemoved: number; relationsModified: number;
      nodesReparented: number; viewChanges: number; layoutOnly: number; requirementsChanged: number;
      /** Sprint 8: API Flow (이전 버전에는 없음 — 0으로 읽는다) */
      flowsAdded?: number; flowsRemoved?: number; flowsModified?: number;
      /** Sprint 7: 같은 배치안의 배포 전략 변경·삭제 (이전 버전에는 없음) */
      strategiesChanged?: number;
    };
export interface VersionListItem { id: string; versionNo: number; label: string; note: string | null; diffSummary: DiffSummary | null; sourceRevision: number; createdAt: string }
export interface VersionRequirement {
  id: string; code: string; kind: string; category: string | null; title: string; target: string | null; metric: string | null; priority: string;
  current?: { title: string; target: string | null; metric: string | null; priority: string };
  deleted?: true;
}
export interface VersionDetail extends VersionListItem { model: ArchitectureModel; readmeMd: string; requirements: VersionRequirement[] }
export interface PublishPreview {
  revision: number;
  latestVersion: VersionRef | null;
  suggestedLabel: string;
  summary: DiffSummary;
  noChanges: boolean;
  layoutOnly: number;
  snapshotHash: string;
}
export type FieldChange = { path: string; before: unknown; after: unknown };
/** GET /architecture/compare 의 변경 한 건 (Sprint 7 Step 4) */
export type CompareChange =
  | { kind: 'component.added' | 'component.removed'; componentId: string; name: string; type: string; viewIds: string[] }
  | { kind: 'component.modified'; componentId: string; name: string; type: string; fields: FieldChange[]; viewIds: string[] }
  | { kind: 'component.requirements'; componentId: string; name: string; added: string[]; removed: string[]; viewIds: string[] }
  | { kind: 'relation.added' | 'relation.removed'; relationId: string; relationType: string; from: string; to: string; fromId: string; toId: string; protocol: string | null }
  | { kind: 'relation.modified'; relationId: string; relationType: string; from: string; to: string; fromId: string; toId: string; fields: FieldChange[]; security?: true }
  | { kind: 'relation.requirements'; relationId: string; relationType: string; from: string; to: string; fromId: string; toId: string; added: string[]; removed: string[] }
  | { kind: 'view.added' | 'view.removed'; viewId: string; viewKind: string; variant: string }
  | { kind: 'view.renamed'; viewId: string; viewKind: string; before: string; after: string }
  | { kind: 'view.strategy'; viewId: string; variant: string; change: 'added' | 'modified' | 'removed' }
  | { kind: 'view.node.added' | 'view.node.removed' | 'layout.moved' | 'layout.resized'; viewId: string; nodeId: string; name: string }
  | { kind: 'view.node.reparented'; viewId: string; nodeId: string; name: string; before: string | null; after: string | null }
  | { kind: 'requirement.snapshot_changed'; code: string; change: 'added' | 'modified' | 'removed'; fields: FieldChange[] }
  // Sprint 8: API Flow
  | { kind: 'flow.added' | 'flow.removed'; flowId: string; name: string; endpoint: string | null }
  | { kind: 'flow.modified'; flowId: string; name: string; fields: FieldChange[] }
  | { kind: 'flow.requirements'; flowId: string; name: string; added: string[]; removed: string[] }
  | { kind: 'flow.mermaid'; flowId: string; name: string };
export interface CompareViewMeta { id: string; kind: string; name: string; variant: string | null }
export interface CompareResult {
  from: { type: 'version'; id: string; label: string; versionNo: number; createdAt: string };
  to: { type: 'version'; id: string; label: string; versionNo: number; createdAt: string } | { type: 'draft'; revision: number; updatedAt: string };
  includeLayout: boolean;
  summary: DiffSummary;
  changes: CompareChange[];
  views: { from: CompareViewMeta[]; to: CompareViewMeta[] };
}
export interface PublishRequest { label?: string; note?: string; baseRevision: number; expectedLatestVersionId: string | null; snapshotHash: string }

export interface ValidationIssue {
  rule: string;
  path: string;
  message: string;
  /** V9 경고: 현재 프로젝트에서 찾지 못해 저장 시 제외한 요구사항 ID */
  removedIds?: string[];
  /** V11 경고(Sprint 7): 배치안의 Process 위치 */
  code?: string;
  viewId?: string;
  nodeId?: string;
}

export interface SaveDraftResult {
  revision: number;
  updatedAt: string;
  warnings: ValidationIssue[];
}

export type PropertyType = 'string' | 'text' | 'number' | 'boolean' | 'enum' | 'list';

/** 타입 레지스트리 속성 정의 (backend/lib/aa/type-registry.json) */
export interface PropertyDef {
  key: string;
  label: string;
  type: PropertyType;
  default?: unknown;
  options?: string[];
  min?: number;
  max?: number;
  integer?: boolean;
  pattern?: string;
  placeholder?: string;
}

export interface TypeDef {
  label: string; category: string; layer: ComponentLayer; icon: string;
  nodeKind: NodeKind; views: ViewKind[]; aliases?: string[]; properties: PropertyDef[];
  /** Sprint 7: 자식을 담는 컴포넌트 (배치안의 환경·구역·플랫폼·VM) */
  container?: boolean;
  /** Sprint 7: realizes 관계의 시작(구현체)이 될 수 있음 */
  realizes?: boolean;
}

export interface TypeRegistry {
  version: number;
  categories: { key: string; label: string }[];
  propertyTypes?: PropertyType[];
  types: Record<string, TypeDef>;
}

// ── 내보내기 기준 (Sprint 6 Step 4) ──
/** README는 latest(최신 발행본, 없으면 Draft)를 쓸 수 있고, Ask AI·Mermaid는 draft·version만 */
export type ExportSource = { type: 'draft' } | { type: 'latest' } | { type: 'version'; versionId: string };
export type ExportBasis =
  | { source: 'draft'; revision: number; readAt: string }
  | { source: 'version'; versionId: string; label: string; versionNo: number; publishedAt: string; readAt: string };

// ── README.md 내보내기 (Sprint 4 Step 5) ──
export type ReadmeSections = { overview: boolean; logicalDiagram: boolean; nfr: boolean; deployment: boolean; deployStrategy: boolean; /** Sprint 8: 고른 흐름 id */ apiFlows?: string[] };
export interface ReadmeExportRequest {
  format: 'readme-md';
  source?: ExportSource;
  sections?: Partial<ReadmeSections>;
  acknowledgedScan?: string | null;
}
export interface ReadmeExportResult {
  filename: string;
  contentType: string;
  content: string;
  contentHash: string;
  sections: ReadmeSections;
  basis: ExportBasis;
  approxTokens: number;
  acknowledgedWarnings?: number;
}
// ── Ask AI 번들 (Sprint 5 Step 1) ──
export type AskAiFormat = 'ai-md' | 'ai-json' | 'mermaid';
export type AskAiTemplate = 'design-review' | 'failure-scenarios' | 'adr-draft' | 'nfr-validation' | 'cost-estimate' | 'explain' | 'custom';
export type AskAiScope =
  | { type: 'project' }
  | { type: 'view'; viewId: 'view_logical' }
  | { type: 'components'; componentIds: string[] }
  | { type: 'requirement'; requirementId: string }
  | { type: 'flow'; flowId: string };
export interface AskAiExportRequest {
  format: AskAiFormat;
  source?: { type: 'draft' } | { type: 'version'; versionId: string };
  scope?: AskAiScope;
  template?: AskAiTemplate;
  question?: string;
  noteIds?: [];
  acknowledgedScan?: string | null;
}
export interface AskAiExportResult {
  filename: string;
  contentType: string;
  content: string;
  contentHash: string;
  basis: ExportBasis;
  approxTokens: number;
  bundleId?: string;
  scopeLabel?: string;
  template?: AskAiTemplate;
  omitted?: { components: number };
  counts?: { components: number; relations: number };
  acknowledgedWarnings?: number;
}

// ── 외부 AI 수동 리뷰 (Sprint 5 Step 3) ──
/** 답변 붙여넣기에 넘기는 번들 (복사한 것 그대로) */
export interface ReviewBundle {
  bundleId: string;
  format: 'ai-md' | 'ai-json';
  /** Draft 기준(Sprint 5 저장분은 source 없이 revision만) 또는 버전 기준 (Sprint 6) */
  basis: { source?: 'draft'; revision: number } | { source: 'version'; versionId: string; label: string };
  scopeLabel: string;
  scope: AskAiScope;
  template: AskAiTemplate;
  question: string;
  bundleMd: string;
}
export interface ReviewListItem {
  id: string;
  mode: 'manual' | 'api';
  source: string;
  tools: string[];
  /** 원래 기준 — 바뀌지 않는다 */
  target: { type: 'draft'; revision: number } | { type: 'version'; versionId: string; label: string | null };
  /** 지금 기준: 버전 리뷰는 최신 발행본, Draft 리뷰는 현재 revision (Sprint 6 REV-M6) */
  current: { type: 'draft'; revision: number | null } | { type: 'version'; id: string; label: string };
  /** 당시 요구사항 기록: 버전 스냅샷 / 보낸 번들 원문 / 없음 (Sprint 6 Q16) */
  requirementsRecord: 'version' | 'bundle' | 'none';
  bundleLinked: boolean;
  bundleId: string | null;
  format: 'ai-md' | 'ai-json' | null;
  scopeLabel: string | null;
  template: AskAiTemplate | null;
  question: string | null;
  status: string;
  answerCount: number;
  staleBasis: boolean;
  createdAt: string;
  finishedAt: string | null;
}
export interface ReviewAnswer { id: string; tool: string; answerMd: string; followUpOf: string | null; followUpQuestion: string | null; createdAt: string }
export interface ReviewDetail extends ReviewListItem { bundleMd: string | null; answers: ReviewAnswer[] }

/** 422 SENSITIVE_DATA_DETECTED의 details */
export interface SensitiveScanDetails {
  issues: { rule: string; path: string; sample: string }[];
  confirmable: boolean;
  scanId: string | null;
}

export type RequirementKind = 'fr' | 'nfr';
export type RequirementStatus = 'active' | 'deprecated';
export type RequirementPriority = 'must' | 'should' | 'could';
export type RequirementCategory =
  | 'availability' | 'performance' | 'scalability' | 'security' | 'operability' | 'cost' | 'other';

export interface Requirement {
  id: string;
  code: string;
  kind: RequirementKind;
  title: string;
  category: RequirementCategory | null;
  description: string | null;
  target: string | null;
  metric: string | null;
  priority: RequirementPriority;
  status: RequirementStatus;
  sortOrder: number;
  /** Sprint 8 (REQ-06): NFR 측정 기준. 없으면 {} */
  measurement?: RequirementMeasurement;
}
export interface RequirementMeasurement { flowId?: string; endpoint?: string; environment?: string; load?: string; method?: string }

export type RequirementUpdate = Partial<Omit<Requirement, 'id' | 'code' | 'kind'>>;
export type RequirementCreate = RequirementUpdate & Pick<Requirement, 'kind' | 'title'>;
export interface ListRequirementsParams {
  kind?: RequirementKind;
  category?: RequirementCategory;
  status?: RequirementStatus;
  limit?: number;
  offset?: number;
}

export interface ListProjectsParams {
  status?: ProjectStatus;
  q?: string;
  limit?: number;
  offset?: number;
}
