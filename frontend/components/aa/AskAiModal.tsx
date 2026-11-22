'use client';

// SCR-14 Ask AI 내보내기 (Sprint 5 Step 2 · S5-1~S5-3).
// 외부 AI(ChatGPT·Claude 등)에 붙여넣을 검토 자료를 만든다. 기준은 저장된 Draft.
// 형식: AI용 Markdown / AI용 JSON / Mermaid. Mermaid는 Logical 전체만이라 범위·템플릿·질문을 숨긴다.
// 복사·다운로드 직전에 같은 요청을 다시 보내 미리보기와 같을 때만 출력한다 (README와 같은 규칙).
// AI 형식을 복사·다운로드하면 이 탭의 최근 번들(최대 5개)에 남겨 [답변 붙여넣기]에서 고를 수 있다.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Button from '@/components/Button';
import MarkdownPreview from '@/components/MarkdownPreview';
import { AaApiError, exportAskAi, getAaUserId, listRequirements } from '@/lib/aa/architecture-api';
import type { AskAiExportResult, AskAiFormat, AskAiScope, AskAiTemplate, Requirement, SensitiveScanDetails } from '@/lib/aa/architecture-types';
import { bundleKey, rememberBundle, TEMPLATE_LABEL } from '@/lib/aa/bundle-store';
import { basisLabel, classifyScan, recheckDecision, ruleLabel, type ExportOutcome } from '@/lib/aa/export-flow';
import BasisSelect, { type BasisValue } from '@/components/aa/BasisSelect';

type ScopeType = AskAiScope['type'];
const FORMATS: [AskAiFormat, string][] = [['ai-md', 'AI용 Markdown'], ['ai-json', 'AI용 JSON'], ['mermaid', 'Mermaid']];
const TEMPLATES = Object.keys(TEMPLATE_LABEL) as AskAiTemplate[];
const QUESTION_MAX = 2000;

interface Settings { format: AskAiFormat; basis: BasisValue; scopeType: ScopeType; requirementId: string; template: AskAiTemplate; question: string }

// Ask AI는 05 §7.6대로 latest를 쓰지 않는다 — Draft(기본) 또는 버전
const sourceOf = (b: BasisValue) => (b === 'draft' || b === 'latest' ? { type: 'draft' as const } : { type: 'version' as const, versionId: b });

function buildScope(s: Settings, componentIds: string[]): AskAiScope {
  if (s.scopeType === 'view') return { type: 'view', viewId: 'view_logical' };
  if (s.scopeType === 'components') return { type: 'components', componentIds };
  if (s.scopeType === 'requirement') return { type: 'requirement', requirementId: s.requirementId };
  return { type: 'project' };
}

async function requestExport(projectId: string, s: Settings, componentIds: string[], ack: string | null): Promise<ExportOutcome<AskAiExportResult>> {
  try {
    const body = s.format === 'mermaid'
      ? { format: s.format, source: sourceOf(s.basis), acknowledgedScan: ack }
      : { format: s.format, source: sourceOf(s.basis), scope: buildScope(s, componentIds), template: s.template, question: s.question.trim(), acknowledgedScan: ack };
    return { kind: 'ok', result: await exportAskAi(projectId, body) };
  } catch (error) {
    if (error instanceof AaApiError && error.status === 422) {
      const classified = classifyScan(error.details);
      if (classified) return classified;
    }
    return { kind: 'error', message: error instanceof Error ? error.message : '검토 자료를 만들지 못했습니다.' };
  }
}

