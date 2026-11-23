'use client';

// 배치안의 컨테이너 컴포넌트 노드 (Sprint 7 · 04 §6.10): 환경·구역·플랫폼·VM.
// 그룹처럼 자식을 담고 크기를 바꾸지만, 속성이 있는 컴포넌트다(Inspector에서 편집). 구역은 신뢰 구역 색.
// 테두리는 longhand로만 (Sprint 1 Step 0 발견 1)
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import type { AaContainerFlowNode } from '@/lib/aa/graph-mapper';
import { GROUP_MIN_SIZE } from '@/lib/aa/model-ops';
import { CATEGORY_COLOR, TRUST_COLOR, TYPE_FALLBACK } from './palette-meta';

export default function ContainerNode({ data, selected }: NodeProps<AaContainerFlowNode>) {
  const meta = TYPE_FALLBACK[data.type] ?? { icon: '▣', category: 'deployment' };
  const color = data.type === 'dep.zone' && data.trust ? TRUST_COLOR[data.trust] ?? CATEGORY_COLOR.deployment : CATEGORY_COLOR.deployment;
  const border = selected ? '#c8a96e' : color;
  const isZone = data.type === 'dep.zone' || data.type === 'dep.environment';
  const handle: React.CSSProperties = { width: 8, height: 8, background: '#c8a96e', borderStyle: 'solid', borderWidth: 2, borderColor: '#121215' };

  return (
    <div data-testid="aa-container" data-type={data.type} style={{
      width: '100%', height: '100%', boxSizing: 'border-box', borderRadius: 10,
      background: isZone ? 'rgba(255,255,255,0.015)' : 'rgba(94,196,182,0.04)',
      borderStyle: isZone ? 'dashed' : 'solid', borderWidth: isZone ? 1.5 : 1,
      borderTopColor: border, borderRightColor: border, borderBottomColor: border, borderLeftColor: border,
    }}>
      <NodeResizer isVisible={selected} minWidth={GROUP_MIN_SIZE} minHeight={GROUP_MIN_SIZE} color="#c8a96e"
        handleStyle={{ width: 8, height: 8, borderRadius: 2 }} />
      {/* 플랫폼·VM은 LB 등과 연결될 수 있다 */}
      {!isZone && <Handle type="target" position={Position.Left} style={handle} />}
      <div style={{ position: 'absolute', top: 6, left: 10, right: 10, display: 'flex', gap: 6, alignItems: 'baseline', fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span style={{ color }}>{meta.icon}</span>
        <b style={{ color: 'rgba(255,255,255,0.8)' }}>{data.name}</b>
        <span style={{ color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {data.type === 'dep.zone' ? `zone · ${data.trust ?? ''}` : data.technology || data.type.replace(/^dep\./, '')}
        </span>
      </div>
      {!isZone && <Handle type="source" position={Position.Right} style={handle} />}
      {data.sharedViews && <span data-testid="aa-node-shared" title={`다른 View에도 있는 컴포넌트 (${data.sharedViews}곳)`} aria-label={`참조 노드 · ${data.sharedViews}개 View`}
        style={{ position: 'absolute', right: 8, bottom: 6, fontSize: 11, color: '#c8a96e' }}>⧉</span>}
    </div>
  );
}
