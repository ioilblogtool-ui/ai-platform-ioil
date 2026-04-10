# AI Platform — Phase 1

1인 기업용 Claude 자동화 플랫폼 MVP

## 폴더 구조

```
ai-platform/
├── frontend/          # Next.js 14 (Vercel 배포)
│   ├── app/
│   │   ├── page.tsx           # 랜딩 / 로그인 리디렉트
│   │   ├── auth/page.tsx      # 로그인 / 회원가입
│   │   ├── dashboard/page.tsx # 메인 대시보드
│   │   └── api/chat/route.ts  # 백엔드 프록시 라우트
│   ├── components/
│   │   ├── ChatWindow.tsx     # 대화 UI
│   │   └── Sidebar.tsx        # 사이드바
│   └── lib/
│       ├── supabase.ts        # Supabase 클라이언트
│       └── api.ts             # 백엔드 API 호출
│
├── backend/           # Node.js + Express (Railway 배포)
│   ├── index.js               # 서버 진입점
│   ├── routes/
│   │   ├── chat.js            # Claude API 프록시
│   │   ├── conversations.js   # 대화 CRUD
│   │   └── auth.js            # 인증
│   ├── middleware/
│   │   └── auth.js            # JWT 검증
│   └── lib/
│       └── supabase.js        # Supabase 서버 클라이언트
│
└── supabase/
    └── schema.sql             # DB 테이블 생성 SQL
```

## 빠른 시작

### 1. Supabase 설정
1. supabase.com → New Project
2. SQL Editor에서 `supabase/schema.sql` 실행
3. Project URL과 anon key 복사

### 2. 백엔드 실행
```bash
cd backend
cp .env.example .env  # 환경변수 입력
npm install
npm run dev
```

### 3. 프론트엔드 실행
```bash
cd frontend
cp .env.example .env.local  # 환경변수 입력
npm install
npm run dev
```

## 환경변수

### backend/.env
```
PORT=4000
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
JWT_SECRET=your-secret-key
```

### frontend/.env.local
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_API_URL=http://localhost:4000
```

## 배포

- 프론트엔드: Vercel (GitHub 연동 후 자동 배포)
- 백엔드: Railway (GitHub 연동 후 자동 배포)
- DB: Supabase (이미 클라우드)
