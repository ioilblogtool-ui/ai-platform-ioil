'use client';

// SCR-03 New Project 모달 — 생성 후 Studio로 이동
import { useState } from 'react';
import Button from '@/components/Button';
import { createAaProject, AaApiError } from '@/lib/aa/architecture-api';

export default function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [template, setTemplate] = useState<'empty' | 'sample-reports' | 'sample-migration'>('empty');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= 120;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const p = await createAaProject({ name: trimmed, description: description.trim() || undefined, template });
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
          <div role="radiogroup" aria-label="시작 방식" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
            {([
              ['empty', '빈 프로젝트', '직접 그리거나 Mermaid로 가져오기'],
              ['sample-reports', '샘플: AI Platform Reports', '웹 앱 · API · DB · 인증 4개 컴포넌트'],
              ['sample-migration', '샘플: TIDAMUNGU 조회 API', 'VM → AWS EKS 병행 전환 · 합성 데이터'],
            ] as const).filter(([key]) => key !== 'sample-migration' || process.env.NEXT_PUBLIC_AA_INFRA_VIEWS !== 'false').map(([key, title, sub]) => (
              <button key={key} type="button" role="radio" aria-checked={template === key} data-testid={`aa-template-${key}`}
                onClick={() => {
                  setTemplate(key);
                  if (key === 'sample-reports' && !name.trim()) setName('AI Platform Reports (샘플)');
                  if (key === 'sample-migration' && (!name.trim() || name === 'AI Platform Reports (샘플)')) setName('TIDAMUNGU 조회 API (사례·합성)');
                }}
                style={{
                  textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                  background: template === key ? 'rgba(200,169,110,0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${template === key ? 'rgba(200,169,110,0.6)' : 'rgba(255,255,255,0.1)'}`, color: 'rgba(255,255,255,0.9)',
                }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>{sub}</div>
              </button>
            ))}
          </div>
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
