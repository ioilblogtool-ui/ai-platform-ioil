# 실행 계획 인덱스 (exec-plans)

> 다음 작업 우선순위를 결정할 때 이 디렉토리를 확인하라.
> 실행 계획은 설계 승인 후 작성하며, 구체적인 구현 단계를 포함한다.

---

## 활성 실행 계획

| 문서 | 기능 | 상태 | 예상 공수 |
|---|---|---|---|
| _(없음)_ | — | — | — |

---

## 완료된 실행 계획

| 기능 | 완료일 | 비고 |
|---|---|---|
| Phase 1: DB Schema | 2024 | `supabase/schema_content_ops.sql` |
| Phase 2: 백엔드 API | 2024 | 14개 라우트 |
| Phase 3: 레이아웃 + 컴포넌트 | 2024 | 8개 공통 컴포넌트 |
| Phase 4 P0: 핵심 화면 | 2024 | Dashboard, Contents, 탭 4개 |
| Phase 4 P1: 보조 탭 + Jobs | 2024 | Ideas/Git/Deploy/Activity, Jobs |
| Phase 5: 전체 페이지 | 2024 | Documents, Deployments, Prompts, Templates, Settings |

---

## 새 실행 계획 작성 가이드

### 파일 명명 규칙
```
YYYY-MM-DD_{기능명}-exec-plan.md
예: 2025-01-15_kanban-board-exec-plan.md
```

### 실행 계획 필수 포함 항목

```markdown
## 관련 문서
- 기획: plan-docs/{파일명}
- 설계: design-docs/{파일명}

## 사전 조건
시작 전 완료되어야 할 것들

## 구현 단계

### Step 1: DB 스키마 (있는 경우)
- [ ] supabase/schema_content_ops.sql 에 마이그레이션 추가
- [ ] Supabase SQL Editor에서 실행

### Step 2: 백엔드 API
- [ ] backend/routes/{파일명}.js 생성
- [ ] backend/index.js 에 라우트 등록
- [ ] requireAuth 미들웨어 적용

### Step 3: 프론트엔드 API 함수
- [ ] frontend/lib/api.ts 에 함수 추가
- [ ] buildQuery() 헬퍼 사용 확인

### Step 4: UI 컴포넌트
- [ ] app/(ops)/{경로}/page.tsx 생성
- [ ] 'use client' 선언
- [ ] inline CSS only

### Step 5: 검증
- [ ] 로컬 백엔드 실행 (port 4000)
- [ ] 로컬 프론트엔드 실행 (port 3000)
- [ ] TypeScript 오류 없음 확인
- [ ] 품질 체크: docs/QUALITY_SCORE.md

## 롤백 계획
문제 발생 시 어떻게 되돌릴 것인가
```

---

## 다음 작업 우선순위 (기획 대기 중)

아래 항목들은 아직 기획 문서가 없음. 기획 → 설계 → 실행 계획 순서로 진행.

| 기능 | 우선순위 | 예상 복잡도 |
|---|---|---|
| 칸반 보드 (드래그앤드롭) | Medium | High |
| Jobs WebSocket 실시간 업데이트 | Low | Medium |
| Settings API 키 관리 백엔드 연동 | Low | Low |
| Ideas 탭 content_ideas 직접 연동 | Low | Low |
| 모바일 반응형 대응 | Low | High |

---

## 구현 원칙 (항상 준수)

1. **DB 먼저** — 스키마 변경은 항상 첫 번째 단계
2. **백엔드 → 프론트엔드** — API가 완성된 후 UI 작업
3. **기존 패턴 따르기** — `docs/ARCHITECTURE.md` 의 헬퍼 패턴 재사용
4. **단계별 검증** — 각 Step 완료 후 로컬에서 동작 확인
5. **품질 게이트** — PR 전 `docs/QUALITY_SCORE.md` 체크리스트 통과
