'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getMyAiModules, updateMyAiModule, ModuleKey } from '@/lib/api';

// ─── 상수 ───────────────────────────────────────────────────────────────────

const MODULES = [
  { key: 'assets',     icon: '💰', name: '자산 관리',   desc: '부동산·주식·현금 포트폴리오 분석', freq: '월간',   freqColor: '#854F0B', freqBg: '#FAEEDA', path: '/my-ai/assets' },
  { key: 'budget',     icon: '📊', name: '가계부',       desc: '수입·지출 소비 패턴 분석',          freq: '월간',   freqColor: '#854F0B', freqBg: '#FAEEDA', path: '/my-ai/budget' },
  { key: 'realestate', icon: '🏠', name: '부동산',       desc: '관심 매물 시세 변동 추적',           freq: '주간',   freqColor: '#0F6E56', freqBg: '#E1F5EE', path: '/my-ai/realestate' },
  { key: 'news',       icon: '📰', name: '뉴스 브리핑', desc: '관심 키워드 맞춤 뉴스 요약',         freq: '매일',   freqColor: '#185FA5', freqBg: '#E6F1FB', path: '/my-ai/news' },
  { key: 'parenting',  icon: '👶', name: '육아',         desc: '성장 기록·발달 단계 분석',           freq: '주간',   freqColor: '#0F6E56', freqBg: '#E1F5EE', path: '/my-ai/parenting' },
  { key: 'portfolio',  icon: '📈', name: '투자',         desc: '주식·ETF 수익률·리밸런싱',           freq: '주간',   freqColor: '#0F6E56', freqBg: '#E1F5EE', path: null },
  { key: 'health',     icon: '🏋️', name: '건강',        desc: '체중·운동·수면 트렌드 분석',         freq: '주간',   freqColor: '#0F6E56', freqBg: '#E1F5EE', path: null },
  { key: 'career',     icon: '💼', name: '커리어',       desc: '연봉·스킬·목표 성장 분석',           freq: '월간',   freqColor: '#854F0B', freqBg: '#FAEEDA', path: null },
  { key: 'learning',   icon: '📚', name: '학습',         desc: '공부 목표·진도 추적 분석',           freq: '주간',   freqColor: '#0F6E56', freqBg: '#E1F5EE', path: null },
] as const;

const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
const STEPS = ['기본 정보', '모듈 선택', '스케줄 설정', '알림 설정', '완료'];

type ModuleSchedule = { news_freq: 'daily' | 'weekday'; news_hour: string; asset_day: 'first' | 'last'; asset_hour: string; weekly_hour: string };
type Notifications  = { email: boolean; browser: boolean; slack: boolean };

const DEFAULT_SCHEDULE: ModuleSchedule = { news_freq: 'daily', news_hour: '06:00', asset_day: 'first', asset_hour: '08:00', weekly_hour: '08:00' };
const DEFAULT_NOTIF:    Notifications  = { email: true,  browser: true, slack: false };

// ─── 컴포넌트 ────────────────────────────────────────────────────────────────

