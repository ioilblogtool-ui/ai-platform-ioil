'use client';

import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import MarkdownPreview from '@/components/MarkdownPreview';
import { aaApi } from '@/lib/aa/architecture-api';
import type { ArchitectureNote, NoteKind, NoteSummary, NoteTargetType } from '@/lib/aa/aa-client';

const NotesContext = createContext<{ projectId: string; summary: NoteSummary | null; refresh: () => void } | null>(null);

export function StudioNotesProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const [summary, setSummary] = useState<NoteSummary | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let live = true;
    aaApi.getNoteSummary(projectId).then(
      (next) => { if (live) setSummary(next); },
      () => { if (live) setSummary(null); },
    );
    return () => { live = false; };
  }, [projectId, refreshKey]);

  return <NotesContext.Provider value={{ projectId, summary, refresh: () => setRefreshKey((key) => key + 1) }}>{children}</NotesContext.Provider>;
}

export function useComponentNoteCounts(componentId: string | undefined) {
  const context = useContext(NotesContext);
  return context?.summary?.byTarget.find((item) => item.targetType === 'component' && item.targetRef === componentId);
}

const labels: Record<NoteKind, string> = { memo: '메모', question: '질문', todo: '할 일', decision: '결정', ai_answer: 'AI 답변 메모' };
const section = { display: 'grid', gap: 8, marginTop: 16, borderTop: '1px solid #303036', paddingTop: 12 };
const field = { boxSizing: 'border-box' as const, width: '100%', color: '#e8e6e1', background: '#141417', border: '1px solid #43434b', borderRadius: 5, padding: 6, font: 'inherit' };
const button = { color: '#e8e6e1', background: '#25252a', border: '1px solid #43434b', borderRadius: 5, padding: '5px 8px', cursor: 'pointer' };

export function StudioNotes({ targetType, targetRef, q }: { targetType: NoteTargetType; targetRef: string; q?: string }) {
  const context = useContext(NotesContext);
  if (!context) return null;
  return <NoteList key={JSON.stringify([context.projectId, targetType, targetRef])}
    projectId={context.projectId} targetType={targetType} targetRef={targetRef} q={q} refreshSummary={context.refresh} />;
}


const stages = [
  ['requirements', '요구사항 정리'], ['design', '설계'], ['review', '리뷰'], ['validation', '검증'], ['retro', '회고'],
] as const;

export function StageNotesBoard({ projectId }: { projectId: string }) {
  return <StudioNotesProvider key={projectId} projectId={projectId}><StageNotes /></StudioNotesProvider>;
}

function StageNotes() {
  const context = useContext(NotesContext);
  const [active, setActive] = useState<(typeof stages)[number][0]>('design');
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  return (
    <section aria-label="단계별 노트" style={{ display: 'grid', gap: 8 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>단계별 노트</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {stages.map(([stage, label]) => {
          const counts = context?.summary?.byStage[stage];
          return <button key={stage} type="button" aria-pressed={stage === active}
            style={stage === active ? { ...button, borderColor: '#c8a96e' } : button} onClick={() => setActive(stage)}>
            {label}{counts ? ` · 질문 ${counts.openQuestions} · 할 일 ${counts.openTodos}` : ''}
          </button>;
        })}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); setQuery(input.trim()); }} style={{ display: 'flex', gap: 6 }}>
        <input aria-label="노트 본문 검색" style={field} maxLength={200} value={input} onChange={(event) => setInput(event.target.value)} />
        <button style={button}>검색</button>
        {query && <button type="button" style={button} onClick={() => { setInput(''); setQuery(''); }}>검색 지우기</button>}
      </form>
      <StudioNotes targetType="stage" targetRef={active} q={query} />
    </section>
  );
}

export function TargetNotes({ projectId, targetType, targetRef, targetVersionId }: {
  projectId: string; targetType: NoteTargetType; targetRef: string; targetVersionId?: string;
}) {
  return <NoteList key={JSON.stringify([projectId, targetType, targetRef, targetVersionId])}
    projectId={projectId} targetType={targetType} targetRef={targetRef} targetVersionId={targetVersionId} />;
}