export default function AskAiModal({ projectId, projectName, selectedComponentIds: initialSelection, unsaved = false, onClose, onCopied }: {
  projectId: string;
  projectName: string;
  /** Studio에서 선택한 컴포넌트 — 있으면 '선택한 컴포넌트' 범위를 고를 수 있다 */
  selectedComponentIds?: string[];   // 열 때 한 번만 읽는다
  /** Studio에 저장 안 된 변경이 있음 — 검토 자료에는 저장된 Draft만 들어간다 */
  unsaved?: boolean;
  onClose: () => void;
  /** AI 형식을 복사·다운로드한 뒤 */
  onCopied?: () => void;
}) {
  const [settings, setSettings] = useState<Settings>({
    format: 'ai-md', basis: 'draft', scopeType: initialSelection?.length ? 'components' : 'project', requirementId: '', template: 'design-review', question: '',
  });
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [selectedComponentIds] = useState<string[]>(() => initialSelection ?? []);
  const [preview, setPreview] = useState<AskAiExportResult | null>(null);
  const [scan, setScan] = useState<SensitiveScanDetails | null>(null);
  const [ack, setAck] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState(true);
  const seq = useRef(0);
  const isMermaid = settings.format === 'mermaid';
  const questionTooLong = settings.question.trim().length > QUESTION_MAX;
  const needsQuestion = !isMermaid && settings.template === 'custom' && !settings.question.trim();
  const needsRequirement = !isMermaid && settings.scopeType === 'requirement' && !settings.requirementId;
  const invalid = questionTooLong || needsQuestion || needsRequirement;

  useEffect(() => {
    listRequirements(projectId, { status: 'active', limit: 200 }).then((r) => setRequirements(r.data ?? [])).catch(() => setRequirements([]));
  }, [projectId]);

  const show = useCallback((outcome: ExportOutcome<AskAiExportResult>, usedAck: string | null) => {
    if (outcome.kind === 'ok') { setPreview(outcome.result); setScan(null); setAck(usedAck); setError(null); return; }
    setPreview(null);   // 경고·차단·오류: 이전 미리보기는 출력에 쓸 수 없다
    setAck(null);
    if (outcome.kind === 'error') { setScan(null); setError(outcome.message); }
    else { setScan(outcome.details); setError(null); }
  }, []);

  const load = useCallback(async (next: Settings, useAck: string | null) => {
    const my = ++seq.current;
    setBusy(true);
    const outcome = await requestExport(projectId, next, selectedComponentIds, useAck);
    if (my !== seq.current) return;
    show(outcome, useAck);
    setBusy(false);
  }, [projectId, selectedComponentIds, show]);

  // 질문 입력은 잠시 멈춘 뒤 미리보기를 다시 만든다. 다른 설정은 바로.
  useEffect(() => {
    setNotice(null);
    if (invalid) { seq.current++; setPreview(null); setScan(null); setAck(null); setBusy(false); return; }
    const t = setTimeout(() => void load(settings, null), 350);
    return () => clearTimeout(t);
  }, [settings, invalid, load]);

  const change = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));

  async function output(kind: 'copy' | 'download') {
    if (!preview) return;
    const my = ++seq.current;
    setBusy(true);
    setNotice(null);
    const outcome = await requestExport(projectId, settings, selectedComponentIds, ack);
    if (my !== seq.current) return;
    setBusy(false);
    const decision = recheckDecision(preview, outcome);
    if (decision.action === 'refresh') {
      setPreview(decision.result);
      setNotice('그 사이 설계가 바뀌었습니다. 갱신된 미리보기를 확인한 뒤 다시 누르세요.');
      return;
    }
    if (decision.action !== 'output') {
      show(outcome, null);
      setNotice(decision.action === 'warn' ? '내보낼 내용에 새 경고가 생겼습니다. 확인한 뒤 다시 내보내세요.' : null);
      return;
    }
    const result = decision.result;
    let done: string;
    if (kind === 'copy') {
      try {
        await navigator.clipboard.writeText(result.content);
        done = '복사했습니다.';
      } catch {
        setNotice('클립보드에 복사하지 못했습니다. 다운로드를 이용하세요.');
        return;
      }
    } else {
      const url = URL.createObjectURL(new Blob([result.content], { type: `${result.contentType};charset=utf-8` }));
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      done = `${result.filename} 파일을 내려받았습니다.`;
    }
    if (settings.format !== 'mermaid' && result.bundleId) {
      const userId = await getAaUserId().catch(() => null);
      let storage: Storage | null = null;
      try { storage = window.sessionStorage; } catch { storage = null; }
      const saved = userId ? rememberBundle(storage, bundleKey(userId, projectId), {
        bundleId: result.bundleId, format: settings.format,
        basis: result.basis.source === 'version'
          ? { source: 'version', versionId: result.basis.versionId, label: result.basis.label }
          : { source: 'draft', revision: result.basis.revision },
        scopeLabel: result.scopeLabel ?? '', scope: buildScope(settings, selectedComponentIds),
        template: settings.template, question: settings.question.trim(), bundleMd: result.content,
      }) : false;
      done += saved ? ' AI 답변을 받으면 [답변 붙여넣기]로 저장하세요.' : ' (이 탭에 번들을 기억하지 못했습니다 — 답변은 번들 없이 저장됩니다.)';
      onCopied?.();
    }
    setNotice(done);
  }

  const scopeOptions: [ScopeType, string, boolean][] = [
    ['project', '프로젝트 전체', true],
    ['view', 'Logical View', true],
    ['components', `선택한 컴포넌트와 이웃${selectedComponentIds.length ? ` (${selectedComponentIds.length})` : ''}`, selectedComponentIds.length > 0],
    ['requirement', '요구사항 하나', requirements.length > 0],
  ];

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
      <div role="dialog" aria-modal="true" aria-label="AI에게 물어볼 검토 자료" data-testid="aa-askai-dialog" onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(1080px, 96vw)', height: '92vh', display: 'flex', flexDirection: 'column', background: '#111114', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <b style={{ fontSize: 15 }}>내보내기 · AI 검토 자료</b>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{projectName}</span>
          <span data-testid="aa-askai-basis" style={{ fontSize: 12, color: '#c8a96e' }}>{preview ? `기준: ${basisLabel(preview.basis)}` : ''}</span>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose}>닫기</Button>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {/* 설정 */}
          <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)', padding: '14px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {unsaved && settings.basis === 'draft' && <div role="status" data-testid="aa-askai-unsaved" style={{ fontSize: 12, color: '#f5a524' }}>저장되지 않은 변경은 포함되지 않습니다. 먼저 저장하세요.</div>}
            <Field label="기준">
              <BasisSelect projectId={projectId} value={settings.basis} allowLatest={false} testId="aa-askai-source" onChange={(v) => change({ basis: v })} />
              {settings.basis !== 'draft' && <Hint>발행 당시 설계·요구사항으로 만듭니다.</Hint>}
            </Field>
            <Field label="형식">
              {FORMATS.map(([f, label]) => (
                <label key={f} style={radio}><input type="radio" name="aa-askai-format" checked={settings.format === f} onChange={() => change({ format: f })} data-testid={`aa-askai-format-${f}`} />{label}</label>
              ))}
              {isMermaid && <Hint>Mermaid는 Logical 구성도 전체를 내보냅니다. 범위·질문은 쓰지 않습니다.</Hint>}
            </Field>
            {!isMermaid && <>
              <Field label="범위">
                {scopeOptions.map(([t, label, enabled]) => (
                  <label key={t} style={{ ...radio, opacity: enabled ? 1 : 0.4 }}>
                    <input type="radio" name="aa-askai-scope" disabled={!enabled} checked={settings.scopeType === t} onChange={() => change({ scopeType: t })} data-testid={`aa-askai-scope-${t}`} />{label}
                  </label>
                ))}
                {settings.scopeType === 'requirement' && (
                  <select value={settings.requirementId} onChange={(e) => change({ requirementId: e.target.value })} data-testid="aa-askai-requirement" style={input}>
                    <option value="">요구사항 선택…</option>
                    {requirements.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.title}</option>)}
                  </select>
                )}
                {!selectedComponentIds.length && <Hint>컴포넌트 범위는 Studio에서 노드를 선택하고 열면 쓸 수 있습니다.</Hint>}
              </Field>
              <Field label="물어볼 것">
                <select value={settings.template} onChange={(e) => change({ template: e.target.value as AskAiTemplate })} data-testid="aa-askai-template" style={input}>
                  {TEMPLATES.map((t) => <option key={t} value={t}>{TEMPLATE_LABEL[t]}</option>)}
                </select>
                <textarea value={settings.question} onChange={(e) => change({ question: e.target.value })} rows={5} data-testid="aa-askai-question"
                  placeholder={settings.template === 'custom' ? '질문을 입력하세요 (필수)' : '추가 질문 (선택)'} style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }} />
                <span style={{ fontSize: 11, color: questionTooLong ? '#f87171' : 'rgba(255,255,255,0.35)', alignSelf: 'flex-end' }}>{settings.question.trim().length} / {QUESTION_MAX}</span>
                {needsQuestion && <Hint warn>직접 입력은 질문이 필요합니다.</Hint>}
              </Field>
            </>}
            <Hint>내부 ID·좌표·노트는 넣지 않습니다. 컴포넌트는 C1·C2… 별칭으로 표시합니다.</Hint>
          </div>

          {/* 미리보기 */}
          <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '14px 20px' }}>
            {notice && <div role="status" data-testid="aa-askai-notice" style={{ marginBottom: 10, color: '#f3c97a', fontSize: 13 }}>{notice}</div>}
            {error && <div role="alert" data-testid="aa-askai-error" style={{ color: '#f87171' }}>{error}</div>}
            {needsRequirement && <div style={{ color: 'rgba(255,255,255,0.5)' }}>요구사항을 고르면 미리보기가 나옵니다.</div>}
            {scan && (
              <div role="alert" data-testid={scan.confirmable ? 'aa-askai-warning' : 'aa-askai-blocked'}
                style={{ padding: 14, borderRadius: 8, background: scan.confirmable ? 'rgba(245,165,36,0.08)' : 'rgba(229,72,77,0.08)', border: `1px solid ${scan.confirmable ? 'rgba(245,165,36,0.35)' : 'rgba(229,72,77,0.4)'}` }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{scan.confirmable ? '내보낼 내용에 확인이 필요한 값이 있습니다' : '키·토큰으로 보이는 값이 있어 내보낼 수 없습니다'}</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7 }}>
                  {scan.issues.slice(0, 20).map((issue, i) => <li key={i}>{ruleLabel(issue.rule)} · {issue.path} · {issue.sample}</li>)}
                </ul>
                {scan.confirmable
                  ? <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>외부 AI에 보내도 되는 값인지 확인하세요. 확인은 10분 동안, 지금 내용 그대로일 때만 유효합니다.</span>
                      <span style={{ flex: 1 }} />
                      <Button variant="primary" disabled={busy} onClick={() => void load(settings, scan.scanId)} data-testid="aa-askai-ack">확인하고 계속</Button>
                    </div>
                  : <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>해당 값을 설계·요구사항에서 지운 뒤 다시 여세요.</div>}
              </div>
            )}
            {preview && (
              <>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                  {preview.scopeLabel && <span data-testid="aa-askai-scope-label">범위: {preview.scopeLabel}</span>}
                  {preview.counts && <span>컴포넌트 {preview.counts.components} · 관계 {preview.counts.relations}</span>}
                  {preview.omitted && preview.omitted.components > 0 && <span style={{ color: '#f5a524' }}>범위 밖 {preview.omitted.components}개 제외</span>}
                  <span style={{ flex: 1 }} />
                  {settings.format === 'ai-md' && (
                    <button onClick={() => setRaw((v) => !v)} style={{ background: 'none', border: 'none', color: '#c8a96e', cursor: 'pointer', fontSize: 12 }}>{raw ? '렌더링해서 보기' : '원문 보기'}</button>
                  )}
                </div>
                <div data-testid="aa-askai-preview">
                  {raw || settings.format !== 'ai-md'
                    ? <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6, margin: 0 }}>{preview.content}</pre>
                    : <MarkdownPreview content={preview.content} />}
                </div>
              </>
            )}
            {busy && !preview && !scan && <div style={{ color: 'rgba(255,255,255,0.5)' }}>검토 자료를 만드는 중…</div>}
          </div>
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8, alignItems: 'center' }}>
          {preview && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{preview.filename} · 약 {preview.approxTokens.toLocaleString()} 토큰</span>}
          <span style={{ flex: 1 }} />
          <Button disabled={!preview || busy} onClick={() => void output('download')} data-testid="aa-askai-download">다운로드</Button>
          <Button variant="primary" disabled={!preview || busy} onClick={() => void output('copy')} data-testid="aa-askai-copy">복사</Button>
        </div>
      </div>
    </div>
  );
}

const radio: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' };
const input: CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'rgba(255,255,255,0.9)', padding: '6px 8px', fontSize: 12.5 };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)' }}>{label}</span>{children}</div>;
}
function Hint({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return <span style={{ fontSize: 11.5, lineHeight: 1.5, color: warn ? '#f5a524' : 'rgba(255,255,255,0.38)' }}>{children}</span>;
}
