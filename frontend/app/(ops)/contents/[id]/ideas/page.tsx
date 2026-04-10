'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getContent, generateIdeas, getActivity } from '@/lib/api';
import Card, { CardHeader, CardTitle, EmptyState } from '@/components/Card';
import Button from '@/components/Button';

type Idea = {
  title: string;
  description: string;
  keywords?: string[];
  priority?: 'high' | 'medium' | 'low';
};

export default function ContentIdeasPage() {
  const params = useParams();
  const id = params.id as string;

  const [content, setContent] = useState<any>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [generating, setGenerating] = useState(false);
  const [rawOutput, setRawOutput] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    try {
      const c = await getContent(id);
      setContent(c);
      // activity에서 이전 ideas 결과 복원 시도
      const acts = await getActivity({ content_item_id: id });
      const ideaAct = (acts || []).find((a: any) => a.action === 'ideas_generated');
      if (ideaAct?.metadata?.ideas) {
        setIdeas(ideaAct.metadata.ideas);
        setRawOutput(ideaAct.metadata.raw || '');
      }
    } catch {}
  }

  async function handleGenerate() {
    setGenerating(true);
    setIdeas([]);
    setRawOutput('');
    setSelected(null);
    try {
      const res = await generateIdeas(id);
      if (res.ideas) {
        setIdeas(res.ideas);
      }
      if (res.raw) setRawOutput(res.raw);
    } catch (e: any) { alert(e.message); }
    setGenerating(false);
  }

  async function handleCopyIdea(idea: Idea) {
    const text = `# ${idea.title}\n\n${idea.description}${idea.keywords?.length ? `\n\nKeywords: ${idea.keywords.join(', ')}` : ''}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const PRIORITY_META = {
    high:   { color: '#f87171', label: 'High' },
    medium: { color: '#fbbf24', label: 'Medium' },
    low:    { color: '#4ade80', label: 'Low' },
  };

  return (
    <div style={{ padding: '24px 28px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <Card style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: '#9a98a8' }}>
              {content ? `"${content.title}" 에 대한 아이디어를 AI로 생성합니다` : '로딩 중...'}
            </div>
            {ideas.length > 0 && (
              <div style={{ fontSize: 11, color: '#3a3850', marginTop: 4 }}>{ideas.length}개 아이디어 생성됨</div>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, border: '2px solid #9a98a8', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                생성 중...
              </span>
            ) : ideas.length > 0 ? '↺ Regenerate' : '⚡ Generate Ideas'}
          </Button>
        </div>
      </Card>

      {/* Ideas Grid */}
      {ideas.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {ideas.map((idea, i) => {
            const isSelected = selected === i;
            const pri = idea.priority ? PRIORITY_META[idea.priority] : null;
            return (
              <div
                key={i}
                onClick={() => setSelected(isSelected ? null : i)}
                style={{
                  padding: '16px 18px',
                  borderRadius: 12,
                  cursor: 'pointer',
                  background: isSelected
                    ? 'linear-gradient(135deg, rgba(200,169,110,0.08), rgba(200,169,110,0.03))'
                    : 'linear-gradient(135deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))',
                  border: isSelected
                    ? '1px solid rgba(200,169,110,0.3)'
                    : '1px solid rgba(255,255,255,0.06)',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e0db', lineHeight: 1.4, flex: 1 }}>
                    {idea.title}
                  </div>
                  {pri && (
                    <span style={{ fontSize: 10, color: pri.color, border: `1px solid ${pri.color}40`, borderRadius: 8, padding: '2px 7px', flexShrink: 0 }}>
                      {pri.label}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#6a6880', lineHeight: 1.6, marginBottom: 10 }}>
                  {idea.description}
                </div>
                {idea.keywords && idea.keywords.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {idea.keywords.map((kw, ki) => (
                      <span key={ki} style={{ fontSize: 10, color: '#5a5870', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '2px 7px' }}>
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
                {isSelected && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
                    <button
                      onClick={e => { e.stopPropagation(); handleCopyIdea(idea); }}
                      style={{ fontSize: 11, color: '#c8a96e', background: 'rgba(200,169,110,0.1)', border: '1px solid rgba(200,169,110,0.2)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}
                    >
                      {copied ? '✓ Copied' : '⎘ Copy'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : !generating ? (
        <Card>
          <EmptyState icon="◈" text='⚡ Generate Ideas 버튼으로 AI 아이디어를 생성하세요' />
        </Card>
      ) : (
        <Card>
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#5a5870', marginBottom: 16 }}>AI가 아이디어를 생성하고 있습니다...</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#c8a96e', opacity: 0.5, animation: `pulse 1.2s ${i * 0.4}s infinite` }} />
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Raw Output */}
      {rawOutput && (
        <Card>
          <CardHeader>
            <CardTitle>Raw Output</CardTitle>
          </CardHeader>
          <pre style={{ fontSize: 11, color: '#5a5870', fontFamily: '"SF Mono", monospace', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 240, overflow: 'auto' }}>
            {rawOutput}
          </pre>
        </Card>
      )}
    </div>
  );
}
