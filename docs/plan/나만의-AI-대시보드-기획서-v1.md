# 나만의 AI 대시보드 — 기획서 v1

문서 버전: v1.2  
문서 상태: Phase 1~5 완료 / Phase 6 진행 예정  
작성일: 2026-04-17 | 최종 수정: 2026-04-18  
대상 서비스: `ai-platform-ioil`

---

## 1. 문서 목적

본 문서는 기존 **Content Ops Dashboard** 와 완전히 분리된  
**나만의 AI 대시보드** (`/my-ai`) 기능의 기획/설계를 정의한다.

- 진입 구조 재설계 (브릿지 페이지)
- UX/UI 방향성 (일반 사용자 대상)
- 모듈 구조 및 기능 명세
- DB 스키마 설계
- 개발 우선순위 (MVP Phase)

---

## 2. 핵심 컨셉

> **"내 삶의 데이터를 입력하면, AI가 매일/매주/매월 분석 리포트를 자동으로 만들어주는 개인 비서 대시보드"**

### Content Ops vs 나만의 AI 비교

| 항목 | Content Ops Dashboard | 나만의 AI 대시보드 |
|------|----------------------|-------------------|
| 대상 | 운영자/기획자 | 일반 개인 사용자 |
| 진입 경로 | `/portal` → Content Ops | `/portal` → 나만의 AI |
| 테마 | 다크 (#080809) + 골드 | 라이트/소프트 + 퍼플 |
| UI 밀도 | 고밀도 (테이블, 필터, 배지) | 저밀도 (카드, 시각화, 쉬운 폼) |
| 레이아웃 | 전문가용 사이드바 nav | 소비자앱 스타일 탑바 + 모듈 카드 |
| 핵심 가치 | 콘텐츠 파이프라인 관리 | AI 자동 리포트 + 인사이트 |

---

## 3. 진입 구조 재설계

### AS-IS (현재)
```
/auth (로그인) → /dashboard (Content Ops)
```

### TO-BE (변경)
```
/auth (로그인) → /portal (브릿지 페이지)
                    ├── Content Ops →  /dashboard
                    └── 나만의 AI  →  /my-ai
```

### 브릿지 페이지 `/portal` 설계

- 로그인 성공 후 항상 이 페이지로 진입
- 두 개의 대형 카드로 구성 (선택 UI)
- 이전 선택 기억 (localStorage) → 재방문 시 자동 이동 옵션
- 카드 1: **Content Ops** — 다크 테마, "콘텐츠 기획·운영 도구"
- 카드 2: **나만의 AI** — 라이트/그라디언트, "나를 위한 AI 비서"

---

## 4. 페이지 구조 (IA)

```
/portal                    ← 브릿지 (서비스 선택)
/my-ai                     ← 나만의 AI 홈 (활성 모듈 + 최신 리포트)
/my-ai/setup               ← 온보딩 5단계 (모듈 선택 → 데이터 입력 → 스케줄 → 알림)
/my-ai/assets              ← 💰 자산 관리
/my-ai/budget              ← 📊 가계부
/my-ai/realestate          ← 🏠 부동산 관심 매물
/my-ai/portfolio           ← 📈 투자 포트폴리오
/my-ai/parenting           ← 👶 육아
/my-ai/health              ← 🏋️ 건강
/my-ai/career              ← 💼 커리어
/my-ai/learning            ← 📚 학습
/my-ai/news                ← 🎯 뉴스 브리핑
/my-ai/reports             ← 전체 리포트 아카이브
/my-ai/settings            ← 알림·스케줄 설정
```

---

## 5. UX/UI 방향성

### 디자인 원칙

- **색상**: 배경 `#F8F7FF` ~ `#FFFFFF`, 퍼플 액센트 `#534AB7`, 보조 `#EEEDFE`
- **타이포**: 시스템 폰트, 본문 14px, 레이블 12px, 수치 강조 18~24px
- **카드**: `border-radius: 16px`, 부드러운 그림자 (`box-shadow: 0 2px 12px rgba(0,0,0,0.06)`)
- **상태 배지**: 일간(파랑) / 주간(초록) / 월간(주황) — 색상 코드 동일하게 유지
- **폼 UX**: 입력 필드 충분한 패딩, 에러 인라인 표시, 저장 즉시 피드백
- **인터랙션**: hover 시 카드 border 강조, 버튼 `transition: all 0.15s`

### 레이아웃 구조

```
┌─────────────────────────────────────────┐
│  탑바: 로고 | 페이지 타이틀 | 프로필   │
├─────────────────────────────────────────┤
│  (모바일 고려 없음, 데스크톱 전용)      │
│                                         │
│  콘텐츠 영역 (max-width: 1100px)       │
│  ┌──────────────────────────────────┐  │
│  │  섹션별 카드 그리드               │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

---

## 6. 모듈 카탈로그

사용자가 필요한 모듈만 활성화하는 구조.

| 모듈 키 | 아이콘 | 이름 | 리포트 주기 | 핵심 입력 | 핵심 출력 |
|---------|--------|------|------------|-----------|-----------|
| `assets` | 💰 | 자산 관리 | 월간 | 부동산·주식·현금·코인·부채 | 포트폴리오 분석, 순자산 추이, AI 제언 |
| `budget` | 📊 | 가계부 | 월간 | 수입/지출 내역 | 소비 패턴, 예산 대비 분석 |
| `realestate` | 🏠 | 부동산 | 주간 | 관심 매물 등록 | 시세 변동, AI 타이밍 분석 |
| `portfolio` | 📈 | 투자 | 주간 | 주식·ETF 보유 현황 | 수익률, 리밸런싱 제언 |
| `parenting` | 👶 | 육아 | 주간 | 성장 기록, 마일스톤 | 발달 분석, 예방접종 일정 |
| `health` | 🏋️ | 건강 | 주간 | 체중·운동·수면 | 건강 트렌드, 개선 제언 |
| `career` | 💼 | 커리어 | 월간 | 연봉·스킬·목표 | 커리어 성장 분석 |
| `learning` | 📚 | 학습 | 주간 | 공부 목표·진도 | 학습 효율 분석 |
| `news` | 📰 | 뉴스 브리핑 | 매일 | 관심 키워드 | 카테고리별 뉴스 요약 |

---

## 7. 화면 상세 설계

### 7-1. 브릿지 페이지 `/portal`

**레이아웃**
- 전체 화면 세로 중앙 정렬
- 상단: "AI Platform" 로고 + 사용자 이름 인사
- 중앙: 2개 대형 선택 카드 (가로 배치)
- 하단: 로그아웃 링크

**카드 1 — Content Ops**
```
배경: linear-gradient(135deg, #0e0e0f, #1a1a1e)
보더: 1px solid rgba(200, 169, 110, 0.3)
아이콘: ⬡  (헥사곤)
제목: Content Ops
설명: 콘텐츠 기획·생성·배포 운영 도구
배지: 운영자 전용
버튼: 이동하기 →
```

**카드 2 — 나만의 AI**
```
배경: linear-gradient(135deg, #EEEDFE, #F0EFFF)
보더: 1.5px solid #534AB7
아이콘: ✦  (별)
제목: 나만의 AI
설명: AI가 자동으로 만들어주는 나만의 개인 리포트
배지: NEW
버튼: 시작하기 →  (퍼플)
```

---

### 7-2. 나만의 AI 홈 `/my-ai`

**섹션 구성**
1. **웰컴 배너** — "안녕하세요 {이름}님, 오늘의 리포트가 준비됐어요"
2. **요약 통계 (4칸)** — 총 순자산 / 이번달 지출 / 생성된 리포트 수 / 다음 리포트
3. **활성 모듈 그리드** — 모듈 카드 (클릭 → 해당 모듈 페이지)
4. **자동 스케줄 현황** — 칩 형태 (매일 06:00 뉴스 / 매주 월 08:00 부동산 / 매월 1일 자산)
5. **최근 AI 리포트** — 리스트 (클릭 → 리포트 상세)

---

### 7-3. 온보딩 `/my-ai/setup`

**5단계 스텝**
```
Step 1: 기본 정보  →  Step 2: 모듈 선택  →  Step 3: 데이터 입력
→  Step 4: 스케줄 설정  →  Step 5: 알림 설정
```

**Step 2 — 모듈 선택**
- 9개 모듈 카드 3열 그리드
- 복수 선택 가능
- 선택된 카드: 퍼플 보더 + 체크 배지

**Step 4 — 스케줄 설정**
- 뉴스 브리핑: 매일 / 평일만 + 발송 시간 선택
- 자산·가계부: 매월 1일 / 말일 + 발송 시간

**Step 5 — 알림 설정**
- 이메일 알림 ON/OFF
- 브라우저 알림 ON/OFF
- Slack 연동 ON/OFF

---

### 7-4. 자산 관리 `/my-ai/assets`

**상단 통계 (4칸)**
- 총 자산 / 총 부채 / 순자산 / 투자 수익률

**자산 구성 (2열)**
- 좌: 카테고리별 비중 바 차트 (부동산/주식/현금/코인)
- 우: 자산 항목 리스트 (아이콘 + 이름 + 금액 + 변동)

**AI 리포트 미리보기**
- 최신 월간 리포트 본문 (인라인 하이라이트 포함)

---

### 7-5. 뉴스 브리핑 `/my-ai/news`

**키워드 칩 관리**
- 등록된 키워드: 칩 (×버튼으로 삭제)
- `+ 추가` 버튼

**오늘의 브리핑**
- 날짜 레이블
- 뉴스 아이템: 카테고리 배지 + 제목 + 출처·시간

---

## 8. DB 스키마

> **마이그레이션 순서**: `schema_my_ai.sql` → `schema_my_ai_v2.sql` → `schema_my_ai_v3.sql` → `schema_my_ai_v4.sql` → `schema_my_ai_v5.sql`

```sql
-- 사용자 모듈 활성화 설정
CREATE TABLE user_modules (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users NOT NULL,
  module_key text NOT NULL,
  is_active  boolean DEFAULT true,
  config     jsonb DEFAULT '{}',
  schedule   jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, module_key)
);

-- 자산 데이터
CREATE TABLE user_assets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users NOT NULL,
  asset_type  text NOT NULL, -- 'real_estate'|'stock'|'cash'|'crypto'|'debt'
  name        text NOT NULL,
  amount      numeric NOT NULL DEFAULT 0,
  metadata    jsonb DEFAULT '{}',
  recorded_at date NOT NULL DEFAULT current_date,
  created_at  timestamptz DEFAULT now()
);

-- 가계부
CREATE TABLE budget_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users NOT NULL,
  record_type  text NOT NULL, -- 'income'|'expense'
  category     text,
  amount       numeric NOT NULL,
  memo         text,
  recorded_at  date NOT NULL DEFAULT current_date,
  created_at   timestamptz DEFAULT now()
);

