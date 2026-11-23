'use client';

import { use, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/Button';
import Card, { EmptyState } from '@/components/Card';
import PageHeader from '@/components/PageHeader';
import {
  AaApiError, createRequirement, deleteRequirement, getAaProject, getDraft, listRequirements, updateRequirement,
} from '@/lib/aa/architecture-api';
import type {
  ArchitectureModel, Requirement, RequirementCategory, RequirementKind, RequirementMeasurement, RequirementPriority, RequirementStatus,
} from '@/lib/aa/architecture-types';
import { computeTrace, GAP_LABEL, MEASUREMENT_FIELDS } from '@/lib/aa/trace';

const categories: Record<RequirementCategory, string> = {
  availability: '가용성', performance: '성능', scalability: '확장성', security: '보안',
  operability: '운영성', cost: '비용', other: '기타',
};
const priorities: Record<RequirementPriority, string> = { must: '필수', should: '권장', could: '선택' };
const statuses: Record<RequirementStatus, string> = { active: '사용 중', deprecated: '사용 중단' };
const pageSize = 50;
const input: CSSProperties = {
  width: '100%', color: '#e2e0db', background: '#131316', border: '1px solid #ffffff20',
  padding: '8px 10px', borderRadius: 7, font: 'inherit', boxSizing: 'border-box',
};
const labelStyle: CSSProperties = { display: 'grid', gap: 6, fontSize: 13, color: '#c8c6c0' };
const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 };
const cell: CSSProperties = { padding: '12px 14px', textAlign: 'left', borderBottom: '1px solid #ffffff0d' };

