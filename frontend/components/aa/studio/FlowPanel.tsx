'use client';

// API Flow 화면 (Sprint 8 · 04 §6.11 · FLW-01~06 · D-25).
// 왼쪽 흐름 목록 · 가운데 시퀀스 미리보기([Mermaid 편집] → 편집기 + 미리보기) · 오른쪽 흐름 정보(엔드포인트·참여·결과·인증 역할·NFR).
// 본문은 componentId로 저장하고 편집기에서만 C1…Cn 별칭으로 보여준다. 참여 밖 식별자는 "불일치"로 표시한다.
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { ApiFlow, ArchitectureModel, FlowOutcome, HttpMethod } from '@/lib/aa/architecture-types';
import * as flowOps from '@/lib/aa/flow-ops';
import { AUTH_ICON, AUTH_LABEL, fromEditorText, renderSource, templateBody, toEditorText, unknownIdentifiers, type AuthRole } from '@/lib/aa/flow-mermaid';
import { useStudio } from '@/lib/aa/studio-store';
import MermaidPreview from './MermaidPreview';
import type { InspectorEdits } from './SchemaForm';

const panel: CSSProperties = { borderRight: '1px solid rgba(255,255,255,0.07)', background: '#0a0a0c', padding: 12, overflowY: 'auto' };
const btn: CSSProperties = { padding: '5px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#e2e0db' };
const input: CSSProperties = { boxSizing: 'border-box', width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.15)', background: '#141417', color: '#e8e6e1', font: 'inherit', fontSize: 12.5 };
const muted: CSSProperties = { color: 'rgba(255,255,255,0.45)', fontSize: 11.5, lineHeight: 1.5 };
const h: CSSProperties = { fontSize: 12, color: '#c8a96e', fontWeight: 600, margin: '14px 0 6px' };

