'use client';

// SCR-17 외부 AI 답변 붙여넣기 (Sprint 5 Step 4 · S5-4~S5-6 · REV-09).
// 새 리뷰: 이 탭에서 최근 복사한 번들 중 하나를 고르거나 '번들 연결 안 함'(서버가 현재 Draft revision으로 기록).
// 기존 리뷰에 추가: reviewId를 주면 같은 리뷰에 답변을 더한다. 특정 답변의 후속 질문으로 표시할 수 있다.
// clientRequestId는 입력이 같으면 재시도에 그대로 쓴다 — 응답을 못 받아 다시 눌러도 하나만 저장된다.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Button from '@/components/Button';
import { AaApiError, addReviewAnswer, createManualReview, getAaUserId } from '@/lib/aa/architecture-api';
import type { ReviewAnswer } from '@/lib/aa/architecture-types';
import { bundleKey, readBundles, TEMPLATE_LABEL, type StoredBundle } from '@/lib/aa/bundle-store';
import { ruleLabel } from '@/lib/aa/export-flow';

const TOOLS = ['ChatGPT', 'Claude', 'Gemini', 'Copilot'];
const ANSWER_MAX_BYTES = 256 * 1024;
const FOLLOW_UP_MAX = 2000;
const NO_BUNDLE = '__none__';

const byteLength = (s: string) => new TextEncoder().encode(s).length;

