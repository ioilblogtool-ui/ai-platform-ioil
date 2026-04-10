'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getGitChanges, createGitChange, updateGitChange } from '@/lib/api';
import Card, { CardHeader, CardTitle, EmptyState } from '@/components/Card';
import Button from '@/components/Button';

type MergeStatus = 'open' | 'merged' | 'closed';

const MERGE_STATUS_META: Record<MergeStatus, { label: string; color: string; bg: string }> = {
  open:   { label: 'Open',   color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
  merged: { label: 'Merged', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
  closed: { label: 'Closed', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
};

const EMPTY_FORM = { branch_name: '', commit_sha: '', pr_url: '', merge_status: 'open' as MergeStatus, notes: '' };

export default function ContentGitPage() {
  const params = useParams();
  const id = params.id as string;

  const [gitChanges, setGitChanges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    try {
      const data = await getGitChanges(id);
      setGitChanges(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      if (editingId) {
        await updateGitChange(editingId, form);
      } else {
        await createGitChange({ content_item_id: id, ...form });
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      setEditingId(null);
      await loadData();
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  }

  function startEdit(gc: any) {
    setForm({
      branch_name: gc.branch_name || '',
      commit_sha: gc.commit_sha || '',
      pr_url: gc.pr_url || '',
      merge_status: gc.merge_status || 'open',
      notes: gc.notes || '',
    });
    setEditingId(gc.id);
    setShowForm(true);
  }

  function cancelForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  }

  return (
    <div style={{ padding: '24px 28px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <Card style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, color: '#9a98a8' }}>Git 브랜치 및 PR 정보를 관리합니다</div>
          {!showForm && (
            <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>
              + Git 정보 추가
            </Button>
          )}
        </div>
      </Card>

      {/* Form */}
      {showForm && (
        <Card accent="#fbbf24">
          <CardHeader>
            <CardTitle>{editingId ? 'Git 정보 수정' : 'Git 정보 추가'}</CardTitle>
            <button onClick={cancelForm} style={{ background: 'none', border: 'none', color: '#5a5870', cursor: 'pointer', fontSize: 14 }}>✕</button>
          </CardHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Branch Name" placeholder="feature/my-content" value={form.branch_name} onChange={v => setForm(f => ({ ...f, branch_name: v }))} monospace />
              <FormField label="Commit SHA" placeholder="a1b2c3d..." value={form.commit_sha} onChange={v => setForm(f => ({ ...f, commit_sha: v }))} monospace />
            </div>
            <FormField label="PR URL" placeholder="https://github.com/..." value={form.pr_url} onChange={v => setForm(f => ({ ...f, pr_url: v }))} />

            <div>
              <div style={{ fontSize: 10, color: '#3a3850', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Merge Status</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(Object.keys(MERGE_STATUS_META) as MergeStatus[]).map(s => {
                  const m = MERGE_STATUS_META[s];
                  return (
                    <button key={s} onClick={() => setForm(f => ({ ...f, merge_status: s }))} style={{
                      padding: '5px 14px', borderRadius: 7, cursor: 'pointer', fontSize: 11,
                      background: form.merge_status === s ? m.bg : 'rgba(255,255,255,0.02)',
                      border: form.merge_status === s ? `1px solid ${m.color}40` : '1px solid rgba(255,255,255,0.07)',
                      color: form.merge_status === s ? m.color : '#5a5870',
                    }}>{m.label}</button>
                  );
                })}
              </div>
            </div>

            <FormField label="Notes" placeholder="메모 (선택사항)" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={cancelForm}>취소</Button>
              <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving || !form.branch_name}>
                {saving ? '저장 중...' : editingId ? '수정 저장' : '추가'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Git Changes List */}
      {loading ? (
        <Card><EmptyState icon="⎇" text="로딩 중..." /></Card>
      ) : gitChanges.length === 0 ? (
        <Card><EmptyState icon="⎇" text="Git 정보가 없습니다. 브랜치를 생성하고 연결하세요." /></Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {gitChanges.map((gc) => {
            const ms = MERGE_STATUS_META[gc.merge_status as MergeStatus] || MERGE_STATUS_META.open;
            return (
              <Card key={gc.id}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#c8c6c0', fontWeight: 500 }}>⎇ {gc.branch_name}</span>
                      <span style={{ fontSize: 11, color: ms.color, background: ms.bg, border: `1px solid ${ms.color}30`, borderRadius: 8, padding: '2px 8px' }}>{ms.label}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {gc.commit_sha && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <span style={{ fontSize: 10, color: '#3a3850', width: 56, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: 1 }}>Commit</span>
                          <span style={{ fontSize: 12, color: '#6a6880', fontFamily: 'monospace' }}>{gc.commit_sha.slice(0, 8)}</span>
                        </div>
                      )}
                      {gc.pr_url && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <span style={{ fontSize: 10, color: '#3a3850', width: 56, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: 1 }}>PR</span>
                          <a href={gc.pr_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#60a5fa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {gc.pr_url}
                          </a>
                        </div>
                      )}
                      {gc.notes && (
                        <div style={{ fontSize: 12, color: '#5a5870', marginTop: 4, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 7, borderLeft: '2px solid rgba(255,255,255,0.06)' }}>
                          {gc.notes}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <Button variant="ghost" size="sm" onClick={() => startEdit(gc)}>수정</Button>
                  </div>
                </div>
                <div style={{ marginTop: 10, fontSize: 10, color: '#2a2840' }}>
                  {new Date(gc.created_at).toLocaleString('ko-KR')}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FormField({ label, placeholder, value, onChange, monospace }: {
  label: string; placeholder?: string; value: string;
  onChange: (v: string) => void; monospace?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#3a3850', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8, color: '#c8c6c0', fontSize: 12, padding: '8px 12px', outline: 'none',
          fontFamily: monospace ? '"SF Mono", "Fira Code", monospace' : 'inherit',
        }}
      />
    </div>
  );
}
