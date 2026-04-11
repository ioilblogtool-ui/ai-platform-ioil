'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getContent, generateIdeas, getContentIdeas, selectContentIdea, type ContentIdea } from '@/lib/api';
import Card, { CardHeader, CardTitle, EmptyState } from '@/components/Card';
import Button from '@/components/Button';

export default function ContentIdeasPage() {
  const params = useParams();
  const id = params.id as string;

  const [content, setContent] = useState<any>(null);
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [generating, setGenerating] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    try {
      const [contentData, ideasData] = await Promise.all([
        getContent(id),
        getContentIdeas(id),
      ]);
      setContent(contentData);
      setIdeas((ideasData || []).map(normalizeIdea));
    } catch {}
  }

  async function handleGenerate() {
    setGenerating(true);
    setSelected(null);

    try {
      const res = await generateIdeas(id);
      if (res.idea) {
        const nextIdea = normalizeIdea(res.idea);
        setIdeas(prev => [nextIdea, ...prev]);
        setSelected(0);
      } else {
        await loadData();
      }
    } catch (e: any) {
      alert(e.message);
    }

    setGenerating(false);
  }

  async function handleCopyIdea(idea: ContentIdea) {
    const title = idea.suggested_titles?.[0] || content?.title || 'Idea';
    const outline = idea.suggested_outline?.length
      ? `\n\nOutline\n${idea.suggested_outline.map((item, index) => `${index + 1}. ${item}`).join('\n')}`
      : '';
    const keywords = idea.seo_keywords?.length ? `\n\nKeywords: ${idea.seo_keywords.join(', ')}` : '';
    const text = `# ${title}\n\n${idea.result_summary || ''}${outline}${keywords}`;

    await navigator.clipboard.writeText(text);
    setCopiedId(idea.id);
    setTimeout(() => setCopiedId(current => (current === idea.id ? null : current)), 1500);
  }

  async function handleUseForPlan(idea: ContentIdea) {
    setSelectingId(idea.id);
    try {
      const saved = normalizeIdea(await selectContentIdea(idea.id));
      setIdeas(prev => prev.map(item => ({
        ...item,
        is_selected: item.id === saved.id,
      })));
      setSelected(prev => {
        if (prev === null) return prev;
        const currentIdea = ideas[prev];
        return currentIdea?.id === idea.id ? prev : prev;
      });
    } catch (e: any) {
      alert(e.message);
    }
    setSelectingId(null);
  }

  const selectedIdea = selected !== null ? ideas[selected] : null;

  return (
    <div style={{ padding: '24px 28px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontSize: 12, color: '#5a5870', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Idea Studio
            </div>
            <div style={{ fontSize: 15, color: '#e2e0db', fontWeight: 600, lineHeight: 1.5 }}>
              {content ? `"${content.title}" ideas` : 'Loading ideas...'}
            </div>
            <div style={{ fontSize: 12, color: '#9a98a8', marginTop: 6 }}>
              {ideas.length > 0 ? `${ideas.length} saved ideas` : 'Generate structured article directions from the current content brief.'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {ideas.length > 0 && (
              <div style={{
                padding: '8px 10px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.06)',
                fontSize: 11,
                color: '#c8a96e',
                fontFamily: 'monospace',
              }}>
                {String(ideas.length).padStart(2, '0')} ideas
              </div>
            )}

            <Button variant="secondary" size="sm" onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating...' : ideas.length > 0 ? 'Regenerate' : 'Generate Ideas'}
            </Button>
          </div>
        </div>
      </Card>

      {ideas.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(320px, 0.85fr)', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {ideas.map((idea, index) => {
              const isSelected = selected === index;
              const title = idea.suggested_titles?.[0] || `Generated Idea ${ideas.length - index}`;

              return (
                <button
                  key={idea.id}
                  onClick={() => setSelected(isSelected ? null : index)}
                  style={{
                    textAlign: 'left',
                    padding: '16px 16px 14px',
                    borderRadius: 14,
                    cursor: 'pointer',
                    background: isSelected
                      ? 'linear-gradient(180deg, rgba(200,169,110,0.14), rgba(200,169,110,0.04))'
                      : 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))',
                    border: isSelected
                      ? '1px solid rgba(200,169,110,0.3)'
                      : '1px solid rgba(255,255,255,0.06)',
                    boxShadow: isSelected ? '0 12px 30px rgba(0,0,0,0.25)' : 'none',
                    transition: 'all 0.16s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#f1efe9', lineHeight: 1.45 }}>
                      {title}
                    </div>
                    {typeof idea.score === 'number' && (
                      <div style={{
                        flexShrink: 0,
                        padding: '4px 8px',
                        borderRadius: 999,
                        background: 'rgba(200,169,110,0.12)',
                        border: '1px solid rgba(200,169,110,0.24)',
                        color: '#c8a96e',
                        fontSize: 11,
                        fontFamily: 'monospace',
                      }}>
                        {idea.score}
                      </div>
                    )}
                  </div>

                  {idea.is_selected && (
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 10,
                      padding: '4px 8px',
                      borderRadius: 999,
                      background: 'rgba(74,222,128,0.12)',
                      border: '1px solid rgba(74,222,128,0.18)',
                      fontSize: 10,
                      color: '#4ade80',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}>
                      Plan Source
                    </div>
                  )}

                  <div style={{ fontSize: 12, color: '#a7a4b1', lineHeight: 1.65, minHeight: 80 }}>
                    {truncateText(idea.result_summary || 'No summary available.', 170)}
                  </div>

                  {idea.seo_keywords && idea.seo_keywords.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                      {idea.seo_keywords.slice(0, 3).map((keyword, keywordIndex) => (
                        <span
                          key={`${idea.id}-${keywordIndex}`}
                          style={{
                            fontSize: 10,
                            color: '#8f8aa1',
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 999,
                            padding: '3px 8px',
                          }}
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                    <div style={{ fontSize: 10, color: '#5a5870', fontFamily: 'monospace' }}>
                      {formatDate(idea.created_at)}
                    </div>
                      <div style={{ fontSize: 10, color: isSelected ? '#c8a96e' : '#5a5870' }}>
                      {idea.is_selected ? 'Used for plan' : isSelected ? 'Selected' : 'Open'}
                      </div>
                  </div>
                </button>
              );
            })}
          </div>

          <Card style={{ padding: 0, overflow: 'hidden', position: 'sticky', top: 0 }}>
            {selectedIdea ? (
              <>
                <div style={{
                  padding: '18px 20px 16px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  background: 'linear-gradient(180deg, rgba(200,169,110,0.12), rgba(200,169,110,0.03))',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#8f7a52', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                        Idea Detail
                      </div>
                      <div style={{ fontSize: 18, color: '#f4f1ea', fontWeight: 600, lineHeight: 1.45 }}>
                        {selectedIdea.suggested_titles?.[0] || 'Idea Detail'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleCopyIdea(selectedIdea)}
                      style={{
                        flexShrink: 0,
                        fontSize: 11,
                        color: '#c8a96e',
                        background: 'rgba(200,169,110,0.1)',
                        border: '1px solid rgba(200,169,110,0.2)',
                        borderRadius: 8,
                        padding: '7px 12px',
                        cursor: 'pointer',
                      }}
                    >
                      {copiedId === selectedIdea.id ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                    <button
                      onClick={() => handleUseForPlan(selectedIdea)}
                      disabled={selectingId === selectedIdea.id || selectedIdea.is_selected}
                      style={{
                        fontSize: 11,
                        color: selectedIdea.is_selected ? '#4ade80' : '#c8a96e',
                        background: selectedIdea.is_selected ? 'rgba(74,222,128,0.12)' : 'rgba(200,169,110,0.1)',
                        border: selectedIdea.is_selected ? '1px solid rgba(74,222,128,0.18)' : '1px solid rgba(200,169,110,0.2)',
                        borderRadius: 8,
                        padding: '7px 12px',
                        cursor: selectedIdea.is_selected ? 'default' : 'pointer',
                      }}
                    >
                      {selectedIdea.is_selected ? 'Selected for Plan' : selectingId === selectedIdea.id ? 'Saving...' : 'Use for Plan'}
                    </button>
                    <span style={{ fontSize: 11, color: '#5a5870' }}>
                      {selectedIdea.is_selected ? 'Plan generation will use this idea first.' : 'Save this idea as the source for Plan generation.'}
                    </span>
                  </div>
                </div>

                <div style={{ padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <Section title="Summary" color="#c8a96e">
                    <div style={{ fontSize: 13, color: '#b8b4c2', lineHeight: 1.75 }}>
                      {selectedIdea.result_summary || 'No summary available.'}
                    </div>
                  </Section>

                  {selectedIdea.suggested_titles && selectedIdea.suggested_titles.length > 0 && (
                    <Section title="Suggested Titles" color="#60a5fa">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {selectedIdea.suggested_titles.map((title, index) => (
                          <div key={index} style={{
                            fontSize: 12,
                            color: '#dde5f7',
                            lineHeight: 1.55,
                            padding: '10px 12px',
                            borderRadius: 10,
                            background: 'rgba(96,165,250,0.06)',
                            border: '1px solid rgba(96,165,250,0.12)',
                          }}>
                            {title}
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {selectedIdea.suggested_outline && selectedIdea.suggested_outline.length > 0 && (
                    <Section title="Outline" color="#a78bfa">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {selectedIdea.suggested_outline.map((item, index) => (
                          <div key={index} style={{ display: 'flex', gap: 10 }}>
                            <div style={{
                              width: 22,
                              height: 22,
                              borderRadius: 999,
                              flexShrink: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 11,
                              color: '#a78bfa',
                              background: 'rgba(167,139,250,0.08)',
                              border: '1px solid rgba(167,139,250,0.16)',
                            }}>
                              {index + 1}
                            </div>
                            <div style={{ fontSize: 12, color: '#b8b4c2', lineHeight: 1.6, paddingTop: 2 }}>
                              {item}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {selectedIdea.seo_keywords && selectedIdea.seo_keywords.length > 0 && (
                    <Section title="SEO Keywords" color="#4ade80">
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {selectedIdea.seo_keywords.map((keyword, index) => (
                          <span key={index} style={{
                            fontSize: 11,
                            color: '#4ade80',
                            background: 'rgba(74,222,128,0.1)',
                            border: '1px solid rgba(74,222,128,0.18)',
                            borderRadius: 999,
                            padding: '5px 10px',
                          }}>
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </Section>
                  )}

                  {(selectedIdea.strengths || selectedIdea.weaknesses) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <InsightCard title="Strengths" color="#4ade80" text={selectedIdea.strengths || 'None'} />
                      <InsightCard title="Weaknesses" color="#f87171" text={selectedIdea.weaknesses || 'None'} />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ padding: '44px 24px' }}>
                <EmptyState icon="◈" text="Select an idea card to see the structured detail." />
              </div>
            )}
          </Card>
        </div>
      ) : !generating ? (
        <Card>
          <EmptyState icon="◈" text="Generate Ideas to create structured article directions." />
        </Card>
      ) : (
        <Card>
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#5a5870', marginBottom: 16 }}>
              AI is generating ideas...
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
              {[0, 1, 2].map(index => (
                <div
                  key={index}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#c8a96e',
                    opacity: 0.5,
                    animation: `pulse 1.2s ${index * 0.4}s infinite`,
                  }}
                />
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Section({
  title,
  color,
  children,
}: {
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ fontSize: 10, color, marginBottom: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function InsightCard({ title, color, text }: { title: string; color: string; text: string }) {
  return (
    <div style={{
      padding: '12px 14px',
      borderRadius: 12,
      background: `${color}10`,
      border: `1px solid ${color}22`,
    }}>
      <div style={{ fontSize: 10, color, marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {title}
      </div>
      <div style={{ fontSize: 12, color: '#b8b4c2', lineHeight: 1.7 }}>
        {text}
      </div>
    </div>
  );
}

function normalizeIdea(idea: any): ContentIdea {
  const parsed = parseEmbeddedIdeaPayload(idea);

  return {
    ...idea,
    suggested_titles: Array.isArray(parsed?.suggested_titles) ? parsed.suggested_titles : [],
    suggested_outline: Array.isArray(parsed?.suggested_outline) ? parsed.suggested_outline : [],
    seo_keywords: Array.isArray(parsed?.seo_keywords) ? parsed.seo_keywords : [],
    strengths: parsed?.strengths || null,
    weaknesses: parsed?.weaknesses || null,
    result_summary: parsed?.result_summary || null,
    score: typeof parsed?.score === 'number' ? parsed.score : null,
    is_selected: Boolean(idea?.is_selected),
    created_at: idea?.created_at || new Date().toISOString(),
  };
}

function parseEmbeddedIdeaPayload(idea: any) {
  const directPayload = {
    result_summary: idea?.result_summary,
    suggested_titles: idea?.suggested_titles,
    suggested_outline: idea?.suggested_outline,
    seo_keywords: idea?.seo_keywords,
    strengths: idea?.strengths,
    weaknesses: idea?.weaknesses,
    score: idea?.score,
  };

  if (
    directPayload.result_summary &&
    (Array.isArray(directPayload.suggested_titles) || Array.isArray(directPayload.suggested_outline))
  ) {
    return directPayload;
  }

  if (typeof idea?.result_summary !== 'string') {
    return directPayload;
  }

  const raw = idea.result_summary.trim();
  const fenced = raw.match(/^```json\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1] : raw;

  try {
    const parsed = JSON.parse(candidate);
    return {
      result_summary: parsed?.result_summary || directPayload.result_summary,
      suggested_titles: parsed?.suggested_titles || directPayload.suggested_titles,
      suggested_outline: parsed?.suggested_outline || directPayload.suggested_outline,
      seo_keywords: parsed?.seo_keywords || directPayload.seo_keywords,
      strengths: parsed?.strengths || directPayload.strengths,
      weaknesses: parsed?.weaknesses || directPayload.weaknesses,
      score: parsed?.score ?? directPayload.score,
    };
  } catch {
    return directPayload;
  }
}

function truncateText(value: string, limit: number) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit).trim()}...`;
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString('ko-KR');
  } catch {
    return value;
  }
}
