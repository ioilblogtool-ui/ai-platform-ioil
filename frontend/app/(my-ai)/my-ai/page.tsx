'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getMyAiModules, getAssets, getBudget, getMyAiReports, generateMyAiReport, AiReport, ModuleKey } from '@/lib/api';

const MODULE_META: Record<string, { icon: string; name: string; desc: string; badgeLabel: string; badgeColor: string; badgeBg: string; path: string }> = {
  assets:     { icon: '💰', name: '자산 관리',    desc: '부동산·주식·현금 포트폴리오', badgeLabel: '월간 리포트', badgeColor: '#854F0B', badgeBg: '#FAEEDA', path: '/my-ai/assets' },
  budget:     { icon: '📊', name: '가계부',         desc: '수입·지출 분석 및 예산 관리',  badgeLabel: '월간 리포트', badgeColor: '#854F0B', badgeBg: '#FAEEDA', path: '/my-ai/budget' },
  news:       { icon: '📰', name: '뉴스 브리핑',  desc: '관심 키워드 뉴스 요약',       badgeLabel: '매일 리포트', badgeColor: '#185FA5', badgeBg: '#E6F1FB', path: '/my-ai/news' },
  realestate: { icon: '🏠', name: '부동산',        desc: '관심 매물 시세 변동 추적',    badgeLabel: '주간 리포트', badgeColor: '#0F6E56', badgeBg: '#E1F5EE', path: '/my-ai/realestate' },
  parenting:  { icon: '👶', name: '육아',          desc: '성장 기록·발달 단계 분석',    badgeLabel: '주간 리포트', badgeColor: '#0F6E56', badgeBg: '#E1F5EE', path: '/my-ai/parenting' },
  portfolio:  { icon: '📈', name: '투자',          desc: '주식·ETF 포트폴리오 추적',    badgeLabel: '주간 분석',  badgeColor: '#0F6E56', badgeBg: '#E1F5EE', path: '/my-ai/portfolio' },
  health:     { icon: '🏋️', name: '건강',         desc: '체중·수면·운동 기록',        badgeLabel: '주간 리포트', badgeColor: '#0F6E56', badgeBg: '#E1F5EE', path: '/my-ai/health' },
  career:     { icon: '💼', name: '커리어',         desc: '목표·스킬·성과 관리',        badgeLabel: '월간 리포트', badgeColor: '#534AB7', badgeBg: '#EEEDFE', path: '/my-ai/career' },
  learning:   { icon: '📚', name: '학습',          desc: '과목별 학습 시간 기록',       badgeLabel: '주간 리포트', badgeColor: '#185FA5', badgeBg: '#E6F1FB', path: '/my-ai/learning' },
};

