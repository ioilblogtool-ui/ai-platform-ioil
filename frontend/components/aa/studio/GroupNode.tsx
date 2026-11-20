'use client';

// Boundary(그룹) 노드 (04 §6.5). 반투명 배경·점선 테두리, 좌상단 라벨(더블클릭 편집), 선택 시 크기 조절.
// 테두리는 longhand로만 (Sprint 1 Step 0 발견 1)
import { useEffect, useRef, useState } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import type { AaGroupFlowNode } from '@/lib/aa/graph-mapper';
import { useStudio } from '@/lib/aa/studio-store';
import { GROUP_MIN_SIZE } from '@/lib/aa/model-ops';

const LABEL_MAX = 120;

export default function GroupNode({ id, data, selected }: NodeProps<AaGroupFlowNode>) {
  const updateGroupLabel = useStudio((s) => s.updateGroupLabel);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!editing) setDraft(data.label); }, [data.label, editing]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = () => { setEditing(false); updateGroupLabel(id, draft.trim().slice(0, LABEL_MAX)); };
  const border = selected ? 'rgba(200,169,110,0.8)' : 'rgba(255,255,255,0.22)';

  return (
    <div data-testid="aa-group" style={{
      width: '100%', height: '100%', boxSizing: 'border-box', borderRadius: 10,
      background: 'rgba(255,255,255,0.025)',
      borderStyle: 'dashed', borderWidth: 1.5,
      borderTopColor: border, borderRightColor: border, borderBottomColor: border, borderLeftColor: border,
    }}>
      <NodeResizer isVisible={selected} minWidth={GROUP_MIN_SIZE} minHeight={GROUP_MIN_SIZE} color="#c8a96e"
        handleStyle={{ width: 8, height: 8, borderRadius: 2 }} />
      <div style={{ position: 'absolute', top: 6, left: 10, right: 10, fontSize: 11.5, fontWeight: 600, letterSpacing: '0.02em', color: 'rgba(255,255,255,0.6)' }}>
        {editing ? (
          <input ref={inputRef} className="nodrag" value={draft} maxLength={LABEL_MAX}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' || e.key === 'Escape') commit();
            }}
            style={{
              width: '100%', boxSizing: 'border-box', fontSize: 11.5, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
              background: '#121215', color: 'rgba(255,255,255,0.9)',
              borderStyle: 'solid', borderWidth: 1, borderColor: 'rgba(200,169,110,0.6)', outline: 'none',
            }} />
        ) : (
          <span onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }} title="더블클릭해서 이름 바꾸기" style={{ cursor: 'text' }}>
            {data.label || 'Boundary'}
          </span>
        )}
      </div>
    </div>
  );
}
