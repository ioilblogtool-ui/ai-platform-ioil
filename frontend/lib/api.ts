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
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'skipped';
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

export async function checkSimilarity(params: {
  title: string;
  seo_keyword?: string;
  content_type?: string;
}): Promise<{
  score: number;
  level: 'ok' | 'warn' | 'block';
  reason: string;
  similar_item: { id: string; title: string; content_type: string; status: string } | null;
}> {
  return apiFetch('/api/contents/check-similarity', { method: 'POST', body: JSON.stringify(params) });
}

export async function autoGenerateIdeas(): Promise<{
  today_category: string;
  items: Array<{
    item: { id: string; title: string; content_type: string; category: string };
    idea: { result_summary: string; suggested_titles: string[]; seo_keywords: string[]; score: number } | null;
    scores: { search: number; revenue: number; internal_link: number; difficulty: number; total: number };
    affiliate_hint: string;
    series_expansion: string;
  }>;
}> {
  return apiFetch('/api/contents/auto-generate', { method: 'POST' });
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
  template_content?: string;
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

export async function skipJob(id: string) {
  return apiFetch(`/api/jobs/${id}/skip`, { method: 'POST' });
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

// =============================================
// 나만의 AI — Types
// =============================================

export type AssetType =
  | 'real_estate'   // 부동산
  | 'stock'         // 주식·ETF
  | 'cash'          // 현금·예금·적금
  | 'pension'       // 퇴직금·연금
  | 'gold'          // 금·귀금속
  | 'crypto'        // 암호화폐
  | 'loan_mortgage' // 담보대출
  | 'loan_credit'   // 신용대출
  | 'loan_minus'    // 마이너스통장
  | 'debt'          // 기타부채 (레거시)
  | 'other';        // 기타
export type ModuleKey = 'assets' | 'budget' | 'realestate' | 'portfolio' | 'parenting' | 'health' | 'career' | 'learning' | 'news';

export interface UserAsset {
  id: string;
  asset_type: AssetType;
  name: string;
  amount: number;
  metadata: Record<string, any>;
  recorded_at: string;
  created_at: string;
}

export interface BudgetRecord {
  id: string;
  record_type: 'income' | 'expense';
  category: string | null;
  amount: number;
  memo: string | null;
  recorded_at: string;
  created_at: string;
}

export interface RealestateItem {
  id: string;
  name: string;
  address: string | null;
  area_sqm: number | null;
  interest: 'buy' | 'rent' | null;
  price: number | null;
  note: string | null;
  created_at: string;
}

export interface UserKeyword {
  id: string;
  keyword: string;
  category: string | null;
  priority: number;
  created_at: string;
}

export interface AiReport {
  id: string;
  module_key: string;
  report_type: 'daily' | 'weekly' | 'monthly';
  title: string;
  content?: string;
  generated_at: string;
}

// =============================================
// 나만의 AI — Modules
// =============================================

export async function getMyAiModules() {
  return apiFetch('/api/my-ai/modules');
}

export async function updateMyAiModule(key: ModuleKey, params: { is_active?: boolean; config?: Record<string, any>; schedule?: Record<string, any> }) {
  return apiFetch(`/api/my-ai/modules/${key}`, { method: 'PUT', body: JSON.stringify(params) });
}

// =============================================
// 나만의 AI — Assets
// =============================================

export async function getAssets(params?: { asset_type?: AssetType; recorded_at?: string }) {
  return apiFetch(`/api/my-ai/assets${buildQuery(params)}`);
}

export async function createAsset(params: { asset_type: AssetType; name: string; amount: number; metadata?: Record<string, any>; recorded_at?: string }) {
  return apiFetch('/api/my-ai/assets', { method: 'POST', body: JSON.stringify(params) });
}

export async function updateAsset(id: string, params: Partial<{ asset_type: AssetType; name: string; amount: number; metadata: Record<string, any>; recorded_at: string }>) {
  return apiFetch(`/api/my-ai/assets/${id}`, { method: 'PUT', body: JSON.stringify(params) });
}

export async function deleteAsset(id: string) {
  return apiFetch(`/api/my-ai/assets/${id}`, { method: 'DELETE' });
}

// =============================================
// 나만의 AI — Asset Snapshots
// =============================================

export type SnapshotPayload = {
  snapshot_date: string;
  stock?: number; real_estate?: number; cash?: number; pension?: number;
  gold?: number; crypto?: number; other?: number;
  loan_mortgage?: number; loan_credit?: number; loan_minus?: number;
  note?: string; detail?: Record<string, any>;
};

export async function getSnapshots(params?: { from?: string; to?: string; limit?: number }) {
  return apiFetch(`/api/my-ai/snapshots${buildQuery(params)}`);
}

export async function getSnapshotStats() {
  return apiFetch('/api/my-ai/snapshots/stats');
}

export async function createSnapshot(params: SnapshotPayload) {
  return apiFetch('/api/my-ai/snapshots', { method: 'POST', body: JSON.stringify(params) });
}

export async function updateSnapshot(id: string, params: Partial<SnapshotPayload>) {
  return apiFetch(`/api/my-ai/snapshots/${id}`, { method: 'PUT', body: JSON.stringify(params) });
}

export async function deleteSnapshot(id: string) {
  return apiFetch(`/api/my-ai/snapshots/${id}`, { method: 'DELETE' });
}

// =============================================
// 나만의 AI — Asset Goals
// =============================================

export type GoalType = 'annual' | 'longterm';

export type GoalPayload = {
  goal_type: GoalType; name: string; target_amount: number; target_year: number; sort_order?: number; description?: string;
};

export async function getGoals(params?: { goal_type?: GoalType }) {
  return apiFetch(`/api/my-ai/goals${buildQuery(params)}`);
}

export async function createGoal(params: GoalPayload) {
  return apiFetch('/api/my-ai/goals', { method: 'POST', body: JSON.stringify(params) });
}

export async function updateGoal(id: string, params: Partial<GoalPayload & { is_achieved: boolean; achieved_at: string }>) {
  return apiFetch(`/api/my-ai/goals/${id}`, { method: 'PUT', body: JSON.stringify(params) });
}

export async function deleteGoal(id: string) {
  return apiFetch(`/api/my-ai/goals/${id}`, { method: 'DELETE' });
}

export async function getMilestones() {
  return apiFetch('/api/my-ai/goals/milestones');
}

// =============================================
// 나만의 AI — Budget
// =============================================

export interface BudgetFixedItem {
  id: string;
  record_type: 'income' | 'expense';
  category: string;
  subcategory: string | null;
  person: string | null;
  amount: number;
  memo: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface MonthSummary {
  month: number;
  income: number;
  expense: number;
  balance: number;
}

export interface BudgetCompare {
  prev:     { income: number; expense: number; balance: number };
  lastYear: { income: number; expense: number; balance: number };
}

export async function getBudget(params?: { year?: number; month?: number; record_type?: string }) {
  return apiFetch(`/api/my-ai/budget${buildQuery(params)}`);
}

export async function getBudgetYearly(year: number): Promise<{ year: number; months: MonthSummary[]; total: { income: number; expense: number; balance: number } }> {
  return apiFetch(`/api/my-ai/budget/yearly${buildQuery({ year })}`);
}

export async function getBudgetCompare(year: number, month: number): Promise<BudgetCompare> {
  return apiFetch(`/api/my-ai/budget/compare${buildQuery({ year, month })}`);
}

export async function getBudgetFixed(): Promise<{ data: BudgetFixedItem[] }> {
  return apiFetch('/api/my-ai/budget/fixed');
}

export async function createBudgetFixed(params: {
  category: string; subcategory?: string; person?: string;
  amount: number; memo: string; record_type?: 'income' | 'expense'; sort_order?: number;
}): Promise<{ data: BudgetFixedItem }> {
  return apiFetch('/api/my-ai/budget/fixed', { method: 'POST', body: JSON.stringify(params) });
}

export async function updateBudgetFixed(id: string, params: Partial<{
  category: string; subcategory: string; person: string;
  amount: number; memo: string; record_type: 'income' | 'expense';
  sort_order: number; is_active: boolean;
}>): Promise<{ data: BudgetFixedItem }> {
  return apiFetch(`/api/my-ai/budget/fixed/${id}`, { method: 'PUT', body: JSON.stringify(params) });
}

export async function deleteBudgetFixed(id: string) {
  return apiFetch(`/api/my-ai/budget/fixed/${id}`, { method: 'DELETE' });
}

export async function applyBudgetFixed(year: number, month: number): Promise<{ applied: number; message?: string }> {
  return apiFetch('/api/my-ai/budget/fixed/apply', { method: 'POST', body: JSON.stringify({ year, month }) });
}

export async function createBudgetRecord(params: { record_type: 'income' | 'expense'; category?: string; amount: number; memo?: string; recorded_at?: string }) {
  return apiFetch('/api/my-ai/budget', { method: 'POST', body: JSON.stringify(params) });
}

export async function deleteBudgetRecord(id: string) {
  return apiFetch(`/api/my-ai/budget/${id}`, { method: 'DELETE' });
}

// =============================================
// 나만의 AI — Realestate
// =============================================

export async function getRealestate() {
  return apiFetch('/api/my-ai/realestate');
}

export async function createRealestateItem(params: { name: string; address?: string; area_sqm?: number; interest?: 'buy' | 'rent'; price?: number; note?: string }) {
  return apiFetch('/api/my-ai/realestate', { method: 'POST', body: JSON.stringify(params) });
}

export async function updateRealestateItem(id: string, params: Partial<{ name: string; address: string; area_sqm: number; interest: 'buy' | 'rent'; price: number; note: string }>) {
  return apiFetch(`/api/my-ai/realestate/${id}`, { method: 'PUT', body: JSON.stringify(params) });
}

export async function deleteRealestateItem(id: string) {
  return apiFetch(`/api/my-ai/realestate/${id}`, { method: 'DELETE' });
}

// =============================================
// 나만의 AI — Keywords
// =============================================

export async function getKeywords() {
  return apiFetch('/api/my-ai/keywords');
}

export async function createKeyword(params: { keyword: string; category?: string; priority?: number }) {
  return apiFetch('/api/my-ai/keywords', { method: 'POST', body: JSON.stringify(params) });
}

export async function deleteKeyword(id: string) {
  return apiFetch(`/api/my-ai/keywords/${id}`, { method: 'DELETE' });
}

// =============================================
// 나만의 AI — Reports
// =============================================

export async function getMyAiReports(params?: { module_key?: string; report_type?: string; limit?: number; offset?: number }) {
  return apiFetch(`/api/my-ai/reports${buildQuery(params)}`);
}

export async function getMyAiReport(id: string) {
  return apiFetch(`/api/my-ai/reports/${id}`);
}

export async function generateMyAiReport(module_key: ModuleKey, opts?: { year?: number; month?: number }): Promise<{ data: AiReport }> {
  return apiFetch('/api/my-ai/reports/generate', { method: 'POST', body: JSON.stringify({ module_key, ...opts }) });
}

// =============================================
// 나만의 AI — Parenting
// =============================================

export interface ParentingRecord {
  id: string;
  child_name: string | null;
  birth_date: string | null;
  record_type: 'growth' | 'milestone' | 'health' | 'daily';
  data: Record<string, any>;
  recorded_at: string;
  created_at: string;
}

export async function getParentingRecords(params?: { child_name?: string; record_type?: string }) {
  return apiFetch(`/api/my-ai/parenting${buildQuery(params)}`);
}

export async function createParentingRecord(params: {
  child_name?: string;
  birth_date?: string;
  record_type: 'growth' | 'milestone' | 'health' | 'daily';
  data?: Record<string, any>;
  recorded_at?: string;
}) {
  return apiFetch('/api/my-ai/parenting', { method: 'POST', body: JSON.stringify(params) });
}

export async function deleteParentingRecord(id: string) {
  return apiFetch(`/api/my-ai/parenting/${id}`, { method: 'DELETE' });
}

// =============================================
// 나만의 AI — Generic Module Records (portfolio/health/career/learning)
// =============================================

export interface ModuleRecord {
  id: string;
  module_key: string;
  record_type: string | null;
  data: Record<string, any>;
  recorded_at: string;
  created_at: string;
}

export async function getModuleRecords(module_key: string, params?: { record_type?: string; limit?: number }) {
  return apiFetch(`/api/my-ai/records${buildQuery({ module_key, ...params })}`);
}

export async function createModuleRecord(params: { module_key: string; record_type?: string; data: Record<string, any>; recorded_at?: string }) {
  return apiFetch('/api/my-ai/records', { method: 'POST', body: JSON.stringify(params) });
}

export async function deleteModuleRecord(id: string) {
  return apiFetch(`/api/my-ai/records/${id}`, { method: 'DELETE' });
}
