'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getContent, getDocuments, generateDesign, updateDocument, approveDocument, getJobs, getTemplates } from '@/lib/api';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { DocStatusBadge } from '@/components/StatusBadge';
import MarkdownPreview from '@/components/MarkdownPreview';
import { SkeletonEditor } from '@/components/Skeleton';
import { useJobPoller } from '@/hooks/useJobPoller';

export default function ContentDesignPage() {
  const params = useParams();
  const id = params.id as string;

  const [content, setContent] = useState<any>(null);
  const [doc, setDoc] = useState<any>(null);
  const [planDoc, setPlanDoc] = useState<any>(null);
  const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('split');
  const [initialLoading, setInitialLoading] = useState(true);
  const [editorContent, setEditorContent] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // 비동기 생성 job 추적
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  useJobPoller(activeJobId, {
    onDone: async () => {
      setGenerating(false);
      setActiveJobId(null);
      await loadDocuments();
    },
    onFailed: (msg) => {
      setGenerating(false);
      setActiveJobId(null);
      alert(`생성 실패: ${msg}`);
    },
  });

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    try {
      const c = await getContent(id);
      setContent(c);
    } catch {}
    await loadDocuments();
    setInitialLoading(false);
  }

  async function loadDocuments() {
    try {
      const [designDocs, planDocs] = await Promise.all([
        getDocuments({ content_item_id: id, doc_type: 'design' }),
        getDocuments({ content_item_id: id, doc_type: 'plan' }),
      ]);
      setPlanDoc(planDocs?.[0] || null);
      const existing = designDocs?.[0] || null;
      setDoc(existing);
      if (existing) setEditorContent(existing.content || '');

      // 진행 중인 job 확인 → 폴링 재연결
      if (!existing || generating) {
        const runningJobs = await getJobs({ content_item_id: id, status: 'running', limit: 1 });
        const queuedJobs  = await getJobs({ content_item_id: id, status: 'queued',  limit: 1 });
        const activeJob   = (runningJobs?.data?.[0]) || (queuedJobs?.data?.[0]);
        if (activeJob && activeJob.job_type === 'design_gen') {
          setGenerating(true);
          setActiveJobId(activeJob.id);
        }
      }
    } catch {}
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      let templateContent = '';
      try {
        const tpls = await getTemplates({ doc_type: 'design', content_type: content?.content_type });
        const def = tpls?.find((t: any) => t.is_default) || tpls?.[0];
        if (def) templateContent = def.content;
      } catch {}

      const res = await generateDesign({ content_item_id: id, plan_doc_id: planDoc?.id, template_content: templateContent });
      setActiveJobId(res.job_id);
    } catch (e: any) {
      alert(e.message);
      setGenerating(false);
    }
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
      await loadDocuments();
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
            ) : generating ? (
              <span style={{ fontSize: 12, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#a78bfa', display: 'inline-block', animation: 'pulse 1.2s ease-in-out infinite' }} />
                AI가 Design을 생성 중입니다
              </span>
            ) : (
              <span style={{ fontSize: 12, color: '#3a3850' }}>Design 문서가 없습니다</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {doc && !generating && (
              <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden' }}>
                {(['edit', 'split', 'preview'] as const).map(m => (
                  <button key={m} onClick={() => setMode(m)} style={{
                    padding: '4px 10px', fontSize: 11, border: 'none', cursor: 'pointer',
                    background: mode === m ? 'rgba(200,169,110,0.15)' : 'transparent',
                    color: mode === m ? '#c8a96e' : '#5a5870',
                    borderRight: m !== 'preview' ? '1px solid rgba(255,255,255,0.08)' : 'none',
                  }}>
                    {m === 'edit' ? '편집' : m === 'split' ? '분할' : '미리보기'}
                  </button>
                ))}
              </div>
            )}
            <Button variant="secondary" size="sm" onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, border: '2px solid #9a98a8', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                  생성 중...
                </span>
              ) : doc ? '↺ Regenerate' : '⚡ Generate Design'}
            </Button>
            {doc && !generating && <>
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

      {/* 생성 중 배너 */}
      {generating && (
        <div style={{
          padding: '12px 16px', borderRadius: 10,
          background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)',
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 12,
        }}>
          <span style={{ width: 12, height: 12, border: '2px solid #a78bfa', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
          <span style={{ color: '#a78bfa' }}>Design 문서를 생성 중입니다...</span>
          <span style={{ color: '#5a5870', marginLeft: 4 }}>다른 탭으로 이동해도 됩니다. 완료되면 자동으로 표시됩니다.</span>
          <style dangerouslySetInnerHTML={{ __html: '@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}' }} />
        </div>
      )}

      {/* Editor / Preview */}
      <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0 }}>
        {initialLoading || generating ? (
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
            <SkeletonEditor />
          </div>
        ) : mode !== 'preview' && <textarea
          value={editorContent}
          onChange={e => { setEditorContent(e.target.value); setDirty(true); }}
          placeholder='⚡ Generate Design 버튼으로 AI 설계 문서를 생성하세요.'
          style={{
            flex: 1, resize: 'none',
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12, padding: '18px 20px',
            color: '#c8c6c0', fontSize: 13, lineHeight: 1.7,
            fontFamily: '"SF Mono", "Fira Code", monospace',
            outline: 'none',
          }}
        />}

        {!initialLoading && !generating && (mode === 'preview' || mode === 'split') && editorContent && (
          <div style={{
            flex: mode === 'preview' ? 1 : undefined,
            width: mode === 'split' ? '50%' : undefined,
            flexShrink: 0,
            background: 'rgba(255,255,255,0.015)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12, padding: '20px 24px',
            overflow: 'auto',
          }}>
            <MarkdownPreview content={editorContent} />
          </div>
        )}
      </div>

      {isApproved && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)', fontSize: 12, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>✓</span> Design 승인 완료 — 콘텐츠 상태가 <strong>Designed</strong>로 변경되었습니다.
        </div>
      )}
    </div>
  );
}
