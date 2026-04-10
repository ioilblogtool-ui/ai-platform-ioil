'use client';

import { useState, useEffect } from 'react';
import { getPrompts, createPrompt, updatePrompt, deletePrompt } from '@/lib/api';
import Card, { CardHeader, CardTitle, EmptyState } from '@/components/Card';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';

type AIModel = 'claude' | 'gpt' | 'gemini' | 'codex';

const MODEL_META: Record<AIModel, { label: string; color: string }> = {
  claude: { label: 'Claude', color: '#c8a96e' },
  gpt:    { label: 'GPT',    color: '#4ade80' },
  gemini: { label: 'Gemini', color: '#60a5fa' },
  codex:  { label: 'Codex',  color: '#a78bfa' },
};

const USAGE_TYPES = ['plan', 'design', 'dev_request', 'ideas', 'general'];

const EMPTY_FORM = { title: '', target_model: 'claude' as AIModel, usage_type: 'general', category: '', content: '' };

export default function PromptLibraryPage() {
  const [prompts, setPrompts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modelFilter, setModelFilter] = useState<AIModel | 'all'>('all');
  const [usageFilter, setUsageFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { loadPrompts(); }, [modelFilter, usageFilter]);

  async function loadPrompts() {
    setLoading(true);
    try {
      const params: any = {};
      if (modelFilter !== 'all') params.target_model = modelFilter;
      if (usageFilter !== 'all') params.usage_type = usageFilter;
      const data = await getPrompts(params);
      setPrompts(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await updatePrompt(editingId, { title: form.title, content: form.content });
      } else {
        await createPrompt(form);
      }
      resetForm();
      await loadPrompts();
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('이 프롬프트를 삭제하시겠습니까?')) return;
    try {
      await deletePrompt(id);
      setPrompts(prev => prev.filter(p => p.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (e: any) { alert(e.message); }
  }

  async function handleCopy(content: string) {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function startEdit(prompt: any) {
    setForm({ title: prompt.title, target_model: prompt.target_model, usage_type: prompt.usage_type, category: prompt.category || '', content: prompt.content });
    setEditingId(prompt.id);
    setShowForm(true);
    setSelected(null);
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  }

  const filtered = prompts.filter(p => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q);
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader
        title="Prompt Library"
        badge={`${prompts.length}개`}
        actions={<Button variant="primary" size="sm" onClick={() => { resetForm(); setShowForm(true); }}>+ 프롬프트 추가</Button>}
      />

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {/* Left: List */}
        <div style={{ flex: selected ? '0 0 420px' : 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: selected ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>

          {/* Filters */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Model filter */}
            <div style={{ display: 'flex', gap: 5 }}>
              {(['all', 'claude', 'gpt', 'gemini', 'codex'] as const).map(m => {
                const mm = m !== 'all' ? MODEL_META[m] : null;
                return (
                  <button key={m} onClick={() => setModelFilter(m)} style={{
                    padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                    background: modelFilter === m ? (mm ? `${mm.color}12` : 'rgba(200,169,110,0.12)') : 'rgba(255,255,255,0.02)',
                    border: modelFilter === m ? `1px solid ${mm ? mm.color : '#c8a96e'}40` : '1px solid rgba(255,255,255,0.07)',
                    color: modelFilter === m ? (mm?.color || '#c8a96e') : '#5a5870',
                  }}>{mm?.label || '전체'}</button>
                );
              })}
            </div>
            <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ display: 'flex', gap: 5 }}>
              {(['all', ...USAGE_TYPES]).map(u => (
                <button key={u} onClick={() => setUsageFilter(u)} style={{
                  padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                  background: usageFilter === u ? 'rgba(200,169,110,0.12)' : 'rgba(255,255,255,0.02)',
                  border: usageFilter === u ? '1px solid rgba(200,169,110,0.3)' : '1px solid rgba(255,255,255,0.07)',
                  color: usageFilter === u ? '#c8a96e' : '#5a5870',
                }}>{u === 'all' ? '전체' : u}</button>
              ))}
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="검색..." style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 7, color: '#c8c6c0', fontSize: 12, padding: '5px 10px', outline: 'none', width: 150,
            }} />
          </div>

          {/* Form */}
          {showForm && (
            <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(200,169,110,0.03)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#3a3850', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Title *</div>
                    <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="프롬프트 이름" style={inputSm} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#3a3850', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Category</div>
                    <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="예: system, user..." style={inputSm} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#3a3850', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Model</div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {(Object.keys(MODEL_META) as AIModel[]).map(m => (
                        <button key={m} onClick={() => setForm(f => ({ ...f, target_model: m }))} style={{
                          padding: '3px 9px', borderRadius: 6, cursor: 'pointer', fontSize: 10,
                          background: form.target_model === m ? `${MODEL_META[m].color}12` : 'rgba(255,255,255,0.02)',
                          border: form.target_model === m ? `1px solid ${MODEL_META[m].color}40` : '1px solid rgba(255,255,255,0.07)',
                          color: form.target_model === m ? MODEL_META[m].color : '#5a5870',
                        }}>{MODEL_META[m].label}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#3a3850', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Usage Type</div>
                    <select value={form.usage_type} onChange={e => setForm(f => ({ ...f, usage_type: e.target.value }))} style={{ ...inputSm, cursor: 'pointer' }}>
                      {USAGE_TYPES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#3a3850', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Content *</div>
                  <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={5} placeholder="프롬프트 내용을 입력하세요..." style={{ ...inputSm, resize: 'vertical', fontFamily: '"SF Mono", monospace', lineHeight: 1.6 }} />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Button variant="ghost" size="sm" onClick={resetForm}>취소</Button>
                  <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || !form.title.trim() || !form.content.trim()}>
                    {saving ? '저장 중...' : editingId ? '수정 저장' : '추가'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* List */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loading ? (
              <EmptyState icon="◈" text="로딩 중..." />
            ) : filtered.length === 0 ? (
              <EmptyState icon="◈" text="프롬프트가 없습니다" />
            ) : (
              filtered.map(prompt => {
                const mm = MODEL_META[prompt.target_model as AIModel] || { label: prompt.target_model, color: '#8b8fa8' };
                const isSelected = selected?.id === prompt.id;
                return (
                  <div key={prompt.id} onClick={() => setSelected(isSelected ? null : prompt)} style={{
                    padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                    background: isSelected ? 'rgba(200,169,110,0.07)' : 'linear-gradient(135deg, rgba(255,255,255,0.02), rgba(255,255,255,0.008))',
                    border: isSelected ? '1px solid rgba(200,169,110,0.25)' : '1px solid rgba(255,255,255,0.05)',
                    transition: 'all 0.15s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#c8c6c0' }}>{prompt.title}</span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: mm.color, background: `${mm.color}12`, border: `1px solid ${mm.color}30`, borderRadius: 6, padding: '1px 7px' }}>{mm.label}</span>
                        <span style={{ fontSize: 10, color: '#5a5870', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '1px 7px' }}>{prompt.usage_type}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: '#5a5870', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {prompt.content?.slice(0, 100)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Detail panel */}
        {selected && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e0db' }}>{selected.title}</div>
                <div style={{ fontSize: 11, color: '#5a5870', marginTop: 3 }}>
                  {MODEL_META[selected.target_model as AIModel]?.label || selected.target_model} · {selected.usage_type}
                  {selected.category && ` · ${selected.category}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="secondary" size="sm" onClick={() => handleCopy(selected.content)}>
                  {copied ? '✓ Copied' : '⎘ Copy'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => startEdit(selected)}>수정</Button>
                <Button variant="danger" size="sm" onClick={() => handleDelete(selected.id)}>삭제</Button>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#5a5870', cursor: 'pointer', fontSize: 16 }}>✕</button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
              <pre style={{
                fontSize: 12, color: '#c8c6c0', fontFamily: '"SF Mono", "Fira Code", monospace',
                lineHeight: 1.7, whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '18px 20px',
              }}>
                {selected.content}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inputSm: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 7, color: '#c8c6c0', fontSize: 12, padding: '7px 10px', outline: 'none', fontFamily: 'inherit',
};
