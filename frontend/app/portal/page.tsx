'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

export default function PortalPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userName, setUserName] = useState('');
  const [hoveredCard, setHoveredCard] = useState<'ops' | 'ai' | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/auth'); return; }
      setUserName(data.user.user_metadata?.name || data.user.email?.split('@')[0] || '');
    });
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.logo}>⬡ AI Platform</div>
        {userName && (
          <div style={styles.greeting}>안녕하세요, <strong>{userName}</strong>님</div>
        )}
      </div>

      <div style={styles.center}>
        <div style={styles.tagline}>
          <div style={styles.taglineTitle}>어디로 이동할까요?</div>
          <div style={styles.taglineSub}>서비스를 선택해 주세요</div>
        </div>

        <div style={styles.cardRow}>
          {/* Content Ops 카드 */}
          <div
            style={{
              ...styles.card,
              ...styles.cardOps,
              ...(hoveredCard === 'ops' ? styles.cardOpsHover : {}),
            }}
            onMouseEnter={() => setHoveredCard('ops')}
            onMouseLeave={() => setHoveredCard(null)}
            onClick={() => router.push('/dashboard')}
          >
            <div style={styles.cardIconOps}>⬡</div>
            <div style={styles.cardBadgeOps}>운영자 전용</div>
            <div style={styles.cardTitleOps}>Content Ops</div>
            <div style={styles.cardDescOps}>
              콘텐츠 기획·AI 생성·배포 관리
              <br />파이프라인 운영 도구
            </div>
            <div style={{ ...styles.cardBtn, ...styles.cardBtnOps }}>
              이동하기 →
            </div>
          </div>

          {/* 나만의 AI 카드 */}
          <div
            style={{
              ...styles.card,
              ...styles.cardAi,
              ...(hoveredCard === 'ai' ? styles.cardAiHover : {}),
            }}
            onMouseEnter={() => setHoveredCard('ai')}
            onMouseLeave={() => setHoveredCard(null)}
            onClick={() => router.push('/my-ai')}
          >
            <div style={styles.cardIconAi}>✦</div>
            <div style={styles.cardBadgeAi}>NEW</div>
            <div style={styles.cardTitleAi}>나만의 AI</div>
            <div style={styles.cardDescAi}>
              내 삶의 데이터를 입력하면
              <br />AI가 매일 리포트를 만들어줘요
            </div>
            <div style={{ ...styles.cardBtn, ...styles.cardBtnAi }}>
              시작하기 →
            </div>

            {/* 모듈 미리보기 칩 */}
            <div style={styles.moduleChips}>
              {['💰 자산', '📊 가계부', '🏠 부동산', '📰 뉴스', '👶 육아'].map(m => (
                <span key={m} style={styles.chip}>{m}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={styles.footer}>
        <span
          style={styles.logoutLink}
          onClick={async () => { await supabase.auth.signOut(); router.push('/auth'); }}
        >
          로그아웃
        </span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(160deg, #0c0c10 0%, #111118 50%, #0a0a12 100%)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '0 24px',
  },
  header: {
    width: '100%',
    maxWidth: 880,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '28px 0 0',
  },
  logo: {
    fontSize: 16,
    fontWeight: 600,
    color: '#c8a96e',
    letterSpacing: '0.02em',
  },
  greeting: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
  center: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingBottom: 80,
  },
  tagline: {
    textAlign: 'center',
    marginBottom: 48,
  },
  taglineTitle: {
    fontSize: 26,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.88)',
    marginBottom: 8,
    letterSpacing: '-0.01em',
  },
  taglineSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.35)',
  },
  cardRow: {
    display: 'flex',
    gap: 20,
    alignItems: 'stretch',
  },

  // 카드 공통
  card: {
    width: 320,
    borderRadius: 20,
    padding: '32px 28px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    position: 'relative',
  },

  // Content Ops 카드
  cardOps: {
    background: 'linear-gradient(145deg, #161618, #1c1c22)',
    border: '1px solid rgba(200, 169, 110, 0.25)',
  },
  cardOpsHover: {
    border: '1px solid rgba(200, 169, 110, 0.6)',
    transform: 'translateY(-3px)',
    boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
  },
  cardIconOps: {
    fontSize: 28,
    color: '#c8a96e',
    marginBottom: 14,
  },
  cardBadgeOps: {
    display: 'inline-block',
    fontSize: 10,
    color: 'rgba(200,169,110,0.7)',
    border: '1px solid rgba(200,169,110,0.3)',
    borderRadius: 20,
    padding: '2px 8px',
    marginBottom: 12,
  },
  cardTitleOps: {
    fontSize: 20,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.88)',
    marginBottom: 10,
    letterSpacing: '-0.01em',
  },
  cardDescOps: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.38)',
    lineHeight: 1.65,
    marginBottom: 28,
    flex: 1,
  },
  cardBtnOps: {
    color: '#c8a96e',
    borderColor: 'rgba(200,169,110,0.3)',
  },

  // 나만의 AI 카드
  cardAi: {
    background: 'linear-gradient(145deg, #EEEDFE, #F4F3FF)',
    border: '1.5px solid #534AB7',
  },
  cardAiHover: {
    border: '1.5px solid #3C3489',
    transform: 'translateY(-3px)',
    boxShadow: '0 16px 40px rgba(83,74,183,0.25)',
  },
  cardIconAi: {
    fontSize: 28,
    color: '#534AB7',
    marginBottom: 14,
  },
  cardBadgeAi: {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    color: '#fff',
    background: '#534AB7',
    borderRadius: 20,
    padding: '2px 8px',
    marginBottom: 12,
    letterSpacing: '0.06em',
  },
  cardTitleAi: {
    fontSize: 20,
    fontWeight: 700,
    color: '#1A1830',
    marginBottom: 10,
    letterSpacing: '-0.01em',
  },
  cardDescAi: {
    fontSize: 13,
    color: '#4A4870',
    lineHeight: 1.65,
    marginBottom: 20,
    flex: 1,
  },
  cardBtnAi: {
    color: '#534AB7',
    borderColor: 'rgba(83,74,183,0.35)',
    marginBottom: 16,
  },
  moduleChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  chip: {
    fontSize: 11,
    color: '#534AB7',
    background: 'rgba(83,74,183,0.1)',
    borderRadius: 20,
    padding: '3px 8px',
  },

  // 버튼 공통
  cardBtn: {
    display: 'inline-block',
    fontSize: 13,
    fontWeight: 500,
    padding: '9px 18px',
    borderRadius: 10,
    border: '1px solid',
    background: 'transparent',
    cursor: 'pointer',
    transition: 'all 0.15s',
    alignSelf: 'flex-start',
  },

  footer: {
    paddingBottom: 32,
  },
  logoutLink: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.25)',
    cursor: 'pointer',
    transition: 'color 0.15s',
  },
};
