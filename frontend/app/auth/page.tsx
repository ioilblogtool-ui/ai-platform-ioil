'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name } },
        });
        if (error) throw error;
        setMessage('이메일을 확인해주세요! 인증 링크를 보내드렸어요.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#0e0e0f', fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{
        width: 360, background: '#161618', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, padding: '32px 28px'
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: '#c8a96e', marginBottom: 4 }}>
          AI Platform
        </h1>
        <p style={{ fontSize: 13, color: '#555350', marginBottom: 28 }}>
          {mode === 'login' ? '로그인하여 시작하기' : '계정 만들기'}
        </p>

        {message && (
          <div style={{ padding: '10px 14px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 8, color: '#4ade80', fontSize: 13, marginBottom: 16 }}>
            {message}
          </div>
        )}

        {error && (
          <div style={{ padding: '10px 14px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, color: '#f87171', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="이름"
              value={name}
              onChange={e => setName(e.target.value)}
              style={inputStyle}
            />
          )}
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
          <input
            type="password"
            placeholder="비밀번호 (6자 이상)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={inputStyle}
          />
          <button type="submit" disabled={loading} style={btnStyle}>
            {loading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: '#555350', marginTop: 20 }}>
          {mode === 'login' ? '계정이 없으신가요? ' : '이미 계정이 있으신가요? '}
          <span
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
            style={{ color: '#c8a96e', cursor: 'pointer' }}
          >
            {mode === 'login' ? '회원가입' : '로그인'}
          </span>
        </p>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: '#1e1e21',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 8,
  color: '#e8e6e1',
  fontSize: 14,
  padding: '10px 14px',
  outline: 'none',
  width: '100%',
};

const btnStyle: React.CSSProperties = {
  background: '#c8a96e',
  border: 'none',
  borderRadius: 8,
  color: '#1a1208',
  fontSize: 14,
  fontWeight: 500,
  padding: '11px',
  cursor: 'pointer',
  marginTop: 4,
};
