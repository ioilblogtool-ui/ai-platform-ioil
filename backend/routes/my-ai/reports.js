const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const supabase = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// GET /api/my-ai/reports?module_key=&report_type=&limit=&offset=
router.get('/', requireAuth, async (req, res) => {
  const { module_key, report_type, limit = 20, offset = 0 } = req.query;

  let query = supabase
    .from('ai_reports')
    .select('id, module_key, report_type, title, generated_at', { count: 'exact' })
    .eq('user_id', req.user.id)
    .order('generated_at', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (module_key)  query = query.eq('module_key', module_key);
  if (report_type) query = query.eq('report_type', report_type);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data, total: count });
});

// GET /api/my-ai/reports/:id
router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('ai_reports')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: '리포트를 찾을 수 없습니다.' });
  res.json({ data });
});

// POST /api/my-ai/reports/generate
router.post('/generate', requireAuth, async (req, res) => {
  const { module_key } = req.body;
  if (!module_key) return res.status(400).json({ error: 'module_key는 필수입니다.' });

  let contextData = {};
  let report_type = 'monthly';
  let promptContent = '';
  let systemPrompt  = null;

  try {
    if (module_key === 'assets') {
      report_type = 'monthly';
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm   = String(now.getMonth() + 1).padStart(2, '0');

      // 최근 13개월 스냅샷 (전년 동월 비교용)
      const { data: snapshots } = await supabase
        .from('user_asset_snapshots')
        .select('*')
        .eq('user_id', req.user.id)
        .order('snapshot_date', { ascending: false })
        .limit(13);

      const latest  = snapshots?.[0]  ?? null;
      const prev    = snapshots?.[1]  ?? null;
      const yoySnap = snapshots?.[12] ?? null;
      const first   = snapshots ? [...snapshots].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))[0] : null;

      // CAGR 계산
      let cagr = null;
      if (first && latest && first.snapshot_date !== latest.snapshot_date) {
        const years = (new Date(latest.snapshot_date) - new Date(first.snapshot_date)) / (1000 * 60 * 60 * 24 * 365.25);
        const f = Number(first.net_worth), c = Number(latest.net_worth);
        if (years >= 0.1 && f > 0) cagr = ((Math.pow(c / f, 1 / years) - 1) * 100).toFixed(2);
      }

      const mom = latest && prev
        ? (((Number(latest.net_worth) - Number(prev.net_worth)) / Number(prev.net_worth)) * 100).toFixed(2)
        : null;
      const yoy = latest && yoySnap
        ? (((Number(latest.net_worth) - Number(yoySnap.net_worth)) / Number(yoySnap.net_worth)) * 100).toFixed(2)
        : null;

      // 목표 현황
      const { data: goals } = await supabase
        .from('user_asset_goals')
        .select('*')
        .eq('user_id', req.user.id)
        .order('goal_type').order('target_year');

      const annualGoal    = goals?.find(g => g.goal_type === 'annual'   && g.target_year === yyyy) ?? null;
      const longtermGoals = goals?.filter(g => g.goal_type === 'longterm') ?? [];
      const longtermGoal  = longtermGoals.find(g => !g.is_achieved) ?? null;

      // 개별 자산 항목
      const { data: userAssets } = await supabase
        .from('user_assets')
        .select('asset_type, name, amount, recorded_at')
        .eq('user_id', req.user.id)
        .order('asset_type').order('amount', { ascending: false });

      const annualPct = annualGoal && latest
        ? ((Number(latest.net_worth) / Number(annualGoal.target_amount)) * 100).toFixed(1)
        : null;
      const longtermPct = longtermGoal && latest
        ? ((Number(latest.net_worth) / Number(longtermGoal.target_amount)) * 100).toFixed(1)
        : null;

      // 남은 개월 수 (연간 목표)
      const remainMonths = 12 - now.getMonth();
      const annualRemain = annualGoal && latest
        ? Math.max(0, Number(annualGoal.target_amount) - Number(latest.net_worth))
        : null;
      const monthlyNeeded = annualRemain !== null && remainMonths > 0
        ? Math.round(annualRemain / remainMonths)
        : null;

      // 이번 달 가계부 요약 (자산 리포트 컨텍스트용)
      const budgetFrom = `${yyyy}-${mm}-01`;
      const budgetTo   = new Date(yyyy, parseInt(mm), 0).toISOString().slice(0, 10);
      const { data: budgetRecs } = await supabase
        .from('budget_records')
        .select('record_type, amount')
        .eq('user_id', req.user.id)
        .gte('recorded_at', budgetFrom)
        .lte('recorded_at', budgetTo);
      const budgetIncome  = (budgetRecs || []).filter(r => r.record_type === 'income' ).reduce((s, r) => s + Number(r.amount), 0);
      const budgetExpense = (budgetRecs || []).filter(r => r.record_type === 'expense').reduce((s, r) => s + Number(r.amount), 0);
      const budgetBalance = budgetIncome - budgetExpense;

      // 사용자명
      const { data: userRow } = await supabase
        .from('users').select('email').eq('id', req.user.id).single();
      const userName = userRow?.email?.split('@')[0] ?? '사용자';

      // 최근 6개월 추이 텍스트
      const recentTable = (snapshots?.slice(0, 6) ?? []).map(s => {
        const idx = snapshots.indexOf(s);
        const p   = snapshots[idx + 1];
        const rate = p ? (((Number(s.net_worth) - Number(p.net_worth)) / Number(p.net_worth)) * 100).toFixed(2) + '%' : '-';
        return `${s.snapshot_date} | ₩${Number(s.net_worth).toLocaleString()} | ${rate}`;
      }).join('\n');

      contextData = { snapshots: snapshots?.slice(0, 6), goals, userAssets };

      const systemPrompt = `당신은 15년 경력의 대한민국 자산관리 전문가(PB, Private Banker)입니다.
고액 자산가 대상 포트폴리오 분석 및 재무 컨설팅 경험을 보유하고 있습니다.

[작성 원칙]
1. 전문가적이고 신뢰감 있는 문체를 사용하십시오. (격식체, ~습니다 종결)
2. 수치는 반드시 ₩ 단위 및 천 단위 구분 기호로 표기하고, 증감률은 소수점 둘째 자리까지 표기하십시오.
3. 긍정적 성과는 칭찬하되 과장하지 마십시오. 우려 사항은 완곡하되 명확하게 제시하십시오.
4. 투자 권유가 아닌 '정보 제공' 관점에서 작성하십시오.
5. 한국 경제 상황(금리, 부동산 시장, 증시 흐름)을 맥락으로 참고하십시오.
6. 반드시 아래 Markdown 구조를 그대로 따르십시오. 섹션 헤더를 변경하지 마십시오.
7. 각 섹션의 분석은 단순 수치 나열이 아닌 의미 해석과 실행 가능한 제언을 포함하십시오.`;

      // 개별 자산 항목 텍스트 (유형별 그룹)
      const TYPE_LABELS = {
        real_estate: '부동산', stock: '주식·ETF', cash: '현금·예금', pension: '퇴직금·연금',
        gold: '금·귀금속', crypto: '암호화폐', other: '기타자산',
        loan_mortgage: '담보대출', loan_credit: '신용대출', loan_minus: '마이너스통장', debt: '기타부채',
      };
      const DEBT_TYPES = ['loan_mortgage', 'loan_credit', 'loan_minus', 'debt'];
      const assetsText = (userAssets && userAssets.length > 0)
        ? userAssets.map(a => {
            const m = a.metadata ?? {};
            let line = `  - [${TYPE_LABELS[a.asset_type] || a.asset_type}] ${a.name}: ₩${Number(a.amount).toLocaleString()}`;
            if (a.recorded_at) line += ` (${a.recorded_at})`;
            if (DEBT_TYPES.includes(a.asset_type)) {
              const details = [];
              if (m.interest_rate)    details.push(`금리 ${m.interest_rate}%`);
              if (m.repayment_method) details.push(`${m.repayment_method}상환`);
              if (m.loan_term_years)  details.push(`${m.loan_term_years}년`);
              if (m.start_date)       details.push(`시작 ${m.start_date}`);
              if (details.length)     line += ` [${details.join(', ')}]`;
            }
            return line;
          }).join('\n')
        : '  (등록된 자산 항목 없음)';

      // 장기 목표 전체 텍스트
      const longtermGoalsText = longtermGoals.length > 0
        ? longtermGoals.map(g => {
            const pct = latest ? ((Number(latest.net_worth) / Number(g.target_amount)) * 100).toFixed(1) : '?';
            const status = g.is_achieved ? '[달성]' : `[진행중 ${pct}%]`;
            return `  - ${status} ${g.name}: ₩${Number(g.target_amount).toLocaleString()} / ${g.target_year}년${g.description ? `\n    상세: ${g.description}` : ''}`;
          }).join('\n')
        : '  미설정';

      promptContent = `[리포트 기준 정보]
기준월: ${yyyy}년 ${parseInt(mm)}월
사용자: ${userName}님
기록 기간: ${first?.snapshot_date ?? '-'} ~ ${latest?.snapshot_date ?? '-'} (${snapshots?.length ?? 0}개월)

[이번 달 자산 현황 — 스냅샷 집계]
- 총 순자산:  ₩${Number(latest?.net_worth ?? 0).toLocaleString()}
- 총 자산:    ₩${Number(latest?.total_assets ?? 0).toLocaleString()}
- 총 부채:    ₩${Number(latest?.total_debt ?? 0).toLocaleString()}
- 주식/투자:  ₩${Number(latest?.stock ?? 0).toLocaleString()}
- 부동산:     ₩${Number(latest?.real_estate ?? 0).toLocaleString()}
- 현금:       ₩${Number(latest?.cash ?? 0).toLocaleString()}
- 퇴직금:     ₩${Number(latest?.pension ?? 0).toLocaleString()}
- 금:         ₩${Number(latest?.gold ?? 0).toLocaleString()}
- 암호화폐:   ₩${Number(latest?.crypto ?? 0).toLocaleString()}
- 담보대출:   ₩${Number(latest?.loan_mortgage ?? 0).toLocaleString()}
- 신용대출:   ₩${Number(latest?.loan_credit ?? 0).toLocaleString()}
- 마이너스통장: ₩${Number(latest?.loan_minus ?? 0).toLocaleString()}
- 기타:       ₩${Number(latest?.other ?? 0).toLocaleString()}
- 비고:       ${latest?.note ?? '-'}

[개별 자산 항목 (user_assets)]
${assetsText}

[주요 통계]
- 전월 대비:     ${mom !== null ? mom + '%' : '데이터 없음'}
- 전년 동월 대비: ${yoy !== null ? yoy + '%' : '데이터 없음'}
- 연 평균 성장률(CAGR): ${cagr !== null ? cagr + '%' : '데이터 부족'}

[목표 현황]
■ 연간 목표 (${yyyy}년):
${annualGoal
  ? `  ${annualGoal.name}: ₩${Number(annualGoal.target_amount).toLocaleString()} (달성률 ${annualPct}%, 잔여 ₩${annualRemain?.toLocaleString()}, 이후 월 ₩${monthlyNeeded?.toLocaleString()} 필요)${annualGoal.description ? `\n  상세: ${annualGoal.description}` : ''}`
  : '  미설정'}

■ 장기 목표:
${longtermGoalsText}

[이번 달 가계부 현황 — 현금흐름 참고]
- 이달 수입:    ₩${budgetIncome.toLocaleString()}${budgetIncome === 0 ? ' (미입력)' : ''}
- 이달 지출:    ₩${budgetExpense.toLocaleString()}${budgetExpense === 0 ? ' (미입력)' : ''}
- 이달 잉여금:  ₩${budgetBalance.toLocaleString()}${budgetIncome === 0 ? ' (미입력)' : ''}
- 잠재 저축 가능액: ₩${budgetBalance > 0 ? budgetBalance.toLocaleString() : 0} (이 금액이 자산으로 전환될 때 영향 분석 필요)

[최근 6개월 추이]
날짜 | 순자산 | 전월 증감률
${recentTable || '데이터 없음'}

위 데이터를 바탕으로 아래 Markdown 구조에 맞춰 전문적인 월간 자산 리포트를 작성하십시오.

# ${yyyy}년 ${mm}월 자산 관리 리포트

> **기준일**: ${latest?.snapshot_date ?? '-'} | **생성일**: ${now.toISOString().slice(0,10)} | **작성**: AI 자산 분석 시스템

---

## 1. 이달의 자산 현황
[이번 달 자산 구성 표 및 전월 대비 변동 표 작성]

---

## 2. 핵심 지표 분석

### 2-1. 성장률 분석
[전월 대비, 전년 대비, CAGR 해석 — 2~3문단]

### 2-2. 자산 구성 평가
[포트폴리오 비율 분석 및 집중·분산 여부 — 2~3문단]

### 2-3. 부채 현황
[부채비율, 이자 부담, 상환 속도 평가 — 1~2문단]

---

## 3. 목표 달성 현황

### 3-1. ${yyyy}년 연간 목표
[연간 목표 진행 상황 및 남은 기간 대비 평가]

### 3-2. 장기 목표
[장기 목표 트래킹, 예상 달성 시점, 필요 행동]

---

## 4. 현금흐름 & 가계부 연계 분석
[이달 수입·지출·잉여금이 자산 증가에 미치는 영향, 잉여금의 자산 배분 제언 — 2~3문단]

---

## 5. 전문가 분석 및 인사이트
[이달 자산 변화의 핵심 요인 분석, 시장 맥락 포함 — 3~5문단]

---

## 6. 다음 달 액션 플랜
[구체적이고 실행 가능한 3~5가지 제언, 체크리스트 형식]

---

## 7. 누적 성과 요약
[기록 시작일, 최초 자산, 현재 자산, 총 증가액, 총 증가율, CAGR 표]

---

*본 리포트는 AI 자산 분석 시스템이 입력 데이터를 기반으로 생성한 참고 자료입니다. 투자 결정은 반드시 본인의 판단과 책임 하에 이루어져야 합니다.*`;

      // 파일명용 사용자명 (report 저장 시 title에 포함)
      req._assetReportMeta = { yyyy, mm, userName };
    } else if (module_key === 'budget') {
      report_type = 'monthly';
      const now = new Date();
      const yyyy = Number(req.body.year)  || now.getFullYear();
      const mm   = Number(req.body.month) || (now.getMonth() + 1);
      const mmStr = String(mm).padStart(2, '0');
      const from  = `${yyyy}-${mmStr}-01`;
      const to    = new Date(yyyy, mm, 0).toISOString().slice(0, 10);

      // 이번 달 내역
      const { data: records } = await supabase
        .from('budget_records')
        .select('record_type, category, amount, memo, recorded_at')
        .eq('user_id', req.user.id)
        .gte('recorded_at', from)
        .lte('recorded_at', to)
        .order('recorded_at', { ascending: false });

      // 전월 집계
      const prevYear  = mm === 1 ? yyyy - 1 : yyyy;
      const prevMonth = mm === 1 ? 12 : mm - 1;
      const prevFrom  = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
      const prevTo    = new Date(prevYear, prevMonth, 0).toISOString().slice(0, 10);
      const { data: prevRecs } = await supabase
        .from('budget_records')
        .select('record_type, amount')
        .eq('user_id', req.user.id)
        .gte('recorded_at', prevFrom)
        .lte('recorded_at', prevTo);

      // 고정비 목록
      const { data: fixedItems } = await supabase
        .from('budget_fixed_items')
        .select('category, memo, amount, record_type, is_active')
        .eq('user_id', req.user.id)
        .eq('is_active', true);

      const recs = records || [];
      const income  = recs.filter(r => r.record_type === 'income' ).reduce((s, r) => s + Number(r.amount), 0);
      const expense = recs.filter(r => r.record_type === 'expense').reduce((s, r) => s + Number(r.amount), 0);
      const balance = income - expense;
      const savRate = income > 0 ? ((balance / income) * 100).toFixed(1) : '0';

      const prevInc = (prevRecs || []).filter(r => r.record_type === 'income' ).reduce((s, r) => s + Number(r.amount), 0);
      const prevExp = (prevRecs || []).filter(r => r.record_type === 'expense').reduce((s, r) => s + Number(r.amount), 0);

      // 카테고리별 지출 집계
      const catMap = {};
      recs.filter(r => r.record_type === 'expense').forEach(r => {
        const cat = r.category || '기타';
        catMap[cat] = (catMap[cat] || 0) + Number(r.amount);
      });
      const catText = Object.entries(catMap)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, amt]) => `  - ${cat}: ₩${Number(amt).toLocaleString()} (${expense > 0 ? ((Number(amt)/expense)*100).toFixed(1) : 0}%)`)
        .join('\n');

      const fixedText = (fixedItems || []).length > 0
        ? (fixedItems || []).map(f => `  - [${f.category}] ${f.memo}: ₩${Number(f.amount).toLocaleString()}`).join('\n')
        : '  (등록된 고정비 없음)';

      contextData = { records, income, expense, balance };

      promptContent = `[${yyyy}년 ${mm}월 가계부 현황]
총 수입:    ₩${income.toLocaleString()}
총 지출:    ₩${expense.toLocaleString()}
잔액:       ₩${balance.toLocaleString()} (저축률 ${savRate}%)

[전월(${prevYear}년 ${prevMonth}월) 대비]
수입 변화: ₩${prevInc.toLocaleString()} → ₩${income.toLocaleString()} (${prevInc > 0 ? (((income-prevInc)/prevInc)*100).toFixed(1) : '-'}%)
지출 변화: ₩${prevExp.toLocaleString()} → ₩${expense.toLocaleString()} (${prevExp > 0 ? (((expense-prevExp)/prevExp)*100).toFixed(1) : '-'}%)

[카테고리별 지출]
${catText || '  (지출 내역 없음)'}

[등록된 고정비 항목]
${fixedText}

[이번 달 전체 내역 (${recs.length}건)]
${recs.slice(0, 40).map(r => `  [${r.recorded_at}] ${r.record_type === 'income' ? '수입' : '지출'} | ${r.category || '-'} | ${r.memo || '-'} | ₩${Number(r.amount).toLocaleString()}`).join('\n') || '  (내역 없음)'}

위 데이터를 바탕으로 아래 구조에 맞춰 전문적인 월간 가계부 리포트를 한국어로 작성해주세요.

# ${yyyy}년 ${mm}월 가계부 리포트

## 1. 이달의 수입·지출 요약
[수입/지출/잔액/저축률 핵심 수치 표 및 해석]

## 2. 전월 대비 분석
[수입·지출 변화 원인 분석 및 주요 특이사항]

## 3. 카테고리별 지출 분석
[카테고리별 지출 비중과 적정성 평가, 과지출 항목 지적]

## 4. 고정비 관리 현황
[고정비 대비 변동비 비율, 고정비 최적화 여부]

## 5. 저축률 및 재무 건전성 평가
[이달 저축률 평가, 권장 저축률(20~30%)과 비교]

## 6. 다음 달 절약 제언
[구체적이고 실행 가능한 3~5가지 절약 방안]`;
    } else if (module_key === 'realestate') {
      report_type = 'weekly';
      const { data: watchlist } = await supabase
        .from('realestate_watchlist')
        .select('name, address, area_sqm, interest, price, note')
        .eq('user_id', req.user.id);
      contextData = { watchlist };
      promptContent = `다음은 사용자의 부동산 관심 매물 목록입니다:\n${JSON.stringify(watchlist, null, 2)}\n\n각 매물에 대한 현재 시장 상황 분석과 매수/임대 타이밍 제언을 담은 주간 리포트를 한국어로 작성해주세요.`;
    } else if (module_key === 'news') {
      report_type = 'daily';
      const { data: keywords } = await supabase
        .from('user_keywords')
        .select('keyword, category')
        .eq('user_id', req.user.id)
        .order('priority', { ascending: false });
      contextData = { keywords };
      const kwList = (keywords || []).map(k => k.keyword).join(', ');
      promptContent = `사용자의 관심 키워드: ${kwList}\n\n오늘 날짜(${new Date().toLocaleDateString('ko-KR')}) 기준으로 위 키워드와 관련된 주요 뉴스 트렌드를 분석하고, 각 키워드별 핵심 동향 요약과 AI 인사이트를 포함한 일간 브리핑을 한국어로 작성해주세요.`;
    } else if (module_key === 'parenting') {
      report_type = 'weekly';
      const { data: records } = await supabase
        .from('parenting_records')
        .select('child_name, birth_date, record_type, data, recorded_at')
        .eq('user_id', req.user.id)
        .order('recorded_at', { ascending: false })
        .limit(30);
      contextData = { records };
      promptContent = `다음은 이번 주 육아 기록입니다:\n${JSON.stringify(records, null, 2)}\n\n발달 현황 분석, 주요 마일스톤, 다음 주 육아 팁을 포함한 주간 육아 리포트를 한국어로 따뜻하게 작성해주세요.`;
    } else if (['portfolio', 'health', 'career', 'learning'].includes(module_key)) {
      const TYPE_MAP = { portfolio: 'weekly', health: 'weekly', career: 'monthly', learning: 'weekly' };
      report_type = TYPE_MAP[module_key] || 'weekly';
      const { data: records } = await supabase
        .from('user_module_records')
        .select('record_type, data, recorded_at')
        .eq('user_id', req.user.id)
        .eq('module_key', module_key)
        .order('recorded_at', { ascending: false })
        .limit(30);
      contextData = { records };
      const MODULE_PROMPTS = {
        portfolio: `다음은 사용자의 투자 포트폴리오 기록입니다:\n${JSON.stringify(records, null, 2)}\n\n보유 종목별 수익률 분석, 포트폴리오 구성 평가, 리밸런싱 제언을 포함한 주간 투자 리포트를 한국어로 작성해주세요.`,
        health:    `다음은 사용자의 건강 기록입니다:\n${JSON.stringify(records, null, 2)}\n\n체중·운동·수면 트렌드 분석, 건강 개선 제언을 포함한 주간 건강 리포트를 한국어로 작성해주세요.`,
        career:    `다음은 사용자의 커리어 기록입니다:\n${JSON.stringify(records, null, 2)}\n\n목표 달성도, 스킬 성장, 다음 달 커리어 액션플랜을 포함한 월간 커리어 리포트를 한국어로 작성해주세요.`,
        learning:  `다음은 사용자의 학습 기록입니다:\n${JSON.stringify(records, null, 2)}\n\n학습량 분석, 목표 달성률, 효율 개선 팁을 포함한 주간 학습 리포트를 한국어로 작성해주세요.`,
      };
      promptContent = MODULE_PROMPTS[module_key];
    } else {
      return res.status(400).json({ error: `${module_key} 모듈의 리포트 생성은 아직 지원되지 않습니다.` });
    }

    const messageParams = {
      model: 'claude-sonnet-4-6',
      max_tokens: 6000,
      messages: [{ role: 'user', content: promptContent }],
    };
    // assets 모듈은 system 프롬프트(전문가 페르소나) 추가
    if (module_key === 'assets' && systemPrompt) {
      messageParams.system = systemPrompt;
    }

    const message = await anthropic.messages.create(messageParams);

    const content = message.content[0].text;

    // assets 리포트 파일명: 2026년04월_홍길동_자산관리_AI리포트
    let title;
    if (module_key === 'assets' && req._assetReportMeta) {
      const { yyyy, mm, userName } = req._assetReportMeta;
      title = `${yyyy}년${mm}월_${userName}_자산관리_AI리포트`;
    } else {
      title = `${new Date().toLocaleDateString('ko-KR')} ${MODULE_NAMES[module_key] || module_key} ${REPORT_TYPE_NAMES[report_type]}`;
    }

    const { data: report, error: saveError } = await supabase
      .from('ai_reports')
      .insert({ user_id: req.user.id, module_key, report_type, title, content, metadata: contextData })
      .select()
      .single();

    if (saveError) return res.status(500).json({ error: saveError.message });
    res.status(201).json({ data: report });

  } catch (err) {
    console.error('리포트 생성 오류:', err);
    res.status(500).json({ error: '리포트 생성 중 오류가 발생했습니다.' });
  }
});

const MODULE_NAMES = {
  assets: '자산 관리', budget: '가계부', realestate: '부동산',
  news: '뉴스 브리핑', parenting: '육아', portfolio: '투자',
  health: '건강', career: '커리어', learning: '학습',
};
const REPORT_TYPE_NAMES = { daily: '일간 리포트', weekly: '주간 리포트', monthly: '월간 리포트' };

module.exports = router;
