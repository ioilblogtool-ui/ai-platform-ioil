const PRIORITY_CATEGORIES = [
  '투자/연금/노후', '출산/임신', '주식/코인', '여행/항공/숙박비', 'AI/생산성/자동화',
  '부동산', '육아', '직업/연봉', '세금/절세', '결혼/웨딩', '복지/지원금',
  '보험', '금융/대출', '생활비절약', '교육비',
  '자동차/유지비', '전기차/충전비', '통신비/알뜰폰', '렌탈/구독비', '이사/청소',
  '반려동물 비용', '프리랜서/사업자', '퇴직/이직', '청년정책', '시니어 생활',
  '건강검진/의료비', '다이어트/운동비', '심리상담/멘탈케어', '취미/클래스', '자기계발',
  '중고거래/리셀', '가전/디지털 구매', '인테리어/수리비', '공과금/에너지', '식비/외식비',
  '장보기/마트', '카드/포인트/마일리지', '해외직구/관세', '환율/해외송금', '유학/어학',
  '캠핑/레저', '숙소/호캉스', '항공권/마일리지', '지역축제/나들이', '공공요금',
  '정부지원 창업', '소상공인 비용', '법률/계약', '상속/증여', '재난/안전',
  '입시/학원비', '대학/장학금', '어린이집/유치원', '돌봄/간병', '은퇴 주거',
  '월세/전세', '청약/분양', '대출 갈아타기', '신용점수', '파킹통장/CMA',
  'ETF/펀드', '코인 세금', '배당/현금흐름', '실손보험', '자동차보험',
  '여행자보험', '웨딩 비용', '장례/상조', '명절/선물비', '연말정산',
];

function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toLines(values, fallback = '(없음)') {
  const lines = [...new Set(values.filter(Boolean).map(String).map(v => v.trim()).filter(Boolean))];
  return lines.length ? lines.map((v, i) => `${i + 1}. ${v}`).join('\n') : fallback;
}

function pickTodayCategory(existing = []) {
  const recentCategories = existing.slice(0, 25).map(c => c.category).filter(Boolean);
  return PRIORITY_CATEGORIES.find(c => !recentCategories.includes(c)) || PRIORITY_CATEGORIES[0];
}

async function buildAutoIdeaContext(supabase, userId) {
  const { data: existing, error: existingError } = await supabase
    .from('content_items')
    .select('id, title, category, content_type, status, seo_keyword, raw_idea')
    .eq('user_id', userId)
    .not('status', 'eq', 'archived')
    .order('created_at', { ascending: false })
    .limit(300);

  if (existingError) throw existingError;

  const { data: savedIdeas, error: ideasError } = await supabase
    .from('content_ideas')
    .select(`
      id,
      result_summary,
      suggested_titles,
      suggested_outline,
      seo_keywords,
      strengths,
      content_items!inner(user_id, title, category, content_type)
    `)
    .eq('content_items.user_id', userId)
    .order('created_at', { ascending: false })
    .limit(300);

  if (ideasError) throw ideasError;

  const existingList = toLines((existing || []).map(c =>
    `[${c.content_type}] ${c.title} (${c.category})`
  ));

  const savedIdeaLines = [];
  for (const idea of savedIdeas || []) {
    const source = idea.content_items?.title ? ` / source: ${idea.content_items.title}` : '';
    for (const title of idea.suggested_titles || []) {
      savedIdeaLines.push(`[saved idea title] ${title}${source}`);
    }
    if (idea.result_summary) savedIdeaLines.push(`[saved idea summary] ${idea.result_summary}${source}`);
    if (idea.strengths) savedIdeaLines.push(`[saved idea strength] ${idea.strengths}${source}`);
    for (const outline of idea.suggested_outline || []) {
      savedIdeaLines.push(`[saved idea outline] ${outline}${source}`);
    }
    for (const keyword of idea.seo_keywords || []) {
      savedIdeaLines.push(`[saved idea keyword] ${keyword}${source}`);
    }
  }

  const excludedIdeas = [
    ...(existing || []).flatMap(c => [c.title, c.seo_keyword, c.raw_idea]),
    ...savedIdeaLines,
  ].filter(Boolean);

  return {
    existing: existing || [],
    savedIdeas: savedIdeas || [],
    existingList,
    excludedIdeaList: toLines(savedIdeaLines.slice(0, 180)),
    todayCategory: pickTodayCategory(existing || []),
    categoryList: PRIORITY_CATEGORIES.join(', '),
    excludedIdeas,
  };
}

function buildNoveltyInstructions(context) {
  return `
[중복 절대 금지 규칙]
- 아래 "이미 저장된 Ideas"에 있는 제목, 요약, 키워드, 문제 상황, 대상 독자와 같은 아이디어는 절대 다시 제안하지 마세요.
- 표현만 바꾼 유사 아이디어도 금지입니다. 대상 비용/상황/계산 방식 중 최소 2개 이상이 달라야 합니다.
- 기존 콘텐츠 목록과 60% 이상 겹치면 실패입니다. 더 좁은 타깃, 다른 생애 이벤트, 다른 비용 항목으로 우회하세요.
- 같은 카테고리 안에서도 세부 주제를 바꾸세요. 예: "보험"이면 자동차보험, 실손보험, 여행자보험, 펫보험을 서로 다른 주제로 취급하세요.

[이미 저장된 Ideas - 재사용 금지]
${context.excludedIdeaList}`;
}

function findConflictingGeneratedIdeas(parsed, excludedIdeas = []) {
  const blocked = [...new Set(excludedIdeas.map(normalizeText).filter(v => v.length >= 8))];
  const conflicts = [];

  for (const type of ['calculator', 'report']) {
    const idea = parsed?.[type];
    if (!idea) continue;
    const candidates = [
      idea.title,
      idea.seo_keyword,
      idea.raw_idea,
      idea.target_path,
      idea.affiliate_hint,
      idea.series_expansion,
    ].map(normalizeText).filter(v => v.length >= 8);

    const matched = candidates.find(candidate =>
      blocked.some(blockedText =>
        candidate === blockedText ||
        (candidate.length >= 8 && blockedText.includes(candidate)) ||
        (blockedText.length >= 8 && candidate.includes(blockedText))
      )
    );

    if (matched) conflicts.push({ type, title: idea.title || '(untitled)', matched });
  }

  return conflicts;
}

module.exports = {
  PRIORITY_CATEGORIES,
  buildAutoIdeaContext,
  buildNoveltyInstructions,
  findConflictingGeneratedIdeas,
};
