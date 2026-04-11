'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getContent, getDocuments, generatePlan, updateDocument, approveDocument, getJobs, getTemplates, getContentIdeas } from '@/lib/api';
import Card, { CardHeader, CardTitle } from '@/components/Card';
import Button from '@/components/Button';
import { DocStatusBadge } from '@/components/StatusBadge';
import MarkdownPreview from '@/components/MarkdownPreview';
import { SkeletonEditor } from '@/components/Skeleton';
import { useJobPoller } from '@/hooks/useJobPoller';

export default function ContentPlanPage() {
  const params = useParams();
  const id = params.id as string;

  const [content, setContent] = useState<any>(null);
  const [doc, setDoc] = useState<any>(null);
  const [editorContent, setEditorContent] = useState('');
  const [selectedIdeaTitle, setSelectedIdeaTitle] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('split');
  const [initialLoading, setInitialLoading] = useState(true);

  // 비동기 생성 job 추적
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // job 완료 시 문서 리로드
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
      const [c] = await Promise.all([getContent(id)]);
      setContent(c);
      try {
        const ideas = await getContentIdeas(id);
        const selectedIdea = ideas?.find((idea: any) => idea.is_selected) || ideas?.[0];
        const title = Array.isArray(selectedIdea?.suggested_titles) ? selectedIdea.suggested_titles[0] : '';
        setSelectedIdeaTitle(title || '');
      } catch {}
      await loadDocuments();
    } catch {}
    setInitialLoading(false);
  }

  async function loadDocuments() {
    try {
      // 문서 로드
      const docs = await getDocuments({ content_item_id: id, doc_type: 'plan' });
      const existing = docs?.[0] || null;
      setDoc(existing);
      if (existing) setEditorContent(existing.content || '');

      // 진행 중인 job이 있으면 자동으로 폴링 재개 (페이지 복귀 시 연결)
      if (!existing || generating) {
        const runningJobs = await getJobs({ content_item_id: id, status: 'running', limit: 1 });
        const queuedJobs  = await getJobs({ content_item_id: id, status: 'queued',  limit: 1 });
        const activeJob   = (runningJobs?.data?.[0]) || (queuedJobs?.data?.[0]);
        if (activeJob && activeJob.job_type === 'plan_gen') {
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
        const tpls = await getTemplates({ doc_type: 'plan', content_type: content?.content_type });
        const def = tpls?.find((t: any) => t.is_default) || tpls?.[0];
        if (def) templateContent = def.content;
      } catch {}

      const res = await generatePlan({ content_item_id: id, template_content: templateContent });
      // 즉시 job_id 반환 → 폴링 시작
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
    setApproving(true);
    try {
      await approveDocument(doc.id);
      await loadDocuments();
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
            ) : generating ? (
              <span style={{ fontSize: 12, color: '#c8a96e', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c8a96e', display: 'inline-block', animation: 'pulse 1.2s ease-in-out infinite' }} />
                AI가 Plan을 생성 중입니다 — 다른 탭을 이용하셔도 됩니다
              </span>
            ) : (
              <span style={{ fontSize: 12, color: '#3a3850' }}>Plan 문서가 없습니다</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
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
              ) : doc ? '↺ Regenerate' : '⚡ Generate Plan'}
            </Button>
            {doc && !generating && (
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

      {/* 생성 중 배너 */}
      {generating && (
        <div style={{
          padding: '12px 16px', borderRadius: 10,
          background: 'rgba(200,169,110,0.06)', border: '1px solid rgba(200,169,110,0.2)',
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 12,
        }}>
          <span style={{ width: 12, height: 12, border: '2px solid #c8a96e', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
          <span style={{ color: '#c8a96e' }}>Plan 문서를 생성 중입니다...</span>
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
        ) : mode !== 'preview' && (
          <textarea
            value={editorContent}
            onChange={e => { setEditorContent(e.target.value); setDirty(true); }}
            placeholder='⚡ Generate Plan 버튼으로 AI 문서를 생성하거나&#10;직접 Markdown을 입력하세요.'
            style={{
              flex: 1, resize: 'none',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12, padding: '18px 20px',
              color: '#c8c6c0', fontSize: 13, lineHeight: 1.7,
              fontFamily: '"SF Mono", "Fira Code", monospace',
              outline: 'none',
            }}
          />
        )}

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
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)', fontSize: 12, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>✓</span> Plan 승인 완료 — 콘텐츠 상태가 <strong>Planned</strong>로 변경되었습니다.
        </div>
      )}
    </div>
  );
}
