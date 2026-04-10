'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getContent, getDocuments, generatePlan, updateDocument, approveDocument, createDocument, getTemplates } from '@/lib/api';
import Card, { CardHeader, CardTitle } from '@/components/Card';
import Button from '@/components/Button';
import { DocStatusBadge } from '@/components/StatusBadge';

export default function ContentPlanPage() {
  const params = useParams();
  const id = params.id as string;

  const [content, setContent] = useState<any>(null);
  const [doc, setDoc] = useState<any>(null);
  const [editorContent, setEditorContent] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    try {
      const [c, docs] = await Promise.all([
        getContent(id),
        getDocuments({ content_item_id: id, doc_type: 'plan' }),
      ]);
      setContent(c);
      const existing = docs?.[0] || null;
      setDoc(existing);
      if (existing) setEditorContent(existing.content || '');
    } catch {}
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      let templateContent = '';
      try {
        const tpls = await getTemplates({ doc_type: 'plan', content_type: content?.content_type });
        const def = tpls?.find((t: any) => t.is_default) || tpls?.[0];
        if (def) templateContent = def.content;
      } catch {}

      const res = await generatePlan({ content_item_id: id, template_content: templateContent });
      setDoc(res.document);
      setEditorContent(res.document.content || '');
      setDirty(false);
    } catch (e: any) { alert(e.message); }
    setGenerating(false);
  }

  async function handleSave() {
    if (!doc) return;
    setSaving(true);
    try {
      const updated = await updateDocument(doc.id, { content: editorContent });
      setDoc(updated);
      setDirty(false);
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  }

  async function handleApprove() {
    if (!doc) return;
    // 저장 먼저
    if (dirty) await handleSave();
    setApproving(true);
    try {
      await approveDocument(doc.id);
      await loadData();
    } catch (e: any) { alert(e.message); }
    setApproving(false);
  }

  const isApproved = doc?.status === 'approved';

  return (
    <div style={{ padding: '24px 28px 40px', display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>

      {/* Meta + Actions */}
      <Card style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {doc ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#9a98a8', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {doc.file_path || 'docs/plan/...'}
                </span>
                <span style={{ fontSize: 11, color: '#5a5870' }}>v{doc.version || '1'}</span>
                <DocStatusBadge value={doc.status} />
                {dirty && <span style={{ fontSize: 10, color: '#fbbf24' }}>● 미저장</span>}
              </div>
            ) : (
              <span style={{ fontSize: 12, color: '#3a3850' }}>Plan 문서가 없습니다</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Button variant="secondary" size="sm" onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, border: '2px solid #9a98a8', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                  생성 중...
                </span>
              ) : doc ? '↺ Regenerate' : '⚡ Generate Plan'}
            </Button>
            {doc && (
              <>
                <Button variant="secondary" size="sm" onClick={handleSave} disabled={saving || !dirty}>
                  {saving ? '저장 중...' : '저장'}
                </Button>
                <Button
                  variant={isApproved ? 'ghost' : 'primary'}
                  size="sm"
                  onClick={handleApprove}
                  disabled={approving || isApproved}
                >
                  {isApproved ? '✓ Approved' : approving ? '처리 중...' : 'Approve →'}
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Editor */}
      <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0 }}>
        {/* Markdown Editor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <textarea
            value={editorContent}
            onChange={e => { setEditorContent(e.target.value); setDirty(true); }}
            placeholder={generating ? '생성 중...' : '⚡ Generate Plan 버튼으로 AI 문서를 생성하거나\n직접 Markdown을 입력하세요.\n\n# Plan 제목\n\n## 목적\n\n## 타겟 사용자\n\n## 핵심 기능\n\n## UI 구성\n\n## 데이터 요구사항'}
            disabled={generating}
            style={{
              flex: 1, resize: 'none',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12, padding: '18px 20px',
              color: '#c8c6c0', fontSize: 13, lineHeight: 1.7,
              fontFamily: '"SF Mono", "Fira Code", monospace',
              outline: 'none', minHeight: 400,
            }}
          />
        </div>

        {/* Preview (간단) */}
        {editorContent && (
          <div style={{
            width: 380, flexShrink: 0,
            background: 'rgba(255,255,255,0.015)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12, padding: '18px 20px',
            overflow: 'auto',
          }}>
            <div style={{ fontSize: 10, color: '#3a3850', marginBottom: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Preview</div>
            <MarkdownPreview content={editorContent} />
          </div>
        )}
      </div>

      {isApproved && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)', fontSize: 12, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>✓</span> Plan 승인 완료 — 콘텐츠 상태가 <strong>Planned</strong>로 변경되었습니다.
        </div>
      )}
    </div>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div style={{ fontSize: 12, color: '#9a98a8', lineHeight: 1.7 }}>
      {lines.map((line, i) => {
        if (line.startsWith('# '))  return <div key={i} style={{ fontSize: 16, fontWeight: 700, color: '#e2e0db', margin: '12px 0 6px' }}>{line.slice(2)}</div>;
        if (line.startsWith('## ')) return <div key={i} style={{ fontSize: 13, fontWeight: 600, color: '#c8c6c0', margin: '10px 0 4px' }}>{line.slice(3)}</div>;
        if (line.startsWith('### ')) return <div key={i} style={{ fontSize: 12, fontWeight: 600, color: '#9a98a8', margin: '8px 0 3px' }}>{line.slice(4)}</div>;
        if (line.startsWith('- ')) return <div key={i} style={{ paddingLeft: 12, color: '#9a98a8' }}>• {line.slice(2)}</div>;
        if (line.trim() === '') return <div key={i} style={{ height: 6 }} />;
        return <div key={i}>{line}</div>;
      })}
    </div>
  );
}
