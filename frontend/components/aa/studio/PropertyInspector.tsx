'use client';

import { useState } from 'react';
import MarkdownPreview from '@/components/MarkdownPreview';
import type { Component, PropertyDef, Relation } from '@/lib/aa/architecture-types';
import { componentTextError, customKeyError, PROTOCOLS, RELATION_MODES, relationFieldError } from '@/lib/aa/model-ops';
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
      <RequirementLinks target="relations" id={relation.id} linked={relation.requirementIds} />
    </div>
  );
}
