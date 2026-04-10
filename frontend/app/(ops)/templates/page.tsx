'use client';

import { useState, useEffect } from 'react';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '@/lib/api';
import Card, { CardHeader, CardTitle, EmptyState } from '@/components/Card';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';

type DocType = 'plan' | 'design' | 'dev_request';
type ContentType = 'calculator' | 'report';

const DOC_TYPE_META: Record<DocType, { label: string; icon: string; color: string }> = {
  plan:        { label: 'Plan',        icon: '≡', color: '#60a5fa' },
  design:      { label: 'Design',      icon: '▦', color: '#a78bfa' },
  dev_request: { label: 'Dev Request', icon: '◎', color: '#fb923c' },
};

const CONTENT_TYPE_META: Record<ContentType, { label: string }> = {
  calculator: { label: 'Calculator' },
  report:     { label: 'Report' },
};

const EMPTY_FORM = { name: '', doc_type: 'plan' as DocType, content_type: '' as ContentType | '', content: '', is_default: false };

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [docTypeFilter, setDocTypeFilter] = useState<DocType | 'all'>('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { loadTemplates(); }, [docTypeFilter]);

  async function loadTemplates() {
    setLoading(true);
    try {
      const params: any = {};
      if (docTypeFilter !== 'all') params.doc_type = docTypeFilter;
      const data = await getTemplates(params);
      setTemplates(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.content.trim()) return;
    setSaving(true);
    try {
      const payload: any = { name: form.name, doc_type: form.doc_type, content: form.content, is_default: form.is_default };
      if (form.content_type) payload.content_type = form.content_type;
      if (editingId) {
        await updateTemplate(editingId, payload);
      } else {
        await createTemplate(payload);
      }
      resetForm();
      await loadTemplates();
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('이 템플릿을 삭제하시겠습니까?')) return;
    try {
      await deleteTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (e: any) { alert(e.message); }
  }

  async function handleSetDefault(id: string) {
    try {
      await updateTemplate(id, { is_default: true });
      await loadTemplates();
    } catch (e: any) { alert(e.message); }
  }

  async function handleCopy(content: string) {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function startEdit(tpl: any) {
    setForm({ name: tpl.name, doc_type: tpl.doc_type, content_type: tpl.content_type || '', content: tpl.content, is_default: tpl.is_default });
    setEditingId(tpl.id);
    setShowForm(true);
    setSelected(null);
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  }

  const grouped: Record<DocType, any[]> = { plan: [], design: [], dev_request: [] };
  templates.forEach(t => {
    if (grouped[t.doc_type as DocType]) grouped[t.doc_type as DocType].push(t);
  });

  const displayTemplates = docTypeFilter === 'all' ? templates : templates.filter(t => t.doc_type === docTypeFilter);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader
        title="Templates"
        badge={`${templates.length}개`}
        actions={<Button variant="primary" size="sm" onClick={() => { resetForm(); setShowForm(true); }}>+ 템플릿 추가</Button>}
      />

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {/* Left: List */}
        <div style={{ flex: selected ? '0 0 400px' : 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: selected ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>

          {/* Filters */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 7, alignItems: 'center' }}>
            {(['all', 'plan', 'design', 'dev_request'] as const).map(t => {
              const m = t !== 'all' ? DOC_TYPE_META[t] : null;
              return (
                <button key={t} onClick={() => setDocTypeFilter(t)} style={{
                  padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 11,
                  background: docTypeFilter === t ? (m ? `${m.color}12` : 'rgba(200,169,110,0.12)') : 'rgba(255,255,255,0.02)',
                  border: docTypeFilter === t ? `1px solid ${m ? m.color : '#c8a96e'}40` : '1px solid rgba(255,255,255,0.07)',
                  color: docTypeFilter === t ? (m?.color || '#c8a96e') : '#5a5870',
                }}>{m ? `${m.icon} ${m.label}` : '전체'}</button>
              );
            })}
          </div>

          {/* Form */}
          {showForm && (
            <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(200,169,110,0.03)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={labelStyle}>Name *</div>
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="템플릿 이름" style={inputSm} />
                  </div>
                  <div>
                    <div style={labelStyle}>Content Type</div>
                    <select value={form.content_type} onChange={e => setForm(f => ({ ...f, content_type: e.target.value as any }))} style={{ ...inputSm, cursor: 'pointer' }}>
                      <option value="">공통 (모든 타입)</option>
                      {(Object.keys(CONTENT_TYPE_META) as ContentType[]).map(ct => (
                        <option key={ct} value={ct}>{CONTENT_TYPE_META[ct].label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <div style={labelStyle}>Doc Type</div>
                  <div style={{ display: 'flex', gap: 7 }}>
                    {(Object.keys(DOC_TYPE_META) as DocType[]).map(dt => {
                      const m = DOC_TYPE_META[dt];
                      return (
                        <button key={dt} onClick={() => setForm(f => ({ ...f, doc_type: dt }))} style={{
                          padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                          background: form.doc_type === dt ? `${m.color}12` : 'rgba(255,255,255,0.02)',
                          border: form.doc_type === dt ? `1px solid ${m.color}40` : '1px solid rgba(255,255,255,0.07)',
                          color: form.doc_type === dt ? m.color : '#5a5870',
                        }}>{m.icon} {m.label}</button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div style={labelStyle}>Content (Markdown) *</div>
                  <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={8}
                    placeholder={`# 템플릿 제목\n\n## 섹션 1\n\n## 섹션 2\n\n## 완료 기준`}
                    style={{ ...inputSm, resize: 'vertical', fontFamily: '"SF Mono", monospace', lineHeight: 1.6 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#9a98a8' }}>
                    <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} />
                    기본 템플릿으로 설정
                  </label>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <Button variant="ghost" size="sm" onClick={resetForm}>취소</Button>
                    <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || !form.name.trim() || !form.content.trim()}>
                      {saving ? '저장 중...' : editingId ? '수정 저장' : '추가'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* List */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loading ? (
              <EmptyState icon="▣" text="로딩 중..." />
            ) : displayTemplates.length === 0 ? (
              <EmptyState icon="▣" text="템플릿이 없습니다" />
            ) : (
              displayTemplates.map(tpl => {
                const dm = DOC_TYPE_META[tpl.doc_type as DocType] || { label: tpl.doc_type, icon: '●', color: '#8b8fa8' };
                const isSelected = selected?.id === tpl.id;
                return (
                  <div key={tpl.id} onClick={() => setSelected(isSelected ? null : tpl)} style={{
                    padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                    background: isSelected ? 'rgba(200,169,110,0.07)' : 'linear-gradient(135deg, rgba(255,255,255,0.02), rgba(255,255,255,0.008))',
                    border: isSelected ? '1px solid rgba(200,169,110,0.25)' : '1px solid rgba(255,255,255,0.05)',
                    transition: 'all 0.15s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: dm.color }}>{dm.icon}</span>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#c8c6c0' }}>{tpl.name}</span>
                        {tpl.is_default && (
                          <span style={{ fontSize: 10, color: '#c8a96e', background: 'rgba(200,169,110,0.1)', border: '1px solid rgba(200,169,110,0.2)', borderRadius: 6, padding: '1px 7px' }}>Default</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <span style={{ fontSize: 10, color: dm.color, background: `${dm.color}10`, border: `1px solid ${dm.color}25`, borderRadius: 6, padding: '1px 7px' }}>{dm.label}</span>
                        {tpl.content_type && (
                          <span style={{ fontSize: 10, color: '#5a5870', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '1px 7px' }}>
                            {tpl.content_type}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: '#5a5870', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tpl.content?.slice(0, 80)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Detail */}
        {selected && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e0db', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {selected.name}
                  {selected.is_default && <span style={{ fontSize: 10, color: '#c8a96e', background: 'rgba(200,169,110,0.1)', border: '1px solid rgba(200,169,110,0.2)', borderRadius: 6, padding: '2px 8px' }}>Default</span>}
                </div>
                <div style={{ fontSize: 11, color: '#5a5870', marginTop: 3 }}>
                  {DOC_TYPE_META[selected.doc_type as DocType]?.label || selected.doc_type}
                  {selected.content_type && ` · ${selected.content_type}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="secondary" size="sm" onClick={() => handleCopy(selected.content)}>
                  {copied ? '✓ Copied' : '⎘ Copy'}
                </Button>
                {!selected.is_default && (
                  <Button variant="ghost" size="sm" onClick={() => handleSetDefault(selected.id)}>Default로 설정</Button>
                )}
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

const labelStyle: React.CSSProperties = { fontSize: 10, color: '#3a3850', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' };
const inputSm: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 7, color: '#c8c6c0', fontSize: 12, padding: '7px 10px', outline: 'none', fontFamily: 'inherit',
};
