'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getMyAiModules } from '@/lib/api';

// 항상 표시되는 고정 메뉴 (모듈 선택과 무관)
const FIXED_NAV: { key: string; label: string; icon: string; path: string }[] = [
  { key: 'home',    label: '홈',            icon: '⬡', path: '/my-ai' },
  { key: 'reports', label: '리포트 아카이브', icon: '📋', path: '/my-ai/reports' },
];

// 모듈 선택에 따라 표시 여부가 결정되는 메뉴
const MODULE_NAV: { key: string; label: string; icon: string; path: string }[] = [
  { key: 'assets',     label: '자산 관리',   icon: '💰', path: '/my-ai/assets' },
  { key: 'budget',     label: '가계부',       icon: '📊', path: '/my-ai/budget' },
  { key: 'news',       label: '뉴스 브리핑', icon: '📰', path: '/my-ai/news' },
  { key: 'realestate', label: '부동산',       icon: '🏠', path: '/my-ai/realestate' },
  { key: 'parenting',  label: '육아',         icon: '👶', path: '/my-ai/parenting' },
  { key: 'portfolio',  label: '투자',         icon: '📈', path: '/my-ai/portfolio' },
  { key: 'health',     label: '건강',         icon: '🏋️', path: '/my-ai/health' },
  { key: 'career',     label: '커리어',       icon: '💼', path: '/my-ai/career' },
  { key: 'learning',   label: '학습',         icon: '📚', path: '/my-ai/learning' },
];

export default function MyAiLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const [userName, setUserName] = useState('');
  const [activeModules, setActiveModules] = useState<string[] | null>(null); // null = 로딩중

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth'); return; }
      setUserName(user.user_metadata?.name || user.email?.split('@')[0] || '');

      // setup 페이지는 모듈 체크 불필요
      if (pathname === '/my-ai/setup') {
        setActiveModules([]);
        return;
      }

      try {
        const res = await getMyAiModules();
        const modules: { module_key: string; is_active: boolean }[] = res?.data ?? [];
        const active = modules.filter(m => m.is_active).map(m => m.module_key);

        // 등록된 모듈이 없으면 설정 페이지로 리다이렉트
        if (active.length === 0) {
          router.push('/my-ai/setup');
          return;
        }

        setActiveModules(active);
      } catch {
        setActiveModules([]);
      }
    })();
  }, [pathname]);

  // 활성 모듈 기준으로 표시할 네비 구성
  const visibleModuleNav = activeModules
    ? MODULE_NAV.filter(item => activeModules.includes(item.key))
    : [];

  const navItems = [...FIXED_NAV, ...visibleModuleNav];

  // 모듈 로딩 전에는 탑바만 표시 (깜빡임 방지)
  if (activeModules === null && pathname !== '/my-ai/setup') {
    return (
      <div style={s.shell}>
        <div style={s.topbar}>
          <div style={s.topbarLeft}>
            <span style={s.topbarLogo}>✦</span>
            <span style={s.topbarTitle}>나만의 AI</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.shell}>
      {/* 탑바 */}
      <div style={s.topbar}>
        <div style={s.topbarLeft}>
          <span style={s.topbarLogo}>✦</span>
          <span style={s.topbarTitle}>나만의 AI</span>
        </div>

        <div style={s.topbarNav}>
          {navItems.map(item => {
            const active = pathname === item.path || (item.path !== '/my-ai' && pathname.startsWith(item.path));
            return (
              <div
                key={item.key}
                style={{ ...s.navItem, ...(active ? s.navItemActive : {}) }}
                onClick={() => router.push(item.path)}
              >
                <span style={s.navIcon}>{item.icon}</span>
                {item.label}
              </div>
            );
          })}
        </div>

        <div style={s.topbarRight}>
          {userName && <span style={s.userName}>{userName}</span>}
          <button
            style={s.setupBtn}
            onClick={() => router.push('/my-ai/setup')}
          >
            ⚙ 설정
          </button>
          <button
            style={s.portalBtn}
            onClick={() => router.push('/portal')}
          >
            서비스 전환
          </button>
        </div>
      </div>

      {/* 콘텐츠 */}
      <div style={s.content}>
        {children}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: '100vh',
    background: '#F8F7FF',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    display: 'flex',
    flexDirection: 'column',
  },
  topbar: {
    height: 56,
    background: '#FFFFFF',
    borderBottom: '1px solid rgba(83,74,183,0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 28px',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    boxShadow: '0 1px 8px rgba(83,74,183,0.06)',
  },
  topbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  topbarLogo: {
    fontSize: 18,
    color: '#534AB7',
  },
  topbarTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#1A1830',
    letterSpacing: '-0.01em',
  },
  topbarNav: {
    display: 'flex',
    gap: 2,
    alignItems: 'center',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '6px 12px',
    borderRadius: 8,
    fontSize: 13,
    color: '#4A4870',
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
  },
  navItemActive: {
    background: '#EEEDFE',
    color: '#534AB7',
    fontWeight: 600,
  },
  navIcon: {
    fontSize: 14,
  },
  topbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  userName: {
    fontSize: 12,
    color: '#9490C0',
  },
  setupBtn: {
    fontSize: 12,
    padding: '5px 12px',
    borderRadius: 8,
    border: '1px solid rgba(83,74,183,0.2)',
    background: 'transparent',
    color: '#534AB7',
    cursor: 'pointer',
  },
  portalBtn: {
    fontSize: 12,
    padding: '5px 12px',
    borderRadius: 8,
    border: '1px solid rgba(0,0,0,0.1)',
    background: 'transparent',
    color: '#9490C0',
    cursor: 'pointer',
  },
  content: {
    flex: 1,
    maxWidth: 1100,
    width: '100%',
    margin: '0 auto',
    padding: '28px 24px',
  },
};
