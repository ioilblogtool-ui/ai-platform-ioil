# AI Platform

콘텐츠 운영과 개인 데이터 관리를 위한 플랫폼이다. 로그인 후 포털에서 Content Ops 또는 나만의 AI를 연다.

| 화면 | 기능 |
|---|---|
| `/dashboard` | 콘텐츠 기획, AI 문서 생성, 개발 요청, 배포 기록 |
| `/my-ai` | 자산, 가계부, 부동산, 육아, 개인 리포트 |
| `/chat` | Claude 채팅 |

## 폴더 구조

```
ai-platform-ioil/
├── frontend/                      # Next.js 16 App Router (Vercel 배포)
│   ├── app/
│   │   ├── page.tsx               # 루트 → /portal 리디렉트
│   │   ├── portal/                # Content Ops와 나만의 AI 선택
│   │   ├── (my-ai)/               # /my-ai 라우트 그룹
│   │   ├── layout.tsx             # 루트 레이아웃
│   │   ├── auth/page.tsx          # 로그인 / 회원가입
│   │   ├── chat/page.tsx          # 기존 채팅 UI (독립 페이지)
│   │   └── (ops)/                 # Content Ops 라우트 그룹 (공통 Sidebar 레이아웃)
│   │       ├── layout.tsx         # Sidebar + 인증 체크
│   │       ├── dashboard/         → /dashboard
│   │       ├── contents/          → /contents (목록)
│   │       │   ├── page.tsx
│   │       │   ├── new/page.tsx   → /contents/new (wizard)
│   │       │   └── [id]/
│   │       │       ├── layout.tsx  # 탭 네비게이션 + 파이프라인 스텝퍼
│   │       │       ├── overview/   → /contents/[id]/overview
│   │       │       ├── ideas/      → /contents/[id]/ideas
│   │       │       ├── plan/       → /contents/[id]/plan
│   │       │       ├── design/     → /contents/[id]/design
│   │       │       ├── dev-request/→ /contents/[id]/dev-request
│   │       │       ├── git/        → /contents/[id]/git
│   │       │       ├── deploy/     → /contents/[id]/deploy
│   │       │       └── activity/   → /contents/[id]/activity
│   │       ├── jobs/              → /jobs
│   │       ├── documents/         → /documents
│   │       ├── deployments/       → /deployments
│   │       ├── prompt-library/    → /prompt-library
│   │       ├── templates/         → /templates
│   │       └── settings/          → /settings
│   ├── components/
│   │   ├── Sidebar.tsx            # 좌측 네비게이션 (collapsible)
│   │   ├── Card.tsx               # Card, CardHeader, CardTitle, EmptyState, Divider
│   │   ├── Button.tsx             # variant: primary|secondary|ghost|danger
│   │   ├── PageHeader.tsx         # title + badge + breadcrumbs + actions
│   │   ├── StatusBadge.tsx        # ContentStatusBadge, DocStatusBadge, JobStatusBadge, DeployStatusDot
│   │   └── PipelineStepper.tsx    # 파이프라인 단계 표시
│   └── lib/
│       ├── api.ts                 # 모든 백엔드 API 호출 함수
│       └── supabase.ts            # Supabase 클라이언트
│
├── backend/                       # Node.js 24 LTS + Express (Railway 배포, 로컬 port 4000)
│   ├── index.js                   # 서버 진입점 + 라우트 등록
│   ├── middleware/
│   │   ├── auth.js                # Supabase JWT 검증
│   │   └── requestLog.js          # HTTP 요청 결과 기록
│   ├── lib/
│   │   ├── supabase.js            # Supabase 서버 클라이언트
│   │   └── activity.js            # logActivity() 헬퍼
│   └── routes/
│       ├── my-ai/                # 개인 대시보드 API
│       ├── auth.js                # 인증
│       ├── chat.js                # Claude API 프록시
│       ├── conversations.js       # 대화 CRUD
│       ├── tasks.js               # 태스크 CRUD
│       ├── contents.js            # Content Ops CRUD + /transition + /stats
│       ├── documents.js           # 문서 CRUD + /approve
│       ├── generate.js            # AI 생성 (ideas/plan/design/dev-request)
│       ├── jobs.js                # 생성 작업 조회 + retry
│       ├── git.js                 # Git 변경 기록
│       ├── deployments.js         # 배포 기록 + mark-success
│       ├── activity.js            # 활동 로그 조회
│       ├── prompts.js             # 프롬프트 라이브러리 CRUD
│       └── templates.js           # 문서 템플릿 CRUD
│
└── supabase/
    ├── schema.sql                 # 초기 스키마 (users, projects, conversations, tasks)
    ├── schema_content_ops.sql     # Content Ops 스키마
    ├── schema_my_ai*.sql          # 개인 대시보드 기본·추가 스키마
    └── schema_budget_v2.sql       # 가계부 확장
```