-- 육아 기록
CREATE TABLE parenting_records (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users NOT NULL,
  child_name  text,
  birth_date  date,
  record_type text NOT NULL, -- 'growth'|'milestone'|'health'|'daily'
  data        jsonb DEFAULT '{}',
  recorded_at date NOT NULL DEFAULT current_date,
  created_at  timestamptz DEFAULT now()
);

-- 부동산 관심 매물
CREATE TABLE realestate_watchlist (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users NOT NULL,
  name        text NOT NULL,
  address     text,
  area_sqm    numeric,
  interest    text, -- 'buy'|'rent'
  note        text,
  created_at  timestamptz DEFAULT now()
);

-- 관심 키워드 (뉴스 브리핑)
CREATE TABLE user_keywords (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users NOT NULL,
  keyword    text NOT NULL,
  category   text,
  priority   int DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, keyword)
);

-- [v3] 월별 자산 스냅샷 (schema_my_ai_v3.sql)
-- user_asset_snapshots: snapshot_date, stock, real_estate, cash, pension, gold, crypto, other, loan_mortgage, loan_credit, loan_minus, note, detail
-- Generated Columns: total_assets, total_debt, net_worth (DB 자동 계산)
-- UNIQUE(user_id, snapshot_date)

-- [v3] 자산 목표
-- user_asset_goals: goal_type('annual'|'longterm'), name, target_amount, target_year, is_achieved, achieved_at, sort_order
-- [v4] description 컬럼 추가

