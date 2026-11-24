'use client';

// 관계 엣지 (04 §6.7). protocol(+label·timeout) 라벨, async면 점선(6 4), 선택 시 gold 2px.
// Sprint 8 (REL-07): personal 주황·sensitive 빨강 2px, 경계 통과 🛡 — 확정 실선 / 추론 점선(2 3) / 가능 🛡?.
// 툴팁 = 운영·보안 속성 요약 + 경계 근거.
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { BOUNDARY_LABEL, DATA_CLASS_COLOR } from '@/lib/aa/boundary';
import type { AaFlowEdge } from '@/lib/aa/graph-mapper';
import { relationSummary } from '@/lib/aa/model-ops';
import { LAYER_STYLE, OPS_RELATION_LABEL, isOpsRelationType } from '@/lib/aa/ops-relations';

export default function RelationEdge(props: EdgeProps<AaFlowEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd } = props;
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const r = data?.relation;
  const timeout = r?.timeoutMs === undefined ? null : r.timeoutMs % 1000 === 0 ? `${r.timeoutMs / 1000}s` : `${r.timeoutMs}ms`;
  // Sprint 11: 운영 설계 관계는 유형 이름을 라벨로, 레이어별 선 스타일 (04 §6.10.1)
  const opsType = isOpsRelationType(r?.type) ? r!.type as keyof typeof OPS_RELATION_LABEL : null;
  const layerStyle = LAYER_STYLE[data?.layer ?? 'api'];
  const label = opsType ? [OPS_RELATION_LABEL[opsType], data?.label].filter(Boolean).join(' · ') : [data?.protocol, data?.label, timeout].filter(Boolean).join(' · ');
  const async = data?.mode === 'async';
  const mark = data?.mark;
  const dataColor = mark?.dataClass ? DATA_CLASS_COLOR[mark.dataClass] : undefined;
  const boundary = mark?.boundary;
  const shield = boundary === 'possible' ? '🛡?' : boundary ? '🛡' : '';
  const dash = opsType ? layerStyle.dash : boundary === 'inferred' || boundary === 'possible' ? '2 3' : async ? '6 4' : undefined;
  const emphasized = Boolean(dataColor || boundary);
  const tooltip = [r ? relationSummary(r) : '', boundary ? `${BOUNDARY_LABEL[boundary]}${mark?.reason ? ` (${mark.reason})` : ''}` : ''].filter(Boolean).join('\n');
  const showLabel = Boolean(label || shield || mark?.dataClass);

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{
        stroke: selected ? '#c8a96e' : opsType ? layerStyle.color : dataColor ?? (boundary ? 'rgba(200,169,110,0.75)' : 'rgba(255,255,255,0.35)'),
        strokeWidth: opsType ? (selected ? Math.max(2, layerStyle.width) : layerStyle.width) : selected || emphasized ? 2 : 1.25,
        strokeDasharray: dash,
        opacity: data?.dimmed ? 0.18 : 1,
      }} />
      {showLabel && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan" data-testid="aa-edge-label" data-relation-type={r?.type} title={tooltip || undefined}
            data-boundary={boundary} data-data-class={mark?.dataClass} data-dimmed={data?.dimmed ? 'true' : undefined}
            style={{
              position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all',
              padding: '1px 6px', borderRadius: 4, fontSize: 10.5, fontFamily: 'Consolas, monospace',
              background: '#121215', color: selected ? '#c8a96e' : 'rgba(255,255,255,0.6)',
              borderStyle: 'solid', borderWidth: 1, borderColor: selected ? 'rgba(200,169,110,0.6)' : dataColor ?? 'rgba(255,255,255,0.12)',
              display: 'flex', gap: 4, alignItems: 'center', opacity: data?.dimmed ? 0.25 : 1,
            }}>
            {shield && <span aria-label={BOUNDARY_LABEL[boundary!]}>{shield}</span>}
            {label && <span>{label}{async ? ' · async' : ''}</span>}
            {mark?.dataClass && dataColor && <span style={{ color: dataColor }}>{mark.dataClass}</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
