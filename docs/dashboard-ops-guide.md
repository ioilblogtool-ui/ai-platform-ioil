# AI Platform — Dashboard 운영 가이드

> 대상: 플랫폼 운영자 (1인 기업 대표)  
> 최종 수정: 2026-04-10

---

## 목차

1. [대시보드 개요](#1-대시보드-개요)
2. [화면 구성](#2-화면-구성)
3. [콘텐츠 파이프라인 이해](#3-콘텐츠-파이프라인-이해)
4. [일일 운영 루틴](#4-일일-운영-루틴)
5. [주요 업무 시나리오](#5-주요-업무-시나리오)
6. [트러블슈팅](#6-트러블슈팅)
7. [네비게이션 맵](#7-네비게이션-맵)

---

## 1. 대시보드 개요

대시보드(`/dashboard`)는 Content Ops 플랫폼의 **운영 중심 화면**이다.  
별도 조회 없이 현재 콘텐츠 현황, 문서 상태, AI 작업 오류, 최근 배포를 한눈에 파악할 수 있다.

### 접근 경로

```
로그인 → 자동으로 /dashboard 이동
사이드바 상단 ⬡ 아이콘 클릭
```

### 데이터 새로고침

- 대시보드 진입 시 자동 로드
- 수동 새로고침: 브라우저 새로고침 (`F5`)
- 실시간 업데이트 없음 — 페이지 재진입 또는 새로고침 필요

---

## 2. 화면 구성

```
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard                          Content Ops  [+ New Content] │  ← PageHeader
├──────────┬──────────┬──────────┬──────────┬──────────┬──────────┤
│  Idea    │ Planned  │ Designed │ ReadyDev │  In Dev  │ Deployed │  ← KPI Cards
├──────────────────────────────────┬──────────────────────────────┤
│  Content Pipeline (바 차트)       │  Quick Actions               │  ← Row 2
├─────────────────────────┬────────┴──────────────────────────────┤
│  Recent Documents        │  Failed Jobs                         │  ← Row 3
├──────────────────────────┴───────────────────────────────────────┤
│  Recent Contents (테이블)                                         │  ← Row 4
├──────────────────────────────────────────────────────────────────┤
│  Recent Deployments                                               │  ← Row 5
└──────────────────────────────────────────────────────────────────┘
```

---

### 2-1. KPI Cards (상단 6개 카드)

각 카드는 콘텐츠 파이프라인의 단계별 **현재 콘텐츠 수**를 보여준다.

| 카드 | 색상 | 의미 |
|------|------|------|
| **Idea** | 회색 | 아이디어만 있고 기획 미착수 |
| **Planned** | 파랑 | Plan 문서 승인 완료 |
| **Designed** | 보라 | Design 문서 승인 완료 |
| **Ready Dev** | 주황 | Dev Request 완료, 개발 대기 |
| **In Dev** | 노랑 | 개발 진행 중 |
| **Deployed** | 초록 | 배포 완료 |

**카드 하단 바**: 파이프라인에서 현재 단계의 위치를 시각적으로 표시  
**카드 클릭**: 해당 상태로 필터링된 `/contents` 목록으로 이동

> **정상 운영 기준**: Idea가 가장 많고, Deployed로 갈수록 줄어드는 깔때기 형태가 정상.  
> Ready Dev에 콘텐츠가 쌓이면 개발 병목 신호.

---

### 2-2. Content Pipeline

현재 파이프라인 단계별 분포를 **가로 바 차트**로 표시한다.

- 각 단계의 콘텐츠 수와 전체 대비 비율(%) 시각화
- 숫자가 `0`이면 회색 처리
- `active` 숫자: 파이프라인에 있는 전체 콘텐츠 수 (archived 제외)

---

### 2-3. Quick Actions

자주 사용하는 화면으로의 **단축 버튼** 모음.

| 버튼 | 이동 경로 | 용도 |
|------|----------|------|
| + New Content | `/contents/new` | 새 콘텐츠 등록 (wizard) |
| ⚡ Generate Plan | `/contents` | 콘텐츠 목록 → Plan 생성 |
| ↗ Register Deployment | `/deployments` | 배포 이력 등록 |
| ◎ View All Jobs | `/jobs` | AI 생성 작업 전체 조회 |
| ≡ All Documents | `/documents` | 문서 전체 조회 |

---

### 2-4. Recent Documents

최근 생성/수정된 문서 4개를 표시한다.

| 요소 | 설명 |
|------|------|
| 좌측 색상 바 | 문서 타입 (파랑=Plan, 보라=Design, 주황=Dev Request) |
| 파일명 | `doc.file_path`의 마지막 경로 |
| 우측 점 | 🟢 Approved / 🟡 Reviewed / ⚫ Draft |

**View all →** 클릭 시 `/documents` 이동

---

### 2-5. Failed Jobs

**AI 생성에 실패한 작업**만 표시한다. 정상이면 빈 상태(`실패한 Job이 없습니다`)여야 한다.

| 요소 | 설명 |
|------|------|
| Job 타입 | plan / design / dev_request / ideas |
| 연결 콘텐츠 | 어떤 콘텐츠의 생성이 실패했는지 |
| 오류 메시지 | API 오류, 타임아웃 등 원인 요약 |
| Retry 버튼 | 즉시 재시도 (→ `/jobs`에서도 가능) |

> **주의**: Failed Jobs에 항목이 있으면 해당 콘텐츠의 문서가 없거나 구버전일 수 있다.  
> 즉시 Retry하거나 `/jobs`에서 오류 원인 확인 후 대응.

---

### 2-6. Recent Contents

최근 수정된 콘텐츠 5개를 테이블로 표시한다.

| 컬럼 | 설명 |
|------|------|
| Title | 콘텐츠 제목 |
| Type | `calculator` / `report` |
| Category | 콘텐츠 카테고리 |
| Status | 현재 파이프라인 단계 (뱃지) |
| Updated | 마지막 수정일 |

**행 클릭** → 해당 콘텐츠의 `/contents/[id]/overview` 이동

---

### 2-7. Recent Deployments

최근 배포 이력 4건을 표시한다.

| 요소 | 설명 |
|------|------|
| 상태 점 | 🟢 Success / 🟡 Pending / 🔴 Failed |
| 콘텐츠명 | 배포된 콘텐츠 |
| 플랫폼 | cloudflare / vercel / railway / other |
| URL | 배포 주소 (있는 경우) |
| 날짜 | 배포일 |

---

## 3. 콘텐츠 파이프라인 이해

### 전체 흐름

```
[1] 아이디어 등록
      ↓  /contents/new (wizard)
[2] Idea 상태
      ↓  Ideas 탭 → AI 아이디어 브레인스토밍 (선택)
      ↓  Plan 탭 → ⚡ Generate Plan → Approve
[3] Planned 상태
      ↓  Design 탭 → ⚡ Generate Design → Approve
[4] Designed 상태
      ↓  Dev Request 탭 → ⚡ Generate Dev Request → 복사 → AI 개발 도구에 전달
      ↓  상태를 수동으로 Ready Dev 전환
[5] Ready Dev 상태
      ↓  Git 탭 → 브랜치/PR 정보 등록
      ↓  상태를 수동으로 In Dev 전환
[6] In Dev 상태
      ↓  개발 완료 → Deploy 탭 → 배포 등록
      ↓  상태를 수동으로 Deployed 전환
[7] Deployed 상태 ✅
      ↓  (필요 시) 수동으로 Archived 전환
[8] Archived 상태
```

### 상태 자동 전환 규칙

| 트리거 | 자동 전환 |
|--------|----------|
| Plan 문서 **Approve** 클릭 | `idea` → `planned` |
| Design 문서 **Approve** 클릭 | `planned` → `designed` |

> 그 외 상태 전환은 Overview 탭의 **상태 변경** 카드에서 수동으로 진행.

---

## 4. 일일 운영 루틴

### 오전 체크 (5분)

1. **대시보드 진입** → KPI 카드 확인
   - Ready Dev에 쌓인 콘텐츠가 있는가? → 개발 병목 확인
   - Deployed 수가 전날보다 증가했는가? → 배포 완료 확인

2. **Failed Jobs 패널 확인**
   - 실패 항목이 있으면 즉시 Retry 또는 `/jobs`에서 오류 원인 파악

3. **Recent Documents 확인**
   - Draft 상태 문서가 오래 방치되지 않았는지 점검

### 콘텐츠 작업 루틴

```
1. /contents/new → 새 콘텐츠 등록
2. /contents/[id]/ideas → 아이디어 브레인스토밍 (선택)
3. /contents/[id]/plan → Plan 생성 → 검토 → Approve
4. /contents/[id]/design → Design 생성 → 검토 → Approve
5. /contents/[id]/dev-request → Dev Request 생성 → Claude Code에 복사
6. 개발 완료 후 /contents/[id]/git → 브랜치/PR 등록
7. 배포 후 /contents/[id]/deploy → 배포 URL 등록
8. Overview → 상태를 Deployed로 변경
```

### 주간 정리 (10분)

- `/documents` → Draft 상태 문서 검토/삭제
- `/jobs` → 실패 작업 정리
- `/deployments` → Pending 상태 배포 → 성공 처리 또는 삭제

---

## 5. 주요 업무 시나리오

### 시나리오 A: 신규 콘텐츠 처음부터 배포까지

```
① 대시보드 → [+ New Content]
② Wizard 입력:
   - Title: "부동산 세금 계산기"
   - Type: calculator
   - Category: 부동산
   - SEO Keyword: 부동산 양도세
   - Target Repo: my-tools
③ Contents List에서 방금 생성된 콘텐츠 클릭
④ Ideas 탭 → [⚡ Generate Ideas] → 원하는 아이디어 메모
⑤ Plan 탭 → [⚡ Generate Plan] → 내용 검토 → [Approve →]
   (자동으로 Planned 상태 전환)
⑥ Design 탭 → [⚡ Generate Design] → 내용 검토 → [Approve →]
   (자동으로 Designed 상태 전환)
⑦ Dev Request 탭 → Target Model: Claude Code → [⚡ Generate Dev Request]
   → [⎘ Copy] → Claude Code에 붙여넣기
⑧ Overview → 상태 변경 → Ready Dev
⑨ Git 탭 → 브랜치명/PR URL 등록 → 상태 변경 → In Dev
⑩ 배포 후 Deploy 탭 → 플랫폼/URL 등록 → [✓ 성공]
⑪ Overview → 상태 변경 → Deployed
```

---

### 시나리오 B: AI 생성 실패 대응

**증상**: Failed Jobs 패널에 `plan — 부동산 세금 계산기` 표시

```
① Failed Jobs → [Retry] 클릭
   - 재시도 성공: Plan 탭에서 결과 확인
   - 재시도 실패: /jobs 이동

② /jobs → 실패 행의 오류 메시지 확인
   - "rate_limit_error" → 1~2분 후 재시도
   - "context_length_exceeded" → 콘텐츠 내용 줄인 후 재시도
   - "authentication_error" → backend .env의 ANTHROPIC_API_KEY 확인

③ 원인 해결 후 [↺ 재시도] 클릭
```

---

### 시나리오 C: 배포된 콘텐츠 업데이트

이미 Deployed 상태인 콘텐츠를 수정해야 할 때:

```
① /contents → 해당 콘텐츠 클릭
② Overview → 상태 변경 → In Dev (뒤로 전환)
③ Design 또는 Dev Request 탭 → [↺ Regenerate] → 수정
④ Dev Request → 복사 → 수정 작업 진행
⑤ Git 탭 → 새 브랜치/PR 정보 추가
⑥ Deploy 탭 → 새 배포 등록
⑦ Overview → 상태 변경 → Deployed
```

---

### 시나리오 D: 프롬프트 품질 개선

Plan/Design/Dev Request 결과가 마음에 들지 않을 때:

```
① /templates → 해당 Doc Type 템플릿 선택 → 수정
   - Plan 탭은 기본 템플릿을 자동으로 사용
   - is_default 체크된 템플릿이 우선 사용됨

② /prompt-library → 관련 프롬프트 수정
   - usage_type: plan / design / dev_request
   - target_model: claude (Claude Code 기본)

③ 해당 콘텐츠 탭에서 [↺ Regenerate] 클릭
```

---

### 시나리오 E: 활동 이력 확인

콘텐츠가 언제 어떻게 변경됐는지 추적하고 싶을 때:

```
① /contents/[id]/activity 탭 이동
② 타임라인에서 확인 가능한 이벤트:
   - 생성 (created)
   - 상태 변경 (status_changed): "idea → planned"
   - AI 문서 생성 (plan_generated 등)
   - 문서 승인 (document_approved)
   - Git 연결 (git_linked)
   - 배포 (deployed)
```

---

## 6. 트러블슈팅

### Q. 대시보드가 비어있다 (카드가 전부 0이다)

**원인 1**: Supabase에 `schema_content_ops.sql`이 적용되지 않음  
→ Supabase SQL Editor에서 `supabase/schema_content_ops.sql` 실행

**원인 2**: 백엔드 서버가 실행 중이지 않음  
→ `cd backend && npm run dev` 실행 확인

**원인 3**: `NEXT_PUBLIC_API_URL`이 잘못 설정됨  
→ `frontend/.env.local` 확인 (`http://localhost:4000`)

---

### Q. ⚡ Generate 버튼을 눌러도 아무 일이 없다

1. `/jobs` 이동 → 해당 작업이 `running` 상태인지 확인 (생성에 10~30초 소요)
2. 여전히 없으면 백엔드 로그 확인 (`cd backend && npm run dev` 터미널)
3. `ANTHROPIC_API_KEY`가 올바른지 확인

---

### Q. Approve 버튼을 눌렀는데 상태가 안 바뀐다

- 콘텐츠 Overview 탭 → 상태 변경 카드 → 수동으로 다음 상태 클릭
- 백엔드 `/api/documents/:id/approve` 엔드포인트 응답 확인

---

### Q. 사이드바의 Prompts를 클릭해도 이동하지 않는다

- 사이드바의 href는 `/prompt-library` → 주소창에서 직접 `/prompt-library` 입력
- 또는 `/settings`에서 관련 설정 확인

---

### Q. 같은 콘텐츠의 Plan을 여러 번 생성했다

- 가장 최근 생성된 문서가 Plan 탭에 표시됨
- 이전 버전은 `/documents`에서 확인 가능
- 불필요한 Draft 문서는 `/documents`에서 삭제

---

## 7. 네비게이션 맵

```
/dashboard              ← 여기서 시작
│
├── /contents           ← 콘텐츠 목록 (상태 필터 가능)
│   ├── /contents/new   ← 새 콘텐츠 wizard
│   └── /contents/[id]
│       ├── /overview   ← 기본 정보 + Next Actions + 상태 변경
│       ├── /ideas      ← AI 아이디어 생성
│       ├── /plan       ← Plan 문서 생성/편집/승인
│       ├── /design     ← Design 문서 생성/편집/승인
│       ├── /dev-request← Dev Request 생성/복사
│       ├── /git        ← 브랜치/PR 등록
│       ├── /deploy     ← 배포 등록/추적
│       └── /activity   ← 변경 이력 타임라인
│
├── /jobs               ← AI 생성 작업 전체 이력 + retry
├── /documents          ← 문서 전체 목록 + 필터
├── /deployments        ← 배포 전체 이력
│
├── /prompt-library     ← 재사용 프롬프트 관리
├── /templates          ← 문서 템플릿 관리
└── /settings           ← 프로필 / 모델 / 시스템 프롬프트 / 위험구역
```

---

## 부록: 상태별 색상 코드

| 상태 | 색상 코드 | 사용 위치 |
|------|-----------|----------|
| Idea | `#8b8fa8` | KPI 카드, ContentStatusBadge |
| Planned | `#60a5fa` | KPI 카드, 문서 타입 Plan |
| Designed | `#a78bfa` | KPI 카드, 문서 타입 Design |
| Ready Dev | `#fb923c` | KPI 카드, 문서 타입 Dev Request |
| In Dev | `#fbbf24` | KPI 카드, Job running |
| Deployed | `#4ade80` | KPI 카드, 배포 성공 |
| Archived | `#6b7280` | 비활성 |
| Error/Failed | `#f87171` | Failed Jobs, 배포 실패 |
| 골드 (액션) | `#c8a96e` | 버튼, 활성 네비, 링크 |
