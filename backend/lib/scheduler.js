const cron = require('node-cron');
const Anthropic = require('@anthropic-ai/sdk');
const supabase = require('./supabase');
const { logActivity } = require('./activity');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function parseJsonSafe(text) {
  const stripped = text
    .replace(/^```json?\s*/im, '')
    .replace(/```\s*$/im, '')
    .trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

const PRIORITY_CATEGORIES = [
  '투자/연금/노후', '출산/임신', '주식/코인',
  '부동산', '육아', '직업/연봉', '자동차유지비',
  '보험', '금융/대출', '생활비절약', '교육비',
];

async function runAutoGenerate(userId) {
  console.log(`[Scheduler] 자동 아이디어 생성 시작 — userId: ${userId}`);

  const { data: existing } = await supabase
    .from('content_items')
    .select('id, title, category, content_type, status')
    .eq('user_id', userId)
    .not('status', 'eq', 'archived')
    .order('created_at', { ascending: false })
    .limit(200);

  const existingList = (existing || [])
    .map((c, i) => `${i + 1}. [${c.content_type}] ${c.title} (${c.category})`)
    .join('\n') || '(없음)';

  const recentCategories = (existing || []).slice(0, 10).map(c => c.category);
  const todayCategory =
    PRIORITY_CATEGORIES.find(c => !recentCategories.includes(c)) ||
    PRIORITY_CATEGORIES[0];

  const systemPrompt = `당신은 bigyocalc.com의 콘텐츠 전략가입니다.
비교계산소는 한국 생활 밀착형 계산기·리포트 사이트로,
검색 유입 → 광고 수익 → 상품 제휴 전환이 수익 모델입니다.

목표: 검색 유입 / 광고 수익 / 제휴 전환 / 내부 페이지 체류시간 증가

평가 기준 (각 1~5점):
- 검색 유입성: 월 검색량, 시즌성, 롱테일 키워드 가능성
- 수익화: 광고 클릭 친화성 + 제휴 연결 가능성
- 내부링크: 후속 시리즈 확장성, 관련 콘텐츠 연결 가능성
- 구현난이도: 낮을수록 좋음 (1=쉬움, 5=어려움)`;

  const userPrompt = `오늘의 신규 콘텐츠 아이디어를 계산기 1개, 리포트 1개 제안해줘.

━━━ 우선 카테고리 ━━━
투자/연금/노후, 출산/임신, 주식/코인, 부동산, 육아, 직업/연봉,
자동차유지비, 보험, 금융/대출, 생활비절약, 교육비

오늘 우선 카테고리: ${todayCategory}

━━━ 이미 등록된 콘텐츠 (중복·유사 금지) ━━━
${existingList}

위 목록과 제목·주제·키워드가 70% 이상 겹치면 절대 안 됨.

━━━ 좋은 아이디어 조건 ━━━
- 사람마다 결과가 달라 직접 해봐야 하는 것 (반복 방문)
- 금융/보험/부동산 제휴 배너 붙이기 좋은 주제
- 연도 업데이트로 매년 재활용 가능한 것

━━━ 출력 형식 (JSON만, 다른 텍스트 없이) ━━━
{
  "calculator": {
    "title": "제목 (20자 이내)",
    "category": "카테고리",
    "seo_keyword": "핵심 검색어",
    "raw_idea": "아이디어 설명 3~5줄. 입력값·출력값·활용 시나리오 포함",
    "target_path": "/tools/{slug}/",
    "scores": { "search": 1~5, "revenue": 1~5, "internal_link": 1~5, "difficulty": 1~5, "total": 합계 },
    "affiliate_hint": "연결 가능한 제휴 상품/서비스",
    "series_expansion": "후속으로 만들 수 있는 콘텐츠 2~3개"
  },
  "report": {
    "title": "제목 (25자 이내, 연도 포함 권장)",
    "category": "카테고리",
    "seo_keyword": "핵심 검색어",
    "raw_idea": "아이디어 설명 3~5줄. 14개 섹션 구성 힌트 포함",
    "target_path": "/reports/{slug}/",
    "scores": { "search": 1~5, "revenue": 1~5, "internal_link": 1~5, "difficulty": 1~5, "total": 합계 },
    "affiliate_hint": "연결 가능한 제휴 상품/서비스",
    "series_expansion": "후속으로 만들 수 있는 콘텐츠 2~3개"
  }
}`;

  let parsed;
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    parsed = parseJsonSafe(response.content[0].text);
    if (!parsed) throw new Error('JSON 파싱 실패');
  } catch (err) {
    console.error('[Scheduler] 아이디어 생성 실패:', err.message);
    return;
  }

  for (const type of ['calculator', 'report']) {
    const idea = parsed[type];
    if (!idea?.title) continue;

    const { data: item, error: itemErr } = await supabase
      .from('content_items')
      .insert({
        user_id: userId,
        title: idea.title,
        content_type: type,
        category: idea.category || todayCategory,
        seo_keyword: idea.seo_keyword || '',
        raw_idea: idea.raw_idea || '',
        target_path: idea.target_path || '',
        priority: 1,
        notes: [
          idea.affiliate_hint ? `제휴 힌트: ${idea.affiliate_hint}` : '',
          idea.series_expansion ? `확장 시리즈: ${idea.series_expansion}` : '',
        ].filter(Boolean).join('\n'),
      })
      .select()
      .single();

    if (itemErr || !item) {
      console.error('[Scheduler] content_item 저장 실패:', itemErr?.message);
      continue;
    }

    await logActivity({
      content_item_id: item.id,
      user_id: userId,
      event_type: 'content_created',
      description: `[자동생성] ${item.title}`,
      metadata: { scores: idea.scores, auto_generated: true },
    });

    try {
      const ideasSystem = `당신은 콘텐츠 전략가입니다. 주어진 아이디어를 바탕으로 웹 콘텐츠 기획안을 작성합니다.
결과는 반드시 아래 JSON 형식으로만 응답하세요.
{
  "result_summary": "콘텐츠 아이디어 요약 (2-3문장)",
  "suggested_titles": ["제목1", "제목2", "제목3"],
  "suggested_outline": ["섹션1", "섹션2", "섹션3", "섹션4", "섹션5"],
  "seo_keywords": ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5"],
  "strengths": "이 아이디어의 강점",
  "weaknesses": "이 아이디어의 약점 또는 주의사항",
  "score": 85
}`;
      const ideasUser = `콘텐츠 타입: ${type}\n카테고리: ${idea.category}\nSEO 키워드: ${idea.seo_keyword}\n아이디어 원문:\n${idea.raw_idea}`;
      const ideasRes = await anthropic.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 1024,
        system: ideasSystem,
        messages: [{ role: 'user', content: ideasUser }],
      });
      const ideasParsed = parseJsonSafe(ideasRes.content[0].text) || {};
      await supabase
        .from('content_ideas')
        .insert({ content_item_id: item.id, model: 'claude', ...ideasParsed });
    } catch (err) {
      console.error('[Scheduler] ideas 생성 실패:', err.message);
    }

    console.log(`[Scheduler] ✓ ${type}: "${item.title}" 등록 완료`);
  }

  console.log('[Scheduler] 자동 아이디어 생성 완료');
}

function startScheduler() {
  const userId = process.env.SCHEDULER_USER_ID;
  if (!userId) {
    console.warn('[Scheduler] SCHEDULER_USER_ID 환경변수가 없어 스케줄러를 시작하지 않습니다.');
    return;
  }

  // 매일 오전 9시 KST (= UTC 00:00)
  cron.schedule('0 0 * * *', () => {
    runAutoGenerate(userId).catch(err =>
      console.error('[Scheduler] 오류:', err.message)
    );
  }, { timezone: 'UTC' });

  console.log('[Scheduler] 매일 09:00 KST 자동 아이디어 생성 스케줄 등록됨');
}

module.exports = { startScheduler, runAutoGenerate };
