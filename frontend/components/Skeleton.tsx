import React from 'react';

const SHIMMER_STYLE = `
@keyframes skeleton-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}
.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    rgba(255,255,255,0.04) 25%,
    rgba(255,255,255,0.09) 50%,
    rgba(255,255,255,0.04) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.6s ease-in-out infinite;
}
`;

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: React.CSSProperties;
}

/** 기본 shimmer 블록 */
export function Skeleton({ width = '100%', height = 14, borderRadius = 6, style }: SkeletonProps) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SHIMMER_STYLE }} />
      <div
        className="skeleton-shimmer"
        style={{ width, height, borderRadius, flexShrink: 0, ...style }}
      />
    </>
  );
}

/** 통계 카드용 (숫자 + 라벨) */
export function SkeletonStat() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <style dangerouslySetInnerHTML={{ __html: SHIMMER_STYLE }} />
      <div className="skeleton-shimmer" style={{ width: 56, height: 28, borderRadius: 6 }} />
      <div className="skeleton-shimmer" style={{ width: 80, height: 12, borderRadius: 4 }} />
    </div>
  );
}

/** 테이블 행 스켈레톤 */
export function SkeletonRows({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  const widths = ['40%', '20%', '15%', '15%', '10%'];
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SHIMMER_STYLE }} />
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '12px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}
        >
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              className="skeleton-shimmer"
              style={{
                flex: j === 0 ? 2 : 1,
                height: 14,
                borderRadius: 4,
                maxWidth: widths[j] ?? '15%',
                opacity: 1 - i * 0.1,
              }}
            />
          ))}
        </div>
      ))}
    </>
  );
}

/** 카드 그리드 스켈레톤 (아이디어/콘텐츠 그리드용) */
export function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SHIMMER_STYLE }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12,
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              opacity: 1 - i * 0.08,
            }}
          >
            <div className="skeleton-shimmer" style={{ width: '60%', height: 16, borderRadius: 4 }} />
            <div className="skeleton-shimmer" style={{ width: '90%', height: 12, borderRadius: 4 }} />
            <div className="skeleton-shimmer" style={{ width: '40%', height: 12, borderRadius: 4 }} />
          </div>
        ))}
      </div>
    </>
  );
}

/** 문서 에디터 스켈레톤 (plan/design 탭용) */
export function SkeletonEditor() {
  const lines = [80, 60, 95, 40, 70, 55, 85, 45, 65, 75, 50, 88];
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SHIMMER_STYLE }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '20px 24px', flex: 1 }}>
        {lines.map((w, i) => (
          <div
            key={i}
            className="skeleton-shimmer"
            style={{ width: `${w}%`, height: 13, borderRadius: 4, opacity: 1 - i * 0.05 }}
          />
        ))}
      </div>
    </>
  );
}

/** 테이블 tbody 안에 직접 넣을 수 있는 TR 스켈레톤 */
export function SkeletonTableRows({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SHIMMER_STYLE }} />
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} style={{ padding: '12px 14px' }}>
              <div
                className="skeleton-shimmer"
                style={{
                  height: 13,
                  borderRadius: 4,
                  width: j === 0 ? '70%' : j === cols - 1 ? '30%' : '55%',
                  opacity: 1 - i * 0.08,
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default Skeleton;
