# AI Platform — Content Ops Dashboard
## Project Overview

기존 AI 채팅 플랫폼에 **Content Ops Dashboard**를 추가 확장한 풀스택 프로젝트.  
콘텐츠(계산기/리포트) 기획 → 문서 작성 → AI 생성 → 개발 요청 → 배포까지의 워크플로우를 관리한다.

---

## Tech Stack

| Layer | Stack |
|---|---|
| Frontend | Next.js 14 App Router, TypeScript, inline CSS (no Tailwind) |
| Backend | Express.js, Node.js (port 4000) |
| DB | Supabase (PostgreSQL) + RLS |
| Auth | Supabase Auth (JWT Bearer token) |
| AI | Anthropic Claude API (`claude-sonnet-4-6`) |
| Deploy | Railway (backend) / Vercel (frontend) |

---

## Monorepo Structure

```
ai-platform-ioil/
├── frontend/               # Next.js app (port 3000)
│   ├── app/
│   │   ├── (ops)/          # Content Ops 라우트 그룹 (공통 Sidebar 레이아웃)
│   │   │   ├── layout.tsx  # Sidebar + auth check
│   │   │   ├── dashboard/  → /dashboard
│   │   │   ├── contents/   → /contents, /contents/new, /contents/[id]/*
│   │   │   ├── jobs/       → /jobs
│   │   │   ├── documents/  → /documents
│   │   │   ├── deployments/→ /deployments
│   │   │   ├── prompt-library/ → /prompt-library
│   │   │   ├── templates/  → /templates
│   │   │   └── settings/   → /settings
│   │   ├── chat/           → /chat (기존 채팅 UI)
│   │   └── auth/           → /auth
│   ├── components/
│   │   ├── Sidebar.tsx         # 좌측 네비게이션 (collapsible)
│   │   ├── Card.tsx            # Card, CardHeader, CardTitle, EmptyState, Divider
│   │   ├── Button.tsx          # variant: primary|secondary|ghost|danger
│   │   ├── PageHeader.tsx      # title + badge + breadcrumbs + actions 슬롯
│   │   ├── StatusBadge.tsx     # ContentStatusBadge, DocStatusBadge, JobStatusBadge, DeployStatusDot
│   │   └── PipelineStepper.tsx # 파이프라인 스텝 표시 + 클릭 전환
│   └── lib/
│       ├── api.ts              # 모든 API 호출 함수 (buildQuery 헬퍼 포함)
│       └── supabase.ts         # Supabase 클라이언트
├── backend/
│   ├── index.js                # Express 앱 + 라우트 등록 + 스케줄러 시작
│   ├── lib/
│   │   ├── activity.js         # logActivity() 헬퍼
│   │   └── scheduler.js        # node-cron 자동 아이디어 생성 (매일 09:00 KST)
│   └── routes/
│       ├── auth.js, chat.js, conversations.js, tasks.js
│       ├── contents.js         # Content Ops CRUD + /transition + /stats + /check-similarity + /auto-generate
│       ├── documents.js        # 문서 CRUD + /approve
│       ├── generate.js         # AI 생성 (ideas/plan/design/dev-request)
│       ├── jobs.js             # 생성 작업 조회 + retry + skip
│       ├── git.js              # Git 변경 기록
│       ├── deployments.js      # 배포 기록 + mark-success
│       ├── activity.js         # 활동 로그 조회
│       ├── prompts.js          # 프롬프트 라이브러리 CRUD
│       └── templates.js        # 문서 템플릿 CRUD
└── supabase/
    ├── schema.sql              # 초기 스키마
    └── schema_content_ops.sql  # Content Ops DB 스키마
```

---

## Database Tables (Content Ops)

| 테이블 | 설명 |
|---|---|
| `content_items` | 콘텐츠 아이템 (title, status, content_type, category 등) |
| `content_ideas` | AI 생성 아이디어 (content_item에 연결) |
| `documents` | 문서 (plan/design/dev_request, status: draft/reviewed/approved) |
| `generation_jobs` | AI 생성 작업 큐 (status: queued/running/done/failed/skipped) |
| `git_changes` | Git 브랜치/커밋/PR 기록 |
| `deployments` | 배포 기록 (platform, environment, deploy_url) |
| `activity_logs` | 모든 변경 이벤트 로그 |
| `prompt_library` | 재사용 가능한 프롬프트 저장소 |
| `doc_templates` | 문서 생성 템플릿 |