-- [v3] 마일스톤 달성 기록
-- user_asset_milestones: milestone_key, label, net_worth, achieved_at, goal_id
-- UNIQUE(user_id, milestone_key)

-- [v5] user_assets asset_type CHECK 확장
-- 추가됨: pension, gold, loan_mortgage, loan_credit, loan_minus, other (legacy: debt)

-- AI 리포트 저장
CREATE TABLE ai_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users NOT NULL,
  module_key   text NOT NULL,
  report_type  text NOT NULL, -- 'daily'|'weekly'|'monthly'
  title        text NOT NULL,
  content      text NOT NULL,
  metadata     jsonb DEFAULT '{}',
  generated_at timestamptz DEFAULT now()
);

-- 스케줄러 로그
CREATE TABLE my_ai_scheduler_logs (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  status   text NOT NULL, -- 'success'|'failed'
  detail   jsonb DEFAULT '{}',
  ran_at   timestamptz DEFAULT now()
);
```

---

## 9. 백엔드 API 설계

```
# 모듈 설정
GET    /api/my-ai/modules              사용자 모듈 목록 조회
PUT    /api/my-ai/modules/:key         모듈 활성화/설정 변경

# 자산 (레거시 항목별 row)
GET    /api/my-ai/assets               자산 목록
POST   /api/my-ai/assets               자산 추가
PUT    /api/my-ai/assets/:id           자산 수정
DELETE /api/my-ai/assets/:id           자산 삭제

