'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getDocuments, generateDevRequest, updateDocument, getJobs, createDocument } from '@/lib/api';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { DocStatusBadge } from '@/components/StatusBadge';
import { SkeletonEditor } from '@/components/Skeleton';
import { useJobPoller } from '@/hooks/useJobPoller';

type TargetModel = 'claude' | 'gpt' | 'gemini' | 'codex';
type PromptStyle = 'implement' | 'modify' | 'refactor';

const MODEL_OPTIONS: { value: TargetModel; label: string; color: string }[] = [
  { value: 'claude', label: 'Claude Code', color: '#c8a96e' },
  { value: 'gpt',    label: 'GPT',         color: '#4ade80' },
  { value: 'codex',  label: 'Codex',       color: '#60a5fa' },
];
const STYLE_OPTIONS: { value: PromptStyle; label: string }[] = [
  { value: 'implement', label: '신규 구현' },
  { value: 'modify',    label: '기능 수정' },
  { value: 'refactor',  label: '리팩토링' },
];

export default function ContentDevRequestPage() {
  const params = useParams();
  const id = params.id as string;

  const [doc, setDoc] = useState<any>(null);
  const [designDoc, setDesignDoc] = useState<any>(null);
  const [editorContent, setEditorContent] = useState('');
  const [targetModel, setTargetModel] = useState<TargetModel>('claude');
  const [promptStyle, setPromptStyle] = useState<PromptStyle>('implement');
  const [generating, setGenerating] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
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
    await loadDocuments();
    setInitialLoading(false);
  }

  async function loadDocuments() {
    try {
      const [devDocs, dsnDocs] = await Promise.all([
        getDocuments({ content_item_id: id, doc_type: 'dev_request' }),
        getDocuments({ content_item_id: id, doc_type: 'design' }),
      ]);
      setDesignDoc(dsnDocs?.[0] || null);
      const existing = devDocs?.[0] || null;
      setDoc(existing);
      if (existing) setEditorContent(existing.content || '');

      // 진행 중인 job 확인 → 폴링 재연결
      if (!existing || generating) {
        const runningJobs = await getJobs({ content_item_id: id, status: 'running', limit: 1 });
        const queuedJobs  = await getJobs({ content_item_id: id, status: 'queued',  limit: 1 });
        const activeJob   = (runningJobs?.data?.[0]) || (queuedJobs?.data?.[0]);
        if (activeJob && activeJob.job_type === 'dev_request_gen') {
          setGenerating(true);
          setActiveJobId(activeJob.id);
        }
      }
    } catch {}
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await generateDevRequest({
        content_item_id: id,
        design_doc_id: designDoc?.id,
        target_model: targetModel,
        prompt_style: promptStyle,
      });
      setActiveJobId(res.job_id);
    } catch (e: any) {
      alert(e.message);
      setGenerating(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (!doc) {
        const created = await createDocument({
          content_item_id: id,
          doc_type: 'dev_request',
          content: editorContent,
          generated_by: 'manual',
        });
        setDoc(created);
      } else {
        const updated = await updateDocument(doc.id, { content: editorContent });
        setDoc(updated);
      }
      setDirty(false);
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(editorContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ padding: '24px 28px 40px', display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>

      {/* Design reference */}
      {designDoc && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.15)', fontSize: 12, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>▦</span>
          <span>기반 Design: {designDoc.file_path?.split('/').pop()}</span>
          <DocStatusBadge value={designDoc.status} size="sm" />
        </div>
      )}

      {/* Options */}
      <Card style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          {/* Target Model */}
          <div>
            <div style={{ fontSize: 10, color: '#3a3850', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Target Model</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {MODEL_OPTIONS.map(m => (
                <button key={m.value} onClick={() => setTargetModel(m.value)} disabled={generating} style={{
                  padding: '5px 12px', borderRadius: 7, cursor: generating ? 'not-allowed' : 'pointer', fontSize: 11,
                  border: targetModel === m.value ? `1px solid ${m.color}50` : '1px solid rgba(255,255,255,0.07)',
                  background: targetModel === m.value ? `${m.color}12` : 'rgba(255,255,255,0.02)',
                  color: targetModel === m.value ? m.color : '#5a5870',
                  fontWeight: targetModel === m.value ? 500 : 400,
                }}>{m.label}</button>
              ))}
            </div>
          </div>

          {/* Prompt Style */}
          <div>
            <div style={{ fontSize: 10, color: '#3a3850', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Prompt Style</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {STYLE_OPTIONS.map(s => (
                <button key={s.value} onClick={() => setPromptStyle(s.value)} disabled={generating} style={{
                  padding: '5px 12px', borderRadius: 7, cursor: generating ? 'not-allowed' : 'pointer', fontSize: 11,
                  border: promptStyle === s.value ? '1px solid rgba(251,146,60,0.4)' : '1px solid rgba(255,255,255,0.07)',
                  background: promptStyle === s.value ? 'rgba(251,146,60,0.1)' : 'rgba(255,255,255,0.02)',
                  color: promptStyle === s.value ? '#fb923c' : '#5a5870',
                }}>{s.label}</button>
              ))}
            </div>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, border: '2px solid #9a98a8', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                  생성 중...
                </span>
              ) : doc ? '↺ Regenerate' : '⚡ Generate Dev Request'}
            </Button>
            {!generating && <>
              <Button variant="secondary" size="sm" onClick={handleSave} disabled={saving || (!dirty && !!doc) || !editorContent.trim()}>
                {saving ? '저장 중...' : '저장'}
              </Button>
              <Button variant="secondary" size="sm" onClick={handleCopy} disabled={!editorContent.trim()}>
                {copied ? '✓ Copied!' : '⎘ Copy'}
              </Button>
            </>}
          </div>
        </div>
      </Card>

      {/* 생성 중 배너 */}
      {generating && (
        <div style={{
          padding: '12px 16px', borderRadius: 10,
          background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.2)',
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 12,
        }}>
          <span style={{ width: 12, height: 12, border: '2px solid #fb923c', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
          <span style={{ color: '#fb923c' }}>Dev Request를 생성 중입니다...</span>
          <span style={{ color: '#5a5870', marginLeft: 4 }}>다른 탭으로 이동해도 됩니다. 완료되면 자동으로 표시됩니다.</span>
          <style dangerouslySetInnerHTML={{ __html: '@keyframes spin{to{transform:rotate(360deg)}}' }} />
        </div>
      )}

      {/* Editor */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {initialLoading || generating ? (
          <div style={{ height: '100%', minHeight: 480, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
            <SkeletonEditor />
          </div>
        ) : (
          <textarea
            value={editorContent}
            onChange={e => { setEditorContent(e.target.value); setDirty(true); }}
            placeholder={'⚡ Generate Dev Request 버튼으로 개발 요청서를 생성하세요.\n\n# 개발 요청서\n\n## 목표\n\n## 참고 문서\n\n## 구현 요구사항\n\n## 수정 대상 파일\n\n## 완료 기준'}
            style={{
              width: '100%', height: '100%', minHeight: 480, resize: 'none',
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12, padding: '18px 20px',
              color: '#c8c6c0', fontSize: 13, lineHeight: 1.7,
              fontFamily: '"SF Mono", "Fira Code", monospace',
              outline: 'none',
            }}
          />
        )}
      </div>

      {doc && !generating && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.15)', fontSize: 12, color: '#fb923c', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>◎</span> Dev Request 저장 완료 — 콘텐츠 상태를 <strong>Ready Dev</strong>로 변경할 수 있습니다.
        </div>
      )}
    </div>
  );
}