### Content 파이프라인 상태 전환
```
idea → planned → designed → ready_dev → in_dev → deployed → archived
```
- Plan 승인 → `planned`
- Design 승인 → `designed`
- Dev Request 저장 후 수동 전환 → `ready_dev`
- 파이프라인 스텝 클릭으로 직접 전환 가능 (layout.tsx에서 처리)
- `deployed` → `archived`: 헤더 Archive 버튼
- `archived` → `idea`: 헤더 Restore 버튼

### generation_jobs status
`queued / running / done / failed / skipped`  
※ DB CHECK 제약 수동 추가 필요:
```sql
ALTER TABLE generation_jobs DROP CONSTRAINT generation_jobs_status_check;
ALTER TABLE generation_jobs ADD CONSTRAINT generation_jobs_status_check
  CHECK (status IN ('queued','running','done','failed','skipped'));
```

---

## 구현 완료된 화면 (전체)

| Phase | 화면 | 경로 | 상태 |
|---|---|---|---|
| Phase 1 | DB Schema | `supabase/schema_content_ops.sql` | ✅ |
| Phase 2 | 백엔드 API 전체 | `backend/routes/*.js` | ✅ |
| Phase 3 | 레이아웃 + 공통 컴포넌트 | `components/`, `(ops)/layout.tsx` | ✅ |
| Phase 4 P0 | Dashboard | `/dashboard` | ✅ |
| Phase 4 P0 | Contents List | `/contents` | ✅ |
| Phase 4 P0 | New Content Wizard | `/contents/new` | ✅ |
| Phase 4 P0 | Content Overview | `/contents/[id]/overview` | ✅ |
| Phase 4 P0 | Plan 탭 | `/contents/[id]/plan` | ✅ |
| Phase 4 P0 | Design 탭 | `/contents/[id]/design` | ✅ |
| Phase 4 P0 | Dev Request 탭 | `/contents/[id]/dev-request` | ✅ |
| Phase 4 P1 | Ideas 탭 | `/contents/[id]/ideas` | ✅ |
| Phase 4 P1 | Git 탭 | `/contents/[id]/git` | ✅ |
| Phase 4 P1 | Deploy 탭 | `/contents/[id]/deploy` | ✅ |
| Phase 4 P1 | Activity 탭 | `/contents/[id]/activity` | ✅ |
| Phase 4 P1 | Jobs 목록 | `/jobs` | ✅ |
| Phase 5 | Documents 목록 | `/documents` | ✅ |
| Phase 5 | Deployments 목록 | `/deployments` | ✅ |
| Phase 5 | Prompt Library | `/prompt-library` | ✅ |
| Phase 5 | Templates | `/templates` | ✅ |
| Phase 5 | Settings | `/settings` | ✅ |

---

## 주요 규칙 & 패턴

### API 호출 (frontend/lib/api.ts)
- `buildQuery(params)` 헬퍼 반드시 사용 — `undefined` 값이 `"undefined"` 문자열로 직렬화되는 버그 방지
- 절대 `new URLSearchParams(params as any)` 직접 사용 금지

### 백엔드 인증
- 모든 라우트에 `requireAuth` 미들웨어 적용
- Supabase service role key로 DB 접근 (RLS 우회 가능)
- `req.user.sub` = Supabase user UUID

### UI 디자인 원칙
- 배경: `#080809` (거의 검정)
- 골드 액센트: `#c8a96e`
- 글라스모피즘: `rgba(255,255,255,0.03~0.05)` 배경, `rgba(255,255,255,0.06~0.08)` 보더
- 절대 Tailwind 사용 금지 — 모든 스타일 inline CSS
- 모바일 대응 없음, 데스크톱 전용

### Content [id] 탭 레이아웃
- `frontend/app/(ops)/contents/[id]/layout.tsx` 에서 탭 네비게이션 + 상태 전환 관리
- 새 탭 추가 시 layout.tsx의 `TABS` 배열에 추가 필요
- 파이프라인 스텝 클릭 → `handleTransition()` → `transitionContent()` API 호출

