// 브라우저용 AA API 기본 인스턴스 — 기존 lib/api.ts의 토큰·쿼리 헬퍼를 재사용한다.
import { API_URL, buildQuery, getToken } from '../api';
import { createAaClient } from './aa-client';

export { AaApiError, RevisionConflictError, modelByteSize } from './aa-client';

export const aaApi = createAaClient({ baseUrl: API_URL, getToken, buildQuery });

export const {
  listProjects: listAaProjects,
  createProject: createAaProject,
  getProject: getAaProject,
  updateProject: updateAaProject,
  deleteProject: deleteAaProject,
  listRequirements,
  createRequirement,
  updateRequirement,
  deleteRequirement,
  exportReadme,
  exportAskAi,
  listReviews,
  getReview,
  createManualReview,
  addReviewAnswer,
  getDraft,
  listVersions,
  getPublishPreview,
  getVersion,
  publishVersion,
  restoreVersion,
  saveDraft,
  getTypeRegistry,
} = aaApi;

/** 현재 로그인 사용자 id — 최근 번들 저장 키에만 쓴다 */
export async function getAaUserId(): Promise<string | null> {
  const { createClient } = await import('../supabase');
  const { data: { session } } = await createClient().auth.getSession();
  return session?.user?.id ?? null;
}