const MODULE_DOT: Record<string, string> = {
  assets: '#854F0B', budget: '#854F0B', news: '#185FA5', realestate: '#0F6E56',
  parenting: '#0F6E56', portfolio: '#0F6E56', health: '#0F6E56', career: '#534AB7', learning: '#185FA5',
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function formatAmount(n: number) {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString()}만`;
  return `${n.toLocaleString()}원`;
}

export default function MyAiHomePage() {
  const router = useRouter();
  const supabase = createClient();

  const [userName, setUserName] = useState('');
  const [activeModules, setActiveModules] = useState<string[]>([]);
  const [reports, setReports] = useState<AiReport[]>([]);
  const [reportTotal, setReportTotal] = useState(0);
  const [netAssets, setNetAssets] = useState<number | null>(null);
  const [monthExpense, setMonthExpense] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    async function init() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { router.push('/auth'); return; }
      setUserName(userData.user.user_metadata?.name || userData.user.email?.split('@')[0] || '');

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const [modRes, rptRes, assetRes, budgetRes] = await Promise.allSettled([
        getMyAiModules(),
        getMyAiReports({ limit: 5 }),
        getAssets(),
        getBudget({ year, month }),
      ]);

      if (modRes.status === 'fulfilled') {
        const mods: any[] = modRes.value?.data ?? [];
        setActiveModules(mods.filter((m: any) => m.is_active).map((m: any) => m.module_key));
      }

      if (rptRes.status === 'fulfilled') {
        setReports(rptRes.value?.data ?? []);
        setReportTotal(rptRes.value?.total ?? 0);
      }

      if (assetRes.status === 'fulfilled') {
        const assets: any[] = assetRes.value?.data ?? [];
        const total = assets.reduce((s: number, a: any) => {
          const v = Number(a.amount) || 0;
          return a.asset_type === 'debt' ? s - v : s + v;
        }, 0);
        setNetAssets(total);
      }

      if (budgetRes.status === 'fulfilled') {
        setMonthExpense(budgetRes.value?.summary?.expense ?? null);
      }

      setLoading(false);
    }
    init();
  }, []);

  async function handleGenerate() {
    if (activeModules.length === 0) return;
    setGenerating(true);
    try {
      await generateMyAiReport(activeModules[0] as ModuleKey);
      const res = await getMyAiReports({ limit: 5 });
      setReports(res?.data ?? []);
      setReportTotal(res?.total ?? 0);
    } catch (e: any) {
      alert('리포트 생성 실패: ' + e.message);
    } finally {
      setGenerating(false);
    }
  }

  const moduleCards = activeModules.filter(k => MODULE_META[k]);

  return (
    <div>
      {/* 웰컴 배너 */}
      <div style={s.welcomeBanner}>
        <div style={s.welcomeLeft}>
          <div style={s.welcomeTitle}>
            {userName ? `${userName}님, ` : ''}오늘도 AI 리포트가 준비됐어요 ✦
          </div>
          <div style={s.welcomeSub}>
            활성 모듈 {activeModules.length}개
            {reports.length > 0 && ` · 최근 리포트 ${timeAgo(reports[0].generated_at)}`}
          </div>
        </div>
        <button
          style={{ ...s.generateBtn, opacity: generating || activeModules.length === 0 ? 0.6 : 1 }}
          onClick={handleGenerate}
          disabled={generating || activeModules.length === 0}
        >
          {generating ? '생성 중...' : '+ 리포트 생성'}
        </button>
      </div>

      {/* 요약 통계 */}
      <div style={s.statRow}>
        <div style={s.statCard}>
          <div style={s.statLabel}>총 순자산</div>
          <div style={s.statValue}>{loading ? '—' : netAssets !== null ? formatAmount(netAssets) : '—'}</div>
          <div style={{ ...s.statChange, color: '#9490C0' }}>자산 기준</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statLabel}>이번달 지출</div>
          <div style={s.statValue}>{loading ? '—' : monthExpense !== null ? formatAmount(monthExpense) : '—'}</div>
          <div style={{ ...s.statChange, color: '#9490C0' }}>가계부 기준</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statLabel}>생성된 리포트</div>
          <div style={s.statValue}>{loading ? '—' : `${reportTotal}개`}</div>
          <div style={{ ...s.statChange, color: '#9490C0' }}>누계</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statLabel}>활성 모듈</div>
          <div style={s.statValue}>{loading ? '—' : `${activeModules.length}개`}</div>
          <div style={{ ...s.statChange, color: '#9490C0' }}>
            {moduleCards.slice(0, 2).map(k => MODULE_META[k]?.name).join(', ') || '—'}
          </div>
        </div>
      </div>

      {/* 활성 모듈 */}
      <div style={s.sectionHeader}>
        <div style={s.sectionTitle}>활성 모듈</div>
        <div style={s.seeAll} onClick={() => router.push('/my-ai/setup')}>모두 관리 →</div>
      </div>

      <div style={s.moduleGrid}>
        {moduleCards.map(key => {
          const mod = MODULE_META[key];
          return (
            <div key={key} style={s.moduleCard} onClick={() => router.push(mod.path)}>
              <div style={s.moduleIcon}>{mod.icon}</div>
              <div style={s.moduleName}>{mod.name}</div>
              <div style={s.moduleDesc}>{mod.desc}</div>
              <div style={{ ...s.moduleBadge, color: mod.badgeColor, background: mod.badgeBg }}>
                {mod.badgeLabel}
              </div>
            </div>
          );
        })}
        {moduleCards.length === 0 && !loading && (
          <div style={s.emptyModules}>활성화된 모듈이 없습니다. 설정에서 모듈을 추가하세요.</div>
        )}
        <div style={{ ...s.moduleCard, ...s.moduleCardAdd }} onClick={() => router.push('/my-ai/setup')}>
          <div style={s.addIcon}>+</div>
          <div style={s.moduleName}>모듈 추가</div>
          <div style={s.moduleDesc}>새 모듈을 활성화하세요</div>
        </div>
      </div>

      <div style={s.divider} />

      {/* 최근 리포트 */}
      <div style={s.sectionHeader}>
        <div style={s.sectionTitle}>최근 AI 리포트</div>
        <div style={s.seeAll} onClick={() => router.push('/my-ai/reports')}>전체 보기 →</div>
      </div>

      <div style={s.reportList}>
        {loading && <div style={s.loadingText}>불러오는 중...</div>}
        {!loading && reports.length === 0 && (
          <div style={s.emptyReports}>
            <div style={s.emptyIcon}>📋</div>
            <div style={s.emptyText}>아직 생성된 리포트가 없습니다.</div>
          </div>
        )}
        {reports.map(r => {
          const dot = MODULE_DOT[r.module_key] ?? '#9490C0';
          const modName = MODULE_META[r.module_key]?.name ?? r.module_key;
          const typeLabel = r.report_type === 'daily' ? '매일' : r.report_type === 'weekly' ? '주간' : '월간';
          return (
            <div key={r.id} style={s.reportItem} onClick={() => router.push('/my-ai/reports')}>
              <div style={{ ...s.reportDot, background: dot }} />
              <div style={s.reportMeta}>
                <div style={s.reportTitle}>{r.title}</div>
                <div style={s.reportSub}>{modName} · {typeLabel}</div>
              </div>
              <div style={s.reportTime}>{timeAgo(r.generated_at)}</div>
              <div style={s.reportArrow}>›</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  welcomeBanner: {
    background: 'linear-gradient(135deg, #534AB7, #7C6FD8)',
    borderRadius: 16,
    padding: '22px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  welcomeLeft: {},
  welcomeTitle: { fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 4 },
  welcomeSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  generateBtn: {
    fontSize: 13, fontWeight: 500, padding: '9px 18px', borderRadius: 10,
    border: 'none', background: 'rgba(255,255,255,0.2)', color: '#fff',
    cursor: 'pointer', backdropFilter: 'blur(4px)',
  },

  statRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 },
  statCard: {
    background: '#fff', borderRadius: 12, padding: '16px',
    border: '1px solid rgba(83,74,183,0.08)', boxShadow: '0 1px 6px rgba(83,74,183,0.05)',
  },
  statLabel: { fontSize: 11, color: '#9490C0', marginBottom: 6 },
  statValue: { fontSize: 18, fontWeight: 600, color: '#1A1830', marginBottom: 4 },
  statChange: { fontSize: 11 },

  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: '#4A4870' },
  seeAll: { fontSize: 12, color: '#534AB7', cursor: 'pointer' },

  moduleGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 28 },
  moduleCard: {
    background: '#fff', border: '1px solid rgba(83,74,183,0.1)', borderRadius: 14,
    padding: '16px 14px', cursor: 'pointer', transition: 'all 0.15s',
    boxShadow: '0 1px 6px rgba(83,74,183,0.04)',
  },
  moduleCardAdd: {
    border: '1.5px dashed rgba(83,74,183,0.25)', background: 'transparent',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', textAlign: 'center' as const, minHeight: 110,
  },
  moduleIcon: { fontSize: 22, marginBottom: 8 },
  addIcon: { fontSize: 24, color: '#534AB7', marginBottom: 8 },
  moduleName: { fontSize: 13, fontWeight: 600, color: '#1A1830', marginBottom: 3 },
  moduleDesc: { fontSize: 11, color: '#9490C0', lineHeight: 1.4, marginBottom: 8 },
  moduleBadge: { display: 'inline-block', fontSize: 10, padding: '2px 7px', borderRadius: 6, fontWeight: 500 },
  emptyModules: { fontSize: 12, color: '#9490C0', padding: '20px 0', gridColumn: '1 / -1' },

  divider: { height: 1, background: 'rgba(83,74,183,0.08)', marginBottom: 24 },

  reportList: { display: 'flex', flexDirection: 'column', gap: 8 },
  reportItem: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px',
    background: '#fff', border: '1px solid rgba(83,74,183,0.08)', borderRadius: 12,
    cursor: 'pointer', transition: 'all 0.15s', boxShadow: '0 1px 4px rgba(83,74,183,0.04)',
  },
  reportDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  reportMeta: { flex: 1 },
  reportTitle: { fontSize: 13, fontWeight: 500, color: '#1A1830', marginBottom: 2 },
  reportSub: { fontSize: 11, color: '#9490C0' },
  reportTime: { fontSize: 11, color: '#9490C0' },
  reportArrow: { fontSize: 14, color: '#9490C0' },
  loadingText: { fontSize: 13, color: '#9490C0', textAlign: 'center' as const, padding: '20px 0' },
  emptyReports: { textAlign: 'center' as const, padding: '32px 0' },
  emptyIcon: { fontSize: 28, marginBottom: 8 },
  emptyText: { fontSize: 12, color: '#9490C0' },
};
