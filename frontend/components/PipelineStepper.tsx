import { CONTENT_STATUS, ContentStatus } from './StatusBadge';

const STEPS: ContentStatus[] = ['idea', 'planned', 'designed', 'ready_dev', 'in_dev', 'deployed'];

interface PipelineStepperProps {
  current: ContentStatus;
  size?: 'sm' | 'md';
}

export default function PipelineStepper({ current, size = 'md' }: PipelineStepperProps) {
  const currentIdx = STEPS.indexOf(current);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {STEPS.map((step, i) => {
        const meta = CONTENT_STATUS[step];
        const isDone = i < currentIdx;
        const isActive = i === currentIdx;
        const dotSize = size === 'sm' ? 8 : 10;
        const lineH = size === 'sm' ? 2 : 2;

        return (
          <div key={step} style={{ display: 'flex', alignItems: 'center' }}>
            {/* Dot */}
            <div style={{
              width: dotSize, height: dotSize, borderRadius: '50%', flexShrink: 0,
              background: isActive ? meta.color : isDone ? '#3a3850' : '#1e1e24',
              border: isActive ? `2px solid ${meta.color}` : isDone ? '2px solid #3a3850' : '2px solid #1e1e24',
              boxShadow: isActive ? `0 0 8px ${meta.color}80` : 'none',
              position: 'relative',
            }}>
              {isActive && (
                <div style={{
                  position: 'absolute', inset: -3, borderRadius: '50%',
                  border: `1px solid ${meta.color}40`,
                }} />
              )}
            </div>
            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div style={{
                width: size === 'sm' ? 20 : 28, height: lineH,
                background: isDone
                  ? 'linear-gradient(90deg, #3a3850, #3a3850)'
                  : isActive
                  ? `linear-gradient(90deg, ${meta.color}60, #1e1e24)`
                  : '#1e1e24',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// 라벨 포함 버전 (클릭 시 상태 전환)
export function PipelineStepperFull({
  current,
  onTransition,
  transitioning,
}: {
  current: ContentStatus;
  onTransition?: (status: ContentStatus) => void;
  transitioning?: boolean;
}) {
  const currentIdx = STEPS.indexOf(current);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
      {STEPS.map((step, i) => {
        const meta = CONTENT_STATUS[step];
        const isDone = i < currentIdx;
        const isActive = i === currentIdx;
        const isClickable = !isActive && !transitioning && !!onTransition;

        return (
          <div key={step} style={{ display: 'flex', alignItems: 'flex-start', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            <div
              onClick={() => isClickable && onTransition?.(step)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                cursor: isClickable ? 'pointer' : 'default',
                opacity: transitioning ? 0.5 : 1,
              }}
            >
              {/* Dot */}
              <div style={{
                width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                background: isActive ? meta.color : isDone ? '#4ade8040' : '#1e1e24',
                border: isActive ? `2px solid ${meta.color}` : isDone ? '2px solid #4ade8060' : '2px solid #2a2a30',
                boxShadow: isActive ? `0 0 10px ${meta.color}80` : isClickable ? `0 0 0 3px ${meta.color}15` : 'none',
                position: 'relative',
                transition: 'all 0.15s',
              }} />
              {/* Label */}
              <span style={{
                fontSize: 10, whiteSpace: 'nowrap',
                color: isActive ? meta.color : isDone ? '#5a5870' : isClickable ? '#3a3850' : '#2a2a30',
                fontWeight: isActive ? 500 : 400,
                transition: 'color 0.15s',
              }}>
                {meta.label}
              </span>
            </div>
            {/* Connector */}
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1, height: 2, marginTop: 5,
                background: isDone
                  ? 'linear-gradient(90deg, #4ade8040, #4ade8020)'
                  : isActive
                  ? `linear-gradient(90deg, ${meta.color}40, #1e1e24)`
                  : '#1e1e24',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
