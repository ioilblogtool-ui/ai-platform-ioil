'use client';

import { useState } from 'react';
import MarkdownPreview from '@/components/MarkdownPreview';
import { StudioNotes } from './StudioNotes';
import type { Component, PropertyDef, Relation } from '@/lib/aa/architecture-types';
import {
  componentPlacements, componentTextError, CREDENTIALS, customKeyError, DATA_CLASSES, deploymentViewSummary, ON_FAILURE, PROTOCOLS, RELATION_MODES, RETRY_BACKOFFS, realizesTargets, relationAttrError, relationFieldError, relationSummary, runLocations, STRATEGY_MAX_BYTES,
} from '@/lib/aa/model-ops';
import { useStudio } from '@/lib/aa/studio-store';
import SchemaForm, { fieldStyle, InspectorField, type InspectorEdits } from './SchemaForm';

const muted: React.CSSProperties = { color: '#9a98a8', fontSize: 12, marginTop: 4, lineHeight: 1.5 };
const mono: React.CSSProperties = { ...muted, fontFamily: 'Consolas, monospace', overflowWrap: 'anywhere' };
const button: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#e2e0db',
};
const fields: React.CSSProperties = { display: 'grid', gap: 10, marginTop: 12 };

export default function PropertyInspector({ edits }: { edits: InspectorEdits }) {
  const s = useStudio();
  const view = s.model?.views.find((entry) => entry.id === s.viewId);
  const total = s.selectedNodeIds.length + s.selectedEdgeIds.length;
  const node = total === 1 ? view?.nodes.find((entry) => entry.id === s.selectedNodeIds[0]) : undefined;
  const edge = total === 1 ? view?.edges.find((entry) => entry.id === s.selectedEdgeIds[0]) : undefined;
  const component = node?.componentId ? s.model?.components[node.componentId] : undefined;
  const relation = edge ? s.model?.relations[edge.relationId] : undefined;

  let body: React.ReactNode;
  if (total > 1) {
    body = <>
      <strong data-testid="aa-inspector-multi">{total}개 선택됨</strong>
      <div style={muted}>노드 {s.selectedNodeIds.length} · 연결 {s.selectedEdgeIds.length}</div>
    </>;
  } else if (component && node) {
    const definition = s.registry?.types[component.type];
    body = <>
      <strong>{definition?.label ?? component.type}</strong>
      <div style={mono}>{component.id}</div>
      <div style={muted}>위치 ({node.position.x}, {node.position.y}){node.parentId ? ' · 그룹 안 상대 좌표' : ''}</div>
      {s.placementWarnings.some((w) => w.viewId === s.viewId && w.nodeId === node.id) && (
        <div role="status" data-testid="aa-inspector-v11" style={{ ...muted, color: '#f5a524' }}>⚠ Process는 VM 또는 Platform 안에 두세요 (V11, 저장은 됨).</div>
      )}
      {definition?.realizes && <RealizesEditor componentId={component.id} />}
      {component.layer === 'logical' && <RunLocations componentId={component.id} />}
      <Placements componentId={component.id} />
      <ComponentEditor
        key={`${s.projectId}:${component.id}`}
        component={component} definitions={definition?.properties ?? []} edits={edits}
      />
    </>;
  } else if (node?.kind === 'group') {
    const children = view?.nodes.filter((entry) => entry.parentId === node.id).length ?? 0;
    body = <>
      <strong>{node.label || 'Boundary'}</strong>
      <div style={muted}>Boundary · 안에 {children}개</div>
      <div style={muted}>크기 {node.width}×{node.height} · 라벨을 더블클릭해서 이름을 바꿉니다.</div>
    </>;
  } else if (node?.kind === 'note') {
    body = <>
      <strong>Note</strong>
      <div style={muted}>{node.text?.length ?? 0} / 2,000자 · 더블클릭해서 편집</div>
    </>;
  } else if (relation) {
    const from = s.model?.components[relation.from]?.name ?? relation.from;
    const to = s.model?.components[relation.to]?.name ?? relation.to;
    body = <>
      <strong>{from} → {to}</strong>
      <div style={mono}>{relation.id}</div>
      <div style={muted}>관계 유형: {relation.type}</div>
      {relation.type === 'calls' && <RelationEditor key={`${s.projectId}:${relation.id}`} relation={relation} edits={edits} />}
    </>;
  } else if (view?.kind === 'deployment') {
    body = <DeploymentSummary key={`${s.projectId}:${view.id}`} edits={edits} />;
  } else {
    const shown = new Set(s.model?.views.flatMap((entry) => entry.nodes.map((item) => item.componentId)));
    const orphanCount = Object.keys(s.model?.components ?? {}).filter((id) => !shown.has(id)).length;
    body = <>
      <strong>{view?.name ?? 'Logical View'}</strong>
      <div style={muted}>
        컴포넌트 {view?.nodes.filter((entry) => entry.kind === 'component').length ?? 0} · 관계 {view?.edges.length ?? 0}<br />
        고아 컴포넌트 {orphanCount} · Draft rev {s.baseRevision || '–'}
      </div>
    </>;
  }

  return (
    <aside aria-label="속성 편집기" data-testid="aa-inspector" style={{
      width: 320, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.07)', background: '#0a0a0c',
      padding: 16, overflowY: 'auto', overflowWrap: 'anywhere',
    }}>
      {body}
      {component ? <StudioNotes targetType="component" targetRef={component.id} />
        : relation ? <StudioNotes targetType="relation" targetRef={relation.id} />
          : total === 0 && view ? <StudioNotes targetType="view" targetRef={view.id} /> : null}
      {total > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          {s.selectedNodeIds.length > 0 && <button style={button} onClick={() => { edits.flush(); s.duplicateSelection(); }} title="Ctrl+D">복제</button>}
          <button style={{ ...button, color: '#ff9b9d' }} onClick={() => { edits.flush(); s.requestDelete(); }} title="Delete">삭제</button>
        </div>
      )}
    </aside>
  );
}

