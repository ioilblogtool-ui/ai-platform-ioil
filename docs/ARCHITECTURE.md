# ARCHITECTURE.md — 코드 구조 전체 지도

> 새 파일을 추가하거나 기존 파일을 수정하기 전에 이 파일을 먼저 읽어라.
> 각 레이어의 역할과 경계를 명확히 이해한 뒤 작업하라.

---

## 시스템 개요

```
Browser (Next.js 14)
      │  HTTP + Supabase Auth JWT
      ▼
Express.js API (port 4000)
      │  Supabase service role
      ▼
PostgreSQL (Supabase)
      │  Anthropic API
      ▼
Claude claude-sonnet-4-6
```

---

## 디렉토리 구조 전체 지도

```
ai-platform-ioil/
│
├── frontend/                        ← Next.js 14 App Router
│   ├── app/
│   │   ├── layout.tsx               ← 루트 레이아웃 (폰트·전역 CSS)
│   │   ├── page.tsx                 ← / 루트 (→ /dashboard 리디렉트)
│   │   ├── auth/                    ← /auth (로그인·회원가입)
│   │   ├── chat/                    ← /chat (기존 채팅 UI — Content Ops와 독립)
│   │   └── (ops)/                   ← Content Ops 라우트 그룹
│   │       ├── layout.tsx           ← Sidebar + 인증 체크 (공통 래퍼)
│   │       ├── dashboard/           ← /dashboard
│   │       ├── contents/
│   │       │   ├── page.tsx         ← /contents (목록)
│   │       │   ├── new/             ← /contents/new (위자드)
│   │       │   └── [id]/
│   │       │       ├── layout.tsx   ← 탭 네비게이션 + 파이프라인 스텝 + 상태 전환
│   │       │       ├── overview/    ← 콘텐츠 상세 개요
│   │       │       ├── ideas/       ← AI 생성 아이디어
│   │       │       ├── plan/        ← Plan 문서 생성·조회
│   │       │       ├── design/      ← Design 문서 생성·조회
│   │       │       ├── dev-request/ ← Dev Request 문서 생성·조회
│   │       │       ├── git/         ← Git 브랜치·PR 기록
│   │       │       ├── deploy/      ← 배포 기록
│   │       │       └── activity/    ← 활동 로그
│   │       ├── jobs/                ← /jobs (생성 작업 큐)
│   │       ├── documents/           ← /documents (전체 문서 목록)
│   │       ├── deployments/         ← /deployments (전체 배포 목록)
│   │       ├── prompt-library/      ← /prompt-library (프롬프트 저장소)
│   │       ├── templates/           ← /templates (문서 템플릿)
│   │       └── settings/            ← /settings
│   │
│   ├── components/                  ← 공용 UI 컴포넌트
│   │   ├── Sidebar.tsx              ← 좌측 접이식 네비게이션
│   │   ├── Card.tsx                 ← Card, CardHeader, CardTitle, EmptyState, Divider
│   │   ├── Button.tsx               ← variant: primary|secondary|ghost|danger
│   │   ├── PageHeader.tsx           ← title + badge + breadcrumbs + actions 슬롯
│   │   ├── StatusBadge.tsx          ← ContentStatusBadge, DocStatusBadge, JobStatusBadge, DeployStatusDot
│   │   ├── PipelineStepper.tsx      ← 파이프라인 스텝 표시 + 클릭 전환
│   │   ├── MarkdownPreview.tsx      ← marked 기반 마크다운 렌더링
│   │   └── Skeleton.tsx             ← 로딩 스켈레톤
│   │
│   ├── lib/
│   │   ├── api.ts                   ← 모든 API 호출 함수 + buildQuery() 헬퍼
│   │   └── supabase.ts              ← Supabase 클라이언트 (인증용)
│   │
│   └── hooks/
│       └── useJobPoller.ts          ← 생성 작업 4초 폴링
│
├── backend/                         ← Express.js (port 4000)
│   ├── index.js                     ← 앱 초기화, 라우트 마운트, 스케줄러 시작
│   ├── middleware/
│   │   └── auth.js                  ← requireAuth (JWT 검증 → req.user)
│   ├── lib/
│   │   ├── supabase.js              ← Supabase 서비스 롤 클라이언트
│   │   ├── activity.js              ← logActivity(supabase, userId, ...) 헬퍼
│   │   └── scheduler.js             ← node-cron 매일 KST 09:00 아이디어 자동 생성
│   └── routes/
│       ├── auth.js                  ← POST /api/auth/*
│       ├── chat.js                  ← POST /api/chat
│       ├── conversations.js         ← GET|POST|DELETE /api/conversations/*
│       ├── tasks.js                 ← GET|POST /api/tasks/*
│       ├── contents.js              ← /api/contents (CRUD + transition + stats + similarity)
│       ├── documents.js             ← /api/documents (CRUD + approve)
│       ├── generate.js              ← /api/generate (ideas/plan/design/dev-request)
│       ├── jobs.js                  ← /api/jobs (조회 + retry + skip)
│       ├── ideas.js                 ← /api/ideas
│       ├── git.js                   ← /api/git-changes
│       ├── deployments.js           ← /api/deployments (CRUD + mark-success)
│       ├── activity.js              ← /api/activity
│       ├── prompts.js               ← /api/prompts (프롬프트 라이브러리 CRUD)
│       └── templates.js             ← /api/templates (문서 템플릿 CRUD)
│
└── supabase/
    ├── schema.sql                   ← 기존 채팅 스키마
    └── schema_content_ops.sql       ← Content Ops 스키마 (9개 테이블)
```

