'use client';

// 캔버스 컴포넌트 노드 (04 §6.4). 테두리는 네 면 longhand로만 — 혼용 시 React 재렌더 경고 (Step 0 스파이크 발견 1)
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { AaComponentFlowNode } from '@/lib/aa/graph-mapper';
import { CATEGORY_COLOR, TYPE_FALLBACK } from './palette-meta';

export default function ComponentNode({ data, selected }: NodeProps<AaComponentFlowNode>) {
  const meta = TYPE_FALLBACK[data.type] ?? { icon: '▭', category: 'application' };
  const color = CATEGORY_COLOR[meta.category] ?? 'rgba(255,255,255,0.4)';
  const edge = selected ? '#c8a96e' : data.warning ? '#f5a524' : 'rgba(255,255,255,0.12)';
  const handle: React.CSSProperties = { width: 8, height: 8, background: '#c8a96e', borderStyle: 'solid', borderWidth: 2, borderColor: '#121215' };

  return (
    <div data-testid="aa-node" title={data.warning} data-warning={data.warning ? 'V11' : undefined} style={{
      width: 168, minHeight: 56, boxSizing: 'border-box', padding: '9px 10px 9px 12px', borderRadius: 9, background: '#121215',
      borderStyle: 'solid', borderWidth: '1px 1px 1px 4px',
      borderTopColor: edge, borderRightColor: edge, borderBottomColor: edge, borderLeftColor: color,
      boxShadow: selected ? '0 0 0 3px rgba(200,169,110,0.16), 0 6px 18px rgba(0,0,0,0.35)' : '0 6px 18px rgba(0,0,0,0.35)',
      color: 'rgba(255,255,255,0.9)', fontSize: 12.5,
    }}>
      <Handle type="target" position={Position.Left} style={handle} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        <span style={{ color, fontSize: 12 }}>{meta.icon}</span>{data.name}
      </div>
      <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 3 }}>{data.technology || data.type}</div>
      {data.warning && <div style={{ color: '#f5a524', fontSize: 10.5, marginTop: 3 }}>⚠ {data.warning}</div>}
      <Handle type="source" position={Position.Right} style={handle} />
    </div>
  );
}
