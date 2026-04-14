const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../lib/activity');

const router = express.Router();
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

const VALID_TRANSITIONS = {
  idea:      ['planned', 'archived'],
  planned:   ['designed', 'idea', 'archived'],
  designed:  ['ready_dev', 'planned', 'archived'],
  ready_dev: ['in_dev', 'designed', 'archived'],
  in_dev:    ['deployed', 'ready_dev', 'archived'],
  deployed:  ['archived'],
  archived:  ['idea'],
};

// GET /api/contents
router.get('/', requireAuth, async (req, res) => {
  const { status, content_type, category, search, limit = 50, offset = 0 } = req.query;

  let query = supabase
    .from('content_items')
    .select('*', { count: 'exact' })
    .eq('user_id', req.user.id)
    .order('updated_at', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (status)       query = query.eq('status', status);
  if (content_type) query = query.eq('content_type', content_type);
  if (category)     query = query.eq('category', category);
  if (search)       query = query.ilike('title', `%${search}%`);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data, total: count });
});

// GET /api/contents/stats  — Dashboard KPI
router.get('/stats', requireAuth, async (req, res) => {
  const { data, error } = await supabase.rpc('get_content_stats', { p_user_id: req.user.id });
  if (error) {
    // RPC 없으면 fallback
    const { data: rows, error: e2 } = await supabase
      .from('content_items')
      .select('status')
      .eq('user_id', req.user.id);
    if (e2) return res.status(500).json({ error: e2.message });
    const counts = {};
    for (const row of rows) counts[row.status] = (counts[row.status] || 0) + 1;
    return res.json(counts);
  }
  const counts = {};
  for (const row of data) counts[row.status] = Number(row.count);
  res.json(counts);
});

// POST /api/contents/check-similarity
// 새 콘텐츠 등록 전 기존 콘텐츠와 유사도 검사
router.post('/check-similarity', requireAuth, async (req, res) => {
  const { title, seo_keyword, content_type } = req.body;
  if (!title) return res.status(400).json({ error: 'title이 필요합니다.' });

  // 기존 콘텐츠 목록 가져오기 (배포됐거나 진행 중인 것 우선)
  const { data: existing } = await supabase
    .from('content_items')
    .select('id, title, seo_keyword, content_type, status')
    .eq('user_id', req.user.id)
    .not('status', 'eq', 'archived')
    .order('updated_at', { ascending: false })
    .limit(200);

  if (!existing || existing.length === 0) {
    return res.json({ score: 0, level: 'ok', similar_items: [], message: '비교할 기존 콘텐츠가 없습니다.' });
  }

  const listText = existing.map((c, i) =>
    `${i + 1}. [${c.content_type}] "${c.title}"${c.seo_keyword ? ` (키워드: ${c.seo_keyword})` : ''} — 상태: ${c.status}`
  ).join('\n');

  const prompt = `다음은 새로 등록하려는 콘텐츠입니다:
- 제목: "${title}"
- 유형: ${content_type || '미지정'}
- SEO 키워드: ${seo_keyword || '미지정'}

아래는 이미 등록된 콘텐츠 목록입니다:
${listText}

새 콘텐츠와 기존 콘텐츠 중 가장 유사한 항목을 찾아 아래 JSON으로만 응답하세요.
{
  "score": 0~100,
  "reason": "유사한 이유 한 줄 (다르면 '충분히 차별화됨')",
  "most_similar_index": null 또는 1~N (위 목록 번호),
  "most_similar_title": null 또는 "가장 유사한 기존 제목"
}

점수 기준:
- 0~50: 주제/키워드가 다름 → 등록 가능
- 51~75: 부분적으로 겹치나 차별화 여지 있음 → 경고
- 76~100: 동일 주제/키워드 → 중복으로 판단`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    let parsed = { score: 0, reason: '', most_similar_index: null, most_similar_title: null };
    try {
      const text = response.content[0].text;
      parsed = parseJsonSafe(text) || parsed;
    } catch {}

    const score = Math.min(100, Math.max(0, Number(parsed.score) || 0));
    const level = score >= 76 ? 'block' : score >= 51 ? 'warn' : 'ok';

    // 가장 유사한 기존 콘텐츠 ID 찾기
    let similar_item = null;
    if (parsed.most_similar_index != null) {
      const idx = Number(parsed.most_similar_index) - 1;
      if (idx >= 0 && idx < existing.length) similar_item = existing[idx];
    }

    res.json({
      score,
      level,           // 'ok' | 'warn' | 'block'
      reason: parsed.reason || '',
      similar_item: similar_item ? {
        id: similar_item.id,
        title: similar_item.title,
        content_type: similar_item.content_type,
        status: similar_item.status,
      } : null,
    });

  } catch (err) {
    // Claude 실패해도 등록은 막지 않음
    res.json({ score: 0, level: 'ok', reason: '유사도 검사 실패 (통과)', similar_item: null });
  }
});