function NoteList({ projectId, targetType, targetRef, targetVersionId, q, refreshSummary }: {
  projectId: string; targetType: NoteTargetType; targetRef: string; targetVersionId?: string; q?: string; refreshSummary?: () => void;
}) {
  const [notes, setNotes] = useState<ArchitectureNote[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<ArchitectureNote | 'new' | null>(null);
  const [kind, setKind] = useState<NoteKind>('memo');
  const [title, setTitle] = useState('');
  const [bodyMd, setBodyMd] = useState('');
  const [source, setSource] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    async function load() {
      const data: ArchitectureNote[] = [];
      let count = 0;
      for (let offset = 0; offset < limit;) {
        const page = await aaApi.listNotes(projectId, { targetType, targetRef, targetVersionId, q: q || undefined, limit: Math.min(200, limit - offset), offset });
        data.push(...page.data);
        count = page.total;
        offset += page.data.length;
        if (!page.data.length || offset >= count) break;
      }
      if (live) { setNotes(data); setTotal(count); }
    }
    load().catch((error: unknown) => {
      if (live) setError(error instanceof Error ? error.message : '노트를 불러오지 못했습니다.');
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [projectId, targetType, targetRef, targetVersionId, q, limit, refreshKey]);

  function open(note: ArchitectureNote | 'new') {
    const existing = note === 'new' ? null : note;
    setEditing(note);
    setKind(existing?.kind ?? 'memo');
    setTitle(existing?.title ?? '');
    setBodyMd(existing?.bodyMd ?? '');
    setSource(existing?.source ?? '');
    setError('');
  }

  async function mutate(action: () => Promise<unknown>, onSuccess?: () => void) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
      onSuccess?.();
      setRefreshKey((key) => key + 1);
      refreshSummary?.();
    } catch (error) {
      setError(error instanceof Error ? error.message : '노트를 저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || busy) return;
    if (new TextEncoder().encode(bodyMd).length > 65536) {
      setError('본문은 65,536바이트 이하여야 합니다.');
      return;
    }
    const values = { title: title || null, bodyMd, source: source || null };
    const note = editing;
    void mutate(() => note === 'new'
      ? aaApi.createNote(projectId, { targetType, targetRef, targetVersionId, kind, ...values })
      : aaApi.updateNote(projectId, note.id, values), () => setEditing(null));
  }

  return (
    <section aria-label="노트" style={section}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong>노트{total ? ' (' + total + ')' : ''}</strong>
        {!editing && <button type="button" style={button} disabled={busy || loading} onClick={() => open('new')}>+ 노트</button>}
      </div>
      {error && <div role="alert" style={{ color: '#ff9b9d' }}>{error}</div>}
      {editing && <form onSubmit={save} style={{ display: 'grid', gap: 6 }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape' && !busy) setEditing(null);
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.currentTarget.requestSubmit(); }
        }}>
        <label>종류 <select style={field} value={kind} disabled={editing !== 'new' || busy} onChange={(event) => setKind(event.target.value as NoteKind)}>
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>제목 <input style={field} value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 8 }}>
          <label style={{ minWidth: 0 }}>본문 (Markdown)
            <textarea style={field} rows={8} value={bodyMd} onChange={(event) => setBodyMd(event.target.value)} />
          </label>
          <div aria-label="노트 미리보기" style={{ minWidth: 0, maxHeight: 240, overflow: 'auto' }}>
            <div>미리보기</div>
            <MarkdownPreview content={bodyMd} />
          </div>
        </div>
        <label>출처 <input style={field} value={source} maxLength={200} onChange={(event) => setSource(event.target.value)} /></label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={button} disabled={busy}>노트 저장</button>
          <button type="button" style={button} disabled={busy} onClick={() => setEditing(null)}>취소</button>
        </div>
      </form>}
      {loading && <span role="status">노트 불러오는 중…</span>}
      {!loading && !error && !notes.length && <span>아직 노트가 없습니다.</span>}
      {notes.map((note) => <article key={note.id} style={{ borderTop: '1px solid #303036', paddingTop: 8, overflowWrap: 'anywhere' }}>
        <strong>{note.pinned && '📌 '}{note.title || labels[note.kind]}</strong>
        <div>{labels[note.kind]}{note.status ? (note.status === 'open' ? ' · 열림' : ' · 완료') : ''}{note.targetMissing && ' · 대상 없음'}</div>
        {note.bodyMd && <MarkdownPreview content={note.bodyMd} />}
        {note.source && <small>출처 {note.source}</small>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
          {note.status && <button style={button} disabled={busy} onClick={() => void mutate(() => aaApi.updateNote(projectId, note.id, { status: note.status === 'open' ? 'done' : 'open' }))}>{note.status === 'open' ? '완료' : '다시 열기'}</button>}
          <button style={button} disabled={busy} onClick={() => void mutate(() => aaApi.updateNote(projectId, note.id, { pinned: !note.pinned }))}>{note.pinned ? '고정 해제' : '고정'}</button>
          <button style={button} disabled={busy} onClick={() => open(note)}>편집</button>
          <button style={button} disabled={busy} onClick={() => setDeleting(note.id)}>삭제</button>
        </div>
        {deleting === note.id && <div role="group" aria-label="노트 삭제 확인">
          <p>이 노트를 삭제할까요?</p>
          <button style={button} disabled={busy} onClick={() => void mutate(() => aaApi.deleteNote(projectId, note.id), () => { setDeleting(null); setEditing(null); })}>삭제 확인</button>
          <button style={button} disabled={busy} onClick={() => setDeleting(null)}>취소</button>
        </div>}
      </article>)}
      {total > notes.length && <button style={button} disabled={loading} onClick={() => setLimit((value) => value + 20)}>노트 더 보기</button>}
    </section>
  );
}
