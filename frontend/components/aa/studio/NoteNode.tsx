'use client';

// 메모 노드 (04 §6.6). 노란 메모, 더블클릭 → textarea 편집, Esc·바깥 클릭으로 확정. 연결 핸들 없음
import { useEffect, useRef, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { AaNoteFlowNode } from '@/lib/aa/graph-mapper';
import { useStudio } from '@/lib/aa/studio-store';

const TEXT_MAX = 2000;

export default function NoteNode({ id, data, selected }: NodeProps<AaNoteFlowNode>) {
  const updateNoteText = useStudio((s) => s.updateNoteText);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.text);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (!editing) setDraft(data.text); }, [data.text, editing]);
  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select(); } }, [editing]);

  // 빈 글은 저장 규칙(1~2,000자)에 맞지 않으므로 이전 글로 되돌린다
  const commit = () => {
    setEditing(false);
    const text = draft.slice(0, TEXT_MAX);
    if (text.trim()) updateNoteText(id, text); else setDraft(data.text);
  };
  const border = selected ? '#c8a96e' : 'rgba(245,215,110,0.35)';

  return (
    <div data-testid="aa-note" onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }} style={{
      width: 200, minHeight: 64, boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6,
      background: 'rgba(245,215,110,0.12)',
      borderStyle: 'solid', borderWidth: 1,
      borderTopColor: border, borderRightColor: border, borderBottomColor: border, borderLeftColor: border,
      boxShadow: selected ? '0 0 0 3px rgba(200,169,110,0.16)' : 'none',
      color: '#f3e6b0', fontSize: 12, lineHeight: 1.5,
    }}>
      {editing ? (
        <textarea ref={ref} className="nodrag nowheel" value={draft} maxLength={TEXT_MAX} rows={4}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') commit(); }}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: 12, lineHeight: 1.5, fontFamily: 'inherit',
            background: 'rgba(0,0,0,0.25)', color: '#f3e6b0', padding: 4, borderRadius: 4,
            borderStyle: 'solid', borderWidth: 1, borderColor: 'rgba(245,215,110,0.4)', outline: 'none',
          }} />
      ) : (
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', cursor: 'text' }} title="더블클릭해서 편집">{data.text}</div>
      )}
    </div>
  );
}
