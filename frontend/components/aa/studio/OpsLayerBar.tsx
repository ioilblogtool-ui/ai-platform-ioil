'use client';

// 운영 설계 범례·레이어 토글 (Sprint 11 · OPS-02·06 · 04 §6.10.1).
// 배치안에 운영 설계(ops) 노드나 관계가 있을 때만 보인다. 범례는 늘 표시하고, 토글 상태는 저장하지 않는다(화면 상태).
import type { ArchitectureModel } from '@/lib/aa/architecture-types';
import { LAYER_STYLE, RELATION_LAYERS, isOpsRelationType, type RelationLayer } from '@/lib/aa/ops-relations';

export function hasOpsContent(model: ArchitectureModel, viewId: string): boolean {
  const view = model.views.find((v) => v.id === viewId);
  if (view?.kind !== 'deployment') return false;
  return view.nodes.some((n) => n.componentId && model.components[n.componentId]?.layer === 'ops')
    || view.edges.some((e) => isOpsRelationType(model.relations[e.relationId]?.type));
}

export default function OpsLayerBar({ hidden, onToggle }: { hidden: ReadonlySet<RelationLayer>; onToggle: (layer: RelationLayer) => void }) {
  return (
    <div data-testid="aa-ops-layers" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 14px', fontSize: 11.5, color: 'rgba(255,255,255,0.55)', borderBottom: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap' }}>
      <span>레이어</span>
      {RELATION_LAYERS.map(({ key, label }) => {
        const st = LAYER_STYLE[key];
        return (
          <label key={key} style={{ display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={!hidden.has(key)} onChange={() => onToggle(key)} data-testid={`aa-ops-layer-${key}`} />
            <svg width="22" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="22" y2="3" stroke={st.color} strokeWidth={st.width} strokeDasharray={st.dash} />
            </svg>
            {label}
          </label>
        );
      })}
    </div>
  );
}