# 자산 스냅샷 (월별 집계 — v3 신규) ✅
GET    /api/my-ai/snapshots            스냅샷 목록 (?from=&to=&limit=)
GET    /api/my-ai/snapshots/stats      집계 통계 (MoM·YoY·CAGR·목표 예상 달성 연도)
POST   /api/my-ai/snapshots            스냅샷 저장 (upsert) + 마일스톤 자동 체크
PUT    /api/my-ai/snapshots/:id        스냅샷 수정
DELETE /api/my-ai/snapshots/:id        스냅샷 삭제

# 자산 목표 (v3 신규) ✅
GET    /api/my-ai/goals                목표 목록 (?goal_type=annual|longterm)
POST   /api/my-ai/goals                목표 추가 (연간 목표 연도당 1개 제한)
PUT    /api/my-ai/goals/:id            목표 수정
DELETE /api/my-ai/goals/:id            목표 삭제
GET    /api/my-ai/goals/milestones     마일스톤 달성 목록

# 가계부
GET    /api/my-ai/budget               가계부 목록 (월별)
POST   /api/my-ai/budget               내역 추가

# 부동산
GET    /api/my-ai/realestate           관심 매물 목록
POST   /api/my-ai/realestate           매물 추가
DELETE /api/my-ai/realestate/:id       매물 삭제

# 키워드
GET    /api/my-ai/keywords             키워드 목록
POST   /api/my-ai/keywords             키워드 추가
DELETE /api/my-ai/keywords/:id         키워드 삭제

# 범용 레코드 (portfolio/health/career/learning 공용)
GET    /api/my-ai/records              레코드 목록 (?module_key=&record_type=)
POST   /api/my-ai/records              레코드 추가
DELETE /api/my-ai/records/:id          레코드 삭제

# 리포트
GET    /api/my-ai/reports              리포트 목록 (모듈·기간 필터)
GET    /api/my-ai/reports/:id          리포트 상세
POST   /api/my-ai/reports/generate     즉시 리포트 생성 (모듈 지정)
```

---

## 10. 스케줄러 설계

```
매일  06:00 KST  →  news      뉴스 브리핑 리포트 생성
매주  월 08:00   →  realestate 부동산 주간 리포트 생성
               →  portfolio  투자 주간 리포트 생성
               →  parenting  육아 주간 리포트 생성
매월  1일 08:00  →  assets    자산 월간 리포트 생성
               →  budget     가계부 월간 리포트 생성
               →  career     커리어 월간 리포트 생성
