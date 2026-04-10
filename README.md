# AI Platform — Content Ops Dashboard

1인 기업용 콘텐츠 운영 자동화 플랫폼.  
콘텐츠(계산기/리포트) 기획 → AI 문서 생성 → 개발 요청 → 배포까지 전 워크플로우를 관리한다.

## 폴더 구조

```
ai-platform-ioil/
├── frontend/                      # Next.js 14 App Router (Vercel 배포)
│   ├── app/
│   │   ├── page.tsx               # 루트 → /dashboard 리디렉트
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
├── backend/                       # Node.js + Express (Railway 배포, port 4000)
│   ├── index.js                   # 서버 진입점 + 라우트 등록
│   ├── middleware/
│   │   └── auth.js                # Supabase JWT 검증
│   ├── lib/
│   │   ├── supabase.js            # Supabase 서버 클라이언트
│   │   └── activity.js            # logActivity() 헬퍼
│   └── routes/
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
    └── schema_content_ops.sql     # Content Ops 스키마 (content_items, documents, jobs 등)
```

## 빠른 시작

### 1. Supabase 설정
```
1. supabase.com → New Project
2. SQL Editor에서 순서대로 실행:
   - supabase/schema.sql
   - supabase/schema_content_ops.sql
3. Project URL, anon key, service role key 복사
```

### 2. 백엔드 실행
```bash
cd backend
cp .env.example .env   # 환경변수 입력
npm install
npm run dev            # http://localhost:4000
```

### 3. 프론트엔드 실행
```bash
cd frontend
cp .env.example .env.local   # 환경변수 입력
npm install
npm run dev                   # http://localhost:3000
```

## 환경변수

### backend/.env
```
PORT=4000
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
```

### frontend/.env.local
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
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
| `ready_dev` | Dev Request 생성 후 수동 전환 |
| `in_dev` | Git 브랜치 연결 후 수동 전환 |
| `deployed` | 배포 등록 후 수동 전환 |

## 배포

| 서비스 | 플랫폼 |
|--------|--------|
| 프론트엔드 | Vercel (GitHub 연동 자동 배포) |
| 백엔드 | Railway (GitHub 연동 자동 배포) |
| 데이터베이스 | Supabase (클라우드) |
