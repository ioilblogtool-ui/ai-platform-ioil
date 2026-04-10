'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

const NAV_SECTIONS = [
  {
    items: [
      { icon: '⬡', label: 'Dashboard',    href: '/dashboard' },
      { icon: '▤', label: 'Contents',     href: '/contents' },
      { icon: '≡', label: 'Documents',    href: '/documents' },
      { icon: '◎', label: 'Jobs',         href: '/jobs' },
      { icon: '↗', label: 'Deployments',  href: '/deployments' },
    ],
  },
  {
    items: [
      { icon: '◈', label: 'Prompts',      href: '/prompt-library' },
      { icon: '▣', label: 'Templates',    href: '/templates' },
      { icon: '⚙', label: 'Settings',     href: '/settings' },
    ],
  },
  {
    items: [
      { icon: '◉', label: 'Chat',         href: '/chat' },
    ],
  },
];

interface SidebarProps {
  userEmail?: string;
}

export default function Sidebar({ userEmail }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth');
  }

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  return (
    <aside style={{
      width: collapsed ? 60 : 220,
      flexShrink: 0,
      background: 'linear-gradient(180deg, #0c0c10 0%, #0a0a0d 100%)',
      borderRight: '1px solid rgba(255,255,255,0.05)',
      display: 'flex', flexDirection: 'column',
      transition: 'width 0.2s ease',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* 상단 골드 라인 */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, #c8a96e60, transparent)' }} />

      {/* 로고 */}
      <div style={{ padding: '20px 14px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
            background: 'linear-gradient(135deg, #c8a96e, #8b6a30)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, color: '#1a1208', fontWeight: 700,
            boxShadow: '0 0 16px #c8a96e30',
          }}>⬡</div>
          {!collapsed && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e6e1', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>AI Platform</div>
              <div style={{ fontSize: 10, color: '#3a3850', marginTop: 1 }}>Content Ops</div>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px', overflow: 'hidden auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
        {NAV_SECTIONS.map((section, si) => (
          <div key={si}>
            {si > 0 && <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '8px 4px' }} />}
            {section.items.map(item => {
              const active = isActive(item.href);
              return (
                <button key={item.href} onClick={() => router.push(item.href)} style={{
                  width: '100%', display: 'flex', alignItems: 'center',
                  gap: collapsed ? 0 : 10,
                  padding: collapsed ? '9px 0' : '8px 10px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  borderRadius: 8, border: 'none', cursor: 'pointer', marginBottom: 1,
                  background: active ? 'linear-gradient(90deg, rgba(200,169,110,0.12), rgba(200,169,110,0.04))' : 'transparent',
                  color: active ? '#c8a96e' : '#5a5870',
                  fontSize: 13, fontWeight: active ? 500 : 400,
                  borderLeft: active ? '2px solid #c8a96e' : '2px solid transparent',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}>
                  <span style={{ fontSize: 14, flexShrink: 0, opacity: active ? 1 : 0.7 }}>{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* 하단 유저 */}
      <div style={{ padding: '10px 10px 16px', borderTop: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
        {!collapsed ? (
          <>
            <div style={{ fontSize: 10, color: '#3a3850', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>
              {userEmail}
            </div>
            <button onClick={handleLogout} style={{
              width: '100%', padding: '6px', borderRadius: 7,
              border: '1px solid rgba(255,255,255,0.06)',
              background: 'transparent', color: '#5a5870', fontSize: 12, cursor: 'pointer',
            }}>로그아웃</button>
          </>
        ) : (
          <button onClick={handleLogout} style={{ width: '100%', padding: '8px 0', border: 'none', background: 'transparent', color: '#5a5870', cursor: 'pointer', fontSize: 16 }}>↩</button>
        )}
      </div>

      {/* 토글 버튼 */}
      <button onClick={() => setCollapsed(p => !p)} style={{
        position: 'absolute', top: 22, right: -10,
        width: 20, height: 20, borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.08)',
        background: '#161620', color: '#555', fontSize: 9, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
      }}>
        {collapsed ? '›' : '‹'}
      </button>
    </aside>
  );
}