// GET /api/contents/:id
router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('content_items')
    .select(`
      *,
      documents (id, doc_type, version, status, file_path, updated_at),
      deployments (id, platform, environment, status, deploy_url, deployed_at),
      git_changes (id, branch_name, pr_url, merge_status)
    `)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (error || !data) return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다.' });
  res.json(data);
});

// POST /api/contents
router.post('/', requireAuth, async (req, res) => {
  const { title, content_type, category, seo_keyword, priority, raw_idea, target_repo, target_path, notes } = req.body;
  if (!title || !content_type || !category) {
    return res.status(400).json({ error: 'title, content_type, category는 필수입니다.' });
  }

  const { data, error } = await supabase
    .from('content_items')
    .insert({
      user_id: req.user.id,
      title, content_type, category,
      seo_keyword, priority: priority ?? 1,
      raw_idea, target_repo, target_path, notes,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await logActivity({
    content_item_id: data.id,
    user_id: req.user.id,
    event_type: 'content_created',
    description: `콘텐츠 생성: ${title}`,
  });

  res.status(201).json(data);
});

// PATCH /api/contents/:id
router.patch('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase
    .from('content_items')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (!existing) return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다.' });

  const allowed = ['title', 'content_type', 'category', 'seo_keyword', 'priority', 'raw_idea', 'target_repo', 'target_path', 'notes'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const { data, error } = await supabase
    .from('content_items')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/contents/:id/transition — 상태 전이
router.post('/:id/transition', requireAuth, async (req, res) => {
  const { status: nextStatus } = req.body;
  if (!nextStatus) return res.status(400).json({ error: 'status가 필요합니다.' });

  const { data: item } = await supabase
    .from('content_items')
    .select('id, status, title')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (!item) return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다.' });

  const allowed = VALID_TRANSITIONS[item.status] || [];
  if (!allowed.includes(nextStatus)) {
    return res.status(400).json({
      error: `${item.status} → ${nextStatus} 전이는 허용되지 않습니다.`,
      allowed,
    });
  }

  const { data, error } = await supabase
    .from('content_items')
    .update({ status: nextStatus })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await logActivity({
    content_item_id: item.id,
    user_id: req.user.id,
    event_type: 'status_changed',
    description: `상태 변경: ${item.status} → ${nextStatus}`,
    metadata: { from: item.status, to: nextStatus },
  });

  res.json(data);
});

// DELETE /api/contents/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase
    .from('content_items')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (!existing) return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다.' });

  const { error } = await supabase.from('content_items').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ─── POST /api/contents/auto-generate ─────────────────────────────────────────
// 계산기 1개 + 리포트 1개 자동 아이디어 생성 및 등록

const PRIORITY_CATEGORIES = [
  '투자/연금/노후', '출산/임신', '주식/코인', '여행/항공/숙박비', 'AI/생산성/자동화',
  '부동산', '육아', '직업/연봉', '세금/절세' , '결혼/웨딩', '복지/지원금',
  '보험', '금융/대출', '생활비절약', '교육비',
];

router.post('/auto-generate', requireAuth, async (req, res) => {
  const userId = req.user.id;

  // 1. 기존 콘텐츠 전체 조회
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

  // 2. 카테고리 로테이션 — 최근 5개에 없는 카테고리 우선
  const recentCategories = (existing || []).slice(0, 10).map(c => c.category);
  const todayCategory =
    PRIORITY_CATEGORIES.find(c => !recentCategories.includes(c)) ||
    PRIORITY_CATEGORIES[0];

  // 3. Claude에게 아이디어 2개 요청
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
    const text = response.content[0].text;
    parsed = parseJsonSafe(text);
    if (!parsed) throw new Error('JSON 파싱 실패');
  } catch (err) {
    return res.status(500).json({ error: `아이디어 생성 실패: ${err.message}` });
  }

  // 4. 각 아이디어를 content_item으로 INSERT
  const results = [];
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

    if (itemErr || !item) continue;

    await logActivity({
      content_item_id: item.id,
      user_id: userId,
      event_type: 'content_created',
      description: `[자동생성] ${item.title}`,
      metadata: { scores: idea.scores, auto_generated: true },
    });

    // 5. Ideas 자동 생성 (동기)
    let generatedIdea = null;
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
      const ideasText = ideasRes.content[0].text;
      const ideasParsed = parseJsonSafe(ideasText) || {};

      const { data: ideaRow } = await supabase
        .from('content_ideas')
        .insert({ content_item_id: item.id, model: 'claude', ...ideasParsed })
        .select().single();
      generatedIdea = ideaRow;
    } catch {}

    results.push({ item, idea: generatedIdea, scores: idea.scores, affiliate_hint: idea.affiliate_hint, series_expansion: idea.series_expansion });
  }

  res.json({ today_category: todayCategory, items: results });
});

module.exports = router;