function ComponentEditor({ component, definitions, edits }: { component: Component; definitions: PropertyDef[]; edits: InspectorEdits }) {
  const s = useStudio();
  const [preview, setPreview] = useState(false);
  const textField = (field: 'name' | 'technology' | 'description', label: string) => (
    <InspectorField label={label} value={component[field] ?? ''} multiline={field === 'description'}
      validate={(value) => componentTextError(field, value)}
      onCommit={(value) => s.updateComponentText(component.id, field, value)} edits={edits} />
  );
  return (
    <div style={fields}>
      {textField('name', '이름')}
      {textField('technology', '기술')}
      <div style={{ display: 'grid', gap: 6 }}>
        <div><button style={button} aria-pressed={preview} onClick={() => { edits.flush(); setPreview(!preview); }}>
          {preview ? 'Markdown 편집' : 'Markdown 미리보기'}
        </button></div>
        {preview
          ? <div aria-label="설명 미리보기">{component.description ? <MarkdownPreview content={component.description} /> : <span style={muted}>설명이 없습니다.</span>}</div>
          : textField('description', '설명 (Markdown)')}
      </div>
      {definitions.length > 0 && <>
        <strong>속성</strong>
        <SchemaForm definitions={definitions} values={component.properties ?? {}}
          onChange={(key, raw) => s.updateComponentProperty(component.id, key, raw)} edits={edits} />
      </>}
      <CustomProperties component={component} definitions={definitions} />
      <RequirementLinks target="components" id={component.id} linked={component.requirementIds} />
    </div>
  );
}

const kindLabel = { fr: 'FR', nfr: 'NFR' } as const;

