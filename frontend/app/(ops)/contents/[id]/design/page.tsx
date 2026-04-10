'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getDocuments, generateDesign, updateDocument, approveDocument } from '@/lib/api';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { DocStatusBadge } from '@/components/StatusBadge';

export default function ContentDesignPage() {
  const params = useParams();
  const id = params.id as string;

  const [doc, setDoc] = useState<any>(null);
  const [planDoc, setPlanDoc] = useState<any>(null);
  const [editorContent, setEditorContent] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    try {
      const [designDocs, planDocs] = await Promise.all([
        getDocuments({ content_item_id: id, doc_type: 'design' }),
        getDocuments({ content_item_id: id, doc_type: 'plan' }),
      ]);
      setPlanDoc(planDocs?.[0] || null);
      const existing = designDocs?.[0] || null;
      setDoc(existing);
      if (existing) setEditorContent(existing.content || '');
    } catch {}
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await generateDesign({ content_item_id: id, plan_doc_id: planDoc?.id });
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
    if (dirty) await handleSave();
    try {
      await approveDocument(doc.id);
      await loadData();
    } catch (e: any) { alert(e.message); }
  }

  const isApproved = doc?.status === 'approved';

  return (
    <div style={{ padding: '24px 28px 40px', display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>

      {/* Reference Plan */}
      {planDoc && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.15)', fontSize: 12, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>≡</span>
          <span>기반 Plan: {planDoc.file_path?.split('/').pop()}</span>
          <DocStatusBadge value={planDoc.status} size="sm" />
        </div>
      )}

      {/* Meta + Actions */}
      <Card style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            {doc ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#9a98a8', fontFamily: 'monospace' }}>{doc.file_path || 'docs/design/...'}</span>
                <DocStatusBadge value={doc.status} />
                {dirty && <span style={{ fontSize: 10, color: '#fbbf24' }}>● 미저장</span>}
              </div>
            ) : (
              <span style={{ fontSize: 12, color: '#3a3850' }}>Design 문서가 없습니다</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={handleGenerate} disabled={generating}>
              {generating ? '생성 중...' : doc ? '↺ Regenerate' : '⚡ Generate Design'}
            </Button>
            {doc && <>
              <Button variant="secondary" size="sm" onClick={handleSave} disabled={saving || !dirty}>
                {saving ? '저장 중...' : '저장'}
              </Button>
              <Button variant={isApproved ? 'ghost' : 'primary'} size="sm" onClick={handleApprove} disabled={isApproved}>
                {isApproved ? '✓ Approved' : 'Approve →'}
              </Button>
            </>}
          </div>
        </div>
      </Card>

      {/* Editor */}
      <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0 }}>
        <textarea
          value={editorContent}
          onChange={e => { setEditorContent(e.target.value); setDirty(true); }}
          placeholder={'⚡ Generate Design 버튼으로 AI 설계 문서를 생성하세요.\n\n# 화면 설계서\n\n## 화면 목록\n\n## 컴포넌트 구조\n\n## 데이터 모델\n\n## 상태 흐름'}
          disabled={generating}
          style={{
            flex: 1, resize: 'none',
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12, padding: '18px 20px',
            color: '#c8c6c0', fontSize: 13, lineHeight: 1.7,
            fontFamily: '"SF Mono", "Fira Code", monospace',
            outline: 'none', minHeight: 400,
          }}
        />
      </div>

      {isApproved && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)', fontSize: 12, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>✓</span> Design 승인 완료 — 콘텐츠 상태가 <strong>Designed</strong>로 변경되었습니다.
        </div>
      )}
    </div>
  );
}
