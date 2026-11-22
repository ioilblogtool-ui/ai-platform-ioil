// AA Workbench API 클라이언트 (의존성 주입형).
// 브라우저 기본 인스턴스는 architecture-api.ts에서 만든다. 이 파일은 런타임 import가 없어 Node에서도 테스트 가능.
//
// 기존 lib/api.ts의 apiFetch는 오류를 `error` 문자열로만 던지므로,
// AA는 { status, code, details }를 보존하는 전용 래퍼를 쓴다 (409 충돌 처리에 currentRevision 필요).
import type {
  AaProject, AaProjectDetail, AaProjectSummary, ArchitectureModel, DiffSummary, DraftResponse,
  PublishPreview, PublishRequest, VersionDetail, VersionListItem,
  AskAiExportRequest, AskAiExportResult, ListProjectsParams, ListRequirementsParams, ProjectStatus, ReadmeExportRequest, ReadmeExportResult,
  Requirement, RequirementCreate, ReviewBundle, ReviewDetail, ReviewListItem,
  RequirementUpdate, SaveDraftResult, TypeRegistry, ValidationIssue,
} from './architecture-types';

export class AaApiError extends Error {
  status: number;
  code: string;
  details: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AaApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** 409 REVISION_CONFLICT — 다른 탭/기기가 먼저 저장함. 덮어쓰려면 currentRevision을 baseRevision으로 다시 저장 */
export class RevisionConflictError extends AaApiError {
  currentRevision: number;
  serverUpdatedAt: string | null;
  constructor(message: string, currentRevision: number, serverUpdatedAt: string | null) {
    super(409, 'REVISION_CONFLICT', message, { currentRevision, updatedAt: serverUpdatedAt });
    this.name = 'RevisionConflictError';
    this.currentRevision = currentRevision;
    this.serverUpdatedAt = serverUpdatedAt;
  }
}

export interface AaClientDeps {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  buildQuery: (params?: Record<string, unknown>) => string;   // lib/api.ts의 buildQuery (CLAUDE.md 규칙)
  fetchImpl?: typeof fetch;
}

export function createAaClient(deps: AaClientDeps) {
  const doFetch = deps.fetchImpl ?? fetch;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await deps.getToken();
    let res: Response;
    try {
      res = await doFetch(`${deps.baseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init.headers || {}),
        },
      });
    } catch (e) {
      throw new AaApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다.', { cause: String(e) });
    }

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let body: any = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = null; }
    }

    if (!res.ok) {
      const code: string = body?.code || (res.status === 401 ? 'UNAUTHORIZED' : 'HTTP_' + res.status);
      const message: string = body?.error || '요청에 실패했습니다.';
      if (res.status === 409 && code === 'REVISION_CONFLICT') {
        throw new RevisionConflictError(message, Number(body?.details?.currentRevision), body?.details?.updatedAt ?? null);
      }
      throw new AaApiError(res.status, code, message, body?.details);
    }
    return body as T;
  }

  const json = (method: string, payload?: unknown): RequestInit =>
    ({ method, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const p = (id: string) => `/api/aa/projects/${encodeURIComponent(id)}`;

  return {
    // ── 프로젝트 ──
    listProjects(params?: ListProjectsParams) {
      return request<{ data: AaProjectSummary[]; total: number }>(`/api/aa/projects${deps.buildQuery(params as Record<string, unknown>)}`);
    },
    async createProject(input: { name: string; description?: string; readmeMd?: string; template?: 'empty' | 'sample-reports' }) {
      return (await request<{ data: AaProject & { draftRevision: number } }>('/api/aa/projects', json('POST', input))).data;
    },
    async getProject(projectId: string) {
      return (await request<{ data: AaProjectDetail }>(p(projectId))).data;
    },
    async updateProject(projectId: string, patch: Partial<{ name: string; description: string | null; status: ProjectStatus; readmeMd: string }>) {
      return (await request<{ data: AaProject }>(p(projectId), json('PATCH', patch))).data;
    },
    async deleteProject(projectId: string, confirmName: string) {
      await request<void>(`${p(projectId)}${deps.buildQuery({ confirm: confirmName })}`, { method: 'DELETE' });
    },

    // ── 내보내기 (Sprint 4: readme-md) — 422는 AaApiError(details: SensitiveScanDetails) ──
    async exportReadme(projectId: string, body: ReadmeExportRequest) {
      return (await request<{ data: ReadmeExportResult }>(`${p(projectId)}/export`, json('POST', body))).data;
    },

    // Ask AI 번들 · Mermaid (Sprint 5)
    async exportAskAi(projectId: string, body: AskAiExportRequest) {
      return (await request<{ data: AskAiExportResult }>(`${p(projectId)}/export`, json('POST', body))).data;
    },

    // ── 외부 AI 수동 리뷰 (Sprint 5) ──
    listReviews(projectId: string, params?: { limit?: number; offset?: number }) {
      return request<{ data: ReviewListItem[]; total: number }>(`${p(projectId)}/reviews${deps.buildQuery({ ...params })}`);
    },
    async getReview(projectId: string, reviewId: string) {
      return (await request<{ data: ReviewDetail }>(`${p(projectId)}/reviews/${encodeURIComponent(reviewId)}`)).data;
    },
    async createManualReview(projectId: string, body: { bundle: ReviewBundle | null; answer: { tool: string; answerMd: string }; clientRequestId: string }) {
      return (await request<{ data: { id: string; answerId: string; existing: boolean } }>(`${p(projectId)}/reviews/manual`, json('POST', body))).data;
    },
    async addReviewAnswer(projectId: string, reviewId: string, body: { tool: string; answerMd: string; followUpOf?: string | null; followUpQuestion?: string | null; clientRequestId: string }) {
      return (await request<{ data: { id: string; existing: boolean } }>(`${p(projectId)}/reviews/${encodeURIComponent(reviewId)}/answers`, json('POST', body))).data;
    },

    // ── 요구사항 ──
    listRequirements(projectId: string, params?: ListRequirementsParams) {
      return request<{ data: Requirement[]; total: number }>(
        `${p(projectId)}/requirements${deps.buildQuery({ ...params })}`,
      );
    },
    async createRequirement(projectId: string, input: RequirementCreate) {
      return (await request<{ data: Requirement }>(`${p(projectId)}/requirements`, json('POST', input))).data;
    },
    async updateRequirement(projectId: string, id: string, patch: RequirementUpdate) {
      return (await request<{ data: Requirement }>(
        `${p(projectId)}/requirements/${encodeURIComponent(id)}`, json('PATCH', patch),
      )).data;
    },
    async deleteRequirement(projectId: string, id: string) {
      await request<void>(`${p(projectId)}/requirements/${encodeURIComponent(id)}`, json('DELETE'));
    },

    // ── Draft ──
    async getDraft(projectId: string) {
      return (await request<{ data: DraftResponse }>(`${p(projectId)}/architecture`)).data;
    },
    /** 409이면 RevisionConflictError. force 같은 우회 옵션은 없다 (D-20). */
    async saveDraft(projectId: string, baseRevision: number, model: ArchitectureModel): Promise<SaveDraftResult> {
      const res = await request<{ data: { revision: number; updatedAt: string }; warnings: ValidationIssue[] }>(
        `${p(projectId)}/architecture/draft`, json('PUT', { baseRevision, model }),
      );
      return { ...res.data, warnings: res.warnings ?? [] };
    },

    // ── 버전 (Sprint 6) ──
    listVersions(projectId: string, params?: { limit?: number; offset?: number }) {
      return request<{ data: VersionListItem[]; total: number }>(`${p(projectId)}/architecture/versions${deps.buildQuery({ ...params })}`);
    },
    async getPublishPreview(projectId: string) {
      return (await request<{ data: PublishPreview }>(`${p(projectId)}/architecture/versions/preview`)).data;
    },
    async getVersion(projectId: string, versionId: string) {
      return (await request<{ data: VersionDetail }>(`${p(projectId)}/architecture/versions/${encodeURIComponent(versionId)}`)).data;
    },
    /** 409: REVISION_CONFLICT(RevisionConflictError)·VERSION_CHANGED·PREVIEW_STALE·NO_CHANGES·LABEL_TAKEN */
    async publishVersion(projectId: string, body: PublishRequest) {
      return (await request<{ data: { id: string; versionNo: number; label: string; diffSummary: DiffSummary; createdAt: string } }>(
        `${p(projectId)}/architecture/versions`, json('POST', body))).data;
    },
    async restoreVersion(projectId: string, versionId: string, baseRevision: number) {
      const res = await request<{ data: { revision: number; updatedAt: string }; warnings: ValidationIssue[] }>(
        `${p(projectId)}/architecture/versions/${encodeURIComponent(versionId)}/restore`, json('POST', { baseRevision }));
      return { ...res.data, warnings: res.warnings ?? [] };
    },

    // ── 메타 ──
    async getTypeRegistry() {
      return (await request<{ data: TypeRegistry }>('/api/aa/meta/types')).data;
    },
  };
}

export type AaClient = ReturnType<typeof createAaClient>;

/** 저장 전 모델 크기 (바이트). 900KB를 넘으면 Toolbar 경고 (02 §4.1.1) */
export function modelByteSize(model: ArchitectureModel): number {
  return new TextEncoder().encode(JSON.stringify(model)).length;
}
