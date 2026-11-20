'use client';

// SCR-03 New Project 모달 — 생성 후 Studio로 이동
import { useState } from 'react';
import Button from '@/components/Button';
import { createAaProject, AaApiError } from '@/lib/aa/architecture-api';

export default function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= 120;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const p = await createAaProject({ name: trimmed, description: description.trim() || undefined });
      onCreated(p.id);
    } catch (e) {
      setError(e instanceof AaApiError ? e.message : '프로젝트를 만들지 못했습니다.');
      setBusy(false);
    }
  }

  const input: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, padding: '9px 11px', color: 'rgba(255,255,255,0.9)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
      <div role="dialog" aria-label="새 프로젝트" onClick={(e) => e.stopPropagation()} style={{
        width: 460, background: '#111114', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', fontWeight: 650, fontSize: 15 }}>새 아키텍처 프로젝트</div>
        <div style={{ padding: '16px 20px' }}>
          <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>이름 *</label>
          <input autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }}
            placeholder="예: AI Platform Reports" style={input} />
          <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: '14px 0 6px' }}>설명</label>
          <textarea value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} rows={3}
            placeholder="무엇을 설계하나요? (선택)" style={{ ...input, resize: 'vertical' }} />
          {error && <div role="alert" style={{ marginTop: 12, fontSize: 12, color: '#f87171' }}>{error}</div>}
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={submit} disabled={!valid || busy} style={{ opacity: !valid || busy ? 0.5 : 1 }}>
            {busy ? '만드는 중…' : '만들기'}
          </Button>
        </div>
      </div>
    </div>
  );
}