```

Railway Cron 설정:
```
0 21 * * *    node jobs/my-ai-daily.js      (UTC 21:00 = KST 06:00)
0 23 * * 0    node jobs/my-ai-weekly.js     (UTC 23:00 Sun = KST 08:00 Mon)
0 23 L * *    node jobs/my-ai-monthly.js    (UTC 23:00 last day = KST 08:00 1st)
```

---

## 11. MVP 개발 순서

### Phase 1 — 진입 구조 + 뼈대 ✅ 완료
- [x] `/portal` 브릿지 페이지 구현 (`frontend/app/portal/page.tsx`, 299줄)
- [x] `auth/page.tsx` 리디렉트 경로 `/portal` 로 변경
- [x] `(my-ai)` 라우트 그룹 + 레이아웃 (`frontend/app/(my-ai)/layout.tsx`)
- [x] `/my-ai` 홈 페이지 (`frontend/app/(my-ai)/my-ai/page.tsx`, 299줄)
- [x] Supabase 스키마 마이그레이션 (`schema_my_ai.sql`)

### Phase 2 — 온보딩 + 모듈 설정 ✅ 완료
- [x] `/my-ai/setup` 5단계 온보딩 UI (`setup/page.tsx`, 505줄)
- [x] 모듈 활성화 API 연동 (`backend/routes/my-ai/modules.js`)
- [x] 모듈 선택 상태 저장

### Phase 3 — 자산 모듈 ✅ 완료 (고도화 포함)
- [x] `/my-ai/assets` 자산 입력 폼 + 리스트 (`assets/page.tsx`)
- [x] 자산 구성 바 차트
- [x] Claude API 연동 → 월간 리포트 생성 (`backend/routes/my-ai/reports.js`)
- [x] 리포트 저장 & 조회 + MD 파일 다운로드 (Blob)
- [x] **월별 스냅샷 CRUD** — `user_asset_snapshots` 테이블 + `routes/my-ai/snapshots.js`
  - Generated Column: `total_assets`, `total_debt`, `net_worth` DB 자동 계산
  - 집계 통계 API (`/stats`): MoM·YoY·CAGR·총 누적 증가·목표 달성 예상 연도
- [x] **자산 목표 CRUD** — `user_asset_goals` 테이블 + `routes/my-ai/goals.js`
  - goal_type: `annual`(연간) / `longterm`(장기)
  - 연간 목표 연도당 1개 제한 (API 레벨 검증)
  - `description` 컬럼 (v4 마이그레이션)
- [x] **마일스톤 자동 체크** — 스냅샷 저장 시 순자산 기준 자동 달성 기록
  - 표준: 🥉1억 / 🥈3억 / 🥇5억 / 💎10억 / 👑20억
  - 사용자 목표 달성 시 🎯🏆 자동 기록
- [x] **DB 마이그레이션**: `schema_my_ai_v3.sql`(snapshots/goals/milestones) → `v4.sql`(goal description) → `v5.sql`(asset_type CHECK 확장)

### Phase 4 — 뉴스 브리핑 ✅ 완료
- [x] `/my-ai/news` 키워드 관리 UI (`news/page.tsx`, 241줄)
- [x] Claude API → 뉴스 요약 리포트 생성
- [x] 키워드 CRUD API (`backend/routes/my-ai/keywords.js`)

### Phase 5 — 전체 모듈 UI ✅ 완료 (계획 초과 달성)
- [x] `/my-ai/realestate` 관심 매물 등록 + 주간 리포트 (310줄)
- [x] `/my-ai/parenting` 성장 기록 + 마일스톤 트래커 (333줄)
- [x] `/my-ai/budget` 가계부 수입/지출 입력 (415줄)
- [x] `/my-ai/portfolio` 투자 포트폴리오 (192줄)
- [x] `/my-ai/health` 건강 기록 (186줄)
- [x] `/my-ai/career` 커리어 관리 (186줄)
- [x] `/my-ai/learning` 학습 트래커 (191줄)
- [x] `/my-ai/reports` 리포트 아카이브 (248줄)

> **Phase 5 추가 구현**: `schema_my_ai_v2.sql` — `user_module_records` 범용 테이블 추가  
> (portfolio/health/career/learning 4개 모듈 공용, `backend/routes/my-ai/records.js` 라우트 포함)

### Phase 6 — 자동화 + 알림 ⏳ 미완료
- [ ] 스케줄러 Job 파일 작성 (`backend/jobs/my-ai-daily.js` 등)
- [ ] 매일 자동 뉴스 브리핑 스케줄러 연동
- [ ] 매주/매월 자산·부동산 리포트 자동 생성
- [ ] 이메일 알림 연동
- [ ] `/my-ai/settings` 알림·스케줄 설정 페이지

---

## 12. 파일 구조 (예정)

```
frontend/app/
├── portal/
│   └── page.tsx                 ← 브릿지 페이지 ✅
├── (my-ai)/
│   ├── layout.tsx               ← 나만의 AI 공통 레이아웃 (탑바) ✅
│   └── my-ai/
│       ├── page.tsx             ← 홈 ✅
│       ├── setup/page.tsx       ← 5단계 온보딩 ✅
│       ├── assets/page.tsx      ✅ (스냅샷·목표·마일스톤 고도화 포함)
│       ├── budget/page.tsx      ✅
│       ├── news/page.tsx        ✅
│       ├── realestate/page.tsx  ✅
│       ├── parenting/page.tsx   ✅
│       ├── portfolio/page.tsx   ✅
│       ├── health/page.tsx      ✅
│       ├── career/page.tsx      ✅
│       ├── learning/page.tsx    ✅
│       └── reports/page.tsx     ✅
backend/routes/
└── my-ai/
    ├── modules.js               ✅
    ├── assets.js                ✅
    ├── snapshots.js             ✅ (월별 스냅샷 CRUD + stats + 마일스톤 체크)
    ├── goals.js                 ✅ (자산 목표 CRUD + 마일스톤 조회)
    ├── budget.js                ✅
    ├── realestate.js            ✅
    ├── keywords.js              ✅
    ├── parenting.js             ✅
    ├── records.js               ✅ (portfolio/health/career/learning 공용)
    └── reports.js               ✅
