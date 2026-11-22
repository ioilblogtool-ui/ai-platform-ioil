'use client';

// SCR-15 Import · Mermaid 모달 (Sprint 4 Step 3 · IMP-01~06 · Q5~Q8).
// 붙여넣기·파일 → 파싱(브라우저) → 미리보기(서버 쓰기 없음) → 타입·재사용 선택 → 적용(Draft PUT 1회).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ArchitectureModel, TypeRegistry } from '@/lib/aa/architecture-types';
import { isImportError, parseMermaidFlowchart, type ImportError, type ImportResult } from '@/lib/aa/importers/mermaid-flowchart';
import * as ops from '@/lib/aa/model-ops';
import { newId } from '@/lib/aa/ids';
import { miniCanvasLayout } from '@/lib/aa/overview';
import { useStudio, type ImportOutcome } from '@/lib/aa/studio-store';
import MiniCanvas from '../MiniCanvas';

const FILE_MAX_BYTES = 1024 * 1024;
const NEW = '__new__';

type LayoutModule = typeof import('@/lib/aa/import-layout');
let layoutModule: Promise<LayoutModule> | null = null;
// Dagre는 가져오기 창을 열 때만 불러온다 (Studio 첫 로딩에 넣지 않음)
const loadLayout = () => (layoutModule ??= import('@/lib/aa/import-layout'));

/** 파일 내용 → Mermaid 원문. .md는 첫 ```mermaid 블록 */
export function mermaidFromFile(name: string, content: string): { text: string } | { error: string } {
  if (/\.md$/i.test(name)) {
    const block = content.match(/```mermaid[^\n]*\n([\s\S]*?)```/);
    return block ? { text: block[1] } : { error: 'Markdown 파일에 ```mermaid 블록이 없습니다.' };
  }
  return { text: content };
}

function buildMerge(
  layout: LayoutModule, model: ArchitectureModel, viewId: string, parsed: ImportResult,
  choices: Record<string, ops.ImportChoice>, registry: TypeRegistry | null,
) {
  const view = ops.getView(model, viewId);
  const toPlace = new Set(ops.importNodesToPlace(model, viewId, parsed, choices));
  const groupOf = new Map(parsed.groups.flatMap((g) => g.members.map((m) => [m, g.id] as const)));
  const placed = layout.layoutImport({
    direction: parsed.direction,
    nodes: parsed.nodes.filter((n) => toPlace.has(n.mermaidId)).map((n) => ({ id: n.mermaidId, group: groupOf.get(n.mermaidId) })),
    groups: parsed.groups.filter((g) => g.members.some((m) => toPlace.has(m))).map((g) => ({ id: g.id })),
    edges: parsed.edges.filter((e) => toPlace.has(e.from) && toPlace.has(e.to)),
  }, (view?.nodes ?? []).map((n) => ({ id: n.id, kind: n.kind, parentId: n.parentId, position: n.position, width: n.width, height: n.height })));
  return ops.mergeImport(model, viewId, parsed, choices, placed, registry, newId);
}

const ERROR_TEXT: Record<string, string> = {
  unchosen: '같은 이름의 기존 컴포넌트가 여러 개인 노드가 있습니다. "연결" 칸에서 고르세요.',
  missing: '연결하려던 기존 컴포넌트가 그 사이 삭제되었습니다. 해당 행을 다시 고르세요.',
  too_large: '합친 설계가 저장 한도(1MB)를 넘습니다. 가져올 범위를 줄이세요.',
  too_many_components: '합친 설계의 컴포넌트가 500개를 넘습니다.',
  layout: '자동 배치에 실패했습니다. 다시 시도하세요.',
  no_view: 'Logical View를 찾을 수 없습니다.',
};

