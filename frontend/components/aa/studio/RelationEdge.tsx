'use client';

// 관계 엣지 (04 §6.7). protocol(+label) 라벨, async면 점선(6 4), 선택 시 gold 2px
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import type { AaFlowEdge } from '@/lib/aa/graph-mapper';

export default function RelationEdge(props: EdgeProps<AaFlowEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd } = props;
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const label = [data?.protocol, data?.label].filter(Boolean).join(' · ');
  const async = data?.mode === 'async';

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{
        stroke: selected ? '#c8a96e' : 'rgba(255,255,255,0.35)',
        strokeWidth: selected ? 2 : 1.25,
        strokeDasharray: async ? '6 4' : undefined,
      }} />
      {label && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan" data-testid="aa-edge-label" style={{
            position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all',
            padding: '1px 6px', borderRadius: 4, fontSize: 10.5, fontFamily: 'Consolas, monospace',
            background: '#121215', color: selected ? '#c8a96e' : 'rgba(255,255,255,0.6)',
            borderStyle: 'solid', borderWidth: 1, borderColor: selected ? 'rgba(200,169,110,0.6)' : 'rgba(255,255,255,0.12)',
          }}>
            {label}{async ? ' · async' : ''}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