### PipelineStepperFull (PipelineStepper.tsx)
- `onTransition?: (status: ContentStatus) => void` — 클릭 핸들러
- `transitioning?: boolean` — 전환 중 비활성화
- 현재 스텝 제외 모두 클릭 가능, archived는 스텝에 없고 헤더 버튼으로 처리

### JSON 파싱 (parseJsonSafe)
Claude API 응답이 ```json 마크다운 블록으로 감싸지는 경우 대비:
```javascript
function parseJsonSafe(text) {
  const stripped = text.replace(/^```json?\s*/im, '').replace(/```\s*$/im, '').trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}
```
`generate.js`와 `contents.js` 양쪽에 동일하게 적용.

### AI 생성 패턴 (backend/routes/generate.js)
- `runJob(supabase, userId, contentItemId, jobType, generatorFn)` 헬퍼 사용
- 생성 결과는 `documents` 테이블에 저장
- 각 생성 후 `logActivity()` 호출
- Design 생성 시 `doc_templates`에서 템플릿 조회 후 systemPrompt에 주입

### 자동 아이디어 생성 스케줄러 (backend/lib/scheduler.js)
- `node-cron` 사용, 매일 UTC 00:00 (KST 09:00) 실행
- `SCHEDULER_USER_ID` 환경변수 필수 (Railway Variables에 설정)
- 계산기 1개 + 리포트 1개 생성 (Claude 1 call → 2 content_items → 2 ideas)
- 카테고리 로테이션: 최근 10개에 없는 PRIORITY_CATEGORIES 우선 선택
- notes 필드: `제휴 힌트: {hint}\n확장 시리즈: {expansion}` 형식으로 저장
- activity_logs metadata: `{ scores, auto_generated: true }`

### 콘텐츠 유사도 체크 (POST /api/contents/check-similarity)
- 새 콘텐츠 등록 전 자동 실행
- score 0~50: ok (통과), 51~75: warn (경고 배너, "그래도 계속" 가능), 76+: block (제목 수정 필요)

### 목록 페이지 패턴
- `PageHeader` + 통계 카드 + 필터 바 + 테이블/카드 그리드 구성
- 우측 Detail 패널 (prompt-library, templates): `selected` state로 분할 레이아웃

### Activity 로그 이벤트 타입
- `content_created`, `document_generated`, `idea_generated`, `job_failed`
- 백엔드 응답: `{ data: [...], total: N }` → 프론트에서 `res?.data ?? []` 로 파싱

---

## 로컬 개발

```bash
# 백엔드
cd backend && npm run dev  # port 4000

# 프론트엔드
cd frontend && npm run dev  # port 3000
```

### 환경변수
- `frontend/.env.local`: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `backend/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`, `SCHEDULER_USER_ID`

### DB 초기화
Supabase SQL Editor에서 순서대로 실행:
1. `supabase/schema.sql`
2. `supabase/schema_content_ops.sql`

---

## 알려진 버그 & 해결된 이슈

| 이슈 | 상태 | 해결 |
|---|---|---|
| URLSearchParams undefined → "undefined" 문자열 직렬화 | ✅ 해결 | `buildQuery()` 헬퍼로 교체 |
| `/dashboard` 라우트 충돌 (`app/dashboard/` vs `app/(ops)/dashboard/`) | ✅ 해결 | `app/dashboard/` 디렉토리 삭제 |
| deployments 페이지 TypeScript `unknown` 타입 오류 | ✅ 해결 | `byPlatform: Record<string, number>` 명시적 타입 선언 |
| Activity 탭 "아직 활동 기록이 없습니다" | ✅ 해결 | `res?.data ?? []` 파싱 수정 |
| Activity 탭 ● 아이콘 (fallback) | ✅ 해결 | ACTION_META 키를 실제 event_type 값으로 수정 |
| Jobs skip 시 DB CHECK 제약 오류 | ✅ 해결 | ALTER TABLE로 'skipped' 추가 (수동 실행 필요) |
| Claude API JSON 응답 마크다운 블록 파싱 실패 | ✅ 해결 | `parseJsonSafe()` 헬퍼 적용 |
| Deploy 탭 배포 목록 빈 화면 | ✅ 해결 | `res?.data ?? []` 파싱 수정 |
