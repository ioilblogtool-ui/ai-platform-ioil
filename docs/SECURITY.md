# SECURITY.md — 보안 규칙

> API 키·외부 링크·민감 데이터를 다루는 모든 작업 전에 이 파일을 읽어라.
> 보안 규칙은 협상 불가. 위반 시 즉시 수정 후 PR 진행.

---

## 1. 환경변수 & 시크릿 관리

### 절대 금지
```
❌ 소스 코드에 API 키, 시크릿 하드코딩
❌ .env 파일 git commit
❌ console.log(process.env.ANTHROPIC_API_KEY) 등 시크릿 출력
❌ 클라이언트 번들에 서버 시크릿 노출 (NEXT_PUBLIC_ 접두사 주의)
```

### 필수 환경변수 목록

**Backend (`backend/.env`)**
```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=       ← service role key (절대 공개 금지)
ANTHROPIC_API_KEY=
SCHEDULER_USER_ID=          ← Supabase user UUID
PORT=4000
```

**Frontend (`frontend/.env.local`)**
```
NEXT_PUBLIC_API_URL=        ← 백엔드 URL (공개 가능)
NEXT_PUBLIC_SUPABASE_URL=   ← 공개 가능
NEXT_PUBLIC_SUPABASE_ANON_KEY=  ← anon key (공개 가능, RLS로 보호)
```

> `SUPABASE_SERVICE_KEY`는 절대 `NEXT_PUBLIC_` 접두사 붙이지 않는다.
> service role key는 RLS를 우회하므로 서버 측에서만 사용해야 한다.

---

## 2. 인증 & 인가

### 백엔드
```javascript
// 모든 라우트에 requireAuth 미들웨어 필수
router.get('/items', requireAuth, async (req, res) => {
  const userId = req.user.sub;  // Supabase user UUID
  // ...
});
```

### 프론트엔드
```typescript
// (ops)/layout.tsx 에서 인증 체크 — 이미 구현됨
// 새 라우트 그룹 추가 시 반드시 auth check 포함
```

### 체크리스트
- [ ] 신규 라우트에 `requireAuth` 적용
- [ ] `req.user.sub`으로 사용자 소유 데이터만 접근
- [ ] 다른 사용자의 데이터 접근 차단 확인

---

## 3. 입력 검증 & SQL 인젝션

### 필수 규칙
```javascript
// ✅ Supabase SDK 사용 (파라미터 바인딩 자동)
const { data } = await supabase
  .from('content_items')
  .select('*')
  .eq('id', contentId)   // 안전
  .eq('user_id', userId);

// ❌ 문자열 연결 금지
supabase.rpc(`SELECT * WHERE id = '${contentId}'`);  // 위험
```

### 사용자 입력 검증
```javascript
// 상태 값: 허용된 enum만 통과
const VALID_STATUSES = ['idea', 'planned', 'designed', 'ready_dev', 'in_dev', 'deployed', 'archived'];
if (!VALID_STATUSES.includes(req.body.status)) {
  return res.status(400).json({ error: 'Invalid status' });
}

// UUID 검증
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!UUID_REGEX.test(req.params.id)) {
  return res.status(400).json({ error: 'Invalid ID' });
}
```

---

## 4. XSS 방지

### 마크다운 렌더링
```tsx
// ✅ MarkdownPreview 컴포넌트 사용 (sanitization 포함)
import MarkdownPreview from '@/components/MarkdownPreview';
<MarkdownPreview content={document.content} />

// ❌ 직접 HTML 삽입 금지
<div dangerouslySetInnerHTML={{ __html: userContent }} />
```

### 텍스트 표시
```tsx
// ✅ React 자동 이스케이핑 활용
<span>{userInput}</span>

// ❌ HTML 문자열 직접 렌더링 금지
```

---

## 5. CORS & 네트워크

```javascript
// backend/index.js — CORS는 허용된 오리진만
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
```

프로덕션 배포 시 `FRONTEND_URL`을 실제 Vercel 도메인으로 설정.

---

## 6. Claude API 응답 처리

```javascript
// Claude 응답을 DB에 저장하기 전 반드시 파싱 검증
const parsed = parseJsonSafe(claudeResponse);
if (!parsed) {
  // 실패 처리 — 원본 텍스트를 그대로 DB에 저장하지 않음
  throw new Error('Invalid Claude response format');
}
```

Claude 응답에 스크립트 인젝션이 포함될 수 있으므로 항상 `MarkdownPreview`를 통해 렌더링.

---

## 7. 민감 데이터 로깅 금지

```javascript
// ❌ 절대 금지
console.log('User data:', req.user);
console.log('API Key:', process.env.ANTHROPIC_API_KEY);
console.log('Request body:', req.body);  // 민감 데이터 포함 가능

// ✅ 허용
console.log('[generate] jobId:', jobId, 'type:', jobType);
console.log('[scheduler] 아이디어 생성 완료:', contentId);
```

---

## 8. 보안 사고 대응

의심스러운 활동 발견 시:
1. Railway/Vercel 환경변수에서 즉시 API 키 교체
2. Supabase Dashboard에서 service role key 재발급
3. `activity_logs` 테이블에서 이상 활동 패턴 확인
4. Anthropic Console에서 API 사용량 확인