/** Sprint 8 (REQ-06): NFR 측정 기준 — 흐름을 고르면 엔드포인트를 채운다. 끊긴 흐름은 "흐름 없음"으로 두고 해제·재선택 */
function MeasurementFields({ value, onChange, model }: { value: RequirementMeasurement; onChange: (v: RequirementMeasurement) => void; model: ArchitectureModel | null }) {
  const flows = Object.values(model?.flows ?? {});
  const missing = value.flowId && !model?.flows?.[value.flowId];
  return (
    <fieldset style={{ border: '1px solid #ffffff14', borderRadius: 8, padding: 12, display: 'grid', gap: 10 }} data-testid="aa-measurement">
      <legend style={{ fontSize: 13, color: '#c8a96e', padding: '0 6px' }}>측정 기준 (REQ-06)</legend>
      <label style={labelStyle}>대상 흐름
        <select value={value.flowId ?? ''} style={input} data-testid="aa-measurement-flow" onChange={(e) => {
          const flow = model?.flows?.[e.target.value];
          const next: RequirementMeasurement = { ...value, flowId: e.target.value || undefined };
          if (flow?.endpoint && !value.endpoint) next.endpoint = `${flow.endpoint.method} ${flow.endpoint.path}`;
          onChange(next);
        }}>
          <option value="">지정 안 함</option>
          {missing && <option value={value.flowId}>⚠ 흐름 없음 ({value.flowId})</option>}
          {flows.map((fl) => <option key={fl.id} value={fl.id}>{fl.name}{fl.endpoint ? ` · ${fl.endpoint.method} ${fl.endpoint.path}` : ''}</option>)}
        </select>
      </label>
      {missing && <span role="status" style={{ color: '#f5a524', fontSize: 12.5 }}>측정 대상 흐름이 지금 설계에 없습니다(삭제·복원). 나머지 조건은 그대로 두었습니다 — 다른 흐름을 고르거나 "지정 안 함"으로 연결을 해제하세요.</span>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        {MEASUREMENT_FIELDS.map((fd) => (
          <label key={fd.key} style={labelStyle}>{fd.label}
            <input value={value[fd.key] ?? ''} maxLength={200} placeholder={fd.placeholder} style={input}
              onChange={(e) => onChange({ ...value, [fd.key]: e.target.value || undefined })} data-testid={`aa-measurement-${fd.key}`} />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function RequirementForm({ item, busy, onSubmit, onCancel, model, measurement, onMeasurement }: {
  item: Requirement | null;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  model: ArchitectureModel | null;
  measurement: RequirementMeasurement;
  onMeasurement: (v: RequirementMeasurement) => void;
}) {
  const [kind, setKind] = useState<RequirementKind>(item?.kind ?? 'fr');
  return (
    <Card>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{item ? `${item.code} 편집` : '새 요구사항'}</h2>
        <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <label style={labelStyle}>유형
              <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as RequirementKind)} disabled={!!item} style={input}>
                <option value="fr">FR · 기능</option><option value="nfr">NFR · 비기능</option>
              </select>
            </label>
            <label style={labelStyle}>분류
              <select name="category" defaultValue={item?.category ?? ''} style={input}>
                <option value="">미지정</option>
                {Object.entries(categories).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
              </select>
            </label>
            <label style={labelStyle}>우선순위
              <select name="priority" defaultValue={item?.priority ?? 'should'} style={input}>
                {Object.entries(priorities).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
              </select>
            </label>
            <label style={labelStyle}>상태
              <select name="status" defaultValue={item?.status ?? 'active'} style={input}>
                {Object.entries(statuses).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
              </select>
            </label>
          </div>
          <label style={labelStyle}>제목
            <input autoFocus name="title" required maxLength={120} defaultValue={item?.title} style={input} />
          </label>
          <label style={labelStyle}>설명
            <textarea name="description" rows={3} maxLength={5000} defaultValue={item?.description ?? ''} style={input} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <label style={labelStyle}>목표
              <input name="target" maxLength={500} defaultValue={item?.target ?? ''} style={input} />
            </label>
            <label style={labelStyle}>측정 방법
              <input name="metric" maxLength={500} defaultValue={item?.metric ?? ''} style={input} />
            </label>
          </div>
          {kind === 'nfr' && <MeasurementFields value={measurement} onChange={onMeasurement} model={model} />}
        </fieldset>
        <div style={{ ...rowStyle, justifyContent: 'flex-end' }}>
          <Button type="button" disabled={busy} onClick={onCancel}>취소</Button>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? '저장 중…' : '저장'}</Button>
        </div>
      </form>
    </Card>
  );
}

export default function RequirementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ProjectRequirements key={id} id={id} />;
}

function ProjectRequirements({ id }: { id: string }) {
  const router = useRouter();
  const [project, setProject] = useState('');
  const [list, setList] = useState<{ data: Requirement[]; total: number } | null>(null);
  const [filter, setFilter] = useState<RequirementKind | ''>('');
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [editor, setEditor] = useState<Requirement | null | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<Requirement | null>(null);
  const [inUse, setInUse] = useState<Requirement | null>(null);
  const [listError, setListError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  // Sprint 8: 측정 기준 입력(흐름 목록)·추적 배지 계산에 Draft 모델을 쓴다
  const [model, setModel] = useState<ArchitectureModel | null>(null);
  const [measurement, setMeasurement] = useState<RequirementMeasurement>({});
  useEffect(() => { getDraft(id).then((d) => setModel(d.model)).catch(() => setModel(null)); }, [id, refresh]);
  const detail = `/aa/projects/${id}`;

  useEffect(() => {
    let active = true;
    getAaProject(id).then(({ name }) => { if (active) setProject(name); }).catch(() => {});
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    let active = true;
    listRequirements(id, { kind: filter || undefined, offset, limit: pageSize })
      .then((response) => {
        if (!active) return;
        if (offset && !response.data.length) setOffset(Math.max(0, offset - pageSize));
        else setList(response);
      })
      .catch((error: Error) => { if (active) setListError(error.message); });
    return () => { active = false; };
  }, [id, filter, offset, refresh]);

  function reload() {
    setList(null);
    setListError('');
    setRefresh((value) => value + 1);
  }

  async function mutate(action: () => Promise<unknown>, success: string, deleting?: Requirement) {
    setBusy(true);
    setNotice('');
    setActionError('');
    try {
      await action();
      setEditor(undefined);
      setConfirmDelete(null);
      setInUse(null);
      setNotice(success);
      reload();
    } catch (error) {
      if (deleting && error instanceof AaApiError && error.code === 'IN_USE') {
        setConfirmDelete(null);
        setInUse(deleting);
      } else {
        setActionError(error instanceof Error ? error.message : '요청에 실패했습니다.');
      }
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get('title')).trim();
    if (!title) { setActionError('제목을 입력해 주세요.'); return; }
    const values = {
      title,
      description: String(data.get('description')).trim() || null,
      target: String(data.get('target')).trim() || null,
      metric: String(data.get('metric')).trim() || null,
      category: (data.get('category') || null) as RequirementCategory | null,
      priority: data.get('priority') as RequirementPriority,
      status: data.get('status') as RequirementStatus,
    };
    const kind = editor ? editor.kind : (data.get('kind') as RequirementKind);
    const withMeasurement = kind === 'nfr'
      ? { ...values, measurement: Object.fromEntries(Object.entries(measurement).filter(([, v]) => typeof v === 'string' && v.trim())) as RequirementMeasurement }
      : values;
    if (editor) void mutate(() => updateRequirement(id, editor.id, withMeasurement), `${editor.code} 저장됨`);
    else void mutate(() => createRequirement(id, { ...withMeasurement, kind }), '요구사항을 등록했습니다.');
  }

  return (
    <>
      <PageHeader title="요구사항" breadcrumbs={[{ label: 'AA Workbench', href: '/aa/projects' }, ...(project ? [{ label: project, href: detail }] : [])]}
        actions={<div style={rowStyle}>
          <Button onClick={() => router.push(`${detail}/architecture`)}>Studio</Button>
          <Button variant="primary" disabled={busy} onClick={() => { setEditor(null); setMeasurement({}); setActionError(''); setConfirmDelete(null); setInUse(null); }}>＋ 요구사항 등록</Button>
        </div>}
      />
      <main style={{ padding: '24px 28px', display: 'grid', gap: 16, maxWidth: 1280 }}>
        {notice && <div role="status" style={{ color: '#4ade80' }}>{notice}</div>}
        {actionError && <div role="alert" style={{ color: '#f87171' }}>{actionError}</div>}
        {editor !== undefined && <RequirementForm key={editor?.id ?? 'new'} item={editor} busy={busy} onSubmit={save}
          model={model} measurement={measurement} onMeasurement={setMeasurement}
          onCancel={() => { setEditor(undefined); setActionError(''); }} />}
        {confirmDelete && (
          <Card><div style={rowStyle}>
            <span>`{confirmDelete.code}` 요구사항을 삭제할까요?</span>
            <Button variant="danger" disabled={busy} onClick={() => void mutate(
              () => deleteRequirement(id, confirmDelete.id), `${confirmDelete.code} 삭제됨`, confirmDelete,
            )}>삭제 확인</Button>
            <Button disabled={busy} onClick={() => { setConfirmDelete(null); setActionError(''); }}>취소</Button>
          </div></Card>
        )}
        {inUse && (
          <Card><div style={rowStyle}>
            <span role="status">{inUse.code}는 설계에서 사용 중이므로 삭제할 수 없습니다.</span>
            {inUse.status !== 'deprecated' && <Button variant="primary" disabled={busy} onClick={() => void mutate(
              () => updateRequirement(id, inUse.id, { status: 'deprecated' }), `${inUse.code} 사용 중단됨`,
            )}>사용 중단</Button>}
            <Button disabled={busy} onClick={() => { setInUse(null); setActionError(''); }}>닫기</Button>
          </div></Card>
        )}
        <label style={{ ...labelStyle, width: 160 }}>요구사항 유형
          <select value={filter} style={input} onChange={(event) => {
            setFilter(event.target.value as RequirementKind | '');
            setOffset(0);
            setList(null);
            setListError('');
          }}>
            <option value="">전체</option><option value="fr">FR · 기능</option><option value="nfr">NFR · 비기능</option>
          </select>
        </label>
        <Card style={{ padding: 0, overflowX: 'auto' }}>
          {listError && <div role="alert" style={{ ...rowStyle, padding: 14, color: '#f87171' }}>{listError}<Button onClick={reload}>다시 시도</Button></div>}
          {!listError && !list && <div role="status" style={{ padding: 14 }}>불러오는 중…</div>}
          {list?.data.length === 0 && <EmptyState icon="▦" text="등록된 요구사항이 없습니다." />}
          {!!list?.data.length && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>{['코드', '요구사항', '분류', '우선순위', '상태', '추적', '작업'].map((heading) => <th key={heading} scope="col" style={cell}>{heading}</th>)}</tr></thead>
              <tbody>{list.data.map((item) => (
                <tr key={item.id}>
                  <td style={{ ...cell, whiteSpace: 'nowrap' }}>{item.code}</td>
                  <td style={cell}>
                    <a href={`${detail}/requirements/${item.id}`} style={{ color: '#e2e0db', fontWeight: 700, textDecoration: 'none' }} data-testid="aa-requirement-trace-link">{item.title}</a>
                    {item.target && <div style={{ color: '#9a98a8', marginTop: 3 }}>{item.target}</div>}
                  </td>
                  <td style={cell}>{item.category ? categories[item.category] : '—'}</td>
                  <td style={cell}>{priorities[item.priority]}</td>
                  <td style={cell}>{statuses[item.status]}</td>
                  <td style={cell}><TraceBadge item={item} model={model} href={`${detail}/requirements/${item.id}`} /></td>
                  <td style={cell}><div style={rowStyle}>
                    <Button size="sm" disabled={busy} aria-label={`${item.code} 편집`} onClick={() => {
                      setEditor(item); setMeasurement({ ...(item.measurement ?? {}) }); setActionError(''); setConfirmDelete(null); setInUse(null);
                    }}>편집</Button>
                    <Button size="sm" variant="danger" disabled={busy} aria-label={`${item.code} 삭제`} onClick={() => {
                      setConfirmDelete(item); setActionError(''); setEditor(undefined); setInUse(null);
                    }}>삭제</Button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Card>
        {list && (offset > 0 || list.total > pageSize) && (
          <div style={rowStyle}>
            <Button disabled={!offset} onClick={() => { setList(null); setOffset(offset - pageSize); }}>이전</Button>
            <span>{offset + 1}–{offset + list.data.length} / {list.total}</span>
            <Button disabled={offset + pageSize >= list.total} onClick={() => { setList(null); setOffset(offset + pageSize); }}>다음</Button>
          </div>
        )}
      </main>
    </>
  );
}

/** Sprint 8 (TRC-02): 빈칸 수 배지 — 누르면 Trace */
function TraceBadge({ item, model, href }: { item: Requirement; model: ArchitectureModel | null; href: string }) {
  if (!model) return <span style={{ color: '#9a98a8' }}>…</span>;
  const { gaps } = computeTrace(item, model);
  return (
    <a href={href} title={gaps.map((g) => GAP_LABEL[g]).join(', ') || '빈칸 없음'} data-testid="aa-trace-badge" data-gaps={gaps.length}
      style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, textDecoration: 'none', whiteSpace: 'nowrap',
        color: gaps.length ? '#f5a524' : '#4ade80', border: `1px solid ${gaps.length ? 'rgba(245,165,36,0.4)' : 'rgba(74,222,128,0.35)'}` }}>
      {gaps.length ? `⚠ 빈칸 ${gaps.length}` : '✓ 연결됨'}
    </a>
  );
}