// 컴포넌트·관계의 FR/NFR 연결. 후보는 현재 프로젝트 요구사항만, 새로 붙일 수 있는 건 active만.
// 이미 연결된 deprecated 항목과 목록에 없는 ID는 표시하고 해제만 할 수 있다.
function RequirementLinks({ target, id, linked }: { target: 'components' | 'relations'; id: string; linked?: string[] }) {
  const requirements = useStudio((s) => s.requirements);
  const error = useStudio((s) => s.requirementsError);
  const setLink = useStudio((s) => s.setRequirementLink);
  const reload = useStudio((s) => s.loadRequirements);
  const [choice, setChoice] = useState('');
  const ids = Array.isArray(linked) ? linked : [];
  const byId = new Map(requirements.map((entry) => [entry.id, entry]));
  const candidates = requirements.filter((entry) => entry.status === 'active' && !ids.includes(entry.id));

  return (
    <section style={{ display: 'grid', gap: 7 }} aria-label="연결된 요구사항" data-testid="aa-requirement-links">
      <strong>요구사항 ({ids.length})</strong>
      {ids.length === 0 && <span style={muted}>연결된 FR·NFR이 없습니다.</span>}
      {ids.map((reqId) => {
        const entry = byId.get(reqId);
        return (
          <div key={reqId} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>
              {entry ? <>
                <b style={{ color: entry.kind === 'nfr' ? '#c8a96e' : '#9ec5ff' }}>{entry.code}</b> {entry.title}
                {entry.status === 'deprecated' && <span style={{ ...muted, marginLeft: 6 }}>사용 중단</span>}
              </> : <span style={muted}>{requirements.length || error ? '찾을 수 없는 요구사항 — 저장하면 제외됩니다' : '불러오는 중…'}</span>}
            </span>
            <button style={button} aria-label={`${entry?.code ?? reqId} 연결 해제`} onClick={() => setLink(target, id, reqId, false)}>해제</button>
          </div>
        );
      })}
      {error ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ ...muted, color: '#ff9b9d', marginTop: 0 }} role="alert">요구사항을 불러오지 못했습니다.</span>
          <button style={button} onClick={() => { void reload(); }}>다시 시도</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <select style={{ ...fieldStyle, flex: 1, minWidth: 0 }} value={choice} aria-label="연결할 요구사항"
            onChange={(event) => setChoice(event.target.value)} disabled={!candidates.length}>
            <option value="">{candidates.length ? '요구사항 선택…' : '연결할 수 있는 활성 요구사항이 없습니다'}</option>
            {candidates.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.code} · {kindLabel[entry.kind]} · {entry.title}</option>
            ))}
          </select>
          <button style={button} disabled={!choice} onClick={() => {
            if (!choice) return;
            setLink(target, id, choice, true);
            setChoice('');
          }}>연결</button>
        </div>
      )}
    </section>
  );
}

