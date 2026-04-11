const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// 토큰 가져오기 (Supabase 세션에서)
async function getToken(): Promise<string | null> {
  const { createClient } = await import('./supabase');
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

// undefined 값 제거한 쿼리스트링 생성
function buildQuery(params?: Record<string, any>): string {
  if (!params) return '';
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
  const q = new URLSearchParams(clean as any).toString();
  return q ? '?' + q : '';
}

// 기본 fetch 래퍼
async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await getToken();

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '요청 실패' }));
    throw new Error(err.error || '요청 실패');
  }

  return res.json();
}

// 채팅 메시지 전송
export async function sendMessage(params: {
  conversation_id?: string;
  project_id?: string;
  message: string;
}) {
  return apiFetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// 대화 목록 가져오기
export async function getConversations(projectId?: string) {
  const query = projectId ? `?project_id=${projectId}` : '';
  return apiFetch(`/api/conversations${query}`);
}

// 대화 메시지 가져오기
export async function getMessages(conversationId: string) {
  return apiFetch(`/api/conversations/${conversationId}/messages`);
}

// 대화 삭제
export async function deleteConversation(id: string) {
  return apiFetch(`/api/conversations/${id}`, { method: 'DELETE' });
}

// 프로젝트 목록
export async function getProjects() {
  return apiFetch('/api/conversations/projects/list');
}

// 프로젝트 생성
export async function createProject(params: {
  name: string;
  description?: string;
  system_prompt?: string;
}) {
  return apiFetch('/api/conversations/projects', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// 토큰 통계
export async function getTokenStats() {
  return apiFetch('/api/conversations/stats');
}

// 태스크 목록
export async function getTasks(projectId: string) {
  return apiFetch(`/api/tasks?project_id=${projectId}`);
}

// 태스크 생성
export async function createTask(params: {
  project_id: string;
  title: string;
  description?: string;
  status?: 'todo' | 'in_progress' | 'done';
  priority?: number;
}) {
  return apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(params) });
}

// 태스크 수정 (상태/우선순위 변경)
export async function updateTask(id: string, params: {
  title?: string;
  status?: 'todo' | 'in_progress' | 'done';
  priority?: number;
}) {
  return apiFetch(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(params) });
}

// 태스크 삭제
export async function deleteTask(id: string) {
  return apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
}

// =============================================
// Content Ops — Types
// =============================================

export type ContentStatus = 'idea' | 'planned' | 'designed' | 'ready_dev' | 'in_dev' | 'deployed' | 'archived';
export type ContentType = 'calculator' | 'report';
export type DocType = 'plan' | 'design' | 'dev_request';
export type JobStatus = 'queued' | 'running' | 'done' | 'failed';
export type AIModel = 'claude' | 'gpt' | 'gemini' | 'codex';
export type ContentIdea = {
  id: string;
  model: AIModel;
  result_summary: string | null;
  suggested_titles: string[] | null;
  suggested_outline: string[] | null;
  seo_keywords: string[] | null;
  strengths: string | null;
  weaknesses: string | null;
  score: number | null;
  is_selected: boolean;
  created_at: string;
};

// =============================================
// Contents
// =============================================

