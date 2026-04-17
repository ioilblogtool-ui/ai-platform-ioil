# 외부 레퍼런스 인덱스 (references)

> 라이브러리나 외부 API를 사용하기 전에 이 인덱스를 확인하라.
> 검증된 패턴과 공식 문서 링크를 모아 불필요한 검색을 줄인다.

---

## 핵심 라이브러리

### Anthropic Claude API
- **SDK**: `@anthropic-ai/sdk` ^0.24.0
- **사용 모델**: `claude-sonnet-4-6`
- **주요 패턴**: `runJob()` 헬퍼 (`backend/routes/generate.js`)
- **주의**: 응답이 ` ```json ` 블록으로 감싸질 수 있음 → `parseJsonSafe()` 필수

```javascript
// 표준 호출 패턴
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const message = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 4096,
  system: systemPrompt,
  messages: [{ role: 'user', content: userPrompt }],
});
const text = message.content[0].text;
const parsed = parseJsonSafe(text);
```

---

### Supabase
- **SDK**: `@supabase/supabase-js` ^2.43.0
- **프론트엔드**: `@supabase/ssr` ^0.3.0 (서버사이드 인증)
- **백엔드**: service role key로 초기화 (`backend/lib/supabase.js`)

```javascript
// 백엔드 — service role (RLS 우회)
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// 프론트엔드 — anon key (RLS 적용)
import { createBrowserClient } from '@supabase/ssr';
```

---

### Next.js 14 App Router
- **버전**: 14.2.3
- **라우팅**: App Router (`app/` 디렉토리)
- **레이아웃 그룹**: `(ops)/` — URL에 영향 없는 공통 레이아웃
- **클라이언트 컴포넌트**: `'use client'` 선언 필수 (인터랙션·훅 사용 시)

---

### node-cron
- **버전**: ^4.2.1
- **사용처**: `backend/lib/scheduler.js`
- **스케줄**: `'0 0 * * *'` (UTC 00:00 = KST 09:00)

```javascript
import cron from 'node-cron';
cron.schedule('0 0 * * *', async () => {
  // 매일 KST 09:00 실행
});
```

---

### marked (마크다운 파서)
- **버전**: ^18.0.0
- **사용처**: `frontend/components/MarkdownPreview.tsx`
- **주의**: XSS 방지를 위해 항상 `MarkdownPreview` 컴포넌트 사용

---

## 외부 서비스

### Railway (백엔드 배포)
- Express 앱 자동 배포
- 환경변수: Railway Dashboard Variables 탭에서 설정
- `SCHEDULER_USER_ID` 반드시 설정 필요

### Vercel (프론트엔드 배포)
- Next.js 자동 인식 및 배포
- 환경변수: Vercel Dashboard Environment Variables에서 설정
- `NEXT_PUBLIC_API_URL`을 Railway URL로 설정

### Supabase
- PostgreSQL DB + Auth + Row Level Security
- SQL Editor: 마이그레이션 수동 실행
- `generation_jobs` status 제약 수동 추가 필요 (`CLAUDE.md` 참조)

---

## 유용한 코드 스니펫

### buildQuery 헬퍼 (frontend/lib/api.ts)
```typescript
// undefined 값 자동 제거
const qs = buildQuery({ status: 'idea', page: 1, category: undefined });
// → 'status=idea&page=1' (category 제외됨)
```

### API 호출 기본 패턴
```typescript
// frontend/lib/api.ts 에서 정의된 함수 사용
import { getContents, createContent, updateContent } from '@/lib/api';

const { data, total } = await getContents({ status: 'idea', page: 1 });
```

### 인증 헤더 포함 fetch
```typescript
// api.ts 내부 패턴
const session = await supabase.auth.getSession();
const token = session.data.session?.access_token;

fetch(`${API_URL}/api/contents`, {
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
});
```
