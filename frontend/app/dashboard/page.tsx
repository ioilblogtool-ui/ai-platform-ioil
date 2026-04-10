'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase';
import { sendMessage, getConversations, getMessages, deleteConversation, getProjects, createProject } from '@/lib/api';
import { useRouter } from 'next/navigation';

type Message = { id?: string; role: 'user' | 'assistant'; content: string };
type Conversation = { id: string; title: string; agent_type: string; created_at: string };
type Project = { id: string; name: string; description: string; stage: string };

export default function Dashboard() {
  const router = useRouter();
  const supabase = createClient();

  const [user, setUser] = useState<any>(null);
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

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/auth'); return; }
    setUser(user);
    loadProjects();
    loadConversations();
  }

  async function loadProjects() {
    try {
      const data = await getProjects();
      setProjects(data);
    } catch {}
  }

  async function loadConversations(projectId?: string) {
    try {
      const data = await getConversations(projectId);
      setConversations(data);
    } catch {}
  }

  async function openConversation(convId: string) {
    setActiveConvId(convId);
    try {
      const data = await getMessages(convId);
      setMessages(data);
    } catch {}
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

      setMessages(prev => [...prev, { role: 'assistant', content: res.message }]);
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

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/auth');
  }

  function newChat() {
    setActiveConvId(null);
    setMessages([]);
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0e0e0f', color: '#e8e6e1', fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>

      {/* 사이드바 */}
      <div style={{ width: 240, background: '#161618', borderRight: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* 로고 */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: 18, fontWeight: 500, color: '#c8a96e' }}>AI Platform</div>
          <div style={{ fontSize: 11, color: '#555350', marginTop: 2 }}>{user?.email}</div>
        </div>

        {/* 새 대화 버튼 */}
        <div style={{ padding: '12px 12px 8px' }}>
          <button onClick={newChat} style={sideBtn('#c8a96e', '#1a1208')}>+ 새 대화</button>
        </div>

        {/* 프로젝트 섹션 */}
        <div style={{ padding: '0 12px 8px' }}>
          <div style={{ fontSize: 10, color: '#555350', letterSpacing: '.07em', textTransform: 'uppercase', padding: '4px 4px 6px' }}>프로젝트</div>
          {projects.map(p => (
            <div
              key={p.id}
              onClick={() => { setActiveProjectId(p.id); loadConversations(p.id); }}
              style={{
                padding: '7px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12,
                background: activeProjectId === p.id ? '#1e1e21' : 'transparent',
                color: activeProjectId === p.id ? '#e8e6e1' : '#8a8784',
                marginBottom: 2,
              }}
            >
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

        {/* 대화 목록 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0 12px' }}>
          <div style={{ fontSize: 10, color: '#555350', letterSpacing: '.07em', textTransform: 'uppercase', padding: '4px 4px 6px' }}>대화 기록</div>
          {conversations.map(c => (
            <div
              key={c.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '6px 8px', borderRadius: 7, cursor: 'pointer',
                background: activeConvId === c.id ? '#1e1e21' : 'transparent',
                marginBottom: 2
              }}
            >
              <div onClick={() => openConversation(c.id)} style={{ flex: 1, fontSize: 12, color: activeConvId === c.id ? '#e8e6e1' : '#8a8784', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.title}
              </div>
              <span onClick={() => handleDeleteConv(c.id)} style={{ fontSize: 10, color: '#555350', cursor: 'pointer', flexShrink: 0 }}>✕</span>
            </div>
          ))}
        </div>

        {/* 로그아웃 */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button onClick={handleLogout} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, color: '#555350', fontSize: 12, padding: '6px 12px', cursor: 'pointer', width: '100%' }}>
            로그아웃
          </button>
        </div>
      </div>

      {/* 대화 영역 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* 상단바 */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#161618', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>
            {activeConvId ? conversations.find(c => c.id === activeConvId)?.title || '대화' : '새 대화'}
          </span>
          <span style={{ fontSize: 11, color: '#c8a96e', background: '#1e1e21', border: '1px solid rgba(200,169,110,0.2)', borderRadius: 20, padding: '3px 10px', fontFamily: 'monospace' }}>
            claude-sonnet-4-6
          </span>
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
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 10 }}>
              {m.role === 'assistant' && (
                <div style={{ width: 28, height: 28, borderRadius: 7, background: '#1e1e21', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#8a8784', flexShrink: 0 }}>C</div>
              )}
              <div style={{
                maxWidth: '72%', padding: '11px 15px', borderRadius: m.role === 'user' ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                background: m.role === 'user' ? '#1e1e21' : '#161618',
                border: `1px solid ${m.role === 'user' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.07)'}`,
                fontSize: 13.5, lineHeight: 1.65, color: '#e8e6e1', whiteSpace: 'pre-wrap'
              }}>
                {m.content}
              </div>
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
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              style={{
                width: 44, height: 44, borderRadius: 10, border: 'none',
                background: loading || !input.trim() ? '#2a2a2e' : '#c8a96e',
                color: loading || !input.trim() ? '#555350' : '#1a1208',
                fontSize: 18, cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                flexShrink: 0,
              }}
            >↑</button>
          </div>
        </div>
      </div>

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