export async function getContents(params?: {
  status?: ContentStatus;
  content_type?: ContentType;
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  return apiFetch(`/api/contents${buildQuery(params)}`);
}

export async function getContentStats() {
  return apiFetch('/api/contents/stats');
}

export async function getContent(id: string) {
  return apiFetch(`/api/contents/${id}`);
}

export async function createContent(params: {
  title: string;
  content_type: ContentType;
  category: string;
  seo_keyword?: string;
  priority?: number;
  raw_idea?: string;
  target_repo?: string;
  target_path?: string;
  notes?: string;
}) {
  return apiFetch('/api/contents', { method: 'POST', body: JSON.stringify(params) });
}

export async function updateContent(id: string, params: Partial<{
  title: string;
  content_type: ContentType;
  category: string;
  seo_keyword: string;
  priority: number;
  raw_idea: string;
  target_repo: string;
  target_path: string;
  notes: string;
}>) {
  return apiFetch(`/api/contents/${id}`, { method: 'PATCH', body: JSON.stringify(params) });
}

export async function transitionContent(id: string, status: ContentStatus) {
  return apiFetch(`/api/contents/${id}/transition`, { method: 'POST', body: JSON.stringify({ status }) });
}

export async function deleteContent(id: string) {
  return apiFetch(`/api/contents/${id}`, { method: 'DELETE' });
}

// =============================================
// Documents
// =============================================

export async function getDocuments(params?: {
  content_item_id?: string;
  doc_type?: DocType;
  status?: string;
}) {
  return apiFetch(`/api/documents${buildQuery(params)}`);
}

export async function getDocument(id: string) {
  return apiFetch(`/api/documents/${id}`);
}

export async function createDocument(params: {
  content_item_id: string;
  doc_type: DocType;
  version?: string;
  file_path?: string;
  content?: string;
  generated_by?: string;
}) {
  return apiFetch('/api/documents', { method: 'POST', body: JSON.stringify(params) });
}

export async function updateDocument(id: string, params: Partial<{
  version: string;
  file_path: string;
  content: string;
  status: 'draft' | 'reviewed' | 'approved';
}>) {
  return apiFetch(`/api/documents/${id}`, { method: 'PATCH', body: JSON.stringify(params) });
}

export async function approveDocument(id: string) {
  return apiFetch(`/api/documents/${id}/approve`, { method: 'POST' });
}

export async function deleteDocument(id: string) {
  return apiFetch(`/api/documents/${id}`, { method: 'DELETE' });
}

// =============================================
// Generate (AI 생성)
// =============================================

export async function generateIdeas(content_item_id: string) {
  return apiFetch('/api/generate/ideas', { method: 'POST', body: JSON.stringify({ content_item_id }) });
}

export async function getContentIdeas(content_item_id: string) {
  return apiFetch(`/api/ideas${buildQuery({ content_item_id })}`);
}

export async function selectContentIdea(id: string) {
  return apiFetch(`/api/ideas/${id}/select`, { method: 'POST' });
}

export async function generatePlan(params: {
  content_item_id: string;
  template_content?: string;
}) {
  return apiFetch('/api/generate/plan', { method: 'POST', body: JSON.stringify(params) });
}

export async function generateDesign(params: {
  content_item_id: string;
  plan_doc_id?: string;
}) {
  return apiFetch('/api/generate/design', { method: 'POST', body: JSON.stringify(params) });
}

export async function generateDevRequest(params: {
  content_item_id: string;
  design_doc_id?: string;
  target_model?: AIModel;
  prompt_style?: 'implement' | 'modify' | 'refactor';
}) {
  return apiFetch('/api/generate/dev-request', { method: 'POST', body: JSON.stringify(params) });
}

// =============================================
// Jobs
// =============================================

export async function getJobs(params?: {
  status?: JobStatus;
  content_item_id?: string;
  limit?: number;
  offset?: number;
}) {
  return apiFetch(`/api/jobs${buildQuery(params)}`);
}

export async function getJob(id: string) {
  return apiFetch(`/api/jobs/${id}`);
}

export async function retryJob(id: string) {
  return apiFetch(`/api/jobs/${id}/retry`, { method: 'POST' });
}

// =============================================
// Git
// =============================================

export async function getGitChanges(content_item_id: string) {
  return apiFetch(`/api/git?content_item_id=${content_item_id}`);
}

export async function createGitChange(params: {
  content_item_id: string;
  branch_name?: string;
  commit_sha?: string;
  pr_url?: string;
  merge_status?: 'open' | 'merged' | 'closed';
  notes?: string;
}) {
  return apiFetch('/api/git', { method: 'POST', body: JSON.stringify(params) });
}

export async function updateGitChange(id: string, params: Partial<{
  branch_name: string;
  commit_sha: string;
  pr_url: string;
  merge_status: 'open' | 'merged' | 'closed';
  notes: string;
}>) {
  return apiFetch(`/api/git/${id}`, { method: 'PATCH', body: JSON.stringify(params) });
}

// =============================================
// Deployments
// =============================================

export async function getDeployments(params?: {
  content_item_id?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  return apiFetch(`/api/deployments${buildQuery(params)}`);
}

export async function createDeployment(params: {
  content_item_id: string;
  platform: 'cloudflare' | 'vercel' | 'railway' | 'other';
  environment?: 'prod' | 'staging' | 'dev';
  status?: string;
  deploy_url?: string;
  deployed_at?: string;
  notes?: string;
}) {
  return apiFetch('/api/deployments', { method: 'POST', body: JSON.stringify(params) });
}

export async function updateDeployment(id: string, params: Partial<{
  platform: string;
  environment: string;
  status: string;
  deploy_url: string;
  deployed_at: string;
  notes: string;
}>) {
  return apiFetch(`/api/deployments/${id}`, { method: 'PATCH', body: JSON.stringify(params) });
}

export async function markDeploymentSuccess(id: string, deploy_url?: string) {
  return apiFetch(`/api/deployments/${id}/mark-success`, { method: 'POST', body: JSON.stringify({ deploy_url }) });
}

// =============================================
// Activity
// =============================================

export async function getActivity(params?: {
  content_item_id?: string;
  limit?: number;
  offset?: number;
}) {
  return apiFetch(`/api/activity${buildQuery(params)}`);
}

// =============================================
// Prompt Library
// =============================================

export async function getPrompts(params?: {
  usage_type?: string;
  target_model?: AIModel;
  category?: string;
}) {
  return apiFetch(`/api/prompts${buildQuery(params)}`);
}

export async function createPrompt(params: {
  title: string;
  target_model: AIModel;
  usage_type: string;
  category?: string;
  content: string;
}) {
  return apiFetch('/api/prompts', { method: 'POST', body: JSON.stringify(params) });
}

export async function updatePrompt(id: string, params: Partial<{
  title: string;
  content: string;
  last_used_at: string;
}>) {
  return apiFetch(`/api/prompts/${id}`, { method: 'PATCH', body: JSON.stringify(params) });
}

export async function deletePrompt(id: string) {
  return apiFetch(`/api/prompts/${id}`, { method: 'DELETE' });
}

// =============================================
// Templates
// =============================================

export async function getTemplates(params?: {
  doc_type?: DocType;
  content_type?: ContentType;
}) {
  return apiFetch(`/api/templates${buildQuery(params)}`);
}

export async function createTemplate(params: {
  name: string;
  doc_type: DocType;
  content_type?: ContentType;
  content: string;
  is_default?: boolean;
}) {
  return apiFetch('/api/templates', { method: 'POST', body: JSON.stringify(params) });
}

export async function updateTemplate(id: string, params: Partial<{
  name: string;
  content_type: ContentType;
  content: string;
  is_default: boolean;
}>) {
  return apiFetch(`/api/templates/${id}`, { method: 'PATCH', body: JSON.stringify(params) });
}

export async function deleteTemplate(id: string) {
  return apiFetch(`/api/templates/${id}`, { method: 'DELETE' });
}
