'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import Card, { CardHeader, CardTitle, Divider } from '@/components/Card';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';

type Section = 'profile' | 'project' | 'api' | 'system' | 'danger';

const SECTIONS: { key: Section; label: string; icon: string }[] = [
  { key: 'profile', label: '프로필',         icon: '◉' },
  { key: 'project', label: '프로젝트',       icon: '◧' },
  { key: 'api',     label: 'API 설정',        icon: '◈' },
  { key: 'system',  label: '시스템 프롬프트', icon: '≡' },
  { key: 'danger',  label: '위험 구역',       icon: '⚠' },
];

const AI_MODELS = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', desc: '균형 잡힌 성능 (권장)' },
  { value: 'claude-opus-4-6',   label: 'Claude Opus 4.6',   desc: '최고 성능, 높은 비용' },
  { value: 'claude-haiku-4-5-20251001',  label: 'Claude Haiku 4.5', desc: '빠르고 경제적' },
];

export default function SettingsPage() {
  const [section, setSection] = useState<Section>('profile');
  const [user, setUser] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Profile
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // API
  const [defaultModel, setDefaultModel] = useState('claude-sonnet-4-6');
  const [maxTokens, setMaxTokens] = useState('4096');

  // System Prompt
  const [systemPrompt, setSystemPrompt] = useState('당신은 1인 기업 운영을 돕는 AI 어시스턴트입니다. 콘텐츠 기획, 설계, 개발 요청서 작성을 도와주세요.');

  useEffect(() => { loadUser(); }, []);

  async function loadUser() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUser(user);
      setEmail(user.email || '');
      setName(user.user_metadata?.name || '');
    }
    // Load from localStorage for demo settings
    const saved = localStorage.getItem('ai_platform_settings');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        if (s.defaultModel) setDefaultModel(s.defaultModel);
        if (s.maxTokens) setMaxTokens(s.maxTokens);
        if (s.systemPrompt) setSystemPrompt(s.systemPrompt);
      } catch {}
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (section === 'profile' && name) {
        const supabase = createClient();
        await supabase.auth.updateUser({ data: { name } });
      }
      // Save API/system settings to localStorage
      const current = JSON.parse(localStorage.getItem('ai_platform_settings') || '{}');
      localStorage.setItem('ai_platform_settings', JSON.stringify({
        ...current,
        defaultModel, maxTokens, systemPrompt,
      }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  }

  async function handleSignOut() {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/auth';
  }

  async function handleDeleteAccount() {
    if (!confirm('계정을 삭제하면 모든 데이터가 영구적으로 삭제됩니다. 정말 삭제하시겠습니까?')) return;
    if (!confirm('마지막 확인: 이 작업은 되돌릴 수 없습니다.')) return;
    alert('계정 삭제는 관리자에게 문의하세요.');
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader title="Settings" />

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {/* Sidebar nav */}
        <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.05)', padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {SECTIONS.map(s => (
            <button key={s.key} onClick={() => setSection(s.key)} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
              border: 'none', cursor: 'pointer', fontSize: 13, textAlign: 'left', width: '100%',
              background: section === s.key ? (s.key === 'danger' ? 'rgba(248,113,113,0.08)' : 'rgba(200,169,110,0.1)') : 'transparent',
              color: section === s.key ? (s.key === 'danger' ? '#f87171' : '#c8a96e') : s.key === 'danger' ? '#f8717170' : '#5a5870',
              borderLeft: section === s.key ? `2px solid ${s.key === 'danger' ? '#f87171' : '#c8a96e'}` : '2px solid transparent',
            }}>
              <span style={{ fontSize: 14 }}>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px 40px', maxWidth: 640 }}>

          {section === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e0db', marginBottom: 4 }}>프로필</h2>
                <p style={{ fontSize: 12, color: '#5a5870' }}>계정 정보를 관리합니다.</p>
              </div>

              <Card>
                <CardHeader><CardTitle>기본 정보</CardTitle></CardHeader>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <div style={labelStyle}>이름</div>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="이름을 입력하세요" style={inputStyle} />
                  </div>
                  <div>
                    <div style={labelStyle}>이메일</div>
                    <input value={email} disabled style={{ ...inputStyle, color: '#5a5870', cursor: 'not-allowed' }} />
                    <div style={{ fontSize: 10, color: '#3a3850', marginTop: 4 }}>이메일은 변경할 수 없습니다.</div>
                  </div>
                  <div>
                    <div style={labelStyle}>플랜</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 13, color: '#c8a96e', background: 'rgba(200,169,110,0.1)', border: '1px solid rgba(200,169,110,0.2)', borderRadius: 8, padding: '4px 12px', fontWeight: 500 }}>
                        Free
                      </span>
                      <span style={{ fontSize: 11, color: '#5a5870' }}>Pro 업그레이드 시 무제한 생성</span>
                    </div>
                  </div>
                </div>
              </Card>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
                  {saved ? '✓ 저장됨' : saving ? '저장 중...' : '저장'}
                </Button>
              </div>
            </div>
          )}

          {section === 'project' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e0db', marginBottom: 4 }}>프로젝트 설정</h2>
                <p style={{ fontSize: 12, color: '#5a5870' }}>AI 생성 프롬프트에 자동으로 주입되는 프로젝트 컨텍스트입니다.</p>
              </div>

              <Card>
                <CardHeader><CardTitle>스택 정보</CardTitle></CardHeader>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: '사이트',      value: 'https://bigyocalc.com' },
                    { label: '레포',        value: 'https://github.com/ioilblogtool-ui/blog-tool' },
                    { label: '프레임워크',  value: 'Astro SSG' },
                    { label: '배포 플랫폼', value: 'Cloudflare Pages' },
                    { label: '배포 방식',   value: 'main 브랜치 푸시 → 즉시 라이브' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ fontSize: 11, color: '#5a5870', width: 80, flexShrink: 0, paddingTop: 1 }}>{label}</span>
                      <span style={{ fontSize: 12, color: '#c8c6c0', wordBreak: 'break-all' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <CardHeader><CardTitle>계산기 파일 구조</CardTitle></CardHeader>
                <p style={{ fontSize: 11, color: '#5a5870', marginBottom: 12 }}>신규 계산기 추가 시 4개 파일이 필요합니다.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { path: 'src/pages/tools/{slug}/index.astro', desc: '페이지 템플릿' },
                    { path: 'src/data/tools.ts',                  desc: '메타데이터 레지스트리 (항목 추가)' },
                    { path: 'src/scripts/{slug}.js',              desc: '클라이언트 계산 로직' },
                    { path: 'src/styles/{slug}.scss',             desc: '페이지 전용 스타일' },
                  ].map(({ path, desc }) => (
                    <div key={path} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <code style={{ fontSize: 11, color: '#c8a96e', fontFamily: '"SF Mono", "Fira Code", monospace', flex: 1 }}>{path}</code>
                      <span style={{ fontSize: 11, color: '#5a5870', flexShrink: 0 }}>{desc}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: '#5a5870', marginBottom: 8 }}>레이아웃 쉘 3종</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['SimpleToolShell', 'CompareToolShell', 'TimelineToolShell'].map(s => (
                      <span key={s} style={{ fontSize: 11, color: '#8b8a9e', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '4px 10px' }}>{s}</span>
                    ))}
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader><CardTitle>리포트 파일 구조</CardTitle></CardHeader>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { path: 'src/pages/reports/{slug}/index.astro', desc: '리포트 페이지' },
                    { path: 'src/data/reports.ts',                  desc: '메타데이터 레지스트리 (항목 추가)' },
                  ].map(({ path, desc }) => (
                    <div key={path} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <code style={{ fontSize: 11, color: '#c8a96e', fontFamily: '"SF Mono", "Fira Code", monospace', flex: 1 }}>{path}</code>
                      <span style={{ fontSize: 11, color: '#5a5870', flexShrink: 0 }}>{desc}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(200,169,110,0.05)', border: '1px solid rgba(200,169,110,0.15)', fontSize: 12, color: '#8b8a9e', lineHeight: 1.6 }}>
                위 정보는 Plan / Design / Dev Request 문서를 AI로 생성할 때 자동으로 프롬프트에 포함됩니다.
                프로젝트 구조가 변경되면 백엔드 <code style={{ color: '#c8a96e', fontSize: 11 }}>routes/generate.js</code>의 <code style={{ color: '#c8a96e', fontSize: 11 }}>PROJECT_CONTEXT</code>를 수정하세요.
              </div>
            </div>
          )}

          {section === 'api' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e0db', marginBottom: 4 }}>API 설정</h2>
                <p style={{ fontSize: 12, color: '#5a5870' }}>AI 모델 및 생성 파라미터를 설정합니다.</p>
              </div>

              <Card>
                <CardHeader><CardTitle>기본 모델</CardTitle></CardHeader>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {AI_MODELS.map(m => (
                    <div key={m.value} onClick={() => setDefaultModel(m.value)} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                      background: defaultModel === m.value ? 'rgba(200,169,110,0.07)' : 'rgba(255,255,255,0.02)',
                      border: defaultModel === m.value ? '1px solid rgba(200,169,110,0.25)' : '1px solid rgba(255,255,255,0.05)',
                      transition: 'all 0.15s',
                    }}>
                      <div>
                        <div style={{ fontSize: 13, color: defaultModel === m.value ? '#c8a96e' : '#c8c6c0', fontWeight: defaultModel === m.value ? 500 : 400 }}>{m.label}</div>
                        <div style={{ fontSize: 11, color: '#5a5870', marginTop: 2 }}>{m.desc}</div>
                      </div>
                      {defaultModel === m.value && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#c8a96e' }} />}
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <CardHeader><CardTitle>생성 파라미터</CardTitle></CardHeader>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <div style={labelStyle}>Max Tokens</div>
                    <input
                      type="number" value={maxTokens}
                      onChange={e => setMaxTokens(e.target.value)}
                      min="256" max="8192" step="256"
                      style={inputStyle}
                    />
                    <div style={{ fontSize: 10, color: '#3a3850', marginTop: 4 }}>최대 {parseInt(maxTokens).toLocaleString()} 토큰으로 제한됩니다.</div>
                  </div>
                </div>
              </Card>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
                  {saved ? '✓ 저장됨' : saving ? '저장 중...' : '저장'}
                </Button>
              </div>
            </div>
          )}

          {section === 'system' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e0db', marginBottom: 4 }}>시스템 프롬프트</h2>
                <p style={{ fontSize: 12, color: '#5a5870' }}>AI 생성 시 기반이 되는 시스템 프롬프트를 설정합니다.</p>
              </div>

              <Card>
                <CardHeader><CardTitle>기본 시스템 프롬프트</CardTitle></CardHeader>
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  rows={10}
                  style={{
                    width: '100%', resize: 'vertical',
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 10, color: '#c8c6c0', fontSize: 13, lineHeight: 1.7,
                    padding: '14px 16px', outline: 'none',
                    fontFamily: '"SF Mono", "Fira Code", monospace',
                  }}
                />
                <div style={{ fontSize: 11, color: '#3a3850', marginTop: 8 }}>
                  이 프롬프트는 Plan, Design, Dev Request 생성 시 AI에게 전달됩니다.
                </div>
              </Card>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button onClick={() => setSystemPrompt('당신은 1인 기업 운영을 돕는 AI 어시스턴트입니다. 콘텐츠 기획, 설계, 개발 요청서 작성을 도와주세요.')} style={{ fontSize: 12, color: '#5a5870', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  ↺ 기본값으로 초기화
                </button>
                <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
                  {saved ? '✓ 저장됨' : saving ? '저장 중...' : '저장'}
                </Button>
              </div>
            </div>
          )}

          {section === 'danger' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: '#f87171', marginBottom: 4 }}>위험 구역</h2>
                <p style={{ fontSize: 12, color: '#5a5870' }}>되돌릴 수 없는 작업입니다. 신중하게 진행하세요.</p>
              </div>

              <Card style={{ border: '1px solid rgba(248,113,113,0.15)' }}>
                <CardHeader>
                  <CardTitle>로그아웃</CardTitle>
                </CardHeader>
                <p style={{ fontSize: 12, color: '#5a5870', marginBottom: 14 }}>현재 세션에서 로그아웃합니다.</p>
                <Button variant="ghost" size="md" onClick={handleSignOut}>로그아웃</Button>
              </Card>

              <Card style={{ border: '1px solid rgba(248,113,113,0.25)' }}>
                <CardHeader>
                  <CardTitle>계정 삭제</CardTitle>
                </CardHeader>
                <p style={{ fontSize: 12, color: '#5a5870', marginBottom: 14 }}>
                  계정을 삭제하면 모든 콘텐츠, 문서, 배포 이력, 프롬프트가 영구적으로 삭제됩니다.
                  이 작업은 <strong style={{ color: '#f87171' }}>되돌릴 수 없습니다</strong>.
                </p>
                <Button variant="danger" size="md" onClick={handleDeleteAccount}>계정 영구 삭제</Button>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: '#5a5870', marginBottom: 6, fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 9, color: '#c8c6c0', fontSize: 13, padding: '9px 12px', outline: 'none', fontFamily: 'inherit',
};