function CustomProperties({ component, definitions }: { component: Component; definitions: PropertyDef[] }) {
  const update = useStudio((s) => s.updateCustomProperty);
  const custom = component.custom ?? {};
  const [entry, setEntry] = useState<{ previous?: string; key: string; value: string } | null>(null);
  const error = entry && (customKeyError(definitions, entry.key.trim(), custom, entry.previous)
    ?? (entry.value.length > 500 ? '값은 500자 이하여야 합니다.' : undefined));

  return (
    <section style={{ display: 'grid', gap: 7 }} aria-label="자유 속성">
      <strong>자유 속성</strong>
      {Object.entries(custom).map(([key, value]) => (
        <div key={key} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <span style={{ flex: 1, minWidth: 0 }}>{key}: {value}</span>
          <button style={button} aria-label={`${key} 편집`} onClick={() => setEntry({ previous: key, key, value })}>편집</button>
          <button style={button} aria-label={`${key} 제거`} onClick={() => {
            update(component.id, key, key);
            if (entry?.previous === key) setEntry(null);
          }}>제거</button>
        </div>
      ))}
      {entry ? (
        <form style={{ display: 'grid', gap: 6 }} onSubmit={(event) => {
          event.preventDefault();
          if (error) return;
          update(component.id, entry.previous, entry.key.trim(), entry.value);
          setEntry(null);
        }}>
          <label>키<input style={fieldStyle} value={entry.key} onChange={(event) => setEntry({ ...entry, key: event.target.value })} /></label>
          <label>값<input style={fieldStyle} value={entry.value} onChange={(event) => setEntry({ ...entry, value: event.target.value })} /></label>
          {error && <span style={{ color: '#ff9b9d' }} role="alert">{error}</span>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="submit" style={button} disabled={Boolean(error)}>적용</button>
            <button type="button" style={button} onClick={() => setEntry(null)}>취소</button>
          </div>
        </form>
      ) : <button style={button} onClick={() => setEntry({ key: '', value: '' })}>자유 속성 추가</button>}
    </section>
  );
}

function RelationEditor({ relation, edits }: { relation: Relation; edits: InspectorEdits }) {
  const update = useStudio((s) => s.updateRelationField);
  return (
    <div style={fields}>
      {([
        ['protocol', '프로토콜', [...PROTOCOLS]],
        ['mode', '호출 방식', [...RELATION_MODES]],
        ['label', '라벨', undefined],
      ] as const).map(([field, label, choices]) => (
        <InspectorField key={field} label={label} choices={choices} value={relation[field] ?? ''}
          validate={(value) => relationFieldError(field, value)}
          onCommit={(value) => update(relation.id, field, value)} edits={edits} />
      ))}
      <RelationAttrs relation={relation} edits={edits} />
      <RequirementLinks target="relations" id={relation.id} linked={relation.requirementIds} />
    </div>
  );
}

/** Sprint 8 (REL-05·06): 운영·보안 속성. 값을 적는 칸은 없다(유형만). 비우면 그 속성을 지운다 */
function RelationAttrs({ relation, edits }: { relation: Relation; edits: InspectorEdits }) {
  const update = useStudio((s) => s.updateRelationAttr);
  const summary = relationSummary(relation);
  const field = (attr: Parameters<typeof update>[1], label: string, value: string, choices?: readonly string[], placeholder?: string) => (
    <InspectorField key={attr} label={label} choices={choices ? [...choices] : undefined} value={value} placeholder={placeholder}
      validate={(v) => relationAttrError(attr, v)} onCommit={(v) => update(relation.id, attr, v)} edits={edits} />
  );
  return (
    <>
      <section data-testid="aa-relation-ops" style={{ display: 'grid', gap: 10 }}>
        <b style={{ fontSize: 12.5, color: '#c8a96e' }}>운영</b>
        {field('timeoutMs', 'Timeout (ms)', relation.timeoutMs === undefined ? '' : String(relation.timeoutMs), undefined, '예: 3000 (비우면 없음)')}
        {field('retryMax', '재시도 횟수', relation.retry ? String(relation.retry.max) : '', undefined, '0~10 (비우면 없음)')}
        {relation.retry && field('retryBackoff', '재시도 방식', relation.retry.backoff, RETRY_BACKOFFS)}
        {field('onFailure', '실패 시 동작', relation.onFailure ?? '', ON_FAILURE)}
      </section>
      <section data-testid="aa-relation-security" style={{ display: 'grid', gap: 10 }}>
        <b style={{ fontSize: 12.5, color: '#c8a96e' }}>보안</b>
        {field('credential', '자격증명 유형', relation.credential ?? '', CREDENTIALS)}
        {field('dataClass', '데이터 등급', relation.dataClass ?? '', DATA_CLASSES)}
        <div style={muted}>유형만 고릅니다. 키·토큰 값은 어디에도 저장하지 않습니다.</div>
      </section>
      {summary && <div style={{ ...muted, fontFamily: 'Consolas, monospace' }} data-testid="aa-relation-summary">{summary}</div>}
    </>
  );
}

/** Sprint 8 (VIEW-05): 이 컴포넌트가 있는 View — 2곳 이상일 때만, 누르면 그 View의 노드로 이동 */
function Placements({ componentId }: { componentId: string }) {
  const model = useStudio((s) => s.model);
  const viewId = useStudio((s) => s.viewId);
  const focusNode = useStudio((s) => s.focusNode);
  const list = model ? componentPlacements(model, componentId) : [];
  if (list.length < 2) return null;
  return (
    <section data-testid="aa-placements" style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, color: '#c8a96e' }}>⧉ 이 컴포넌트가 있는 View {list.length}곳</div>
      <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
        {list.map((p) => (
          <button key={p.viewId} style={{ ...button, textAlign: 'left', opacity: p.viewId === viewId ? 0.55 : 1 }} disabled={p.viewId === viewId}
            onClick={() => focusNode(p.viewId, p.nodeId)}>{p.viewId === viewId ? '· ' : '→ '}{p.label}</button>
        ))}
      </div>
    </section>
  );
}

// ── 배치안 (Sprint 7 · 04 §6.10 · VIEW-06) ─────────────────────────────────

