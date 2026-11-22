'use client';

// 읽기 전용 미니 캔버스 (Overview, Mermaid 가져오기 미리보기). 모델을 바꾸지 않는다.
// 좌표 계산은 lib/aa/overview.ts miniCanvasLayout.
import type { MiniCanvas as Layout } from '@/lib/aa/overview';

export default function MiniCanvas({ layout, height = 300, highlight, label = 'Logical View 미리보기', testId = 'aa-mini-canvas' }: {
  layout: Layout;
  height?: number;
  /** 강조할 노드 ID (가져오기로 새로 생길 노드·그룹) */
  highlight?: Set<string>;
  label?: string;
  testId?: string;
}) {
  const { x, y, w, h } = layout.viewBox;
  const isNew = (id: string) => Boolean(highlight?.has(id));
  return (
    <svg role="img" aria-label={label} data-testid={testId} viewBox={`${x} ${y} ${w} ${h}`}
      style={{ width: '100%', height, background: '#0b0b0d', borderRadius: 8, border: '1px solid #ffffff10' }}
      preserveAspectRatio="xMidYMid meet">
      <defs>
        <marker id="aa-mini-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#8a8678" />
        </marker>
      </defs>
      {layout.boxes.filter((b) => b.kind === 'group').map((b) => (
        <g key={b.id}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={10} fill="rgba(200,169,110,0.04)"
            stroke={isNew(b.id) ? '#4ade80' : 'rgba(200,169,110,0.35)'} strokeDasharray="6 4" />
          <text x={b.x + 10} y={b.y + 18} fontSize={12} fill="#c8a96e">{b.label}</text>
        </g>
      ))}
      {layout.lines.map((l) => (
        <g key={l.id}>
          <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#8a8678" strokeWidth={1.5} markerEnd="url(#aa-mini-arrow)" />
          {l.label && <text x={(l.x1 + l.x2) / 2} y={(l.y1 + l.y2) / 2 - 6} fontSize={10} textAnchor="middle" fill="#9a98a8">{l.label}</text>}
        </g>
      ))}
      {layout.boxes.filter((b) => b.kind !== 'group').map((b) => (
        <g key={b.id}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={8}
            fill={b.kind === 'note' ? 'rgba(245,165,36,0.08)' : '#121215'}
            stroke={isNew(b.id) ? '#4ade80' : b.kind === 'note' ? 'rgba(245,165,36,0.4)' : 'rgba(255,255,255,0.18)'}
            strokeWidth={isNew(b.id) ? 2 : 1} />
          <text x={b.x + 12} y={b.y + 24} fontSize={13} fontWeight={600} fill="#e2e0db">{clip(b.label, 20)}</text>
          {b.sub && <text x={b.x + 12} y={b.y + 42} fontSize={11} fill="#9a98a8">{clip(b.sub, 24)}</text>}
        </g>
      ))}
    </svg>
  );
}

function clip(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
