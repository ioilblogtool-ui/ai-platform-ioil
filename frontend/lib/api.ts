const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// 토큰 가져오기 (Supabase 세션에서)
async function getToken(): Promise<string | null> {
  const { createClient } = await import('./supabase');
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
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