/** 구현체(Process·Managed DB·Managed Auth)의 구현 대상 Logical 컴포넌트 — 체크로 연결, 이름을 누르면 Logical View로 이동 */
function RealizesEditor({ componentId }: { componentId: string }) {
  const s = useStudio();
  if (!s.model) return null;
  const targets = new Set(realizesTargets(s.model, componentId));
  const logical = Object.values(s.model.components).filter((c) => c.layer === 'logical').sort((a, b) => a.name.localeCompare(b.name));
  const logicalView = s.model.views.find((v) => v.id === 'view_logical');
  return (
    <div style={{ ...fields, marginTop: 12 }} data-testid="aa-realizes">
      <strong>구현 대상 (realizes)</strong>
      {!logical.length && <span style={muted}>Logical 컴포넌트가 없습니다.</span>}
      {logical.map((c) => {
        const nodeId = logicalView?.nodes.find((n) => n.componentId === c.id)?.id;
        return (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={targets.has(c.id)} aria-label={`${c.name} 구현`} data-testid="aa-realizes-toggle"
              onChange={(e) => s.setRealizes(componentId, c.id, e.target.checked)} />
            <span style={{ flex: 1 }}>{c.name}</span>
            {targets.has(c.id) && nodeId && (
              <button style={{ ...button, padding: '3px 8px' }} onClick={() => s.focusNode('view_logical', nodeId)} data-testid="aa-realizes-goto">Logical에서 보기</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Logical 컴포넌트가 배치안마다 어디서 실행되는지 — 누르면 그 배치안의 구현체로 이동 */
function RunLocations({ componentId }: { componentId: string }) {
  const s = useStudio();
  if (!s.model || !s.model.views.some((v) => v.kind === 'deployment')) return null;
  const rows = runLocations(s.model, componentId);
  return (
    <div style={{ ...fields, marginTop: 12 }} data-testid="aa-run-locations">
      <strong>배치안별 실행 위치</strong>
      {!rows.length && <span style={muted}>어느 배치안에서도 구현하지 않았습니다.</span>}
      {rows.map((r) => (
        <button key={r.nodeId} style={{ ...button, textAlign: 'left' }} onClick={() => s.focusNode(r.viewId, r.nodeId)} data-testid="aa-run-location">
          {r.variant} → {r.container ? `${r.container} / ` : ''}{r.implementer}{r.instances ? ` ×${r.instances}` : ''}
        </button>
      ))}
    </div>
  );
}

/** 배치안에서 아무것도 선택하지 않았을 때: 요약과 배포 전략 Markdown (DEP-01) */
function DeploymentSummary({ edits }: { edits: InspectorEdits }) {
  const s = useStudio();
  const [preview, setPreview] = useState(false);
  const view = s.model?.views.find((v) => v.id === s.viewId);
  if (!s.model || !view) return null;
  const sum = deploymentViewSummary(s.model, view.id)!;
  return (
    <div data-testid="aa-deployment-summary">
      <strong>{view.variant}</strong>
      <div style={muted}>
        배치안 · 컴포넌트 {sum.components} · 구현체 {sum.implementers} · 구현된 Logical {sum.realizedLogical}<br />
        {sum.unrealizedLogical.length ? `아직 구현 안 된 Logical: ${sum.unrealizedLogical.join(', ')}` : '모든 Logical 컴포넌트가 이 배치안에서 구현됩니다.'}
      </div>
      <div style={{ ...fields }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ flex: 1 }}>배포 전략</strong>
          <button style={button} aria-pressed={preview} onClick={() => { edits.flush(); setPreview(!preview); }}>{preview ? 'Markdown 편집' : '미리보기'}</button>
        </div>
        {preview
          ? <div aria-label="배포 전략 미리보기">{view.strategyMd ? <MarkdownPreview content={view.strategyMd} /> : <span style={muted}>배포 전략이 비어 있습니다.</span>}</div>
          : <InspectorField label="Markdown — 누가 승인하고, 무엇을 확인하며, 실패하면 어디까지 되돌리는지" value={view.strategyMd ?? ''} multiline rows={16}
              validate={(v) => (new TextEncoder().encode(v).length > STRATEGY_MAX_BYTES ? '배포 전략은 64KB 이하여야 합니다.' : undefined)}
              onCommit={(v) => s.setStrategy(v)} edits={edits} />}
      </div>
    </div>
  );
}