backend/jobs/
├── my-ai-daily.js               ⏳ 미작성
├── my-ai-weekly.js              ⏳ 미작성
└── my-ai-monthly.js             ⏳ 미작성
supabase/
├── schema_my_ai.sql             ✅ (기본: user_modules, user_assets, budget_records 등)
├── schema_my_ai_v2.sql          ✅ (user_module_records 추가)
├── schema_my_ai_v3.sql          ✅ (user_asset_snapshots, user_asset_goals, user_asset_milestones)
├── schema_my_ai_v4.sql          ✅ (user_asset_goals.description 컬럼 추가)
└── schema_my_ai_v5.sql          ✅ (user_assets asset_type CHECK 확장)
```

---

## 13. 디자인 토큰 (나만의 AI 전용)

```css
/* 배경 */
--mai-bg-page:     #F8F7FF;
--mai-bg-card:     #FFFFFF;
--mai-bg-subtle:   #F4F3FF;

/* 퍼플 액센트 */
--mai-purple:      #534AB7;
--mai-purple-light:#EEEDFE;
--mai-purple-dark: #3C3489;

/* 상태 배지 색상 */
--mai-daily-bg:    #E6F1FB;  --mai-daily-text:   #185FA5;
--mai-weekly-bg:   #E1F5EE;  --mai-weekly-text:  #0F6E56;
--mai-monthly-bg:  #FAEEDA;  --mai-monthly-text: #854F0B;

/* 텍스트 */
--mai-text-primary:   #1A1830;
--mai-text-secondary: #4A4870;
--mai-text-tertiary:  #9490C0;

/* 보더 */
--mai-border:      rgba(83, 74, 183, 0.15);
--mai-border-card: rgba(0, 0, 0, 0.07);
```

---

---

## 14. 구현 현황 요약

| Phase | 내용 | 상태 |
|-------|------|------|
| Phase 1 | 진입 구조 + 뼈대 (`/portal`, `(my-ai)` 레이아웃, 홈, DB 스키마) | ✅ 완료 |
| Phase 2 | 온보딩 5단계 + 모듈 설정 API | ✅ 완료 |
| Phase 3 | 자산 모듈 + 리포트 생성 API | ✅ 완료 |
| Phase 4 | 뉴스 브리핑 + 키워드 API | ✅ 완료 |
| Phase 5 | 전체 9개 모듈 UI + 범용 records API | ✅ 완료 (계획 초과) |
| Phase 6 | 스케줄러 Jobs + 이메일 알림 + settings 페이지 | ⏳ 미완료 |

### 계획 대비 추가 구현 사항
- `portfolio`, `health`, `career`, `learning` 모듈 UI — 기획서 Phase 5 이후로 예정이었으나 선행 구현
- `user_module_records` 범용 테이블 (`schema_my_ai_v2.sql`) — 4개 모듈 데이터를 단일 테이블로 통합
- `backend/routes/my-ai/records.js` — 범용 레코드 CRUD 라우트
- **자산 관리 고도화** (계획서 별도 문서 → `자산관리-모듈-고도화-기획.md` 참조)
  - `user_asset_snapshots` 월별 스냅샷 + Generated Column (`total_assets`, `total_debt`, `net_worth`)
  - `user_asset_goals` 목표 관리 (연간/장기, 연간 목표 연도당 1개 제한)
  - `user_asset_milestones` 자동 마일스톤 기록 (1억~20억 + 사용자 목표 달성)
  - `/api/my-ai/snapshots/stats` 집계 API (MoM·YoY·CAGR·목표 예상 달성 연도)
  - MD 파일 다운로드 (Blob, 파일명: `{YYYY}년{MM}월_{이름}_자산관리_AI리포트.md`)
  - DB 마이그레이션 v3/v4/v5

### 잔여 작업 (Phase 6)
1. `backend/jobs/` 스케줄러 Job 3개 작성 (daily / weekly / monthly)
2. `/my-ai/settings` 알림·스케줄 설정 페이지
3. 이메일 알림 연동 (SendGrid 등)
4. Railway Cron 설정
5. 자산 월별 라인 차트 + 파이차트 (차트 라이브러리 도입 필요)

---

*문서 작성: 2026-04-17 | 최종 수정: 2026-04-18 (자산관리 고도화 구현 반영)*
