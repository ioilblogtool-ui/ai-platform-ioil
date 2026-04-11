/**
 * bigyocalc.com 기존 콘텐츠 + plan/design 문서 일괄 등록 스크립트
 *
 * 사용법:
 *   USER_ID=<supabase-user-uuid> node scripts/seed-bigyocalc.js
 *
 * 수행 작업:
 *   1) content_items 45개 upsert (계산기 23 + 리포트 22 + AI 스택 계산기 1)
 *   2) GitHub docs/plan/** → documents (doc_type: plan) upsert
 *   3) GitHub docs/design/** → documents (doc_type: design) upsert
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const USER_ID = process.env.USER_ID || process.argv[2];
if (!USER_ID) {
  console.error('❌ USER_ID가 필요합니다.');
  console.error('   사용법: USER_ID=<uuid> node scripts/seed-bigyocalc.js');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── GitHub raw 파일 fetch ─────────────────────────────────────────────────────
const GH_RAW = 'https://raw.githubusercontent.com/ioilblogtool-ui/blog-tool/main/docs';

function fetchRaw(path) {
  return new Promise((resolve, reject) => {
    const url = `${GH_RAW}/${path}`;
    https.get(url, res => {
      if (res.statusCode === 404) { resolve(null); return; }
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

const TARGET_REPO = 'https://github.com/ioilblogtool-ui/blog-tool.git';

// ─── 1. CONTENT ITEMS ─────────────────────────────────────────────────────────
const CALCULATORS = [
  // 연봉·이직
  { title: '연봉 티어 계산기',        category: '연봉·이직',       seo_keyword: '연봉 티어',          notes: 'https://bigyocalc.com/tools/salary-tier/' },
  { title: '연봉 인상 계산기',        category: '연봉·이직',       seo_keyword: '연봉 인상',          notes: 'https://bigyocalc.com/tools/salary/' },
  { title: '이직 계산기',            category: '연봉·이직',       seo_keyword: '이직 연봉',          notes: 'https://bigyocalc.com/tools/negotiation/' },
  { title: '퇴직금 계산기',          category: '연봉·이직',       seo_keyword: '퇴직금',            notes: 'https://bigyocalc.com/tools/retirement/' },
  { title: '가구 소득 계산기',        category: '연봉·이직',       seo_keyword: '가구 소득',          notes: 'https://bigyocalc.com/tools/household-income/' },
  // 성과급 비교
  { title: '대기업 성과급 시뮬레이터',  category: '성과급',          seo_keyword: '대기업 성과급',       notes: 'https://bigyocalc.com/tools/bonus-simulator/' },
  { title: '삼성전자 성과급 계산기',   category: '성과급',          seo_keyword: '삼성전자 성과급',      notes: 'https://bigyocalc.com/tools/samsung-bonus/' },
  { title: 'SK하이닉스 성과급 계산기', category: '성과급',          seo_keyword: 'SK하이닉스 성과급',    notes: 'https://bigyocalc.com/tools/sk-hynix-bonus/' },
  { title: '현대자동차 성과급 계산기',  category: '성과급',          seo_keyword: '현대자동차 성과급',    notes: 'https://bigyocalc.com/tools/hyundai-bonus/' },
  // 육아휴직·출산
  { title: '육아휴직 계산기',          category: '육아휴직·출산',   seo_keyword: '육아휴직',           notes: 'https://bigyocalc.com/tools/parental-leave/' },
  { title: '육아휴직 급여 계산기',      category: '육아휴직·출산',   seo_keyword: '육아휴직 급여',       notes: 'https://bigyocalc.com/tools/parental-leave-pay/' },
  { title: '6+6 부모육아휴직제 계산기', category: '육아휴직·출산',   seo_keyword: '6+6 육아휴직',       notes: 'https://bigyocalc.com/tools/six-plus-six/' },
  { title: '한 명만 육아휴직 총수령액 계산기', category: '육아휴직·출산', seo_keyword: '육아휴직 총수령액', notes: 'https://bigyocalc.com/tools/single-parental-leave-total/' },
  { title: '출산~2세 총지원금 계산기',  category: '육아휴직·출산',   seo_keyword: '출산 지원금',        notes: 'https://bigyocalc.com/tools/birth-support-total/' },
  { title: '육아휴직 + 육아기 단축근무 계산기', category: '육아휴직·출산', seo_keyword: '육아기 단축근무', notes: 'https://bigyocalc.com/tools/parental-leave-short-work-calculator/' },
  // 육아·생활·부동산
  { title: '아기 기저귀 값 계산기',    category: '육아·생활·부동산', seo_keyword: '기저귀 비용',        notes: 'https://bigyocalc.com/tools/diaper-cost/' },
  { title: '아기 분유 값 계산기',      category: '육아·생활·부동산', seo_keyword: '분유 비용',          notes: 'https://bigyocalc.com/tools/formula-cost/' },
  { title: '아기 성장 백분위 계산기',   category: '육아·생활·부동산', seo_keyword: '아기 성장 백분위',   notes: 'https://bigyocalc.com/tools/baby-growth-percentile-calculator/' },
  { title: '내집마련 자금 계산기',      category: '육아·생활·부동산', seo_keyword: '내집마련',          notes: 'https://bigyocalc.com/tools/home-purchase-fund/' },
  // 결혼·웨딩
  { title: '결혼 비용 계산기',         category: '결혼·웨딩',       seo_keyword: '결혼 비용',          notes: 'https://bigyocalc.com/tools/wedding-budget-calculator/' },
  { title: '결혼 축의금 손익분기점 계산기', category: '결혼·웨딩',    seo_keyword: '축의금 손익분기점',   notes: 'https://bigyocalc.com/tools/wedding-gift-break-even-calculator/' },
  // 투자·재테크
  { title: '적립식 투자 수익 비교 계산기', category: '투자·재테크',   seo_keyword: '적립식 투자 수익',    notes: 'https://bigyocalc.com/tools/dca-investment-calculator/' },
  { title: '파이어족 계산기',           category: '투자·재테크',    seo_keyword: '파이어족',           notes: 'https://bigyocalc.com/tools/fire-calculator/' },
  // AI (미배포)
  { title: 'AI 스택 비용 계산기',      category: '투자·재테크',    seo_keyword: 'AI 툴 비용',         notes: '' },
];

const REPORTS = [
  // 연봉·초봉
  { title: '2026 신입사원 초봉 비교',                        category: '연봉·초봉',    seo_keyword: '신입 초봉 2026',        notes: 'https://bigyocalc.com/reports/new-employee-salary-2026/' },
  { title: 'IT 업계 신입 초봉 TOP 10',                      category: '연봉·초봉',    seo_keyword: 'IT 신입 초봉',          notes: 'https://bigyocalc.com/reports/it-salary-top10/' },
  { title: 'IT SI·SM 대기업 평균 연봉·성과급 비교 2026',     category: '연봉·초봉',    seo_keyword: 'IT SI SM 연봉',         notes: 'https://bigyocalc.com/reports/it-si-sm-salary-comparison-2026/' },
  { title: '국내 TOP 보험사 평균 연봉·성과급 비교 2026',     category: '연봉·초봉',    seo_keyword: '보험사 연봉 2026',      notes: 'https://bigyocalc.com/reports/insurance-salary-bonus-comparison-2026/' },
  { title: '국내 TOP 대형 건설사 평균 연봉·성과급 비교 2026', category: '연봉·초봉',   seo_keyword: '건설사 연봉 2026',      notes: 'https://bigyocalc.com/reports/construction-salary-bonus-comparison-2026/' },
  { title: '2026 대기업 연차별 연봉 성장 비교',              category: '연봉·초봉',    seo_keyword: '대기업 연차별 연봉',    notes: 'https://bigyocalc.com/reports/large-company-salary-growth-by-years-2026/' },
  { title: '경찰관 계급별 연봉·호봉 완전 정리 2026',         category: '연봉·초봉',    seo_keyword: '경찰관 연봉 2026',      notes: 'https://bigyocalc.com/reports/police-salary-2026/' },
  { title: '소방관 계급별 연봉·수당 비교 2026',              category: '연봉·초봉',    seo_keyword: '소방관 연봉 2026',      notes: 'https://bigyocalc.com/reports/firefighter-salary-2026/' },
  { title: '간호사 연차별 연봉 + 병원 규모별 비교 2026',     category: '연봉·초봉',    seo_keyword: '간호사 연봉 2026',      notes: 'https://bigyocalc.com/reports/nurse-salary-2026/' },
  // 자산·부동산
  { title: '2026 이재명 정부 핵심 공직자 재산·보수 비교',    category: '자산·부동산',   seo_keyword: '공직자 재산 2026',      notes: 'https://bigyocalc.com/reports/lee-jaemyung-government-officials-assets-salary-2026/' },
  { title: '서울 국평 아파트 가격 비교',                     category: '자산·부동산',   seo_keyword: '서울 84㎡ 아파트',      notes: 'https://bigyocalc.com/reports/seoul-84-apartment-prices/' },
  { title: '한국 부자 TOP 10 자산 비교',                     category: '자산·부동산',   seo_keyword: '한국 부자 TOP 10',      notes: 'https://bigyocalc.com/reports/korea-rich-top10-assets/' },
  { title: '미국 부자 TOP 10 성공 패턴',                     category: '자산·부동산',   seo_keyword: '미국 부자 TOP 10',      notes: 'https://bigyocalc.com/reports/us-rich-top10-patterns/' },
  { title: '서울 집값 2016 vs 2026 비교',                    category: '자산·부동산',   seo_keyword: '서울 집값 10년',        notes: 'https://bigyocalc.com/reports/seoul-housing-2016-vs-2026/' },
  { title: '전세 사라지는 서울 아파트',                       category: '자산·부동산',   seo_keyword: '서울 아파트 전세',      notes: 'https://bigyocalc.com/reports/seoul-apartment-jeonse-report/' },
  { title: '미국·한국 반도체 ETF 비교 2026',                 category: '자산·부동산',   seo_keyword: '반도체 ETF 2026',       notes: 'https://bigyocalc.com/reports/semiconductor-etf-2026/' },
  { title: '엔비디아는 왜 공장이 없을까? 반도체 산업 구조',   category: '자산·부동산',   seo_keyword: '반도체 밸류체인',       notes: 'https://bigyocalc.com/reports/semiconductor-value-chain/' },
  // 생활·문화
  { title: '결혼비용 2016 vs 2026',                          category: '생활·문화',    seo_keyword: '결혼 비용 변화',        notes: 'https://bigyocalc.com/reports/wedding-cost-2016-vs-2026/' },
  { title: '신생아~돌까지 육아 비용 총정리',                  category: '생활·문화',    seo_keyword: '첫해 육아 비용',        notes: 'https://bigyocalc.com/reports/baby-cost-guide-first-year/' },
  { title: '아이 키우는 비용 2016 vs 2026 비교',             category: '생활·문화',    seo_keyword: '육아 비용 변화',        notes: 'https://bigyocalc.com/reports/baby-cost-2016-vs-2026/' },
  { title: '대한민국 영화 손익 비교',                         category: '생활·문화',    seo_keyword: '한국 영화 손익분기점',  notes: 'https://bigyocalc.com/reports/korean-movie-break-even-profit/' },
  { title: '한국인 평균 연봉·자산 2016 vs 2026 비교',        category: '생활·문화',    seo_keyword: '한국인 연봉 자산 변화', notes: 'https://bigyocalc.com/reports/salary-asset-2016-vs-2026/' },
];

// ─── 2. DOCUMENT MAPPINGS (GitHub 경로 → 콘텐츠 제목 + 문서 유형) ──────────────
// [githubPath, contentTitle, docType, version]
// contentTitle이 null이면 해당 문서는 특정 content_item과 매핑되지 않아 건너뜀
const DOCUMENT_MAPPINGS = [
  // ── plan / 202603 ────────────────────────────────────────────────────────────
  ['plan/202603/C004_PLAN.md',                          '서울 국평 아파트 가격 비교',                      'plan', 'v1'],
  ['plan/202603/C005_PLAN.md',                          '국내 TOP 보험사 평균 연봉·성과급 비교 2026',       'plan', 'v1'],
  ['plan/202603/C006_PLAN.md',                          '국내 TOP 대형 건설사 평균 연봉·성과급 비교 2026',  'plan', 'v1'],
  ['plan/202603/C007_PLAN.md',                          '2026 이재명 정부 핵심 공직자 재산·보수 비교',      'plan', 'v1'],
  ['plan/202603/C008_PLAN.md',                          '결혼 비용 계산기',                                'plan', 'v1'],
  ['plan/202603/ai-stack-calculator-v4-plan.md',        'AI 스택 비용 계산기',                            'plan', 'v4'],
  ['plan/202603/bigyocalc_wedding_report_webplan_v3.md','결혼비용 2016 vs 2026',                          'plan', 'v3'],
  ['plan/202603/it-si-sm-salary-comparison-2026.md',    'IT SI·SM 대기업 평균 연봉·성과급 비교 2026',      'plan', 'v1'],

  // ── plan / 202604 ────────────────────────────────────────────────────────────
  ['plan/202604/baby-cost-2016-vs-2026.md',                          '아이 키우는 비용 2016 vs 2026 비교',        'plan', 'v1'],
  ['plan/202604/baby-cost-guide-first-year.md',                      '신생아~돌까지 육아 비용 총정리',            'plan', 'v1'],
  ['plan/202604/baby-growth-percentile-calculator.md',               '아기 성장 백분위 계산기',                  'plan', 'v1'],
  ['plan/202604/dca-investment-calculator-plan.md',                   '적립식 투자 수익 비교 계산기',             'plan', 'v1'],
  ['plan/202604/fire-calculator-plan.md',                             '파이어족 계산기',                         'plan', 'v1'],
  ['plan/202604/firefighter-salary-2026.md',                          '소방관 계급별 연봉·수당 비교 2026',        'plan', 'v1'],
  ['plan/202604/korean-movie-break-even-profit.md',                   '대한민국 영화 손익 비교',                  'plan', 'v1'],
  ['plan/202604/large-company-salary-growth-by-years-2026.md',        '2026 대기업 연차별 연봉 성장 비교',        'plan', 'v1'],
  ['plan/202604/nurse-salary-2026.md',                                '간호사 연차별 연봉 + 병원 규모별 비교 2026','plan', 'v1'],
  ['plan/202604/police-salary-2026.md',                               '경찰관 계급별 연봉·호봉 완전 정리 2026',   'plan', 'v1'],
  ['plan/202604/salary-asset-2016-vs-2026-webplan (1).md',            '한국인 평균 연봉·자산 2016 vs 2026 비교',  'plan', 'v1'],
  ['plan/202604/semiconductor-etf-report-plan-v1.md',                 '미국·한국 반도체 ETF 비교 2026',           'plan', 'v1'],
  ['plan/202604/semiconductor-value-chain-plan-v1.md',                '엔비디아는 왜 공장이 없을까? 반도체 산업 구조', 'plan', 'v1'],
  ['plan/202604/seoul-apartment-jeonse-report.md',                    '전세 사라지는 서울 아파트',                'plan', 'v1'],
  ['plan/202604/seoul-housing-2016-vs-2026-webplan (1).md',           '서울 집값 2016 vs 2026 비교',              'plan', 'v1'],
  ['plan/202604/wedding-gift-break-even-calculator.md',               '결혼 축의금 손익분기점 계산기',             'plan', 'v1'],
  ['plan/202604/육아휴직 + 육아기 단축근무 계산기.md',                  '육아휴직 + 육아기 단축근무 계산기',         'plan', 'v1'],

  // ── design / 202603 ──────────────────────────────────────────────────────────
  ['design/202603/C004_DESIGN.md',                           '서울 국평 아파트 가격 비교',                      'design', 'v1'],
  ['design/202603/C005_DESIGN.md',                           '국내 TOP 보험사 평균 연봉·성과급 비교 2026',       'design', 'v1'],
  ['design/202603/C006_DESIGN.md',                           '국내 TOP 대형 건설사 평균 연봉·성과급 비교 2026',  'design', 'v1'],
  ['design/202603/C007_DESIGN.md',                           '2026 이재명 정부 핵심 공직자 재산·보수 비교',      'design', 'v1'],
  ['design/202603/C008_DESIGN.md',                           '결혼 비용 계산기',                                'design', 'v1'],
  ['design/202603/it-si-sm-salary-comparison-2026-design.md','IT SI·SM 대기업 평균 연봉·성과급 비교 2026',      'design', 'v1'],

  // ── design / 202604 ──────────────────────────────────────────────────────────
  ['design/202604/baby-cost-2016-vs-2026-design.md',                    '아이 키우는 비용 2016 vs 2026 비교',         'design', 'v1'],
  ['design/202604/baby-cost-guide-first-year-design.md',                '신생아~돌까지 육아 비용 총정리',             'design', 'v1'],
  ['design/202604/baby-growth-percentile-calculator-design.md',         '아기 성장 백분위 계산기',                   'design', 'v1'],
  ['design/202604/dca-investment-calculator-design.md',                  '적립식 투자 수익 비교 계산기',              'design', 'v1'],
  ['design/202604/firefighter-salary-2026-design.md',                    '소방관 계급별 연봉·수당 비교 2026',         'design', 'v1'],
  ['design/202604/korean-movie-break-even-profit-design.md',             '대한민국 영화 손익 비교',                   'design', 'v1'],
  ['design/202604/large-company-salary-growth-by-years-2026-design.md',  '2026 대기업 연차별 연봉 성장 비교',         'design', 'v1'],
  ['design/202604/nurse-salary-2026-design.md',                          '간호사 연차별 연봉 + 병원 규모별 비교 2026', 'design', 'v1'],
  ['design/202604/parental-leave-short-work-calculator-design.md',       '육아휴직 + 육아기 단축근무 계산기',          'design', 'v1'],
  ['design/202604/police-salary-2026-design.md',                         '경찰관 계급별 연봉·호봉 완전 정리 2026',    'design', 'v1'],
  ['design/202604/salary-asset-2016-vs-2026-design.md',                  '한국인 평균 연봉·자산 2016 vs 2026 비교',   'design', 'v1'],
  ['design/202604/semiconductor-etf-report-design.md',                   '미국·한국 반도체 ETF 비교 2026',            'design', 'v1'],
  ['design/202604/semiconductor-value-chain-design.md',                  '엔비디아는 왜 공장이 없을까? 반도체 산업 구조', 'design', 'v1'],
  ['design/202604/seoul-apartment-jeonse-report-design.md',              '전세 사라지는 서울 아파트',                 'design', 'v1'],
  ['design/202604/seoul-housing-2016-vs-2026-design.md',                 '서울 집값 2016 vs 2026 비교',               'design', 'v1'],
  ['design/202604/wedding-gift-break-even-calculator-design.md',         '결혼 축의금 손익분기점 계산기',              'design', 'v1'],
];

// ─── STEP 1: content_items upsert ─────────────────────────────────────────────
async function upsertContentItems() {
  // AI 스택 계산기는 아직 배포 전 → designed 상태
  const rows = [
    ...CALCULATORS.map(c => ({
      ...c,
      content_type: 'calculator',
      user_id: USER_ID,
      target_repo: TARGET_REPO,
      target_path: c.notes ? new URL(c.notes).pathname : '',
      status: c.title === 'AI 스택 비용 계산기' ? 'designed' : 'deployed',
      priority: 1,
    })),
    ...REPORTS.map(r => ({
      ...r,
      content_type: 'report',
      user_id: USER_ID,
      target_repo: TARGET_REPO,
      target_path: r.notes ? new URL(r.notes).pathname : '',
      status: 'deployed',
      priority: 1,
    })),
  ];

  // 중복 방지: 이미 등록된 title 조회
  const { data: existing } = await supabase
    .from('content_items')
    .select('id, title')
    .eq('user_id', USER_ID);

  const existingMap = {};
  (existing || []).forEach(r => { existingMap[r.title] = r.id; });

  const toInsert = rows.filter(r => !existingMap[r.title]);

  if (toInsert.length > 0) {
    const { data, error } = await supabase
      .from('content_items')
      .insert(toInsert)
      .select('id, title');
    if (error) throw new Error(`content_items insert 오류: ${error.message}`);
    data.forEach(d => { existingMap[d.title] = d.id; });
    console.log(`  ✅ content_items: ${data.length}개 신규 등록 (기존 ${(existing||[]).length}개)`);
  } else {
    console.log(`  ✅ content_items: 모두 이미 등록됨 (${(existing||[]).length}개)`);
  }

  // target_repo / target_path 일괄 업데이트 (기존 등록 항목 포함)
  const allItems = [...CALCULATORS, ...REPORTS];
  for (const item of allItems) {
    if (!item.notes) continue;
    const path = new URL(item.notes).pathname;
    await supabase
      .from('content_items')
      .update({ target_repo: TARGET_REPO, target_path: path })
      .eq('user_id', USER_ID)
      .eq('title', item.title);
  }
  console.log(`  ✅ target_repo / target_path 업데이트 완료 (${allItems.filter(i => i.notes).length}개)`);

  return existingMap; // title → id
}

// ─── STEP 2: documents upsert ─────────────────────────────────────────────────
async function upsertDocuments(titleToId) {
  // 이미 등록된 문서 조회 (content_item_id + doc_type 조합으로 중복 체크)
  const { data: existingDocs } = await supabase
    .from('documents')
    .select('content_item_id, doc_type, version')
    .in('content_item_id', Object.values(titleToId));

  const existingSet = new Set(
    (existingDocs || []).map(d => `${d.content_item_id}__${d.doc_type}__${d.version}`)
  );

  let inserted = 0;
  let skipped = 0;
  let notFound = [];

  for (const [ghPath, contentTitle, docType, version] of DOCUMENT_MAPPINGS) {
    const contentItemId = titleToId[contentTitle];
    if (!contentItemId) {
      notFound.push(contentTitle);
      continue;
    }

    const key = `${contentItemId}__${docType}__${version}`;
    if (existingSet.has(key)) {
      skipped++;
      continue;
    }

    process.stdout.write(`  📥 ${ghPath} ...`);
    const content = await fetchRaw(encodeURI(ghPath));
    if (!content) {
      console.log(' (404, 건너뜀)');
      skipped++;
      continue;
    }

    const { error } = await supabase
      .from('documents')
      .insert({
        content_item_id: contentItemId,
        user_id: USER_ID,
        doc_type: docType,
        version,
        status: 'approved',
        file_path: `docs/${ghPath}`,
        generated_by: 'manual',
        content,
      });

    if (error) {
      console.log(` ❌ ${error.message}`);
    } else {
      console.log(' ✓');
      inserted++;
    }
  }

  console.log(`\n  ✅ documents: ${inserted}개 신규 등록, ${skipped}개 스킵`);
  if (notFound.length) {
    console.log(`  ⚠️  content_item 없음 (매핑 확인 필요):`);
    notFound.forEach(t => console.log(`     • ${t}`));
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const totalItems = CALCULATORS.length + REPORTS.length;
  const totalDocs  = DOCUMENT_MAPPINGS.length;
  console.log(`\n🚀 bigyocalc.com 콘텐츠 일괄 등록`);
  console.log(`   content_items: ${totalItems}개 (계산기 ${CALCULATORS.length} + 리포트 ${REPORTS.length})`);
  console.log(`   documents    : ${totalDocs}개 (plan ${DOCUMENT_MAPPINGS.filter(m=>m[2]==='plan').length} + design ${DOCUMENT_MAPPINGS.filter(m=>m[2]==='design').length})\n`);

  console.log('① content_items 등록 중...');
  const titleToId = await upsertContentItems();

  console.log('\n② documents 등록 중 (GitHub에서 파일 다운로드)...');
  await upsertDocuments(titleToId);

  console.log('\n🎉 완료!');
}

main().catch(err => { console.error(err); process.exit(1); });