export default function FlowPanel({ edits }: { edits: InspectorEdits }) {
  const s = useStudio();
  const model = s.model!;
  const flows = Object.values(model.flows ?? {});
  const flow = s.selectedFlowId ? model.flows?.[s.selectedFlowId] : undefined;
  const [creating, setCreating] = useState(flows.length === 0);
  useEffect(() => { edits.flush(); }, [s.selectedFlowId, edits]);

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex' }} data-testid="aa-flow-panel">
      <div style={{ ...panel, width: 250, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <b style={{ fontSize: 13 }}>API Flow</b>
          <span style={muted}>{flows.length}/{flowOps.FLOW_LIMITS.flows}</span>
          <span style={{ flex: 1 }} />
          <button style={btn} onClick={() => setCreating(true)} disabled={flows.length >= flowOps.FLOW_LIMITS.flows} data-testid="aa-flow-add">+ 흐름</button>
        </div>
        {s.flowRepair && (
          <div role="alert" data-testid="aa-flow-repair" style={{ marginTop: 10, padding: 8, borderRadius: 8, background: 'rgba(245,165,36,0.08)', border: '1px solid rgba(245,165,36,0.3)', fontSize: 12, color: '#f3c97a', lineHeight: 1.5 }}>
            {s.flowRepair.removed > 0 && <>없어진 컴포넌트를 가리키던 참여·역할 {s.flowRepair.removed}개를 뺐습니다.<br /></>}
            {s.flowRepair.underTwo.length > 0 && <>참여가 2개 미만인 흐름 {s.flowRepair.underTwo.length}개는 저장되지 않습니다. [수정]으로 참여를 더하거나 [삭제]하세요.</>}
            {!s.flowRepair.underTwo.length && <button style={{ ...btn, marginTop: 6 }} onClick={s.dismissFlowRepair}>확인</button>}
          </div>
        )}
        <div style={{ display: 'grid', gap: 6, marginTop: 10 }} data-testid="aa-flow-list">
          {flows.map((f) => {
            const broken = s.flowRepair?.underTwo.includes(f.id);
            const active = f.id === s.selectedFlowId;
            return (
              <div key={f.id} data-testid="aa-flow-item" style={{ padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: active ? 'rgba(200,169,110,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${broken ? 'rgba(245,165,36,0.5)' : active ? 'rgba(200,169,110,0.45)' : 'rgba(255,255,255,0.06)'}` }}
                onClick={() => { setCreating(false); s.selectFlow(f.id); }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{broken ? '⚠ ' : ''}{f.name}</div>
                {f.endpoint && <div style={{ ...muted, fontFamily: 'Consolas, monospace' }}>{f.endpoint.method} {f.endpoint.path}</div>}
                <div style={{ fontSize: 11.5, marginTop: 2 }}>
                  {f.outcomes.map((o) => <span key={o.id} style={{ marginRight: 6, color: o.kind === 'success' ? '#4ade80' : '#f87171' }}>{o.kind === 'success' ? '✓' : '✕'}{o.label.split(' ')[0]}</span>)}
                </div>
                {broken && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button style={btn} onClick={(e) => { e.stopPropagation(); setCreating(false); s.selectFlow(f.id); }} data-testid="aa-flow-repair-edit">수정</button>
                    <button style={{ ...btn, color: '#ff9b9d' }} onClick={(e) => { e.stopPropagation(); s.flowEdit((m) => ({ model: flowOps.removeFlow(m, f.id) })); }} data-testid="aa-flow-repair-delete">삭제</button>
                  </div>
                )}
              </div>
            );
          })}
          {!flows.length && !creating && <div style={muted}>아직 흐름이 없습니다. [+ 흐름]으로 시나리오(예: 리포트 목록 조회)를 만드세요.</div>}
        </div>
      </div>

      {creating ? <NewFlow model={model} onDone={() => setCreating(false)} />
        : flow ? <FlowDetail key={flow.id} flow={flow} model={model} />
          : <div style={{ flex: 1, display: 'grid', placeItems: 'center', ...muted }}>왼쪽에서 흐름을 고르세요.</div>}
    </div>
  );
}

function NewFlow({ model, onDone }: { model: ArchitectureModel; onDone: () => void }) {
  const flowEdit = useStudio((s) => s.flowEdit);
  const selectFlow = useStudio((s) => s.selectFlow);
  const [name, setName] = useState('');
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [path, setPath] = useState('');
  const [parts, setParts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const logical = Object.values(model.components).filter((c) => c.layer === 'logical').sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const submit = () => {
    let created: string | undefined;
    const err = flowEdit((m) => { const r = flowOps.addFlow(m, { name, participantIds: parts, endpoint: path ? { method, path } : undefined }, templateBody); created = r.flowId; return r; });
    if (err) { setError(err); return; }
    if (created) selectFlow(created);
    onDone();
  };
  return (
    <div style={{ flex: 1, padding: 20, overflowY: 'auto', display: 'grid', alignContent: 'start', gap: 10, maxWidth: 560 }} data-testid="aa-flow-new">
      <b style={{ fontSize: 14 }}>새 흐름</b>
      <label style={{ display: 'grid', gap: 4, fontSize: 12.5 }}>이름
        <input style={input} value={name} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder="예: 리포트 목록 조회" data-testid="aa-flow-new-name" />
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        <select style={{ ...input, width: 100 }} value={method} onChange={(e) => setMethod(e.target.value as HttpMethod)} aria-label="메서드">{flowOps.HTTP_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
        <input style={input} value={path} onChange={(e) => { setPath(e.target.value); setError(null); }} placeholder="/api/my-ai/reports (선택)" aria-label="경로" data-testid="aa-flow-new-path" />
      </div>
      <div style={{ fontSize: 12.5 }}>참여 컴포넌트 (고른 순서 = 시퀀스 순서, 2개 이상 · Logical만)</div>
      <div style={{ display: 'grid', gap: 4 }}>
        {logical.map((c) => {
          const i = parts.indexOf(c.id);
          return (
            <label key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}>
              <input type="checkbox" checked={i >= 0} onChange={(e) => setParts(e.target.checked ? [...parts, c.id] : parts.filter((x) => x !== c.id))} data-testid="aa-flow-new-part" />
              {c.name}{i >= 0 && <span style={{ color: '#c8a96e' }}> · C{i + 1}</span>}
            </label>
          );
        })}
      </div>
      {error && <div role="alert" style={{ color: '#ff9b9d', fontSize: 12.5 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={btn} onClick={onDone}>취소</button>
        <button style={{ ...btn, background: '#c8a96e', color: '#16130c', borderColor: '#c8a96e' }} onClick={submit} data-testid="aa-flow-new-submit">만들기</button>
      </div>
      <div style={muted}>결과는 “✓ 200 OK” 하나로 시작하고, 본문은 참여 순서로 만든 템플릿입니다. 오른쪽 정보 패널에서 실패 분기·인증 역할·NFR을 더하세요.</div>
    </div>
  );
}

function FlowDetail({ flow, model }: { flow: ApiFlow; model: ArchitectureModel }) {
  const s = useStudio();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = (fn: (m: ArchitectureModel) => { model: ArchitectureModel; error?: string }) => setError(s.flowEdit(fn) ?? null);
  const rendered = useMemo(() => renderSource(flow, model), [flow, model]);
  const unknown = rendered.unknown;
  const name = (cid: string) => model.components[cid]?.name ?? '(삭제된 컴포넌트)';

  return (
    <>
      <div style={{ flex: 1, minWidth: 0, padding: 16, overflowY: 'auto', display: 'grid', alignContent: 'start', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <b style={{ fontSize: 14 }}>{flow.name}</b>
          {flow.endpoint && <span style={{ ...muted, fontFamily: 'Consolas, monospace' }}>{flow.endpoint.method} {flow.endpoint.path}</span>}
          <span style={{ flex: 1 }} />
          <button style={btn} onClick={() => s.setView('view_logical')} data-testid="aa-flow-show-logical" title="Logical에서 참여 컴포넌트·호출 강조">Logical에서 보기</button>
          <button style={btn} onClick={() => setEditing((v) => !v)} data-testid="aa-flow-edit-toggle">{editing ? '편집 닫기' : 'Mermaid 편집 ▸'}</button>
        </div>
        {(unknown.length > 0 || rendered.removed.length > 0) && (
          <div role="alert" data-testid="aa-flow-mismatch" style={{ fontSize: 12, color: '#f3c97a', padding: 8, borderRadius: 8, background: 'rgba(245,165,36,0.08)', border: '1px solid rgba(245,165,36,0.3)', lineHeight: 1.5 }}>
            {unknown.length > 0 && <>⚠ 본문과 참여 목록이 맞지 않습니다 — 참여 밖 식별자 {unknown.length}개({unknown.join(', ')}). 본문을 고치거나 참여에 더하세요.<br /></>}
            {rendered.removed.length > 0 && <>그리기 전에 뺀 설정: {rendered.removed.join(', ')} (저장본은 그대로)</>}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: editing ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr', gap: 12 }}>
          {editing && <MermaidEditor flow={flow} onCommit={(text) => run((m) => flowOps.updateFlowText(m, flow.id, 'mermaid', text))} />}
          <div><MermaidPreview source={rendered.source} label={`${flow.name} 시퀀스`} /></div>
        </div>
        {error && <div role="alert" style={{ color: '#ff9b9d', fontSize: 12.5 }}>{error}</div>}
      </div>

      <div style={{ ...panel, width: 320, flexShrink: 0, borderRight: 'none', borderLeft: '1px solid rgba(255,255,255,0.07)', fontSize: 12.5 }} data-testid="aa-flow-info">
        <TextCommit label="이름" value={flow.name} onCommit={(v) => run((m) => flowOps.updateFlowText(m, flow.id, 'name', v))} />
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <select style={{ ...input, width: 96 }} aria-label="메서드" value={flow.endpoint?.method ?? 'GET'} onChange={(e) => run((m) => flowOps.setEndpoint(m, flow.id, e.target.value as HttpMethod, flow.endpoint?.path ?? ''))}>
            {flowOps.HTTP_METHODS.map((x) => <option key={x}>{x}</option>)}
          </select>
          <TextCommit label="" ariaLabel="경로" value={flow.endpoint?.path ?? ''} placeholder="/api/… (비우면 없음)" onCommit={(v) => run((m) => flowOps.setEndpoint(m, flow.id, flow.endpoint?.method ?? 'GET', v))} />
        </div>
        <TextCommit label="설명" value={flow.description ?? ''} multiline onCommit={(v) => run((m) => flowOps.updateFlowText(m, flow.id, 'description', v))} />

        <div style={h}>참여 ({flow.participantIds.length}) — 순서 = 시퀀스</div>
        <div style={{ display: 'grid', gap: 4 }} data-testid="aa-flow-participants">
          {flow.participantIds.map((cid, i) => (
            <div key={cid} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ color: '#c8a96e', width: 26 }}>C{i + 1}</span>
              <span style={{ flex: 1 }}>{name(cid)}</span>
              <button style={btn} aria-label={`${name(cid)} 위로`} disabled={i === 0} onClick={() => run((m) => flowOps.moveParticipant(m, flow.id, cid, -1))}>↑</button>
              <button style={btn} aria-label={`${name(cid)} 아래로`} disabled={i === flow.participantIds.length - 1} onClick={() => run((m) => flowOps.moveParticipant(m, flow.id, cid, 1))}>↓</button>
              <button style={btn} aria-label={`${name(cid)} 빼기`} onClick={() => run((m) => flowOps.setParticipants(m, flow.id, flow.participantIds.filter((x) => x !== cid)))}>✕</button>
            </div>
          ))}
          <select style={input} value="" aria-label="참여 더하기" data-testid="aa-flow-add-participant" onChange={(e) => e.target.value && run((m) => flowOps.setParticipants(m, flow.id, [...flow.participantIds, e.target.value]))}>
            <option value="">+ 참여 더하기</option>
            {Object.values(model.components).filter((c) => c.layer === 'logical' && !flow.participantIds.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div style={h}>결과 분기</div>
        <div style={{ display: 'grid', gap: 6 }} data-testid="aa-flow-outcomes">
          {flow.outcomes.map((o) => <OutcomeRow key={o.id} outcome={o} onChange={(patch) => run((m) => flowOps.updateOutcome(m, flow.id, o.id, patch))} onRemove={() => run((m) => flowOps.removeOutcome(m, flow.id, o.id))} />)}
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={btn} onClick={() => run((m) => flowOps.addOutcome(m, flow.id, 'success', '200 OK'))}>+ 성공</button>
            <button style={btn} onClick={() => run((m) => flowOps.addOutcome(m, flow.id, 'failure', '401 Unauthorized'))} data-testid="aa-flow-add-failure">+ 실패</button>
          </div>
        </div>

        <div style={h}>인증·데이터 경계</div>
        {(Object.keys(AUTH_ICON) as AuthRole[]).map((role) => (
          <label key={role} style={{ display: 'grid', gridTemplateColumns: '90px 1fr', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span>{AUTH_ICON[role]} {AUTH_LABEL[role]}</span>
            <select style={input} value={flow.auth?.[role] ?? ''} onChange={(e) => run((m) => flowOps.setAuthRole(m, flow.id, role, e.target.value))} data-testid={`aa-flow-auth-${role}`}>
              <option value="">없음</option>
              {flow.participantIds.map((cid) => <option key={cid} value={cid}>{name(cid)}</option>)}
            </select>
          </label>
        ))}

        <div style={h}>요구사항 (NFR·FR)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }} data-testid="aa-flow-requirements">
          {s.requirements.filter((r) => r.status !== 'deprecated' || flow.requirementIds.includes(r.id)).map((r) => {
            const on = flow.requirementIds.includes(r.id);
            return (
              <button key={r.id} title={r.title} onClick={() => run((m) => flowOps.toggleFlowRequirement(m, flow.id, r.id))}
                style={{ ...btn, padding: '2px 7px', fontSize: 11.5, background: on ? 'rgba(200,169,110,0.16)' : 'transparent', borderColor: on ? 'rgba(200,169,110,0.5)' : 'rgba(255,255,255,0.1)', color: on ? '#e9d6b0' : 'rgba(255,255,255,0.55)' }}>
                {on ? '✓ ' : ''}{r.code}
              </button>
            );
          })}
          {!s.requirements.length && <span style={muted}>요구사항이 없습니다.</span>}
        </div>

        <DeleteFlow name={flow.name} onDelete={() => run((m) => ({ model: flowOps.removeFlow(m, flow.id) }))} />
      </div>
    </>
  );
}

function DeleteFlow({ name, onDelete }: { name: string; onDelete: () => void }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button style={{ ...btn, marginTop: 18, color: '#ff9b9d', borderColor: 'rgba(248,113,113,0.35)' }} onClick={() => setAsk(true)} data-testid="aa-flow-delete">흐름 삭제</button>;
  return (
    <div role="alertdialog" aria-label="흐름 삭제 확인" style={{ marginTop: 18, display: 'grid', gap: 6, fontSize: 12 }}>
      <span>“{name}”을 삭제할까요? 자동 저장되며, 이미 발행한 버전에는 남습니다.</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button style={btn} onClick={() => setAsk(false)}>취소</button>
        <button style={{ ...btn, color: '#ff9b9d', borderColor: 'rgba(248,113,113,0.35)' }} onClick={onDelete} data-testid="aa-flow-delete-confirm">삭제</button>
      </div>
    </div>
  );
}

function OutcomeRow({ outcome, onChange, onRemove }: { outcome: FlowOutcome; onChange: (p: { kind?: FlowOutcome['kind']; label?: string; cause?: FlowOutcome['cause'] | '' }) => void; onRemove: () => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 96px 26px', gap: 4, alignItems: 'center' }} data-testid="aa-flow-outcome">
      <button style={{ ...btn, padding: '3px 0', color: outcome.kind === 'success' ? '#4ade80' : '#f87171' }} title="성공·실패 바꾸기" aria-label={outcome.kind === 'success' ? '성공 — 실패로 바꾸기' : '실패 — 성공으로 바꾸기'}
        onClick={() => onChange({ kind: outcome.kind === 'success' ? 'failure' : 'success' })}>{outcome.kind === 'success' ? '✓' : '✕'}</button>
      <TextCommit label="" ariaLabel="결과 라벨" value={outcome.label} onCommit={(v) => onChange({ label: v })} />
      <select style={{ ...input, padding: '5px 4px' }} aria-label="실패 원인" value={outcome.cause ?? ''} onChange={(e) => onChange({ cause: e.target.value as FlowOutcome['cause'] | '' })}>
        <option value="">원인 없음</option>
        {flowOps.OUTCOME_CAUSES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <button style={{ ...btn, padding: '3px 0' }} aria-label="결과 삭제" onClick={onRemove}>✕</button>
    </div>
  );
}

function TextCommit({ label, ariaLabel, value, onCommit, multiline, placeholder }: { label: string; ariaLabel?: string; value: string; onCommit: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => { if (draft !== value) onCommit(draft); };
  const props = { value: draft, placeholder, 'aria-label': ariaLabel ?? label, style: input, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value), onBlur: commit };
  return (
    <label style={{ display: 'grid', gap: 4, flex: 1, marginTop: label ? 8 : 0 }}>
      {label && <span>{label}</span>}
      {multiline ? <textarea rows={3} {...props} /> : <input {...props} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />}
    </label>
  );
}

function MermaidEditor({ flow, onCommit }: { flow: ApiFlow; onCommit: (stored: string) => void }) {
  const model = useStudio((s) => s.model!);
  const initial = useMemo(() => toEditorText(flow.mermaid, flow.participantIds), [flow.mermaid, flow.participantIds]);
  const [text, setText] = useState(initial);
  useEffect(() => setText(initial), [initial]);
  const unknownAliases = unknownIdentifiers(text, flow.participantIds, 'editor');
  return (
    <div style={{ display: 'grid', gap: 6, alignContent: 'start' }} data-testid="aa-flow-editor">
      <div style={{ ...muted }}>
        별칭: {flow.participantIds.map((cid, i) => `C${i + 1} = ${model.components[cid]?.name ?? '(삭제됨)'}`).join(' · ')}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} rows={18} aria-label="Mermaid 본문 (별칭)"
        style={{ ...input, fontFamily: 'Consolas, monospace', fontSize: 12, lineHeight: 1.5 }} />
      {unknownAliases.length > 0 && <div style={{ color: '#f3c97a', fontSize: 12 }}>⚠ 참여 목록 밖 식별자: {unknownAliases.join(', ')}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button style={btn} onClick={() => setText(initial)}>되돌리기</button>
        <button style={{ ...btn, background: '#c8a96e', color: '#16130c', borderColor: '#c8a96e' }} disabled={text === initial}
          onClick={() => onCommit(fromEditorText(text, flow.participantIds))} data-testid="aa-flow-editor-apply">본문 적용</button>
      </div>
    </div>
  );
}
