'use client';

// AA Workbench 레이아웃 (D-02: /aa 독립 화면). 인증 체크 + 64px 아이콘 레일.
// Studio(/aa/projects/[id]/architecture)는 캔버스 공간을 위해 레일 없이 전체 화면.
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

const NAV = [
  { icon: '▦', label: 'Projects', href: '/aa/projects' },
];

export default function AaLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/auth'); return; }
      setReady(true);
    });
  }, [router]);

  if (!ready) return <div style={{ minHeight: '100vh', background: '#080809' }} />;

  const isStudio = /^\/aa\/projects\/[^/]+\/architecture/.test(pathname);
  if (isStudio) return <div style={{ height: '100vh', background: '#080809', overflow: 'hidden' }}>{children}</div>;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#080809', color: 'rgba(255,255,255,0.88)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <aside style={{
        width: 64, flexShrink: 0, background: 'linear-gradient(180deg, #0c0c10 0%, #0a0a0d 100%)',
        borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', padding: '14px 0', gap: 6, position: 'relative',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, #c8a96e, transparent)' }} />
        <div title="AA Workbench" style={{
          width: 34, height: 34, borderRadius: 9, background: 'rgba(200,169,110,0.12)', border: '1px solid rgba(200,169,110,0.4)',
          color: '#c8a96e', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 12, marginBottom: 12,
        }}>AA</div>
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <button key={item.href} title={item.label} onClick={() => router.push(item.href)} style={{
              width: 42, height: 42, borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 17,
              background: active ? 'rgba(200,169,110,0.12)' : 'transparent', color: active ? '#c8a96e' : 'rgba(255,255,255,0.35)',
            }}>{item.icon}</button>
          );
        })}
        <div style={{ flex: 1 }} />
        <button title="서비스 전환" onClick={() => router.push('/portal')} style={{
          width: 42, height: 42, borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 15,
          background: 'transparent', color: 'rgba(255,255,255,0.35)',
        }}>↩</button>
      </aside>
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>{children}</main>
    </div>
  );
}