export default function ImportMermaidModal({ onClose, flushEdits, onApplied }: {
  onClose: () => void;
  flushEdits: () => void;
  onApplied: (summary: ops.ImportSummary | undefined) => void;
}) {
  const s = useStudio();
  const [text, setText] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ImportResult | ImportError | null>(null);
  const [choices, setChoices] = useState<Record<string, ops.ImportChoice>>({});
  const [layout, setLayout] = useState<LayoutModule | null>(null);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void loadLayout().then(setLayout); }, []);

  // 입력이 멈추면 파싱한다. 서버 호출·Draft 변경 없음
  useEffect(() => {
    const t = setTimeout(() => setParsed(text.trim() ? parseMermaidFlowchart(text, s.registry) : null), 250);
    return () => clearTimeout(t);
  }, [text, s.registry]);

  const ok = parsed && !isImportError(parsed) ? parsed : null;
  const candidates = useMemo(() => (ok && s.model ? ops.importCandidates(s.model, ok) : {}), [ok, s.model]);

  // 파싱 결과가 바뀌면 기본 선택을 다시 잡되, 사용자가 이미 고른 값은 유효하면 유지한다
  useEffect(() => {
    if (!ok) { setChoices({}); return; }
    const defaults = ops.defaultImportChoices(ok, candidates);
    setChoices((prev) => Object.fromEntries(Object.entries(defaults).map(([id, d]) => {
      const p = prev[id];
      if (!p) return [id, d];
      const reuseValid = p.reuse === null || (p.reuse !== undefined && (candidates[id] ?? []).includes(p.reuse));
      return [id, { type: p.type, reuse: reuseValid ? p.reuse : d.reuse }];
    })));
  }, [ok, candidates]);

  const problems = ok && s.model ? ops.importChoiceProblems(s.model, ok, choices) : { unchosen: [], missing: [] };
  const preview = useMemo(() => {
    if (!ok || !layout || !s.model || !ok.nodes.length) return null;
    if (ok.nodes.some((n) => !choices[n.mermaidId])) return null;
    const probe = ops.importChoiceProblems(s.model, ok, choices);
    // 미선택 행은 미리보기에서만 "새로 만들기"로 그린다 (적용은 막힘)
    const shown = probe.unchosen.length || probe.missing.length
      ? Object.fromEntries(Object.entries(choices).map(([id, c]) => [id, c.reuse === undefined || (c.reuse && !s.model!.components[c.reuse]) ? { ...c, reuse: null } : c]))
      : choices;
    const merged = buildMerge(layout, s.model, s.viewId, ok, shown, s.registry);
    if ('error' in merged) return null;
    const before = new Set(ops.getView(s.model, s.viewId)?.nodes.map((n) => n.id));
    const after = ops.getView(merged.model, s.viewId)?.nodes ?? [];
    const canvas = miniCanvasLayout(merged.model, s.viewId);
    if (!canvas) return null;
    return { layout: canvas, highlight: new Set(after.map((n) => n.id).filter((id) => !before.has(id))), summary: merged.summary };
  }, [ok, layout, s.model, s.viewId, s.registry, choices]);

  const componentTypes = useMemo(() => Object.entries(s.registry?.types ?? {}).filter(([, d]) => d.nodeKind === 'component'), [s.registry]);
  const blockedByStudio = Boolean(s.recovery) || s.saveState === 'loading';
  const canApply = Boolean(ok && ok.nodes.length && layout && preview && !problems.unchosen.length && !problems.missing.length && !applying && !blockedByStudio && s.saveState !== 'conflict');

  async function readFile(file: File) {
    setFileError(null);
    if (file.size > FILE_MAX_BYTES) { setFileError('파일은 1MB 이하여야 합니다.'); return; }
    if (!/\.(mmd|md|txt)$/i.test(file.name)) { setFileError('.mmd, .md, .txt 파일만 읽을 수 있습니다.'); return; }
    try {
      const content = await file.text();
      const out = mermaidFromFile(file.name, content);
      if ('error' in out) setFileError(out.error);
      else setText(out.text);
    } catch {
      setFileError('파일을 읽지 못했습니다.');
    }
  }

  async function apply() {
    if (!ok) return;
    setApplying(true);
    setMessage(null);
    flushEdits();                                  // ① Inspector 대기 입력 반영
    const mod = await loadLayout();
    const outcome: ImportOutcome = await s.applyImport((latest) => {
      // 그 사이 Draft가 바뀌었을 수 있으니 최신 모델 기준으로 다시 확인·배치한다
      const problemsNow = ops.importChoiceProblems(latest, ok, choices);
      if (problemsNow.missing.length) return { error: 'missing', ids: problemsNow.missing };
      return buildMerge(mod, latest, s.viewId, ok, choices, s.registry);
    });
    setApplying(false);
    if (outcome.status === 'saved') { onApplied(outcome.summary); onClose(); return; }
    if (outcome.status === 'blocked') {
      setMessage(outcome.reason === 'save_conflict' ? '먼저 저장 충돌을 해결하세요. 해결한 뒤 다시 적용하면 됩니다. 가져올 내용과 선택은 그대로입니다.'
        : outcome.reason === 'save_failed' ? '직전 저장이 실패했습니다. 저장을 다시 시도한 뒤 적용하세요. 가져올 내용과 선택은 그대로입니다.'
          : '지금은 적용할 수 없습니다. 잠시 후 다시 시도하세요.');
    } else if (outcome.status === 'conflict') {
      setMessage(`다른 곳에서 설계가 먼저 저장되었습니다 (rev ${outcome.revision ?? '?'}). 충돌을 해결한 뒤 다시 적용하면 최신 설계에 합칩니다.`);
    } else if (outcome.status === 'invalid') {
      setMessage(ERROR_TEXT[outcome.error] ?? outcome.error);
    } else {
      setMessage(outcome.code === 'MODEL_TOO_LARGE' ? ERROR_TEXT.too_large : `저장하지 못했습니다: ${outcome.message}`);
    }
  }

  const setChoice = (id: string, patch: Partial<ops.ImportChoice>) => setChoices((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  const summary = preview?.summary;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 40 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="aa-import-title" data-testid="aa-import-dialog"
        style={{ width: 'min(1180px, 96vw)', maxHeight: '92vh', overflow: 'auto', padding: 20, borderRadius: 12, background: '#121215', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <b id="aa-import-title" style={{ fontSize: 15 }}>Mermaid 구성도 가져오기</b>
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>미리보기 동안에는 저장되지 않습니다 · 적용하면 현재 설계에 추가되고 한 번 저장됩니다</span>
          <span style={{ flex: 1 }} />
          <button style={btn()} onClick={onClose} disabled={applying}>닫기</button>
        </div>

        {s.saveState === 'conflict' && (
          <div role="alert" style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(245,165,36,0.1)', border: '1px solid rgba(245,165,36,0.3)', color: '#f3c97a', display: 'flex', gap: 10, alignItems: 'center' }}>
            저장 충돌: 서버에 더 최근 설계가 있습니다 (rev {s.conflictRevision}). 충돌을 해결한 뒤 다시 적용하세요.
            <span style={{ flex: 1 }} />
            <button style={btn()} disabled={s.reloading} onClick={() => { if (confirm('저장하지 않은 변경을 버리고 서버 버전을 불러올까요?')) void s.reloadServer(); }}>서버 버전 불러오기</button>
            <button style={btn()} disabled={s.reloading || !Number.isInteger(s.conflictRevision)} onClick={() => { if (confirm(`서버 rev ${s.conflictRevision}을 내 편집으로 덮어쓸까요?`)) { flushEdits(); void s.overwrite(); } }}>내 변경으로 덮어쓰기</button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: 14, marginTop: 14 }}>
          <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>원문</span>
              <span style={{ flex: 1 }} />
              <input ref={fileRef} type="file" accept=".mmd,.md,.txt" style={{ display: 'none' }} data-testid="aa-import-file"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ''; }} />
              <button style={btn()} onClick={() => fileRef.current?.click()} disabled={applying}>파일 선택 (.mmd .md .txt)</button>
            </div>
            <textarea aria-label="Mermaid 원문" data-testid="aa-import-text" value={text} disabled={applying}
              onChange={(e) => { setText(e.target.value); setMessage(null); }}
              placeholder={'flowchart LR\n  Client --> Gateway --> Reports API --> Redis'}
              style={{ minHeight: 260, resize: 'vertical', padding: 10, borderRadius: 8, background: '#0b0b0d', color: '#e2e0db', border: '1px solid rgba(255,255,255,0.12)', font: '12.5px/1.6 Consolas, monospace' }} />
            {fileError && <div role="alert" style={{ color: '#f87171' }}>{fileError}</div>}
            {parsed && isImportError(parsed) && <div role="alert" data-testid="aa-import-error" style={{ color: '#f87171' }}>{parsed.message}</div>}
            {ok && ok.warnings.length > 0 && (
              <div data-testid="aa-import-warnings" style={{ color: '#f3c97a', fontSize: 12, display: 'grid', gap: 3 }}>
                <b>가져오지 않은 줄 {ok.warnings.length}개</b>
                {ok.warnings.slice(0, 20).map((w, i) => <span key={i}>{w.line}번째 줄: {w.reason}{w.text ? ` — ${w.text.slice(0, 60)}` : ''}</span>)}
                {ok.warnings.length > 20 && <span>…외 {ok.warnings.length - 20}개</span>}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600 }}>미리보기</span>
              {ok && <span data-testid="aa-import-counts" style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>노드 {ok.nodes.length} · 연결 {ok.edges.length} · 그룹 {ok.groups.length}</span>}
            </div>
            {preview
              ? <MiniCanvas layout={preview.layout} height={240} highlight={preview.highlight} label="가져오기 미리보기 (초록색이 새로 추가)" testId="aa-import-preview" />
              : <div style={{ height: 240, display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px dashed rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)' }}>
                  {ok && !layout ? '배치 도구를 불러오는 중…' : 'Mermaid flowchart를 붙여 넣거나 파일을 선택하세요'}
                </div>}
          </div>
        </div>

        {ok && ok.nodes.length > 0 && (
          <table style={{ width: '100%', marginTop: 14, borderCollapse: 'collapse', fontSize: 12.5 }} data-testid="aa-import-table">
            <thead>
              <tr style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'left' }}>
                <th style={cell}>이름</th><th style={cell}>타입</th><th style={cell}>추론</th><th style={cell}>기존 컴포넌트</th>
              </tr>
            </thead>
            <tbody>
              {ok.nodes.map((n) => {
                const choice = choices[n.mermaidId];
                const list = candidates[n.mermaidId] ?? [];
                const value = choice?.reuse === undefined ? '' : choice.reuse === null ? NEW : choice.reuse;
                const missing = problems.missing.includes(n.mermaidId);
                return (
                  <tr key={n.mermaidId} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={cell}>{n.label}{n.label !== n.mermaidId && <span style={{ color: 'rgba(255,255,255,0.35)' }}> ({n.mermaidId})</span>}</td>
                    <td style={cell}>
                      <select aria-label={`${n.label} 타입`} value={choice?.type ?? n.inferredType} disabled={applying || Boolean(choice?.reuse)}
                        onChange={(e) => setChoice(n.mermaidId, { type: e.target.value })} style={select}>
                        {componentTypes.map(([key, d]) => <option key={key} value={key}>{d.label}</option>)}
                      </select>
                    </td>
                    <td style={{ ...cell, color: n.confidence === 'low' ? '#f5a524' : 'rgba(255,255,255,0.55)' }}>
                      {n.confidence === 'low' ? '⚠ 확인 필요' : n.confidence === 'medium' ? '보통' : '높음'}
                    </td>
                    <td style={cell}>
                      {list.length === 0 ? <span style={{ color: 'rgba(255,255,255,0.4)' }}>새로 만들기</span> : (
                        <select aria-label={`${n.label} 기존 컴포넌트`} value={value} disabled={applying}
                          onChange={(e) => setChoice(n.mermaidId, { reuse: e.target.value === NEW ? null : e.target.value || undefined })}
                          style={{ ...select, borderColor: value === '' || missing ? '#f5a524' : select.borderColor }}>
                          {value === '' && <option value="">선택하세요 (후보 {list.length}개)</option>}
                          {list.map((id, i) => (
                            <option key={id} value={id}>기존에 연결: {s.model?.components[id]?.name ?? id}{list.length > 1 ? ` #${i + 1} (${s.model?.components[id]?.type ?? ''})` : ''}</option>
                          ))}
                          <option value={NEW}>새로 만들기</option>
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {message && <div role="alert" data-testid="aa-import-message" style={{ marginTop: 12, color: '#f3c97a' }}>{message}</div>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
          {summary && (
            <span data-testid="aa-import-summary" style={{ color: 'rgba(255,255,255,0.65)' }}>
              새 컴포넌트 {summary.newComponents} · 기존 컴포넌트 연결 {summary.reused} · 새 관계 {summary.newRelations}
              {summary.skippedRelations ? ` (중복 ${summary.skippedRelations} 제외)` : ''} · 새 그룹 {summary.newGroups}
            </span>
          )}
          {problems.unchosen.length > 0 && <span style={{ color: '#f5a524' }}>기존 컴포넌트를 고르지 않은 행 {problems.unchosen.length}개</span>}
          <span style={{ flex: 1 }} />
          <button style={btn()} onClick={onClose} disabled={applying}>취소</button>
          <button data-testid="aa-import-apply" disabled={!canApply} onClick={() => void apply()}
            style={{ ...btn(), background: canApply ? '#c8a96e' : 'rgba(200,169,110,0.3)', borderColor: '#c8a96e', color: '#16130c', fontWeight: 600 }}>
            {applying ? '적용 중…' : '적용'}
          </button>
        </div>
      </div>
    </div>
  );
}

const cell: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'middle' };
const select: React.CSSProperties = { padding: '4px 6px', borderRadius: 6, background: '#0b0b0d', color: '#e2e0db', border: '1px solid rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.15)' };

function btn(): React.CSSProperties {
  return { padding: '6px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer', borderStyle: 'solid', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.85)' };
}