---

## 데이터 플로우

### AI 문서 생성 (Plan / Design / Dev Request)

```
Frontend (탭 페이지)
  → POST /api/generate/{type}  (contentItemId)
  → generate.js: runJob(supabase, userId, contentItemId, jobType, generatorFn)
      ├── generation_jobs 에 'queued' 레코드 삽입
      ├── 비동기: Claude API 호출 (claude-sonnet-4-6)
      ├── parseJsonSafe() 로 응답 파싱
      ├── documents 테이블에 저장
      ├── logActivity() 호출
      └── generation_jobs status → 'done' | 'failed'
Frontend (useJobPoller)
  → 4초마다 GET /api/jobs/{jobId} 폴링
  → done 확인 후 문서 렌더링
```

### 콘텐츠 상태 전환

```
PipelineStepperFull (클릭)
  → layout.tsx: handleTransition(newStatus)
  → PATCH /api/contents/{id}/transition  { status }
  → contents.js: status 업데이트 + logActivity()
  → 프론트 상태 갱신
```

---

## 데이터베이스 테이블 관계

```
content_items (1)
  ├──< content_ideas        (M)  AI 아이디어
  ├──< documents            (M)  plan/design/dev_request 문서
  ├──< generation_jobs      (M)  AI 생성 작업 큐
  ├──< git_changes          (M)  Git 브랜치·PR
  ├──< deployments          (M)  배포 기록
  └──< activity_logs        (M)  모든 이벤트 로그

prompt_library              독립 테이블 (재사용 프롬프트)
doc_templates               독립 테이블 (문서 생성 템플릿)
```

---

## 콘텐츠 파이프라인 상태 머신

```
idea
  │  Plan 문서 approve
  ▼
planned
  │  Design 문서 approve
  ▼
designed
  │  Dev Request 저장 후 수동 전환
  ▼
ready_dev
  │  개발 시작 수동 전환
  ▼
in_dev
  │  배포 완료 수동 전환
  ▼
deployed
  │  헤더 Archive 버튼
  ▼
archived
  │  헤더 Restore 버튼
  ▼
idea  (재순환)
```

---

## 핵심 헬퍼 & 패턴

### `buildQuery(params)` — `frontend/lib/api.ts`
`undefined` 값을 자동 제거하여 URLSearchParams 직렬화 버그 방지.
```ts
// 반드시 이 헬퍼 사용
const qs = buildQuery({ status, page, limit });
fetch(`/api/contents?${qs}`)
```

### `runJob(...)` — `backend/routes/generate.js`
모든 AI 생성 작업의 표준 래퍼. 큐 등록 → Claude 호출 → 결과 저장 → 상태 갱신.

### `parseJsonSafe(text)` — `backend/routes/generate.js`, `contents.js`
Claude 응답의 ```json 마크다운 블록 제거 후 JSON 파싱.

### `logActivity(supabase, userId, contentItemId, eventType, meta)` — `backend/lib/activity.js`
모든 상태 변경·생성 이벤트 기록. 백엔드 라우트에서 직접 호출.

---

## 의존성

### Backend
| 패키지 | 버전 | 용도 |
|---|---|---|
| express | ^4.19.2 | HTTP 서버 |
| @anthropic-ai/sdk | ^0.24.0 | Claude API |
| @supabase/supabase-js | ^2.43.0 | DB 접근 |
| node-cron | ^4.2.1 | 스케줄러 |
| jsonwebtoken | ^9.0.2 | JWT 검증 |

### Frontend
| 패키지 | 버전 | 용도 |
|---|---|---|
| next | 14.2.3 | 프레임워크 |
| @supabase/ssr | ^0.3.0 | 서버사이드 인증 |
| marked | ^18.0.0 | 마크다운 렌더링 |
