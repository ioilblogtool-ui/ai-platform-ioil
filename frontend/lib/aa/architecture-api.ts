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
  getDraft,
  saveDraft,
  getTypeRegistry,
} = aaApi;