## 빠른 시작

### 1. Node.js와 Supabase 준비

로컬에서도 Node.js 24 LTS를 사용한다. 빈 Supabase 프로젝트를 만들었다면 SQL Editor에서 다음 순서로 실행한다.

1. `schema.sql` → `schema_content_ops.sql`
2. `schema_my_ai.sql` → `schema_my_ai_v2.sql` → `schema_my_ai_v3.sql` → `schema_my_ai_v4.sql` → `schema_my_ai_v5.sql`
3. `schema_budget_v2.sql`

기본 SQL을 적용한 DB에서 Jobs 건너뛰기를 쓰려면 [작업 상태 제약 변경](CLAUDE.md#generation_jobs-status)을 추가 적용한다. 기존 프로젝트를 재개할 때는 기존 테이블과 데이터를 먼저 확인한다.

### 2. 백엔드 실행
```bash
cd backend
cp .env.example .env   # 환경변수 입력
npm ci
npm run dev            # http://localhost:4000
```

### 3. 프론트엔드 실행
```bash
cd frontend
cp .env.example .env.local   # 환경변수 입력
npm ci
npm run dev                   # http://localhost:3000
```

## 환경변수

### backend/.env
```
PORT=4000
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_...
# FRONTEND_URL=https://ai-platform-ioil.vercel.app
# SCHEDULER_USER_ID=<Supabase 사용자 UUID>
```

### frontend/.env.local
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase publishable 또는 anon 키>
NEXT_PUBLIC_API_URL=http://localhost:4000
```

## Content 파이프라인

```
idea → planned → designed → ready_dev → in_dev → deployed → archived
```

| 상태 | 트리거 |
|------|--------|
| `planned` | Plan 문서 Approve |
| `designed` | Design 문서 Approve |
| `ready_dev` | Dev Request 문서 Approve 또는 수동 전환 |
| `in_dev` | Git 브랜치 연결 후 수동 전환 |
| `deployed` | 배포 등록 후 수동 전환 |

## 배포

| 서비스 | 플랫폼 |
|--------|--------|
| 프론트엔드 | [Vercel 운영 사이트](https://ai-platform-ioil.vercel.app) · `main`, 루트 `frontend/` |
| 백엔드 | [Railway 헬스체크](https://ai-platform-ioil-production.up.railway.app/health) · `main`, 루트 `backend/`, Railpack 및 Node.js 24 |
| 데이터베이스·인증 | Supabase |

- Vercel Production의 `NEXT_PUBLIC_API_URL`에는 Railway 백엔드 주소를 넣는다. 변경 후 프론트를 재배포해야 새 주소가 빌드에 반영된다.
- Railway의 `FRONTEND_URL`에는 Vercel 운영 주소를 넣고 서버용 Supabase 키와 Anthropic 키는 Railway Variables에 저장한다.
- 기존 Render 서비스는 일시 중지했다. 운영 요청은 Railway로 보낸다.
- 자정 KST 자동 아이디어 생성은 운영에서 꺼져 있다. `SCHEDULER_USER_ID`를 지정하면 서버 기동 시 등록되며, 대시보드 버튼을 통한 수동 생성은 계속 사용할 수 있다.
- Railway **Deploy Logs**에서 `http_request`로 필터링하면 메서드, API 경로 패턴, 응답 상태, 처리 시간을 확인할 수 있다. `/health`와 `OPTIONS`는 제외한다.

배포 후에는 `/health` 응답을 확인하고 운영 사이트에서 로그인과 콘텐츠 목록 조회를 확인한다. DB와 인증까지 확인하려면 로그인 이후 API 요청이 성공해야 한다.

## 관련 문서

- [운영 가이드](docs/dashboard-ops-guide.md)
- [아키텍처](docs/ARCHITECTURE.md)
- [보안 가이드](docs/SECURITY.md)
