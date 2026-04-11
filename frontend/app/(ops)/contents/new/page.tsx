'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createContent, generateIdeas, checkSimilarity } from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import Card, { CardTitle } from '@/components/Card';
import Button from '@/components/Button';

const STEPS = ['Basic Info', 'Idea Input', 'AI Generate', 'Select Result'];
const CATEGORIES = ['연봉/임금', '투자/ETF', '부동산', '세금/절세', '노후/연금', '육아/교육', '보험', '자동차', '생활비', '기타'];
const PRIORITIES = [
  { value: 2, label: '높음', color: '#f87171' },
  { value: 1, label: '보통', color: '#fbbf24' },
  { value: 0, label: '낮음', color: '#4ade80' },
];

type SimilarityResult = {
  score: number;
  level: 'ok' | 'warn' | 'block';
  reason: string;
  similar_item: { id: string; title: string; content_type: string; status: string } | null;
};

export default function NewContentPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [generatedIdea, setGeneratedIdea] = useState<any>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [similarityResult, setSimilarityResult] = useState<SimilarityResult | null>(null);

  const [form, setForm] = useState({
    title: '',
    content_type: 'report' as 'report' | 'calculator',
    category: '',
    seo_keyword: '',
    priority: 1,
    raw_idea: '',
    target_repo: '',
    target_path: '',
    notes: '',
  });

  const set = (k: string, v: any) => {
    setForm(f => ({ ...f, [k]: v }));
    // 제목/키워드 변경 시 유사도 결과 초기화
    if (k === 'title' || k === 'seo_keyword') setSimilarityResult(null);
  };

  async function handleNextStep() {
    setChecking(true);
    setSimilarityResult(null);
    try {
      const result = await checkSimilarity({
        title: form.title,
        seo_keyword: form.seo_keyword,
        content_type: form.content_type,
      });
      if (result.level === 'ok') {
        setStep(1);
      } else {
        setSimilarityResult(result);
      }
    } catch {
      // 체크 실패 시 그냥 통과
      setStep(1);
    }
    setChecking(false);
  }

  async function handleCreate() {
    setSaving(true);
    try {
      const content = await createContent(form);
      setCreatedId(content.id);
      setStep(2);
    } catch (e: any) {
      alert(e.message);
    }
    setSaving(false);
  }

  async function handleGenerate() {
    if (!createdId) return;
    setGenerating(true);
    try {
      const res = await generateIdeas(createdId);
      setGeneratedIdea(res.idea);
      setStep(3);
    } catch (e: any) {
      alert(e.message);
    }
    setGenerating(false);
  }

  function handleDone() {
    if (createdId) router.push(`/contents/${createdId}/overview`);
  }

  const step1Valid = form.title.trim() && form.content_type && form.category;
  const step2Valid = form.raw_idea.trim().length > 10;

  return (
    <>
      <PageHeader
        title="New Content"
        breadcrumbs={[{ label: 'Contents', href: '/contents' }]}
      />

      <main style={{ flex: 1, overflow: 'auto', padding: '28px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>

          {/* Step Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
            {STEPS.map((s, i) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 600,
                    background: i < step ? '#4ade8020' : i === step ? 'linear-gradient(135deg, #c8a96e, #a8823e)' : '#1e1e24',
                    color: i < step ? '#4ade80' : i === step ? '#1a1208' : '#3a3850',
                    border: i < step ? '1px solid #4ade8040' : i === step ? 'none' : '1px solid #2a2a30',
                    boxShadow: i === step ? '0 0 12px #c8a96e40' : 'none',
                  }}>
                    {i < step ? '✓' : i + 1}
                  </div>
                  <span style={{ fontSize: 10, color: i === step ? '#c8a96e' : i < step ? '#4ade80' : '#3a3850', whiteSpace: 'nowrap' }}>{s}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ flex: 1, height: 1, margin: '0 8px', marginBottom: 20, background: i < step ? '#4ade8030' : '#1e1e24' }} />
                )}
              </div>
            ))}
          </div>

          {/* Step 1: Basic Info */}
          {step === 0 && (
            <Card>
              <CardTitle>기본 정보</CardTitle>
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

                <Field label="제목 *">
                  <input value={form.title} onChange={e => set('title', e.target.value)}
                    placeholder="콘텐츠 제목을 입력하세요" style={inputStyle} />
                </Field>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="타입 *">
                    <div style={{ display: 'flex', gap: 8 }}>
                      {(['report', 'calculator'] as const).map(t => (
                        <button key={t} onClick={() => set('content_type', t)} style={{
                          flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer',
                          border: form.content_type === t ? '1px solid #c8a96e' : '1px solid rgba(255,255,255,0.08)',
                          background: form.content_type === t ? 'rgba(200,169,110,0.1)' : 'rgba(255,255,255,0.02)',
                          color: form.content_type === t ? '#c8a96e' : '#5a5870',
                          fontSize: 12, fontWeight: form.content_type === t ? 500 : 400,
                        }}>{t}</button>
                      ))}
                    </div>
                  </Field>

                  <Field label="우선순위">
                    <div style={{ display: 'flex', gap: 6 }}>
                      {PRIORITIES.map(p => (
                        <button key={p.value} onClick={() => set('priority', p.value)} style={{
                          flex: 1, padding: '7px 4px', borderRadius: 7, cursor: 'pointer', fontSize: 11,
                          border: form.priority === p.value ? `1px solid ${p.color}60` : '1px solid rgba(255,255,255,0.06)',
                          background: form.priority === p.value ? `${p.color}15` : 'rgba(255,255,255,0.02)',
                          color: form.priority === p.value ? p.color : '#5a5870',
                        }}>{p.label}</button>
                      ))}
                    </div>
                  </Field>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="카테고리 *">
                    <select value={form.category} onChange={e => set('category', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="">선택하세요</option>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>

                  <Field label="SEO 키워드">
                    <input value={form.seo_keyword} onChange={e => set('seo_keyword', e.target.value)}
                      placeholder="예: 연봉 실수령액 계산기" style={inputStyle} />
                  </Field>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="Target Repo">
                    <input value={form.target_repo} onChange={e => set('target_repo', e.target.value)}
                      placeholder="예: blog-tool" style={inputStyle} />
                  </Field>
                  <Field label="Target Path">
                    <input value={form.target_path} onChange={e => set('target_path', e.target.value)}
                      placeholder="예: /reports/etf" style={inputStyle} />
                  </Field>
                </div>

                {/* 유사도 체크 결과 */}
                {similarityResult && similarityResult.level !== 'ok' && (
                  <SimilarityBanner result={similarityResult} onForce={() => setStep(1)} />
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <Button variant="ghost" onClick={() => router.push('/contents')}>취소</Button>
                  <Button
                    variant="primary"
                    onClick={handleNextStep}
                    disabled={!step1Valid || checking}
                    style={{ opacity: step1Valid ? 1 : 0.4, minWidth: 100 }}
                  >
                    {checking ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 10, height: 10, border: '2px solid #1a1208', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                        검사 중...
                      </span>
                    ) : '다음 →'}
                  </Button>
                </div>
                <style dangerouslySetInnerHTML={{ __html: '@keyframes spin{to{transform:rotate(360deg)}}' }} />
              </div>
            </Card>
          )}

          {/* Step 2: Idea Input */}
          {step === 1 && (
            <Card>
              <CardTitle>아이디어 입력</CardTitle>
              <div style={{ marginTop: 4, fontSize: 12, color: '#3a3850' }}>콘텐츠 아이디어를 자유롭게 입력하세요. AI가 이를 구체화합니다.</div>
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

                <Field label="아이디어 원문 *">
                  <textarea
                    value={form.raw_idea}
                    onChange={e => set('raw_idea', e.target.value)}
                    placeholder={`예:\n미국/한국 반도체 ETF 벨류체인 연계 리포트\n- TSMC, 삼성, SK하이닉스 밸류체인 비교\n- 국내외 ETF 종목 상세 분석\n- 투자 시나리오별 수익률 계산`}
                    rows={8}
                    style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                  />
                  <div style={{ fontSize: 10, color: form.raw_idea.length > 10 ? '#4ade8080' : '#3a3850', textAlign: 'right', marginTop: 4 }}>
                    {form.raw_idea.length}자
                  </div>
                </Field>

                <Field label="메모 / 참고 링크">
                  <input value={form.notes} onChange={e => set('notes', e.target.value)}
                    placeholder="참고할 링크나 메모" style={inputStyle} />
                </Field>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <Button variant="ghost" onClick={() => setStep(0)}>← 이전</Button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="secondary" onClick={handleCreate} disabled={!step2Valid || saving} style={{ opacity: step2Valid ? 1 : 0.4 }}>
                      {saving ? '저장 중...' : '저장만 하기'}
                    </Button>
                    <Button variant="primary" onClick={async () => { await handleCreate(); }} disabled={!step2Valid || saving} style={{ opacity: step2Valid ? 1 : 0.4 }}>
                      {saving ? '저장 중...' : 'AI 생성하기 →'}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Step 3: Generate */}
          {step === 2 && (
            <Card>
              <CardTitle>AI 아이디어 생성</CardTitle>
              <div style={{ marginTop: 4, fontSize: 12, color: '#3a3850' }}>Claude가 입력된 아이디어를 분석하고 구체적인 콘텐츠 기획안을 생성합니다.</div>

              <div style={{ margin: '28px 0', padding: '20px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 11, color: '#3a3850', marginBottom: 8 }}>입력된 아이디어</div>
                <div style={{ fontSize: 13, color: '#9a98a8', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{form.raw_idea}</div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px', borderRadius: 10, background: 'rgba(200,169,110,0.05)', border: '1px solid rgba(200,169,110,0.12)' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #c8a96e, #8b6a30)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#1a1208', fontWeight: 700, flexShrink: 0, boxShadow: '0 0 12px #c8a96e30' }}>⬡</div>
                <div>
                  <div style={{ fontSize: 12, color: '#c8a96e', fontWeight: 500 }}>Claude Sonnet</div>
                  <div style={{ fontSize: 11, color: '#5a5870' }}>아이디어 확장 및 구조화</div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
                <Button variant="ghost" onClick={() => router.push(`/contents/${createdId}/overview`)}>
                  나중에 생성하기
                </Button>
                <Button variant="primary" onClick={handleGenerate} disabled={generating}>
                  {generating ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 12, height: 12, border: '2px solid #1a1208', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                      생성 중...
                    </span>
                  ) : '⚡ Generate Ideas'}
                </Button>
              </div>
            </Card>
          )}

          {/* Step 4: Result */}
          {step === 3 && generatedIdea && (
            <Card>
              <CardTitle>생성 결과</CardTitle>
              <div style={{ marginTop: 4, fontSize: 12, color: '#3a3850' }}>Claude가 생성한 콘텐츠 기획안입니다.</div>

              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ padding: '14px', borderRadius: 10, background: 'rgba(200,169,110,0.05)', border: '1px solid rgba(200,169,110,0.12)' }}>
                  <div style={{ fontSize: 10, color: '#c8a96e', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Summary</div>
                  <div style={{ fontSize: 13, color: '#c8c6c0', lineHeight: 1.6 }}>{generatedIdea.result_summary}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {generatedIdea.suggested_titles?.length > 0 && (
                    <div style={{ padding: '14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: 10, color: '#60a5fa', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Suggested Titles</div>
                      {generatedIdea.suggested_titles.map((t: string, i: number) => (
                        <div key={i} style={{ fontSize: 12, color: '#9a98a8', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', lineHeight: 1.4 }}>{t}</div>
                      ))}
                    </div>
                  )}

                  {generatedIdea.suggested_outline?.length > 0 && (
                    <div style={{ padding: '14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: 10, color: '#a78bfa', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Outline</div>
                      {generatedIdea.suggested_outline.map((s: string, i: number) => (
                        <div key={i} style={{ fontSize: 12, color: '#9a98a8', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <span style={{ color: '#3a3850', marginRight: 6 }}>{i + 1}.</span>{s}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  {generatedIdea.seo_keywords?.map((k: string) => (
                    <span key={k} style={{ fontSize: 11, color: '#4ade80', background: '#4ade8015', border: '1px solid #4ade8030', borderRadius: 20, padding: '3px 10px' }}>{k}</span>
                  ))}
                  {generatedIdea.score && (
                    <span style={{ marginLeft: 'auto', fontSize: 13, fontFamily: 'monospace', color: '#c8a96e', fontWeight: 700 }}>
                      Score: {generatedIdea.score}/100
                    </span>
                  )}
                </div>

                {generatedIdea.strengths && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.1)', fontSize: 12, color: '#9a98a8' }}>
                      <span style={{ color: '#4ade80', fontSize: 10, display: 'block', marginBottom: 4 }}>Strengths</span>
                      {generatedIdea.strengths}
                    </div>
                    <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.1)', fontSize: 12, color: '#9a98a8' }}>
                      <span style={{ color: '#f87171', fontSize: 10, display: 'block', marginBottom: 4 }}>Weaknesses</span>
                      {generatedIdea.weaknesses}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
                <Button variant="ghost" onClick={() => setStep(2)}>← 재생성</Button>
                <Button variant="primary" onClick={handleDone}>
                  콘텐츠 상세로 이동 →
                </Button>
              </div>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}

// ── 유사도 경고/차단 배너 ────────────────────────────────────────────
function SimilarityBanner({ result, onForce }: { result: SimilarityResult; onForce: () => void }) {
  const isBlock = result.level === 'block';
  const color   = isBlock ? '#f87171' : '#fbbf24';
  const bg      = isBlock ? 'rgba(248,113,113,0.06)' : 'rgba(251,191,36,0.06)';
  const border  = isBlock ? 'rgba(248,113,113,0.2)' : 'rgba(251,191,36,0.2)';
  const icon    = isBlock ? '🚫' : '⚠️';

  return (
    <div style={{ padding: '16px', borderRadius: 10, background: bg, border: `1px solid ${border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 13, color, fontWeight: 600 }}>
          {isBlock ? '유사한 콘텐츠가 이미 있습니다' : '비슷한 콘텐츠가 존재합니다'}
        </span>
        <span style={{ fontSize: 11, color, background: `${color}20`, border: `1px solid ${color}40`, borderRadius: 12, padding: '2px 8px', marginLeft: 4, fontFamily: 'monospace' }}>
          유사도 {result.score}%
        </span>
      </div>

      {result.reason && (
        <div style={{ fontSize: 12, color: '#9a98a8', marginBottom: 10, lineHeight: 1.5 }}>
          {result.reason}
        </div>
      )}

      {result.similar_item && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 12 }}>
          <span style={{ fontSize: 10, color: '#5a5870', background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '2px 6px' }}>
            {result.similar_item.content_type}
          </span>
          <span style={{ fontSize: 13, color: '#c8c6c0', flex: 1 }}>{result.similar_item.title}</span>
          <span style={{ fontSize: 10, color: '#5a5870' }}>{result.similar_item.status}</span>
          <a
            href={`/contents/${result.similar_item.id}/overview`}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 11, color: '#60a5fa', textDecoration: 'none' }}
          >
            보기 ↗
          </a>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {!isBlock && (
          <button onClick={onForce} style={{
            fontSize: 11, color: '#fbbf24',
            background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)',
            borderRadius: 7, padding: '5px 14px', cursor: 'pointer',
          }}>
            그래도 계속 진행
          </button>
        )}
        <span style={{ fontSize: 11, color: '#5a5870', display: 'flex', alignItems: 'center' }}>
          {isBlock ? '제목을 수정해주세요' : '제목을 수정하거나 계속 진행하세요'}
        </span>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11, color: '#5a5870', letterSpacing: '0.04em' }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8, color: '#e2e0db', fontSize: 13, outline: 'none',
  fontFamily: 'inherit',
};
