'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase';
import {
  sendMessage, getConversations, getMessages, deleteConversation,
  getProjects, createProject, getTokenStats,
  getTasks, createTask, updateTask, deleteTask,
} from '@/lib/api';
import { useRouter } from 'next/navigation';

type Message = { id?: string; role: 'user' | 'assistant'; content: string; tokens_used?: number };
type Conversation = { id: string; title: string; agent_type: string; created_at: string };
type Project = { id: string; name: string; description: string; stage: string };
type Task = { id: string; title: string; description?: string; status: 'todo' | 'in_progress' | 'done'; priority: number };
type Tab = 'chat' | 'board';

const PRIORITY = [
  { value: 2, label: '높음', color: '#e05c5c' },
  { value: 1, label: '보통', color: '#c8a96e' },
  { value: 0, label: '낮음', color: '#5c9e6e' },
];
const STATUS_NEXT: Record<string, Task['status']> = { todo: 'in_progress', in_progress: 'done', done: 'todo' };
const COLUMNS: { key: Task['status']; label: string }[] = [
  { key: 'todo', label: 'TODO' },
  { key: 'in_progress', label: 'IN PROGRESS' },
  { key: 'done', label: 'DONE' },
];

export default function Dashboard() {
  const router = useRouter();
  const supabase = createClient();

  const [user, setUser] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('chat');
  const [projects, setProjects] = useState<Project[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 보드
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingCol, setAddingCol] = useState<Task['status'] | null>(null);

  // 토큰
  const [totalTokens, setTotalTokens] = useState(0);
  const [convTokens, setConvTokens] = useState<Record<string, number>>({});

  useEffect(() => { checkUser(); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/auth'); return; }
    setUser(user);
    loadProjects();
    loadConversations();
    loadStats();
  }

  async function loadStats() {
    try {
      const s = await getTokenStats();
      setTotalTokens(s.total_tokens || 0);
      setConvTokens(s.per_conversation || {});
    } catch {}
  }

  async function loadProjects() {
    try { setProjects(await getProjects()); } catch {}
  }

  async function loadConversations(projectId?: string) {
    try { setConversations(await getConversations(projectId)); } catch {}
  }

  async function loadTasks(projectId: string) {
    try { setTasks(await getTasks(projectId)); } catch {}
  }

  async function selectProject(id: string) {
    setActiveProjectId(id);
    loadConversations(id);
    loadTasks(id);
  }

  async function openConversation(convId: string) {
    setActiveConvId(convId);
    try { setMessages(await getMessages(convId)); } catch {}
  }

  async function handleSend() {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    try {
      const res = await sendMessage({
        conversation_id: activeConvId || undefined,
        project_id: activeProjectId || undefined,
        message: text,
      });
      if (!activeConvId) {
        setActiveConvId(res.conversation_id);
        loadConversations(activeProjectId || undefined);
      }
      setMessages(prev => [...prev, { role: 'assistant', content: res.message, tokens_used: res.tokens_used }]);
      setTotalTokens(t => t + (res.tokens_used || 0));
      setConvTokens(prev => ({
        ...prev,
        [res.conversation_id]: (prev[res.conversation_id] || 0) + (res.tokens_used || 0),
      }));
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `오류: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleNewProject() {
    if (!newProjectName.trim()) return;
    try {
      const proj = await createProject({ name: newProjectName });
      setProjects(prev => [proj, ...prev]);
      setNewProjectName('');
      setShowNewProject(false);
    } catch {}
  }

  async function handleDeleteConv(id: string) {
    await deleteConversation(id);
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConvId === id) { setActiveConvId(null); setMessages([]); }
  }

  async function handleAddTask(status: Task['status']) {
    if (!newTaskTitle.trim() || !activeProjectId) return;
    try {
      const t = await createTask({ project_id: activeProjectId, title: newTaskTitle, status, priority: 1 });
      setTasks(prev => [...prev, t]);
      setNewTaskTitle('');
      setAddingCol(null);
    } catch {}
  }

  async function handleMoveTask(task: Task) {
    const next = STATUS_NEXT[task.status];
    try {
      const updated = await updateTask(task.id, { status: next });
      setTasks(prev => prev.map(t => t.id === task.id ? updated : t));
    } catch {}
  }

  async function handlePriorityTask(task: Task) {
    const next = task.priority === 2 ? 0 : task.priority + 1;
    try {
      const updated = await updateTask(task.id, { priority: next });
      setTasks(prev => prev.map(t => t.id === task.id ? updated : t));
    } catch {}
  }

  async function handleDeleteTask(id: string) {
    await deleteTask(id);
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/auth');
  }

  function newChat() { setActiveConvId(null); setMessages([]); }

  const fmtTokens = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0e0e0f', color: '#e8e6e1', fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>

      {/* 사이드바 */}
      <div style={{ width: 240, background: '#161618', borderRight: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* 로고 */}
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: 18, fontWeight: 500, color: '#c8a96e' }}>AI Platform</div>
          <div style={{ fontSize: 11, color: '#555350', marginTop: 2 }}>{user?.email}</div>
        </div>

        {/* 탭 */}
        <div style={{ display: 'flex', padding: '10px 12px 0', gap: 6 }}>
          {(['chat', 'board'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '6px 0', borderRadius: 7, border: 'none', fontSize: 12, cursor: 'pointer',
              background: tab === t ? '#c8a96e' : '#1e1e21',
              color: tab === t ? '#1a1208' : '#8a8784', fontWeight: tab === t ? 600 : 400,
            }}>
              {t === 'chat' ? '채팅' : '보드'}
            </button>
          ))}
        </div>

        {/* 새 대화 버튼 (채팅 탭일 때만) */}
        {tab === 'chat' && (
          <div style={{ padding: '10px 12px 6px' }}>
            <button onClick={newChat} style={sideBtn('#c8a96e', '#1a1208')}>+ 새 대화</button>
          </div>
        )}

        {/* 프로젝트 섹션 */}
        <div style={{ padding: tab === 'chat' ? '0 12px 8px' : '10px 12px 8px' }}>
          <div style={{ fontSize: 10, color: '#555350', letterSpacing: '.07em', textTransform: 'uppercase', padding: '4px 4px 6px' }}>프로젝트</div>
          {projects.map(p => (
            <div key={p.id} onClick={() => selectProject(p.id)} style={{
              padding: '7px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12,
              background: activeProjectId === p.id ? '#1e1e21' : 'transparent',
              color: activeProjectId === p.id ? '#e8e6e1' : '#8a8784', marginBottom: 2,
            }}>
              {p.name}
            </div>
          ))}
          {showNewProject ? (
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <input
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleNewProject()}
                placeholder="프로젝트명"
                autoFocus
                style={{ flex: 1, background: '#1e1e21', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e8e6e1', fontSize: 12, padding: '5px 8px', outline: 'none' }}
              />
              <button onClick={handleNewProject} style={{ background: '#c8a96e', border: 'none', borderRadius: 6, color: '#1a1208', fontSize: 12, padding: '5px 8px', cursor: 'pointer' }}>+</button>
            </div>
          ) : (
            <div onClick={() => setShowNewProject(true)} style={{ fontSize: 12, color: '#555350', cursor: 'pointer', padding: '4px 10px' }}>+ 새 프로젝트</div>
          )}
        </div>

        {/* 대화 목록 (채팅 탭) */}
        {tab === 'chat' && (
          <div style={{ flex: 1, overflow: 'auto', padding: '0 12px' }}>
            <div style={{ fontSize: 10, color: '#555350', letterSpacing: '.07em', textTransform: 'uppercase', padding: '4px 4px 6px' }}>대화 기록</div>
            {conversations.map(c => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '6px 8px', borderRadius: 7, cursor: 'pointer',
                background: activeConvId === c.id ? '#1e1e21' : 'transparent', marginBottom: 2,
              }}>
                <div onClick={() => openConversation(c.id)} style={{ flex: 1, fontSize: 12, color: activeConvId === c.id ? '#e8e6e1' : '#8a8784', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.title}
                </div>
                {convTokens[c.id] > 0 && (
                  <span style={{ fontSize: 10, color: '#555350', flexShrink: 0 }}>{fmtTokens(convTokens[c.id])}</span>
                )}
                <span onClick={() => handleDeleteConv(c.id)} style={{ fontSize: 10, color: '#555350', cursor: 'pointer', flexShrink: 0 }}>✕</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'board' && <div style={{ flex: 1 }} />}

        {/* 하단: 토큰 + 로그아웃 */}
        <div style={{ padding: '10px 16px 14px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: 11, color: '#555350', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span>총 토큰</span>
            <span style={{ color: '#c8a96e', fontFamily: 'monospace' }}>{fmtTokens(totalTokens)}</span>
          </div>
          <button onClick={handleLogout} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, color: '#555350', fontSize: 12, padding: '6px 12px', cursor: 'pointer', width: '100%' }}>
            로그아웃
          </button>
        </div>
      </div>

      {/* 메인 영역 */}
      {tab === 'chat' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* 상단바 */}
          <div style={{ padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#161618', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 15, fontWeight: 500 }}>
              {activeConvId ? conversations.find(c => c.id === activeConvId)?.title || '대화' : '새 대화'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {activeConvId && convTokens[activeConvId] > 0 && (
                <span style={{ fontSize: 11, color: '#8a8784' }}>
                  이 대화 {fmtTokens(convTokens[activeConvId])} tok
                </span>
              )}
              <span style={{ fontSize: 11, color: '#c8a96e', background: '#1e1e21', border: '1px solid rgba(200,169,110,0.2)', borderRadius: 20, padding: '3px 10px', fontFamily: 'monospace' }}>
                claude-sonnet-4-6
              </span>
            </div>
          </div>

          {/* 메시지 */}
          <div style={{ flex: 1, overflow: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {messages.length === 0 && (
              <div style={{ margin: 'auto', textAlign: 'center', color: '#555350' }}>
                <div style={{ fontSize: 36, marginBottom: 12, opacity: .3 }}>◈</div>
                <div style={{ fontSize: 16, color: '#8a8784', marginBottom: 6 }}>무엇을 도와드릴까요?</div>
                <div style={{ fontSize: 13 }}>아래에 메시지를 입력해보세요</div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 4 }}>
                <div style={{ display: 'flex', gap: 10, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  {m.role === 'assistant' && (
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: '#1e1e21', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#8a8784', flexShrink: 0 }}>C</div>
                  )}
                  <div style={{
                    maxWidth: '72%', padding: '11px 15px', borderRadius: m.role === 'user' ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                    background: m.role === 'user' ? '#1e1e21' : '#161618',
                    border: `1px solid ${m.role === 'user' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.07)'}`,
                    fontSize: 13.5, lineHeight: 1.65, color: '#e8e6e1', whiteSpace: 'pre-wrap',
                  }}>
                    {m.content}
                  </div>
                </div>
                {m.role === 'assistant' && m.tokens_used && m.tokens_used > 0 && (
                  <div style={{ fontSize: 10, color: '#555350', paddingLeft: 38 }}>{m.tokens_used.toLocaleString()} tokens</div>
                )}
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: '#1e1e21', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#8a8784' }}>C</div>
                <div style={{ padding: '14px 16px', background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '4px 12px 12px 12px', display: 'flex', gap: 4 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#555350', animation: `blink 1.2s ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 입력창 */}
          <div style={{ padding: '14px 24px 18px', borderTop: '1px solid rgba(255,255,255,0.07)', background: '#161618' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="메시지 입력... (Enter 전송, Shift+Enter 줄바꿈)"
                rows={1}
                style={{
                  flex: 1, background: '#1e1e21', border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 10, color: '#e8e6e1', fontSize: 13.5, padding: '11px 14px',
                  resize: 'none', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
                  minHeight: 44, maxHeight: 120,
                }}
              />
              <button onClick={handleSend} disabled={loading || !input.trim()} style={{
                width: 44, height: 44, borderRadius: 10, border: 'none',
                background: loading || !input.trim() ? '#2a2a2e' : '#c8a96e',
                color: loading || !input.trim() ? '#555350' : '#1a1208',
                fontSize: 18, cursor: loading || !input.trim() ? 'not-allowed' : 'pointer', flexShrink: 0,
              }}>↑</button>
            </div>
          </div>
        </div>
      ) : (
        /* 칸반 보드 */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#161618', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 500 }}>
              {activeProjectId ? projects.find(p => p.id === activeProjectId)?.name : '프로젝트 보드'}
            </span>
            {activeProjectId && (
              <span style={{ fontSize: 11, color: '#555350' }}>
                {tasks.length}개 태스크
              </span>
            )}
          </div>

          {!activeProjectId ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: '#555350' }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: .3 }}>▦</div>
              <div style={{ fontSize: 14, color: '#8a8784' }}>왼쪽에서 프로젝트를 선택하세요</div>
            </div>
          ) : (
            <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              {COLUMNS.map(col => {
                const colTasks = tasks.filter(t => t.status === col.key);
                return (
                  <div key={col.key} style={{ width: 280, flexShrink: 0, background: '#161618', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {/* 컬럼 헤더 */}
                    <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: '#8a8784' }}>{col.label}</span>
                      <span style={{ fontSize: 11, color: '#555350', background: '#1e1e21', borderRadius: 10, padding: '2px 8px' }}>{colTasks.length}</span>
                    </div>

                    {/* 태스크 카드 */}
                    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60 }}>
                      {colTasks.map(task => {
                        const pri = PRIORITY.find(p => p.value === task.priority) || PRIORITY[1];
                        return (
                          <div key={task.id} style={{ background: '#1e1e21', borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                              <span style={{ fontSize: 13, color: '#e8e6e1', lineHeight: 1.4, flex: 1 }}>{task.title}</span>
                              <button onClick={() => handleDeleteTask(task.id)} style={{ background: 'none', border: 'none', color: '#555350', cursor: 'pointer', fontSize: 11, flexShrink: 0, padding: 0, lineHeight: 1 }}>✕</button>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <button onClick={() => handlePriorityTask(task)} style={{
                                background: 'none', border: `1px solid ${pri.color}33`, borderRadius: 10,
                                color: pri.color, fontSize: 10, cursor: 'pointer', padding: '2px 8px',
                              }}>
                                {pri.label}
                              </button>
                              {col.key !== 'done' && (
                                <button onClick={() => handleMoveTask(task)} style={{
                                  background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
                                  color: '#8a8784', fontSize: 11, cursor: 'pointer', padding: '3px 8px',
                                }}>
                                  {col.key === 'todo' ? '시작 →' : '완료 →'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* 태스크 추가 */}
                      {addingCol === col.key ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <input
                            value={newTaskTitle}
                            onChange={e => setNewTaskTitle(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleAddTask(col.key); if (e.key === 'Escape') { setAddingCol(null); setNewTaskTitle(''); } }}
                            placeholder="태스크 이름 (Enter 추가)"
                            autoFocus
                            style={{ background: '#2a2a2e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 7, color: '#e8e6e1', fontSize: 12, padding: '8px 10px', outline: 'none', fontFamily: 'inherit' }}
                          />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => handleAddTask(col.key)} style={{ flex: 1, background: '#c8a96e', border: 'none', borderRadius: 6, color: '#1a1208', fontSize: 12, padding: '6px', cursor: 'pointer', fontWeight: 500 }}>추가</button>
                            <button onClick={() => { setAddingCol(null); setNewTaskTitle(''); }} style={{ flex: 1, background: '#2a2a2e', border: 'none', borderRadius: 6, color: '#8a8784', fontSize: 12, padding: '6px', cursor: 'pointer' }}>취소</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setAddingCol(col.key); setNewTaskTitle(''); }} style={{ background: 'none', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 7, color: '#555350', fontSize: 12, padding: '8px', cursor: 'pointer', width: '100%' }}>
                          + 태스크 추가
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes blink { 0%,80%,100%{opacity:.2} 40%{opacity:1} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>
    </div>
  );
}

function sideBtn(bg: string, color: string): React.CSSProperties {
  return { background: bg, border: 'none', borderRadius: 8, color, fontSize: 13, fontWeight: 500, padding: '8px 14px', cursor: 'pointer', width: '100%' };
}
