interface CardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
  accent?: string; // top border color
}

export default function Card({ children, style, onClick, accent }: CardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))',
        border: '1px solid rgba(255,255,255,0.06)',
        borderTop: accent ? `2px solid ${accent}` : '1px solid rgba(255,255,255,0.06)',
        borderRadius: 14,
        padding: '18px 20px',
        cursor: onClick ? 'pointer' : undefined,
        transition: onClick ? 'all 0.15s' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, ...style }}>
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 13, fontWeight: 600, color: '#c8c6c0', letterSpacing: '-0.01em' }}>
      {children}
    </span>
  );
}

export function LinkButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 11, color: '#5a5870', background: 'none',
      border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2,
    }}>
      {children}
    </button>
  );
}

export function EmptyState({ icon, text, positive }: { icon: string; text: string; positive?: boolean }) {
  return (
    <div style={{ padding: '28px 0', textAlign: 'center' }}>
      <div style={{ fontSize: 24, opacity: 0.12, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 12, color: positive ? '#4ade8060' : '#3a3850' }}>{text}</div>
    </div>
  );
}

export function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '12px 0' }} />;
}
