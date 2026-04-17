# QUALITY_SCORE.md — 코드 품질 루브릭

> PR 생성 또는 배포 직전에 이 루브릭으로 변경사항을 자체 점검하라.
> 각 항목은 **Pass / Warn / Fail** 세 단계로 평가한다.

---

## 체크리스트

### 1. 정확성 (Correctness)

| 항목 | Pass 기준 | Fail 기준 |
|---|---|---|
| API 파라미터 직렬화 | `buildQuery()` 헬퍼 사용 | `URLSearchParams` 직접 사용 |
| JSON 파싱 | `parseJsonSafe()` 사용 (Claude 응답) | `JSON.parse()` 직접 사용 (Claude 응답) |
| 상태 전환 | 허용된 파이프라인 순서 준수 | 임의 상태 jump |
| 인증 | 모든 백엔드 라우트에 `requireAuth` 적용 | 미인증 라우트 존재 |
| DB 접근 | service role 클라이언트 사용 | anon key로 직접 접근 |

---

### 2. 프론트엔드 UI (Frontend UI)

| 항목 | Pass 기준 | Fail 기준 |
|---|---|---|
| 스타일링 | 100% inline CSS | Tailwind 클래스 사용 |
| 디자인 토큰 | `#080809`, `#c8a96e`, `rgba(255,255,255,0.03~0.05)` 사용 | 임의 색상 하드코딩 |
| 컴포넌트 재사용 | `Button`, `Card`, `PageHeader`, `StatusBadge` 사용 | 중복 버튼·카드 직접 구현 |
| 새 페이지 | `app/(ops)/` 하위, `'use client'` 선언 | 루트 app/ 직접 생성 |
| 탭 추가 | `[id]/layout.tsx` TABS 배열 업데이트 | 탭 추가 후 layout 미수정 |
| 빈 상태 | `EmptyState` 컴포넌트 사용 | 빈 화면에 아무것도 없음 |

---

### 3. 백엔드 API (Backend API)

| 항목 | Pass 기준 | Fail 기준 |
|---|---|---|
| AI 생성 | `runJob()` 헬퍼 사용 | 직접 Claude 호출 + 수동 큐 관리 |
| 활동 로그 | 상태 변경·생성 후 `logActivity()` 호출 | 이벤트 누락 |
| 오류 처리 | 적절한 HTTP 상태 코드 반환 (400/401/404/500) | 모든 오류를 200으로 반환 |
| 응답 구조 | 목록: `{ data: [...], total: N }` | 배열 직접 반환 |

---

### 4. 타입 안정성 (TypeScript)

| 항목 | Pass 기준 | Fail 기준 |
|---|---|---|
| 타입 오류 | `tsc --noEmit` 통과 | 타입 오류 있음 |
| `unknown` 타입 | 명시적 타입 가드 또는 캐스팅 | `as any` 남용 |
| API 응답 타입 | 인터페이스 정의 후 사용 | `any` 타입으로 받음 |

---

### 5. 보안 (Security)

| 항목 | Pass 기준 | Fail 기준 |
|---|---|---|
| 환경변수 | `.env` 파일 사용, 코드에 하드코딩 없음 | API 키 코드에 직접 포함 |
| 입력 검증 | 사용자 입력 서버 측 검증 | 검증 없이 DB 쿼리에 직접 사용 |
| SQL 인젝션 | Supabase SDK 파라미터 바인딩 사용 | 문자열 연결로 쿼리 생성 |
| XSS | `MarkdownPreview` 컴포넌트 사용 | `dangerouslySetInnerHTML` 직접 사용 |

→ 상세 보안 규칙은 `docs/SECURITY.md` 참조.

---

### 6. 성능 (Performance)

| 항목 | Pass 기준 | Warn 기준 |
|---|---|---|
| 폴링 간격 | 4초 이상 (현재 useJobPoller 기준) | 1초 이하 폴링 |
| 불필요한 리렌더 | `useCallback`/`useMemo` 적절히 사용 | 모든 렌더에 객체 재생성 |
| 대용량 목록 | 페이지네이션 구현 | 전체 데이터 한 번에 로드 |

---

## 점수 계산

| 등급 | 기준 |
|---|---|
| ✅ **Ship** | Fail 항목 0개 |
| ⚠️ **Fix Before Merge** | Fail 항목 1~2개 (사소한 것) |
| ❌ **Block** | Fail 항목 3개 이상 또는 보안 Fail 1개 이상 |

---

## PR 설명 필수 포함 항목

```markdown
## 변경 내용
- 무엇을 추가/수정/삭제했는가

## 테스트 방법
- 어떻게 검증했는가 (로컬 실행, 수동 테스트 시나리오)

## 품질 체크
- [ ] buildQuery() 헬퍼 사용 확인
- [ ] inline CSS only 확인
- [ ] requireAuth 미들웨어 적용 확인
- [ ] TypeScript 오류 없음 확인
```