export default function PasteAnswerModal({ projectId, reviewId, answers = [], onClose, onSaved }: {
  projectId: string;
  /** 있으면 이 리뷰에 답변을 추가한다 */
  reviewId?: string;
  /** 추가 모드에서 후속 질문 대상으로 고를 답변 */
  answers?: ReviewAnswer[];
  onClose: () => void;
  onSaved: (result: { reviewId: string; existing: boolean }) => void;
}) {
  const adding = Boolean(reviewId);
  const [bundles, setBundles] = useState<StoredBundle[] | null>(adding ? [] : null);
  const [bundleId, setBundleId] = useState<string>(NO_BUNDLE);
  const [toolChoice, setToolChoice] = useState('ChatGPT');
  const [toolOther, setToolOther] = useState('');
  const [answerMd, setAnswerMd] = useState('');
  const [followUpOf, setFollowUpOf] = useState('');
  const [followUpQuestion, setFollowUpQuestion] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ rule: string; path: string; sample: string }[]>([]);
  const request = useRef<{ key: string; id: string } | null>(null);

  useEffect(() => {
    if (adding) return;
    let alive = true;
    getAaUserId().then((userId) => {
      let storage: Storage | null = null;
      try { storage = window.sessionStorage; } catch { storage = null; }
      const list = userId ? readBundles(storage, bundleKey(userId, projectId)) : [];
      if (!alive) return;
      setBundles(list);
      setBundleId(list[0]?.bundleId ?? NO_BUNDLE);   // 기본은 가장 최근 번들
    }).catch(() => { if (alive) setBundles([]); });
    return () => { alive = false; };
  }, [adding, projectId]);

  const tool = (toolChoice === '__other__' ? toolOther : toolChoice).trim();
  const bytes = byteLength(answerMd);
  const bundle = bundles?.find((b) => b.bundleId === bundleId) ?? null;
  const tooLarge = bytes > ANSWER_MAX_BYTES;
  const followTooLong = followUpQuestion.trim().length > FOLLOW_UP_MAX;
  const canSave = !saving && bundles !== null && tool.length > 0 && tool.length <= 60 && answerMd.trim().length > 0 && !tooLarge && !followTooLong;

  // 입력 전체가 같을 때만 같은 clientRequestId
  const inputKey = useMemo(() => JSON.stringify([reviewId ?? null, bundle?.bundleId ?? null, tool, answerMd, followUpOf, followUpQuestion.trim()]),
    [reviewId, bundle, tool, answerMd, followUpOf, followUpQuestion]);

  async function save() {
    if (!canSave) return;
    if (!request.current || request.current.key !== inputKey) request.current = { key: inputKey, id: crypto.randomUUID() };
    const clientRequestId = request.current.id;
    setSaving(true);
    setError(null);
    setIssues([]);
    try {
      if (reviewId) {
        const r = await addReviewAnswer(projectId, reviewId, {
          tool, answerMd, clientRequestId,
          followUpOf: followUpOf || null, followUpQuestion: followUpOf ? (followUpQuestion.trim() || null) : null,
        });
        onSaved({ reviewId, existing: r.existing });
      } else {
        const payload = bundle ? {
          bundleId: bundle.bundleId, format: bundle.format, basis: bundle.basis, scopeLabel: bundle.scopeLabel,
          scope: bundle.scope, template: bundle.template, question: bundle.question, bundleMd: bundle.bundleMd,
        } : null;
        const r = await createManualReview(projectId, { bundle: payload, answer: { tool, answerMd }, clientRequestId });
        onSaved({ reviewId: r.id, existing: r.existing });
      }
    } catch (e) {
      if (!(e instanceof AaApiError) || e.status === 0) {
        // 응답을 못 받았다 — 같은 clientRequestId로 다시 보내면 중복 없이 처리된다
        setError('서버에 연결하지 못했습니다. 다시 저장을 누르면 같은 요청으로 재시도합니다.');
      } else if (e.code === 'SENSITIVE_DATA_DETECTED') {
        setIssues(Array.isArray(e.details) ? e.details as typeof issues : []);
        setError(e.message);
      } else if (e.status === 413) {
        setError('붙여넣은 내용이 너무 큽니다.');
      } else {
        setError(e.message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
      <div role="dialog" aria-modal="true" aria-label="AI 답변 붙여넣기" data-testid="aa-paste-dialog" onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(820px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: '#111114', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <b style={{ fontSize: 15 }}>{adding ? '이 리뷰에 답변 추가' : 'AI 답변 붙여넣기'}</b>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose}>닫기</Button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div role="note" data-testid="aa-paste-disclaimer" style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            외부 AI 의견을 그대로 기록합니다. AI 의견이며 검증된 결과가 아닙니다. 키·토큰이 있으면 저장하지 않습니다.
          </div>

          {!adding && (
            <Row label="검토 자료">
              {bundles === null ? <span style={{ color: 'rgba(255,255,255,0.4)' }}>불러오는 중…</span> : <>
                <select value={bundleId} onChange={(e) => setBundleId(e.target.value)} data-testid="aa-paste-bundle" style={input}>
                  {bundles.map((b) => (
                    <option key={b.bundleId} value={b.bundleId}>
                      {new Date(b.copiedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} · {b.scopeLabel} · {TEMPLATE_LABEL[b.template] ?? b.template} · rev {b.basis.revision}
                    </option>
                  ))}
                  <option value={NO_BUNDLE}>번들 연결 안 함 (현재 Draft 기준으로 기록)</option>
                </select>
                {bundles.length === 0 && <Hint>이 탭에서 복사한 검토 자료가 없습니다. 답변만 현재 Draft 기준으로 저장합니다.</Hint>}
                {bundle?.question && <Hint>질문: {bundle.question.slice(0, 160)}</Hint>}
              </>}
            </Row>
          )}

          <Row label="AI 도구">
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={toolChoice} onChange={(e) => setToolChoice(e.target.value)} data-testid="aa-paste-tool" style={input}>
                {TOOLS.map((t) => <option key={t} value={t}>{t}</option>)}
                <option value="__other__">기타 (직접 입력)</option>
              </select>
              {toolChoice === '__other__' && <input value={toolOther} onChange={(e) => setToolOther(e.target.value)} maxLength={60} placeholder="도구 이름" data-testid="aa-paste-tool-other" style={{ ...input, flex: 1 }} />}
            </div>
          </Row>

          {adding && answers.length > 0 && (
            <Row label="후속 질문 (선택)">
              <select value={followUpOf} onChange={(e) => setFollowUpOf(e.target.value)} data-testid="aa-paste-followup" style={input}>
                <option value="">새 답변 (후속 아님)</option>
                {answers.map((a, i) => <option key={a.id} value={a.id}>#{i + 1} {a.tool} 답변의 후속</option>)}
              </select>
              {followUpOf && <>
                <textarea value={followUpQuestion} onChange={(e) => setFollowUpQuestion(e.target.value)} rows={2} placeholder="AI에게 다시 물어본 질문" data-testid="aa-paste-followup-question" style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }} />
                {followTooLong && <Hint warn>후속 질문은 {FOLLOW_UP_MAX}자까지입니다.</Hint>}
              </>}
            </Row>
          )}

          <Row label="AI 답변 (Markdown)">
            <textarea value={answerMd} onChange={(e) => setAnswerMd(e.target.value)} rows={16} autoFocus data-testid="aa-paste-answer"
              placeholder="외부 AI의 답변을 그대로 붙여 넣으세요" style={{ ...input, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: 12, lineHeight: 1.55 }} />
            <span style={{ fontSize: 11, alignSelf: 'flex-end', color: tooLarge ? '#f87171' : 'rgba(255,255,255,0.35)' }} data-testid="aa-paste-bytes">
              {Math.ceil(bytes / 1024).toLocaleString()} KB / 256 KB
            </span>
          </Row>

          {(error || issues.length > 0) && (
            <div role="alert" data-testid="aa-paste-error" style={{ padding: 12, borderRadius: 8, background: 'rgba(229,72,77,0.08)', border: '1px solid rgba(229,72,77,0.4)', fontSize: 12.5 }}>
              <div>{error}</div>
              {issues.length > 0 && (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
                  {issues.slice(0, 20).map((it, i) => <li key={i}>{ruleLabel(it.rule)} · {it.path} · {it.sample}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            {adding ? '같은 리뷰에 기록됩니다' : bundle ? `기준: 번들 rev ${bundle.basis.revision}` : '기준: 저장 시점의 Draft'}
          </span>
          <span style={{ flex: 1 }} />
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" disabled={!canSave} onClick={() => void save()} data-testid="aa-paste-save">{saving ? '저장 중…' : '저장'}</Button>
        </div>
      </div>
    </div>
  );
}

const input: CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'rgba(255,255,255,0.9)', padding: '6px 8px', fontSize: 12.5 };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)' }}>{label}</span>{children}</div>;
}
function Hint({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return <span style={{ fontSize: 11.5, lineHeight: 1.5, color: warn ? '#f5a524' : 'rgba(255,255,255,0.38)' }}>{children}</span>;
}
