'use client';

import { useRouter } from 'next/navigation';

interface Breadcrumb { label: string; href?: string }

interface PageHeaderProps {
  title: string;
  breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode;
  badge?: string;
}

export default function PageHeader({ title, breadcrumbs, actions, badge }: PageHeaderProps) {
  const router = useRouter();

  return (
    <header style={{
      height: 56, flexShrink: 0,
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      background: 'rgba(8,8,9,0.9)',
      backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 28px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
            {breadcrumbs.map((b, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {i > 0 && <span style={{ color: '#3a3850', fontSize: 12 }}>/</span>}
                {b.href ? (
                  <button onClick={() => router.push(b.href!)} style={{ background: 'none', border: 'none', color: '#5a5870', fontSize: 12, cursor: 'pointer', padding: 0 }}>{b.label}</button>
                ) : (
                  <span style={{ color: '#5a5870', fontSize: 12 }}>{b.label}</span>
                )}
              </span>
            ))}
            <span style={{ color: '#3a3850', fontSize: 12 }}>/</span>
          </div>
        )}
        <span style={{ fontSize: 15, fontWeight: 600, color: '#e2e0db' }}>{title}</span>
        {badge && (
          <span style={{ fontSize: 10, color: '#5a5870', padding: '2px 8px', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 20 }}>
            {badge}
          </span>
        )}
      </div>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {actions}
        </div>
      )}
    </header>
  );
}