export default function SetupPage() {
  const router  = useRouter();
  const supabase = createClient();

  const [step, setStep]             = useState(1);
  const [userName, setUserName]     = useState('');
  const [userEmail, setUserEmail]   = useState('');
  const [displayName, setDisplayName] = useState('');

  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [schedule, setSchedule]     = useState<ModuleSchedule>(DEFAULT_SCHEDULE);
  const [notifications, setNotifications] = useState<Notifications>(DEFAULT_NOTIF);

  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  // 초기 로드: 사용자 정보 + 기존 모듈 설정
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/auth'); return; }
        const name = user.user_metadata?.name || user.email?.split('@')[0] || '';
        setUserName(name);
        setDisplayName(name);
        setUserEmail(user.email ?? '');

        // 기존 활성 모듈 로드
        const res = await getMyAiModules();
        const active = new Set<string>(
          (res.data ?? []).filter((m: any) => m.is_active).map((m: any) => m.module_key)
        );
        // 기존 설정이 없으면 기본값 세팅
        if (active.size === 0) active.add('assets').add('news');
        setSelected(active);

        // 기존 스케줄 설정 로드 (news 모듈 config에서)
        const newsModule = (res.data ?? []).find((m: any) => m.module_key === 'news');
        if (newsModule?.schedule) {
          setSchedule(prev => ({ ...prev, ...newsModule.schedule }));
        }

        // 알림 설정 로드 (localStorage)
        try {
          const saved = localStorage.getItem('my-ai-notifications');
          if (saved) setNotifications(JSON.parse(saved));
        } catch {}
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  function toggleModule(key: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // 다음 스텝 진행 (스텝별 저장 로직)
  async function handleNext() {
    setError('');

    if (step === 1) {
      // 기본 정보: 이름 저장 (Supabase user_metadata)
      if (displayName.trim()) {
        await supabase.auth.updateUser({ data: { name: displayName.trim() } });
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (selected.size === 0) { setError('최소 1개 이상의 모듈을 선택해주세요.'); return; }
      setStep(3);
      return;
    }

    if (step === 3) {
      setStep(4);
      return;
    }

    if (step === 4) {
      // 알림 설정 저장 (localStorage)
      localStorage.setItem('my-ai-notifications', JSON.stringify(notifications));
      setStep(5);
      return;
    }

    if (step === 5) {
      // 최종 저장: 모든 모듈 활성화 상태 + 스케줄 저장
      setSaving(true);
      try {
        await Promise.all(
          MODULES.map(mod =>
            updateMyAiModule(mod.key as ModuleKey, {
              is_active: selected.has(mod.key),
              schedule: getScheduleForModule(mod.key),
            })
          )
        );
        router.push('/my-ai');
      } catch (e: any) {
        setError(e.message);
      } finally {
        setSaving(false);
      }
    }
  }

  function getScheduleForModule(key: string): Record<string, any> {
    if (key === 'news')     return { freq: schedule.news_freq,  hour: schedule.news_hour };
    if (key === 'assets' || key === 'budget' || key === 'career')
                             return { day: schedule.asset_day,   hour: schedule.asset_hour };
    return { hour: schedule.weekly_hour };
  }

  if (loading) return <div style={s.center}>불러오는 중...</div>;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.title}>나만의 AI 대시보드 설정</div>
        <div style={s.sub}>원하는 모듈을 선택하고 리포트 스케줄을 설정하세요</div>
      </div>

      {/* 스텝 바 */}
      <div style={s.stepRow}>
        {STEPS.map((label, i) => {
          const num = i + 1;
          const state = num < step ? 'done' : num === step ? 'active' : 'todo';
          return (
            <div key={i} style={s.stepGroup}>
              <div style={s.step}>
                <div style={{ ...s.stepNum, ...(state === 'todo' ? s.stepNumTodo : s.stepNumActive) }}>
                  {state === 'done' ? '✓' : num}
                </div>
                <span style={{ ...s.stepLabel, color: state === 'active' ? '#1A1830' : state === 'done' ? '#9490C0' : '#C0BDDB' }}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && <div style={s.stepArrow}>›</div>}
            </div>
          );
        })}
      </div>

      {/* ── Step 1: 기본 정보 ─────────────────────────────── */}
      {step === 1 && (
        <div style={s.stepContent}>
          <div style={s.sectionTitle}>기본 정보를 확인해주세요</div>
          <div style={s.card}>
            <div style={s.field}>
              <label style={s.label}>이름 / 닉네임</label>
              <input
                style={s.input}
                placeholder="표시될 이름을 입력하세요"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                autoFocus
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>이메일</label>
              <input style={{ ...s.input, ...s.inputDisabled }} value={userEmail} readOnly />
              <div style={s.hint}>Supabase 계정 이메일 — 변경 불가</div>
            </div>
          </div>
          <div style={s.infoBox}>
            <span style={s.infoIcon}>✦</span>
            나만의 AI는 입력한 데이터를 기반으로 개인 맞춤 리포트를 자동 생성합니다.<br />
            데이터는 본인 계정에만 저장되며 외부에 공유되지 않습니다.
          </div>
        </div>
      )}

      {/* ── Step 2: 모듈 선택 ─────────────────────────────── */}
      {step === 2 && (
        <div style={s.stepContent}>
          <div style={s.sectionTitle}>관심 있는 모듈을 선택하세요 (복수 선택 가능)</div>
          <div style={s.moduleGrid}>
            {MODULES.map(mod => {
              const isOn = selected.has(mod.key);
              return (
                <div
                  key={mod.key}
                  style={{ ...s.modCard, ...(isOn ? s.modCardOn : {}) }}
                  onClick={() => toggleModule(mod.key)}
                >
                  {isOn && <div style={s.checkMark}>✓</div>}
                  <div style={s.modIcon}>{mod.icon}</div>
                  <div style={{ ...s.modName, color: isOn ? '#3C3489' : '#1A1830' }}>{mod.name}</div>
                  <div style={{ ...s.modDesc, color: isOn ? '#534AB7' : '#9490C0' }}>{mod.desc}</div>
                  <div style={{ ...s.modFreq, color: mod.freqColor, background: mod.freqBg }}>{mod.freq}</div>
                </div>
              );
            })}
          </div>
          <div style={s.hint}>{selected.size}개 모듈 선택됨</div>
        </div>
      )}

      {/* ── Step 3: 스케줄 설정 ───────────────────────────── */}
      {step === 3 && (
        <div style={s.stepContent}>
          <div style={s.sectionTitle}>리포트 자동 생성 스케줄을 설정하세요</div>
          <div style={s.scheduleGrid}>

            {/* 뉴스 브리핑 */}
            {selected.has('news') && (
              <div style={s.scheduleCard}>
                <div style={s.scheduleModLabel}>📰 뉴스 브리핑</div>
                <div style={s.scheduleName}>생성 주기</div>
                <div style={s.freqBtnRow}>
                  {([['daily', '매일'], ['weekday', '평일만']] as const).map(([v, label]) => (
                    <button
                      key={v}
                      style={{ ...s.freqBtn, ...(schedule.news_freq === v ? s.freqBtnActive : {}) }}
                      onClick={() => setSchedule(p => ({ ...p, news_freq: v }))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div style={s.timeRow}>
                  <span style={s.timeLabel}>발송 시간</span>
                  <select
                    style={s.timeSelect}
                    value={schedule.news_hour}
                    onChange={e => setSchedule(p => ({ ...p, news_hour: e.target.value }))}
                  >
                    {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* 자산·가계부·커리어 (월간) */}
            {(selected.has('assets') || selected.has('budget') || selected.has('career')) && (
              <div style={s.scheduleCard}>
                <div style={s.scheduleModLabel}>
                  {[selected.has('assets') && '💰', selected.has('budget') && '📊', selected.has('career') && '💼'].filter(Boolean).join(' ')}
                  {' '}월간 모듈
                </div>
                <div style={s.scheduleName}>월간 리포트 생성일</div>
                <div style={s.freqBtnRow}>
                  {([['first', '매월 1일'], ['last', '말일']] as const).map(([v, label]) => (
                    <button
                      key={v}
                      style={{ ...s.freqBtn, ...(schedule.asset_day === v ? s.freqBtnActive : {}) }}
                      onClick={() => setSchedule(p => ({ ...p, asset_day: v }))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div style={s.timeRow}>
                  <span style={s.timeLabel}>발송 시간</span>
                  <select
                    style={s.timeSelect}
                    value={schedule.asset_hour}
                    onChange={e => setSchedule(p => ({ ...p, asset_hour: e.target.value }))}
                  >
                    {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* 주간 모듈 */}
            {(['realestate', 'portfolio', 'parenting', 'health', 'learning'] as const).some(k => selected.has(k)) && (
              <div style={s.scheduleCard}>
                <div style={s.scheduleModLabel}>
                  {(['realestate', 'portfolio', 'parenting', 'health', 'learning'] as const)
                    .filter(k => selected.has(k))
                    .map(k => MODULES.find(m => m.key === k)?.icon)
                    .join(' ')}
                  {' '}주간 모듈
                </div>
                <div style={s.scheduleName}>주간 리포트 생성일</div>
                <div style={{ ...s.hint, marginBottom: 8 }}>매주 월요일 자동 생성</div>
                <div style={s.timeRow}>
                  <span style={s.timeLabel}>발송 시간</span>
                  <select
                    style={s.timeSelect}
                    value={schedule.weekly_hour}
                    onChange={e => setSchedule(p => ({ ...p, weekly_hour: e.target.value }))}
                  >
                    {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div style={s.infoBox}>
            <span style={s.infoIcon}>ℹ</span>
            스케줄은 나중에 각 모듈 페이지의 ⚙ 설정에서 언제든지 변경할 수 있습니다.
          </div>
        </div>
      )}

      {/* ── Step 4: 알림 설정 ─────────────────────────────── */}
      {step === 4 && (
        <div style={s.stepContent}>
          <div style={s.sectionTitle}>알림 설정</div>
          <div style={s.notifCard}>
            {([
              { key: 'email'   as const, icon: '✉', title: '이메일 알림',   sub: '리포트 생성 시 이메일 발송' },
              { key: 'browser' as const, icon: '🔔', title: '브라우저 알림', sub: '대시보드 접속 시 새 리포트 알림' },
              { key: 'slack'   as const, icon: '💬', title: 'Slack 연동',    sub: '채널에 리포트 요약 자동 전송' },
            ]).map(item => (
              <div key={item.key} style={s.notifRow}>
                <div style={s.notifLeft}>
                  <div style={s.notifIcon}>{item.icon}</div>
                  <div>
                    <div style={s.notifTitle}>{item.title}</div>
                    <div style={s.notifSub}>{item.sub}</div>
                  </div>
                </div>
                <div
                  style={{ ...s.toggleWrap, ...(notifications[item.key] ? s.toggleOn : s.toggleOff) }}
                  onClick={() => setNotifications(p => ({ ...p, [item.key]: !p[item.key] }))}
                >
                  <div style={{ ...s.toggleKnob, ...(notifications[item.key] ? s.toggleKnobOn : s.toggleKnobOff) }} />
                </div>
              </div>
            ))}
          </div>
          <div style={s.infoBox}>
            <span style={s.infoIcon}>ℹ</span>
            Slack 연동은 현재 개발 중입니다. 이메일·브라우저 알림은 즉시 사용 가능합니다.
          </div>
        </div>
      )}

      {/* ── Step 5: 완료 ──────────────────────────────────── */}
      {step === 5 && (
        <div style={s.stepContent}>
          <div style={s.doneWrap}>
            <div style={s.doneIcon}>✦</div>
            <div style={s.doneTitle}>설정이 완료됐습니다!</div>
            <div style={s.doneSub}>
              {selected.size}개 모듈이 활성화되었습니다.<br />
              대시보드에서 각 모듈에 데이터를 입력하고 AI 리포트를 생성해보세요.
            </div>
            {/* 활성 모듈 요약 */}
            <div style={s.activeSummary}>
              {MODULES.filter(m => selected.has(m.key)).map(m => (
                <div key={m.key} style={s.activeMod}>
                  <span style={s.activeModIcon}>{m.icon}</span>
                  <span style={s.activeModName}>{m.name}</span>
                  <span style={{ ...s.modFreq, color: m.freqColor, background: m.freqBg }}>{m.freq}</span>
                  {m.path && (
                    <span style={s.activeModLink} onClick={() => router.push(m.path!)}>바로가기 ›</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 에러 */}
      {error && <div style={s.errBox}>{error}</div>}

      {/* 하단 버튼 */}
      <div style={s.bottomBar}>
        <button
          style={s.btnSecondary}
          onClick={() => step > 1 ? setStep(s => s - 1) : router.push('/my-ai')}
        >
          {step === 1 ? '← 취소' : '← 이전'}
        </button>
        <button
          style={{ ...s.btnPrimary, opacity: saving ? 0.7 : 1 }}
          onClick={handleNext}
          disabled={saving}
        >
          {saving ? '저장 중...' : step < STEPS.length ? `다음 →` : '저장하고 시작하기 →'}
        </button>
      </div>
    </div>
  );
}

// ─── 스타일 ──────────────────────────────────────────────────────────────────

const P = '#534AB7';

const s: Record<string, React.CSSProperties> = {
  center:    { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#9490C0', fontSize: 14 },
  wrap:      { maxWidth: 760, margin: '0 auto' },
  header:    { marginBottom: 24 },
  title:     { fontSize: 18, fontWeight: 600, color: '#1A1830', marginBottom: 4 },
  sub:       { fontSize: 13, color: '#9490C0' },

  stepRow:   { display: 'flex', alignItems: 'center', gap: 0, marginBottom: 32, flexWrap: 'wrap' as const, rowGap: 8 },
  stepGroup: { display: 'flex', alignItems: 'center', gap: 4 },
  step:      { display: 'flex', alignItems: 'center', gap: 6 },
  stepNum:   { width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 },
  stepNumActive: { background: P, color: '#fff' },
  stepNumTodo:   { background: '#E8E6F8', color: '#9490C0' },
  stepLabel: { fontSize: 12 },
  stepArrow: { fontSize: 14, color: '#C0BDDB', margin: '0 4px' },

  stepContent: { marginBottom: 28 },
  sectionTitle:{ fontSize: 13, fontWeight: 600, color: '#4A4870', marginBottom: 14 },
  card:        { background: '#fff', border: '1px solid rgba(83,74,183,0.08)', borderRadius: 14, padding: '20px', marginBottom: 14 },
  field:       { marginBottom: 14 },
  label:       { display: 'block', fontSize: 12, color: '#4A4870', marginBottom: 6, fontWeight: 500 },
  input:       { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(83,74,183,0.2)', fontSize: 13, color: '#1A1830', outline: 'none', boxSizing: 'border-box' as const, background: '#FAFAFE' },
  inputDisabled: { background: '#F4F3FF', color: '#9490C0', cursor: 'not-allowed' },
  hint:        { fontSize: 11, color: '#9490C0', marginTop: 4 },
  infoBox:     { background: '#F4F3FF', border: '1px solid rgba(83,74,183,0.12)', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: '#4A4870', lineHeight: 1.7, display: 'flex', gap: 8, alignItems: 'flex-start' },
  infoIcon:    { color: P, fontSize: 14, flexShrink: 0, marginTop: 1 },

  moduleGrid:  { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 10 },
  modCard:     { border: '1px solid rgba(83,74,183,0.12)', borderRadius: 14, padding: '14px 12px', cursor: 'pointer', position: 'relative' as const, background: '#fff', transition: 'all 0.15s' },
  modCardOn:   { border: `1.5px solid ${P}`, background: '#EEEDFE' },
  checkMark:   { position: 'absolute' as const, top: 10, right: 10, width: 18, height: 18, borderRadius: '50%', background: P, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 },
  modIcon:     { fontSize: 22, marginBottom: 8 },
  modName:     { fontSize: 13, fontWeight: 600, marginBottom: 3 },
  modDesc:     { fontSize: 11, lineHeight: 1.4 },
  modFreq:     { fontSize: 10, padding: '2px 7px', borderRadius: 5, marginTop: 7, display: 'inline-block', fontWeight: 500 },

  scheduleGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 12, marginBottom: 14 },
  scheduleCard: { border: '1px solid rgba(83,74,183,0.1)', borderRadius: 12, padding: '16px', background: '#fff' },
  scheduleModLabel: { fontSize: 12, color: '#9490C0', marginBottom: 6 },
  scheduleName: { fontSize: 13, fontWeight: 600, color: '#1A1830', marginBottom: 10 },
  freqBtnRow:  { display: 'flex', gap: 6, marginBottom: 10 },
  freqBtn:     { fontSize: 11, padding: '5px 12px', border: '1px solid rgba(83,74,183,0.2)', borderRadius: 20, cursor: 'pointer', color: '#4A4870', background: 'transparent' },
  freqBtnActive:{ background: P, color: '#fff', borderColor: P },
  timeRow:     { display: 'flex', alignItems: 'center', gap: 8 },
  timeLabel:   { fontSize: 12, color: '#4A4870', flexShrink: 0 },
  timeSelect:  { padding: '4px 8px', border: '1px solid rgba(83,74,183,0.2)', borderRadius: 8, fontSize: 12, color: '#1A1830', background: '#fff' },

  notifCard:   { border: '1px solid rgba(83,74,183,0.1)', borderRadius: 14, padding: '4px 16px', background: '#fff', marginBottom: 14 },
  notifRow:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid rgba(83,74,183,0.07)' },
  notifLeft:   { display: 'flex', alignItems: 'center', gap: 10 },
  notifIcon:   { fontSize: 18, width: 28, textAlign: 'center' as const },
  notifTitle:  { fontSize: 13, fontWeight: 500, color: '#1A1830' },
  notifSub:    { fontSize: 11, color: '#9490C0', marginTop: 2 },
  toggleWrap:  { width: 38, height: 22, borderRadius: 11, position: 'relative' as const, cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s' },
  toggleOn:    { background: P },
  toggleOff:   { background: '#E8E6F8', border: '1px solid rgba(83,74,183,0.15)' },
  toggleKnob:  { width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute' as const, top: 3, transition: 'all 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' },
  toggleKnobOn: { right: 3 },
  toggleKnobOff:{ left: 3, background: '#9490C0' },

  doneWrap:    { textAlign: 'center' as const, padding: '20px 0 32px' },
  doneIcon:    { fontSize: 44, color: P, marginBottom: 14 },
  doneTitle:   { fontSize: 20, fontWeight: 700, color: '#1A1830', marginBottom: 8 },
  doneSub:     { fontSize: 13, color: '#4A4870', lineHeight: 1.8, marginBottom: 24 },
  activeSummary:{ display: 'flex', flexDirection: 'column' as const, gap: 0, border: '1px solid rgba(83,74,183,0.08)', borderRadius: 12, background: '#fff', overflow: 'hidden', maxWidth: 420, margin: '0 auto' },
  activeMod:   { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: '1px solid rgba(83,74,183,0.06)' },
  activeModIcon:{ fontSize: 16 },
  activeModName:{ flex: 1, fontSize: 13, fontWeight: 500, color: '#1A1830' },
  activeModLink:{ fontSize: 11, color: P, cursor: 'pointer', flexShrink: 0 },

  errBox:      { fontSize: 12, color: '#E53E3E', background: '#FEE8E8', padding: '10px 14px', borderRadius: 8, marginBottom: 14 },
  bottomBar:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 20, borderTop: '1px solid rgba(83,74,183,0.1)' },
  btnSecondary:{ fontSize: 13, padding: '9px 20px', border: '1px solid rgba(83,74,183,0.2)', borderRadius: 10, background: 'transparent', color: '#4A4870', cursor: 'pointer' },
  btnPrimary:  { fontSize: 13, fontWeight: 500, padding: '9px 22px', border: 'none', borderRadius: 10, background: P, color: '#fff', cursor: 'pointer' },
};
