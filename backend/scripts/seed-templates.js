/**
 * doc_templates 시드 스크립트
 * 리포트·계산기 Plan/Design 표준 템플릿을 DB에 등록합니다.
 *
 * 실행:
 *   PowerShell> $env:USER_ID="<your-uuid>"; node scripts/seed-templates.js
 *   bash>       USER_ID=<your-uuid> node scripts/seed-templates.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const USER_ID = process.env.USER_ID;
if (!USER_ID) { console.error('❌ USER_ID 환경변수를 설정하세요.'); process.exit(1); }

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─────────────────────────────────────────────────────────────────────────────
const TEMPLATES = [

  // ══════════════════════════════════════════════════════════════════════════
  // 1. 리포트 — Plan 템플릿
  // ══════════════════════════════════════════════════════════════════════════
  {
    name: '리포트 기획서 표준',
    doc_type: 'plan',
    content_type: 'report',
    is_default: true,
    content: `# {콘텐츠명} — 기획서

## 1. 문서 개요

| 항목 | 내용 |
|------|------|
| 문서명 | {콘텐츠명} |
| slug | {slug} |
| URL | /reports/{slug}/ |
| 콘텐츠 유형 | 인터랙티브 비교 리포트 |
| 목표 | {목표} |
| 핵심 타깃 | {타깃} |
| 주요 키워드 | {키워드1}, {키워드2}, {키워드3} |
| 내부 링크 | {관련 계산기·리포트} |
| 우선순위 | 상 / 중 / 하 |

---

## 2. 기획 배경

이 콘텐츠가 필요한 이유와 검색 수요 근거를 기술합니다.

- 검색 수요: {월간 검색량 또는 트렌드}
- 경쟁 콘텐츠: {경쟁 페이지 분석}
- 비교계산소 포맷 적합성: {이유}

---

## 3. 핵심 방향

### 3-1. 가장 중요한 기획 원칙

{핵심 원칙 1~2가지 — 예: "직접 비교 가능한 수치 중심"}

### 3-2. 핵심 데이터 포인트 (KPI 4개 선정)

Hero 섹션에 노출할 가장 임팩트 있는 수치 4개:

1. {KPI 1}: {값} — {이유}
2. {KPI 2}: {값} — {이유}
3. {KPI 3}: {값} — {이유}
4. {KPI 4}: {값} — {이유}

### 3-3. 비교 축 설계

메인 비교 섹션(D)에서 다룰 비교 축:

- 축 1: {예: 초등 vs 중학교 vs 고등학교}
- 축 2: {예: 공립 vs 사립}
- 축 3: {예: 정규직 vs 계약직}

---

## 4. 섹션 구조 계획

표준 14개 섹션(A~N) 중 이 콘텐츠에서 채울 내용:

| 섹션 | 명칭 | 핵심 내용 |
|------|------|-----------|
| A | Hero | eyebrow: "{카테고리}", title: "{제목}", desc: "{설명}" |
| B | InfoNotice | 데이터 출처, 추정 기준, 주의사항 |
| C | KPI Cards | {KPI1} / {KPI2} / {KPI3} / {KPI4} |
| D | 메인 비교 | {주요 비교 대상들 — 카드 그리드} |
| E | 상세 테이블 | {테이블 구조 — 요약 + 전체 펼치기} |
| F | 바 차트 | {차트 제목 및 X/Y 축 내용} |
| G | 탭 UI | {탭 분류 — 예: 고정/역할/연간} |
| H | 비교 테이블 | {2열 비교 항목} |
| I | 시뮬레이션 | {시뮬레이션 축 및 변수} |
| J | 업무강도 | {비교 항목 및 기준} |
| K | 총보상 | {기본급+수당+기타 구성} |
| L | 진입경로 | {경로별 자격·조건} |
| M | FAQ | {예상 질문 6~8개} |
| N | 관련 링크 | {연결할 계산기·리포트 6개} |

---

## 5. 데이터 수집 계획

### 5-1. 공식 출처

- {출처 1}: {URL 또는 문서명}
- {출처 2}: {URL 또는 문서명}

### 5-2. 추정치 기준

- 세후 실수령: {공제 기준 — 예: 미혼·부양가족 없음, 4대보험+소득세}
- 예상 연봉: {포함 항목 — 예: 기본급+고정수당+명절휴가비}

### 5-3. 배지 구분

| 배지 | 의미 |
|------|------|
| 공식 | 정부·기관 고시 수치 |
| 추정 | 계산식 기반 추정치 |
| 참고 | 일반적 경향, 편차 있음 |
| 편집부 기준 | 정량화 불가 상대 평가 |

---

## 6. SEO 전략

### 6-1. 메타 정보

- Title: {제목} | 비교계산소
- Description: {160자 이내 — 핵심 수치 포함}

### 6-2. h2 키워드 배치

- {섹션 D} h2: {키워드 포함 소제목}
- {섹션 E} h2: {키워드 포함 소제목}
- {섹션 M} h2: {FAQ 소제목}

### 6-3. 구조화 데이터

- FAQPage 스키마 (섹션 M)
- SeoContent 컴포넌트 (페이지 하단)

---

## 7. 파생 콘텐츠 계획

이 리포트 이후 이어서 만들 콘텐츠:

1. {파생 콘텐츠 1 — 예: 특정 직군 심화 리포트}
2. {파생 콘텐츠 2}
`,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 2. 리포트 — Design 템플릿
  // ══════════════════════════════════════════════════════════════════════════
  {
    name: '리포트 설계서 표준',
    doc_type: 'design',
    content_type: 'report',
    is_default: true,
    content: `# {콘텐츠명} — 화면 설계서

> 기획 원문: \`docs/plan/{yyyymm}/{slug}.md\`
> 작성일: {date}
> 구현 기준: Claude Code가 이 문서를 보고 바로 구현에 착수할 수 있는 수준

---

## 1. 파일 구조

| 역할 | 경로 |
|------|------|
| 데이터 | \`src/data/{camelCase}.ts\` |
| 페이지 | \`src/pages/reports/{slug}/index.astro\` |
| 스타일 | \`src/styles/scss/pages/_{slug}.scss\` |
| 스크립트 | \`public/scripts/{slug}.js\` |
| 레지스트리 | \`src/data/reports.ts\` (order: {N}) |
| 사이트맵 | \`public/sitemap.xml\` |

- **CSS prefix**: \`{prefix}-\`
  예: \`.{prefix}-kpi-grid\`, \`.{prefix}-level-card\`, \`.{prefix}-faq-list\`
- **참고 구현체**: \`police-salary-2026\`, \`nurse-salary-2026\`, \`teacher-salary-2026\`

---

## 2. TypeScript 데이터 구조

\`\`\`ts
// src/data/{camelCase}.ts

// ─── 타입 정의 ───────────────────────────────────────
export type {Name}Row = {
  id: string;
  name: string;
  // ...핵심 수치 필드들
};

export type {Name}Allowance = {
  name: string;
  amount: string;
  condition: string;
  basis: string;
  type: 'fixed' | 'role' | 'annual';
};

// ─── SEO / Hero ──────────────────────────────────────
export const {PREFIX}_META = {
  title: '{SEO title} | 비교계산소',
  description: '{SEO description 160자 이내}',
} as const;

export const {PREFIX}_HERO_STATS = {
  {kpi1Key}: {값},
  {kpi2Key}: {값},
  {kpi3Key}: {값},
  {kpi4Key}: {값},
} as const;

// ─── 메인 데이터 ─────────────────────────────────────
export const {ITEMS}: {Name}Row[] = [
  // 데이터 배열
];

// ─── 비교 데이터 ─────────────────────────────────────
export const {ALLOWANCES}: {Name}Allowance[] = [
  // 수당/항목 배열
];
\`\`\`

---

## 3. 섹션 설계 (A~N)

### A. Hero
\`\`\`astro
<CalculatorHero
  eyebrow="{카테고리 — 예: 직업·연봉 리포트}"
  title="{페이지 제목}"
  description="{부제목 — 데이터 기준·비교 대상 명시}"
/>
\`\`\`

### B. InfoNotice
\`\`\`astro
<InfoNotice
  title="데이터 기준 안내"
  lines={[
    "{출처 명시 — 예: 인사혁신처 2026년 고시 기준}",
    "{추정 기준 — 예: 미혼·부양가족 없음 기준 세후 추정}",
    "{변동 안내 — 예: 수당은 조건에 따라 편차 있음}",
  ]}
/>
\`\`\`

### C. KPI Cards
\`\`\`
grid: repeat(auto-fit, minmax(145px, 1fr))
\`\`\`

| 카드 | label | value | badge |
|------|-------|-------|-------|
| 1 | {label} | {value} | 공식 |
| 2 | {label} | {value} | 공식 |
| 3 | {label} | {value} | 추정 |
| 4 | {label} | {value} | 공식 |

출처 주석: \`<p class="{prefix}-source-note">출처: {출처}</p>\`

### D. 메인 비교 (카드 그리드)
\`\`\`
grid: repeat(auto-fill, minmax(220px, 1fr))
\`\`\`

각 카드 구성:
- 상단 색상 바 (컬러 변수: \`--{prefix}-color-{name}\`)
- 이름 + 배지
- 시작 조건
- 기본 수치 (공식 배지)
- 체감 범위 (추정 배지)
- "상세 보기" 아코디언 토글

### E. 상세 테이블

요약 테이블 (기본 표시, 대표 7~10개 행):
| 구간 | {col2} | {col3} | {col4} |

"전체 펼치기" 토글 버튼 → 전체 행 hidden 패널 표시

하이라이트 행: \`.{prefix}-row--highlight\` (기준 행)

### F. 바 차트
\`\`\`html
<canvas id="{prefix}-annual-chart"
  data-labels={JSON.stringify(chartLabels)}
  data-values={JSON.stringify(chartData)}
></canvas>
\`\`\`

chart.js 설정:
- type: 'bar'
- color: '{색상 hex}'
- tooltip: 만원 단위 포맷

### G. 탭 UI
탭 버튼: \`role="tablist"\`, \`.{prefix}-tab.is-active\`

| 탭 | 내용 |
|----|------|
| {탭1} | {설명} |
| {탭2} | {설명} |
| {탭3} | {설명} |

### H. 비교 테이블 (2열)

| 항목 | {A} | {B} |
|------|-----|-----|
| {항목1} | | |
| {항목2} | | |

### I. 시뮬레이션 차트
컨트롤: {변수1} / {변수2} (버튼 그룹, \`.{prefix}-sim-btn.is-active\`)

\`\`\`html
<canvas id="{prefix}-sim-chart"
  data-{var1}={JSON.stringify(data1)}
  data-{var2}={JSON.stringify(data2)}
  data-labels={JSON.stringify(labels)}
></canvas>
\`\`\`

### J. 업무강도·조건 비교

| 항목 | {분류1} | {분류2} | {분류3} |
|------|---------|---------|---------|

셀 클래스: \`.{prefix}-cell--{level}\`
레벨: very-high / high / mid-high / mid / low

### K. 총보상 패키지
| 경력 구간 | 기본급 기준 세전 | 수당 포함 추정 | 비고 |

### L. 진입경로 카드 그리드
\`\`\`
grid: repeat(auto-fill, minmax(200px, 1fr))
\`\`\`

각 카드: 경로명 / 자격 / 시작 조건 / 설명

### M. FAQ
\`\`\`html
<!-- FAQPage 스키마 적용 -->
<div itemscope itemtype="https://schema.org/FAQPage">
  {items.map(item => (
    <div itemscope itemprop="mainEntity"
         itemtype="https://schema.org/Question">
      <button class="{prefix}-faq-q" aria-expanded="false">
        {item.q}
      </button>
      <div class="{prefix}-faq-a" hidden>
        <p itemprop="text">{item.a}</p>
      </div>
    </div>
  ))}
</div>
\`\`\`

FAQ 6~8개 예시:
1. {Q1}
2. {Q2}
3. {Q3}

### N. 관련 링크 + SeoContent
링크 카드 6개 (계산기 2개 + 관련 리포트 3개 + 전체 리포트):

\`\`\`astro
<SeoContent
  introTitle="{SEO 소개 제목}"
  intro={["{문단1}", "{문단2}", "{문단3}"]}
  criteria={["{기준1}", "{기준2}", "{기준3}"]}
  faq={faqItems}
  related={[...]}
/>
\`\`\`

---

## 4. 인터랙션 설계 (\`public/scripts/{slug}.js\`)

### 아코디언 (레벨 카드 상세 / FAQ)
\`\`\`js
// 카드 클릭 → .{prefix}-panel hidden 토글
// FAQ 버튼 → .{prefix}-faq-a hidden 토글
// aria-expanded 동기화
\`\`\`

### 탭 전환
\`\`\`js
// .{prefix}-tab 클릭 → data-tab 매칭 패널 show/hide
// is-active 클래스 토글
\`\`\`

### 호봉/상세 테이블 펼치기
\`\`\`js
// #{prefix}-toggle 버튼 → #{prefix}-full hidden 토글
// aria-expanded, 버튼 텍스트 업데이트
\`\`\`

### Chart.js 초기화
\`\`\`js
// DOMContentLoaded 후 canvas.dataset에서 데이터 파싱
// 바 차트 + 라인 시뮬레이션 차트 각각 초기화
\`\`\`

---

## 5. CSS 구조 (\`src/styles/scss/pages/_{slug}.scss\`)

\`\`\`scss
.{prefix}-page {
  --{prefix}-color-{name1}: #hex;
  --{prefix}-color-{name2}: #hex;
  // ... 분류별 컬러 변수
}

// KPI
.{prefix}-kpi-grid { ... }
.{prefix}-kpi-card { ... }

// 메인 비교 카드
.{prefix}-level-grid { ... }
.{prefix}-level-card { ... }
.{prefix}-level-bar  { ... }
.{prefix}-level-panel { ... }

// 테이블
.{prefix}-hobong-table { ... }
.{prefix}-row--highlight { ... }

// 수당 탭
.{prefix}-allowance-tabs { ... }
.{prefix}-allowance-card { ... }

// 비교 테이블
.{prefix}-pp-table { ... }

// 시뮬레이션
.{prefix}-sim-controls { ... }
.{prefix}-sim-btn { &.is-active { ... } }

// 업무강도 셀
.{prefix}-cell--very-high { color: #b81c1c; background: #fff0f0; }
.{prefix}-cell--high      { color: #c05c00; background: #fff5ec; }
.{prefix}-cell--mid-high  { color: #8b6d00; background: #fffaed; }
.{prefix}-cell--mid       { color: #2a7a2a; background: #f0f8ee; }
.{prefix}-cell--low       { color: #5f6674; background: #f5f5f5; }

// FAQ
.{prefix}-faq-list { ... }
.{prefix}-faq-q    { ... }
.{prefix}-faq-a    { ... }

// 관련 링크
.{prefix}-link-grid { ... }
.{prefix}-link-card { ... }

// 반응형
@media (max-width: 600px) { ... }
@media (max-width: 380px) { ... }
\`\`\`

---

## 6. reports.ts 등록

\`\`\`ts
{
  slug: '{slug}',
  title: '{제목}',
  description: '{설명}',
  category: '{카테고리}',
  tags: ['{tag1}', '{tag2}'],
  order: {N},
  publishedAt: '{YYYY-MM-DD}',
}
\`\`\`

---

## 7. QA 체크리스트

- [ ] \`npm run build\` 오류 없음
- [ ] \`/reports/{slug}/\` 200 응답
- [ ] 모바일 375px 레이아웃 확인
- [ ] Chart.js 바 차트 렌더링
- [ ] 시뮬레이션 차트 컨트롤 동작
- [ ] FAQ 아코디언 aria-expanded 동기화
- [ ] 레벨 카드 아코디언 동작
- [ ] 수당 탭 전환
- [ ] 호봉표 전체 펼치기
- [ ] reports.ts 등록 확인
- [ ] sitemap.xml URL 추가 확인
`,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 3. 계산기 — Plan 템플릿
  // ══════════════════════════════════════════════════════════════════════════
  {
    name: '계산기 기획서 표준',
    doc_type: 'plan',
    content_type: 'calculator',
    is_default: true,
    content: `# {콘텐츠명} — 기획서

## 1. 문서 개요

| 항목 | 내용 |
|------|------|
| 문서명 | {콘텐츠명} |
| slug | {slug} |
| URL | /tools/{slug}/ |
| 콘텐츠 유형 | 인터랙티브 계산기 |
| 레이아웃 쉘 | SimpleToolShell / CompareToolShell / TimelineToolShell |
| 목표 | |
| 핵심 타깃 | |
| 주요 키워드 | |
| 우선순위 | |

---

## 2. 핵심 기능 정의

### 2-1. 입력 필드

| 필드명 | 타입 | 단위 | 기본값 | 설명 |
|--------|------|------|--------|------|
| {input1} | number/select | {단위} | {기본값} | |
| {input2} | | | | |

### 2-2. 계산 로직

\`\`\`
{수식 또는 계산 플로우}
\`\`\`

### 2-3. 결과 출력

| 결과 항목 | 설명 | 단위 |
|-----------|------|------|
| {result1} | | |
| {result2} | | |

---

## 3. 레이아웃 쉘 선택

- **선택**: {SimpleToolShell / CompareToolShell / TimelineToolShell}
- **이유**: {선택 이유}

### SimpleToolShell
- 입력 → 결과 단방향, 단순 구조
- 적합: 1~3개 입력, 결과 명확한 경우

### CompareToolShell
- 좌: 입력 패널 / 우: 결과 패널 분리
- 적합: 입력이 많거나 결과 시각화 필요한 경우

### TimelineToolShell
- 시간축 기반 추이 구조
- 적합: 복리·연차·기간 계산

---

## 4. UI 구성

### 4-1. 입력 영역
{입력 UI 구조 설명}

### 4-2. 결과 영역
{결과 UI 구조 — 수치 강조, 차트, 부연 설명}

### 4-3. 부가 정보
{메모, 주의사항, 관련 계산기 링크}

---

## 5. SEO 전략

- Title: {제목} 계산기 | 비교계산소
- Description: {설명}
- 주요 키워드: {키워드}

---

## 6. 내부 링크

- {관련 계산기 1}
- {관련 리포트 1}
`,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 4. 계산기 — Design 템플릿
  // ══════════════════════════════════════════════════════════════════════════
  {
    name: '계산기 설계서 표준',
    doc_type: 'design',
    content_type: 'calculator',
    is_default: true,
    content: `# {콘텐츠명} — 화면 설계서

> 작성일: {date}
> 구현 기준: Claude Code가 이 문서를 보고 바로 구현에 착수할 수 있는 수준

---

## 1. 파일 구조

| 역할 | 경로 |
|------|------|
| 페이지 | \`src/pages/tools/{slug}/index.astro\` |
| 레지스트리 | \`src/data/tools.ts\` (항목 추가) |
| 계산 로직 | \`src/scripts/{slug}.js\` |
| 스타일 | \`src/styles/scss/pages/_{slug}.scss\` |

- **레이아웃 쉘**: \`{ToolShell이름}\`
- **React Island**: \`client:load\` / \`client:visible\`

---

## 2. tools.ts 등록 항목

\`\`\`ts
{
  slug: '{slug}',
  title: '{제목}',
  description: '{설명}',
  category: '{카테고리}',
  tags: ['{tag1}', '{tag2}'],
  order: {N},
  icon: '{icon}',
  isNew: false,
}
\`\`\`

---

## 3. Astro 페이지 구조

\`\`\`astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import {ToolShell이름} from '../../components/{ToolShell이름}.astro';
import SeoContent from '../../components/SeoContent.astro';
import { META } from '../../data/{camelCase}';
---

<BaseLayout title={META.title} description={META.description}>
  <{ToolShell이름}
    title="{제목}"
    description="{설명}"
  >
    <!-- 계산기 컴포넌트 (React Island) -->
    <{ComponentName} client:load />
  </{ToolShell이름}>

  <SeoContent ... />
</BaseLayout>
\`\`\`

---

## 4. 계산 로직 (\`src/scripts/{slug}.js\`)

### 4-1. 입력 이벤트

\`\`\`js
// 입력 필드별 이벤트 리스너
// input / change / keyup → calculate() 호출
\`\`\`

### 4-2. 계산 함수

\`\`\`js
function calculate() {
  const {input1} = parseFloat(document.getElementById('{id1}').value);
  // ...계산 로직
  const result = {수식};
  updateDisplay(result);
}
\`\`\`

### 4-3. 결과 업데이트

\`\`\`js
function updateDisplay(result) {
  document.getElementById('{resultId}').textContent =
    result.toLocaleString('ko-KR');
}
\`\`\`

---

## 5. 상태 흐름

\`\`\`
초기 렌더 (기본값으로 계산 결과 표시)
  → 사용자 입력 변경
  → 입력 유효성 검사
  → calculate() 실행
  → DOM 업데이트 (결과 수치 + 보조 텍스트)
  → (선택) Chart 업데이트
\`\`\`

---

## 6. CSS 구조

\`\`\`scss
// prefix: {prefix}-

.{prefix}-calculator { ... }

.{prefix}-input-group {
  label { ... }
  input, select { ... }
}

.{prefix}-result-panel {
  .{prefix}-result-value { font-size: 2rem; font-weight: 800; }
  .{prefix}-result-label { }
}

.{prefix}-note { font-size: 0.8rem; color: #888; }

@media (max-width: 600px) { ... }
\`\`\`

---

## 7. QA 체크리스트

- [ ] \`npm run build\` 오류 없음
- [ ] \`/tools/{slug}/\` 200 응답
- [ ] 기본값으로 계산 결과 즉시 표시
- [ ] 입력 변경 시 실시간 업데이트
- [ ] 모바일 375px 레이아웃
- [ ] 0·음수 입력 예외처리
- [ ] tools.ts 등록 확인
`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n📋 doc_templates 시드 시작 (user_id: ${USER_ID})\n`);

  // 기존 템플릿 삭제 (같은 user_id + name)
  for (const t of TEMPLATES) {
    await supabase
      .from('doc_templates')
      .delete()
      .eq('user_id', USER_ID)
      .eq('name', t.name);
  }

  // 삽입
  const rows = TEMPLATES.map(t => ({ ...t, user_id: USER_ID }));
  const { data, error } = await supabase
    .from('doc_templates')
    .insert(rows)
    .select('id, name, doc_type, content_type, is_default');

  if (error) {
    console.error('❌ 삽입 실패:', error.message);
    process.exit(1);
  }

  console.log('✅ 등록 완료:\n');
  data.forEach(r => {
    const def = r.is_default ? ' ★ default' : '';
    console.log(`  [${r.doc_type.padEnd(10)}] [${(r.content_type || 'common').padEnd(10)}] ${r.name}${def}`);
  });
  console.log(`\n총 ${data.length}개 템플릿 등록.\n`);
}

main();
