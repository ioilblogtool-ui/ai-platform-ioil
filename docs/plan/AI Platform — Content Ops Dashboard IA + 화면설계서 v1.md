# AI Platform — Content Ops Dashboard IA + 화면설계서 v1

문서 버전: v1
문서 상태: Draft
작성일: 2026-04-10
대상 서비스: `ai-platform-ioil`
연계 서비스: `blog-tool`, `bigyocalc.com`

---

# 1. 문서 목적

본 문서는 **AI Platform — Content Ops Dashboard**의

* 정보구조(IA)
* 주요 화면 구성
* 화면 간 이동 흐름
* 핵심 컴포넌트
* 상태/액션 설계

를 정의한다.

이 문서의 목적은 단순 UI 아이디어 정리가 아니라,
실제 구현 가능한 수준의 **운영형 대시보드 화면 설계 기준**을 만드는 것이다.

---

# 2. 화면 설계 원칙

## 2.1 핵심 원칙

이 시스템은 채팅 중심이 아니라 **콘텐츠 운영 중심**이어야 한다.

따라서 화면 설계 기준은 아래와 같다.

1. **콘텐츠 카드 중심**
2. **상태 기반 파이프라인 강조**
3. **문서(plan/design/dev request) 연결성 강조**
4. **AI 생성 결과 비교/채택이 쉬워야 함**
5. **Git/배포 상태를 한 화면 흐름 안에서 파악 가능해야 함**

---

## 2.2 UX 방향

### 지향 UX

* “지금 뭐가 밀려 있는지” 바로 보이는 운영 대시보드
* 문서 생성/검토/승격 액션이 빠른 구조
* 상태와 산출물이 함께 보이는 구조
* 개발자/기획자 1인 운영에 맞는 고밀도 UI

### 피해야 할 UX

* 채팅창만 크고 실제 운영 정보가 안 보이는 구조
* 문서와 상태가 분리된 구조
* 화면 이동이 많아 맥락이 끊기는 구조
* 액션 버튼이 산재되어 다음 단계가 모호한 구조

---

# 3. 전체 IA

## 3.1 1차 메뉴 구조

```text
AI Platform
├─ Dashboard
├─ Contents
│  ├─ All Contents
│  ├─ Ideas
│  ├─ Planned
│  ├─ Designed
│  ├─ Ready for Dev
│  ├─ In Dev
│  └─ Deployed
├─ Documents
│  ├─ Plan Docs
│  ├─ Design Docs
│  └─ Dev Request Docs
├─ Jobs
│  ├─ Generation Jobs
│  └─ Failed Jobs
├─ Deployments
│  ├─ Deployment Status
│  └─ Release History
├─ Prompt Library
├─ Templates
└─ Settings
```

---

## 3.2 권장 라우팅 구조

```text
/
├─ /dashboard
├─ /contents
├─ /contents/new
├─ /contents/[id]
│  ├─ /overview
│  ├─ /ideas
│  ├─ /plan
│  ├─ /design
│  ├─ /dev-request
│  ├─ /git
│  ├─ /deploy
│  └─ /activity
├─ /documents
├─ /documents/plan
├─ /documents/design
├─ /documents/dev-request
├─ /jobs
├─ /jobs/failed
├─ /deployments
├─ /prompt-library
├─ /templates
└─ /settings
```

---

# 4. 메뉴별 역할 정의

## 4.1 Dashboard

운영 전체 상태를 한눈에 보는 홈 화면

### 목적

* 현재 작업량 파악
* 병목 파악
* 최근 생성/실패/배포 확인

### 핵심 질문

* 지금 아이디어가 몇 개 쌓였는가?
* plan/design이 어디서 막혔는가?
* 어떤 콘텐츠가 배포 직전인가?
* 실패한 생성 작업이 있는가?

---

## 4.2 Contents

콘텐츠 운영의 메인 공간

### 목적

* 콘텐츠 단위로 전체 흐름 관리
* 상태 기반 액션 실행
* 상세 화면 진입

### 하위 섹션

* All Contents
* 상태별 뷰
* 콘텐츠 신규 생성

---

## 4.3 Documents

문서 중심으로 관리하는 공간

### 목적

* 생성된 문서를 모아서 검토
* plan / design / dev request 분리 관리
* 문서 품질 점검 및 재생성

---

## 4.4 Jobs

AI 생성 실행 이력 공간

### 목적

* 어떤 모델로 어떤 문서를 생성했는지 추적
* 실패한 작업 재시도
* 품질/성능 디버깅

---

## 4.5 Deployments

배포 중심 추적 공간

### 목적

* 배포 성공/실패 여부 확인
* 콘텐츠별 배포 URL 관리
* 최근 릴리즈 이력 추적

---

## 4.6 Prompt Library

재사용 가능한 프롬프트 관리

### 목적

* calculator/report 별 프롬프트 재사용
* Claude / GPT / Codex 용 템플릿 분리
* 운영자가 직접 다듬은 프롬프트 축적

---

## 4.7 Templates

문서 템플릿 관리

### 목적

* plan/design/dev request 기본 포맷 관리
* 카테고리별 템플릿 분기

---

## 4.8 Settings

시스템 설정

### 목적

* 모델 설정
* 기본 문서 경로 규칙
* 레포/배포 플랫폼 기본값
* 템플릿 정책

---

# 5. 전체 사용자 흐름

## 5.1 핵심 업무 흐름

```text
Dashboard
→ 신규 콘텐츠 생성
→ 아이디어 입력
→ 모델별 결과 생성
→ 콘텐츠 카드 생성
→ plan 문서 생성
→ design 문서 생성
→ dev request 생성
→ Git/배포 정보 연결
→ deployed 상태 전환
```

---

## 5.2 주요 흐름도

### 흐름 A. 신규 콘텐츠 등록

```text
Contents > New
→ 제목/타입/카테고리 입력
→ 아이디어 원문 입력
→ AI 결과 생성
→ 결과 선택
→ 콘텐츠 생성 완료
→ 상세 화면 이동
```

### 흐름 B. Plan 생성

```text
Content Detail > Plan 탭
→ Generate Plan 클릭
→ 템플릿 선택(자동 기본값 가능)
→ 결과 생성
→ 검토/수정
→ 저장
→ 상태 planned 전환
```

### 흐름 C. Design 생성

```text
Content Detail > Design 탭
→ 기존 plan 기반 생성
→ 검토/수정
→ 저장
→ 상태 designed 전환
```

### 흐름 D. Dev Request 생성

```text
Content Detail > Dev Request 탭
→ 설계 문서 기준 생성
→ Claude/Codex용 프롬프트 출력
→ 저장
→ 상태 ready_dev 전환
```

### 흐름 E. 배포 기록

```text
Content Detail > Git / Deploy 탭
→ branch / commit / PR 입력
→ deploy URL 입력
→ 성공 체크
→ 상태 deployed 전환
```

---

# 6. 화면 목록

## 6.1 화면 목록표

| 화면 ID  | 화면명                          | 경로                           | 목적              |
| ------ | ---------------------------- | ---------------------------- | --------------- |
| SCR-01 | Dashboard                    | `/dashboard`                 | 전체 운영 현황        |
| SCR-02 | Contents List                | `/contents`                  | 콘텐츠 목록/필터       |
| SCR-03 | New Content                  | `/contents/new`              | 신규 콘텐츠 생성       |
| SCR-04 | Content Detail - Overview    | `/contents/[id]/overview`    | 기본 정보/상태        |
| SCR-05 | Content Detail - Ideas       | `/contents/[id]/ideas`       | AI 결과 비교        |
| SCR-06 | Content Detail - Plan        | `/contents/[id]/plan`        | plan 문서 생성/편집   |
| SCR-07 | Content Detail - Design      | `/contents/[id]/design`      | design 문서 생성/편집 |
| SCR-08 | Content Detail - Dev Request | `/contents/[id]/dev-request` | 개발 요청 생성        |
| SCR-09 | Content Detail - Git         | `/contents/[id]/git`         | Git/PR 관리       |
| SCR-10 | Content Detail - Deploy      | `/contents/[id]/deploy`      | 배포 상태 관리        |
| SCR-11 | Content Detail - Activity    | `/contents/[id]/activity`    | 활동 로그           |
| SCR-12 | Documents List               | `/documents`                 | 문서 모아보기         |
| SCR-13 | Jobs List                    | `/jobs`                      | 생성 작업 목록        |
| SCR-14 | Failed Jobs                  | `/jobs/failed`               | 실패 작업 대응        |
| SCR-15 | Deployments                  | `/deployments`               | 배포 이력           |
| SCR-16 | Prompt Library               | `/prompt-library`            | 프롬프트 관리         |
| SCR-17 | Templates                    | `/templates`                 | 템플릿 관리          |
| SCR-18 | Settings                     | `/settings`                  | 운영 설정           |

---

# 7. 공통 레이아웃 설계

## 7.1 전체 레이아웃

```text
┌────────────────────────────────────────────────────────────┐
│ Top Header                                                 │
│ - 서비스명 / 검색 / 빠른 생성 버튼 / 사용자 메뉴          │
├───────────────┬────────────────────────────────────────────┤
│ Left Sidebar  │ Main Content                               │
│ - Dashboard   │                                            │
│ - Contents    │                                            │
│ - Documents   │                                            │
│ - Jobs        │                                            │
│ - Deployments │                                            │
│ - Prompts     │                                            │
│ - Templates   │                                            │
│ - Settings    │                                            │
└───────────────┴────────────────────────────────────────────┘
```

---

## 7.2 공통 UI 요소

### Header

* 서비스명
* 글로벌 검색
* `+ New Content`
* 최근 작업 바로가기
* 사용자 메뉴

### Sidebar

* 1차 메뉴 고정
* Contents는 하위 상태 메뉴 펼침 가능

### Main Area

* Breadcrumb
* Page Title
* Summary Bar
* Main Content
* Right Panel(Optional)

---

# 8. 화면 상세 설계

---

# 8.1 SCR-01 Dashboard

## 목적

운영 상황을 한눈에 보여주는 메인 화면

## 주요 컴포넌트

1. KPI Summary Cards
2. 상태별 콘텐츠 보드
3. 최근 생성 문서 목록
4. 실패 Job 목록
5. 최근 배포 목록
6. 빠른 액션 패널

## 와이어프레임

```text
[Header]

[Dashboard]

┌────────────┬────────────┬────────────┬────────────┬────────────┬────────────┐
│ New Ideas  │ Planned    │ Designed   │ Ready Dev  │ Deployed   │ Failed Jobs│
└────────────┴────────────┴────────────┴────────────┴────────────┴────────────┘

┌──────────────────────────────┬──────────────────────────────────────────────┐
│ Pipeline Snapshot            │ Quick Actions                                │
│ - Idea 12                    │ - New Content                               │
│ - Planned 7                  │ - Generate Plan                             │
│ - Designed 4                 │ - Retry Failed Job                          │
│ - Ready Dev 3                │ - Register Deployment                       │
└──────────────────────────────┴──────────────────────────────────────────────┘

┌──────────────────────────────┬──────────────────────────────────────────────┐
│ Recent Documents             │ Failed Jobs                                  │
└──────────────────────────────┴──────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ Recent Deployments                                                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 액션

* `+ New Content`
* 특정 상태 클릭 시 해당 리스트로 이동
* 실패 job 클릭 시 상세/재시도 화면 이동

---

# 8.2 SCR-02 Contents List

## 목적

전체 콘텐츠를 필터/검색/상태 기준으로 관리

## 주요 컴포넌트

1. Filter Bar
2. Table / Board Toggle
3. Contents Table
4. Bulk Actions
5. Pagination

## 상단 필터

* 검색어
* 콘텐츠 타입
* 카테고리
* 상태
* 우선순위
* 생성일 범위

## 테이블 컬럼

| 컬럼          | 설명                |
| ----------- | ----------------- |
| 제목          | 콘텐츠명              |
| 타입          | calculator/report |
| 카테고리        | 연봉/투자/육아 등        |
| 상태          | 현재 단계             |
| plan        | 생성 여부             |
| design      | 생성 여부             |
| dev request | 생성 여부             |
| 배포 상태       | deployed 여부       |
| 최근 수정일      | 마지막 업데이트          |

## 와이어프레임

```text
[Contents]

[Search] [Type] [Category] [Status] [Priority] [Date] [Reset]
[Table View] [Board View]                                  [+ New Content]

┌──────────────────────────────────────────────────────────────────────────────┐
│ Title | Type | Category | Status | Plan | Design | DevReq | Deploy | Updated│
├──────────────────────────────────────────────────────────────────────────────┤
│ ...                                                                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 액션

* 행 클릭 → 상세 화면
* 상태 필터
* 다중 선택 후 상태 변경
* plan 미생성 건만 보기

---

# 8.3 SCR-03 New Content

## 목적

신규 콘텐츠 아이템 생성

## 입력 영역

1. 기본 정보
2. 아이디어 원문
3. AI 생성 옵션
4. 생성 결과 선택

## 폼 항목

| 그룹    | 필드                         |
| ----- | -------------------------- |
| 기본 정보 | 제목, 타입, 카테고리, 키워드, 우선순위    |
| 아이디어  | 원문 입력                      |
| AI 옵션 | Claude/GPT/Gemini/Codex 선택 |
| 부가 정보 | 비고, 타겟 repo, 목표 경로         |

## 화면 흐름

### Step 1. 기본 정보 입력

* 제목
* 타입
* 카테고리

### Step 2. 아이디어 입력

* 자유 텍스트
* 참고 링크/메모

### Step 3. AI 결과 생성

* 모델 선택
* Generate 버튼

### Step 4. 결과 비교/채택

* 모델별 카드 비교
* “이 결과로 콘텐츠 생성”

## 와이어프레임

```text
[New Content]

Step 1. Basic Info
- Title
- Type
- Category
- SEO Keyword
- Priority

Step 2. Idea Input
- Raw Idea Textarea

Step 3. Model Selection
[Claude] [GPT] [Gemini] [Codex]
[Generate Ideas]

Step 4. Generated Results
┌────────────┬────────────┬────────────┬────────────┐
│ Claude     │ GPT        │ Gemini     │ Codex      │
└────────────┴────────────┴────────────┴────────────┘

[Create Content]
```

## 검증 규칙

* 제목 필수
* 타입 필수
* 카테고리 필수
* 아이디어 원문 최소 길이 권장

---

# 8.4 SCR-04 Content Detail - Overview

## 목적

콘텐츠의 현재 상태와 핵심 정보를 한 페이지에서 요약

## 상단 요약 카드

* 제목
* 상태
* 타입
* 카테고리
* SEO 키워드
* 최근 수정일
* 문서 생성 현황
* 배포 상태

## 주요 섹션

1. Summary Header
2. Status Timeline
3. Document Status
4. Next Actions
5. Basic Info
6. Notes

## 와이어프레임

```text
[Content Title] [Status Badge]

Type: report | Category: 투자 | Keyword: 반도체 ETF | Updated: 2026-04-10

[Idea] → [Planned] → [Designed] → [Ready Dev] → [In Dev] → [Deployed]

Plan: Done
Design: Done
Dev Request: Pending
Git: Pending
Deploy: Pending

[Next Action]
- Generate Dev Request
- Move to Ready Dev
```

## 핵심 액션

* 상태 변경
* Plan 생성
* Design 생성
* Dev Request 생성
* 배포 등록

---

# 8.5 SCR-05 Content Detail - Ideas

## 목적

AI 생성 결과 비교 및 채택 관리

## 주요 컴포넌트

* Idea Input Summary
* Model Result Tabs
* Score Comparison Table
* Select Result
* Regenerate

## 비교 기준

| 항목        | 설명            |
| --------- | ------------- |
| 구조화 정도    | 문서화 적합성       |
| SEO 적합성   | 검색 키워드 반영 정도  |
| 확장성       | 파생 콘텐츠 가능성    |
| 구현성       | 실제 제작 난이도     |
| 내부 링크 연결성 | 기존 사이트 연결 가능성 |

## 와이어프레임

```text
[Ideas]

Original Idea
------------------------------------------------
반도체 미국/한국 ETF 벨류체인 연계 리포트

[Claude] [GPT] [Gemini] [Codex]

Result Card
- Summary
- Suggested Titles
- Suggested Outline
- SEO Keywords
- Strengths / Weaknesses

[Select This Result] [Regenerate]
```

## 액션

* 결과 채택
* 점수 수정
* 재생성
* 콘텐츠 반영

---

# 8.6 SCR-06 Content Detail - Plan

## 목적

`docs/plan` 문서 생성 및 편집

## 화면 구성

1. 상단 메타 정보
2. 문서 생성 옵션
3. MD 에디터
4. 파일 경로
5. 상태 전이 액션

## 폼/정보

* Doc Type: Plan
* Version: v1 / v2
* File Path
* Generated By
* Status: draft / reviewed / approved

## 와이어프레임

```text
[Plan Document]

File Path: docs/plan/202604/report-semiconductor-etf-2026-v1-plan.md
Version: v1
Status: Draft

[Generate Plan] [Regenerate] [Save] [Approve]

------------------------------------------------
Markdown Editor
------------------------------------------------
# 비교계산소용 최종 MD 웹기획서 v2
...
```

## 핵심 액션

* Generate Plan
* Save Draft
* Approve
* Move to Planned

## 규칙

* 승인 시 콘텐츠 상태를 `planned`로 변경 가능
* 파일명 자동 제안
* 수동 수정 허용

---

# 8.7 SCR-07 Content Detail - Design

## 목적

`docs/design` 문서 생성 및 편집

## 구성

* plan 기반 참조 박스
* design 생성 옵션
* 에디터
* 파일 경로/버전 관리

## 와이어프레임

```text
[Design Document]

Reference Plan:
docs/plan/202604/...

File Path:
docs/design/202604/report-semiconductor-etf-2026-v1-design.md

[Generate Design] [Regenerate] [Save] [Approve]

------------------------------------------------
Markdown Editor
------------------------------------------------
# 화면 설계
# 컴포넌트 구조
# 데이터 모델
...
```

## 핵심 액션

* plan 기준 생성
* 저장
* 승인
* 상태 `designed` 변경

---

# 8.8 SCR-08 Content Detail - Dev Request

## 목적

Claude Code / Codex 등 구현용 개발 요청 문서 생성

## 구성

* 설계 문서 참조
* 모델별 프롬프트 타입
* 최종 프롬프트 에디터
* 복사/저장 기능

## 주요 옵션

* Output Target: Claude / Codex / GPT
* Prompt Style: 구현형 / 수정형 / 리팩토링형
* Scope: full / partial

## 와이어프레임

```text
[Dev Request]

Reference Design:
docs/design/202604/...

Target Model: [Claude Code] [Codex] [GPT]
Prompt Style: [Implement] [Modify] [Refactor]

[Generate Dev Request] [Copy] [Save]

------------------------------------------------
Markdown / Prompt Editor
------------------------------------------------
목표:
참고 문서:
구현 요구사항:
수정 대상 파일:
완료 기준:
...
```

## 상태 전이

* 저장 완료 시 `ready_dev` 전환 가능

---

# 8.9 SCR-09 Content Detail - Git

## 목적

Git 작업 이력 연결

## 입력 필드

* Branch Name
* Commit SHA
* PR URL
* Merge Status
* Notes

## 와이어프레임

```text
[Git / PR]

Branch Name: feature/report-semiconductor-etf-2026
Commit SHA: abc123...
PR URL: https://...
Merge Status: Open / Merged

[Save Git Info]
```

---

# 8.10 SCR-10 Content Detail - Deploy

## 목적

배포 상태 및 URL 관리

## 입력 필드

* Platform
* Environment
* Deployment Status
* Deployment URL
* Deployed At
* Notes

## 와이어프레임

```text
[Deployment]

Platform: Cloudflare Pages
Environment: prod
Status: success
URL: https://bigyocalc.com/reports/...
Deployed At: 2026-04-10 14:30

[Save Deployment]
[Mark as Deployed]
```

## 상태 규칙

* deployment success 저장 시 `deployed` 자동 제안

---

# 8.11 SCR-11 Content Detail - Activity

## 목적

전체 이력 확인

## 표시 항목

* 아이디어 생성
* 문서 생성
* 상태 변경
* Git 등록
* 배포 등록
* 실패/재시도

## 와이어프레임

```text
[Activity Log]

2026-04-10 10:12 Idea created
2026-04-10 10:20 Plan generated by Claude
2026-04-10 10:40 Design approved
2026-04-10 11:15 Dev request created
2026-04-10 13:50 Deployment saved
```

---

# 8.12 SCR-12 Documents List

## 목적

문서 기준 일괄 관리

## 탭

* Plan Docs
* Design Docs
* Dev Request Docs

## 필터

* Doc Type
* Status
* Version
* Content Category
* Generated By

## 테이블 컬럼

| 컬럼     | 설명                      |
| ------ | ----------------------- |
| 문서 제목  | 문서명                     |
| 문서 타입  | plan/design/dev_request |
| 연결 콘텐츠 | 콘텐츠명                    |
| 버전     | v1/v2                   |
| 상태     | draft/reviewed/approved |
| 수정일    | 최근 수정                   |

---

# 8.13 SCR-13 Jobs List

## 목적

AI 생성 작업 관리

## 테이블 컬럼

| 컬럼         | 설명                         |
| ---------- | -------------------------- |
| Job Type   | idea_expand 등              |
| Model      | Claude/GPT 등               |
| Content    | 연결 콘텐츠                     |
| Status     | queued/running/done/failed |
| Created At | 실행 시간                      |
| Error      | 에러 요약                      |

## 액션

* 상세 보기
* 재시도
* 로그 확인

---

# 8.14 SCR-14 Failed Jobs

## 목적

실패 건만 빠르게 대응

## 핵심 기능

* failed 상태 필터 기본 적용
* 재시도 버튼 노출
* 원인 메시지 표시

---

# 8.15 SCR-15 Deployments

## 목적

배포 기준 모니터링

## 화면 요소

* 최근 배포 리스트
* 플랫폼 필터
* 성공/실패 필터
* 배포 URL 확인

---

# 8.16 SCR-16 Prompt Library

## 목적

자주 쓰는 프롬프트 재사용

## 분류

* 아이디어 발굴용
* plan 생성용
* design 생성용
* dev request 생성용

## 테이블 컬럼

| 컬럼     | 설명                  |
| ------ | ------------------- |
| 제목     | 프롬프트명               |
| 대상 모델  | Claude/GPT/Codex    |
| 용도     | plan/design/dev     |
| 카테고리   | report/calculator 등 |
| 최근 사용일 | 마지막 사용 시점           |

---

# 8.17 SCR-17 Templates

## 목적

문서 템플릿 설정

## 관리 항목

* report plan template
* calculator plan template
* report design template
* calculator design template
* dev request template

---

# 8.18 SCR-18 Settings

## 목적

전역 설정 관리

## 섹션

1. 모델 설정
2. 기본 경로 규칙
3. repo 설정
4. 배포 플랫폼 기본값
5. 상태 전이 옵션
6. 템플릿 기본 선택값

---

# 9. 주요 컴포넌트 설계

## 9.1 ContentStatusBadge

상태를 배지로 표현

| 상태        | 표시  |
| --------- | --- |
| idea      | 회색  |
| planned   | 파랑  |
| designed  | 보라  |
| ready_dev | 주황  |
| in_dev    | 노랑  |
| deployed  | 초록  |
| archived  | 진회색 |

---

## 9.2 DocumentStatusCard

문서 생성 여부 표시 카드

표시 항목:

* plan 존재 여부
* design 존재 여부
* dev request 존재 여부
* 승인 여부

---

## 9.3 PipelineStepper

상태 흐름 시각화

```text
Idea → Planned → Designed → Ready Dev → In Dev → Deployed
```

현재 단계 강조 표시

---

## 9.4 AIResultCompareCard

모델별 결과 비교 카드

표시 항목:

* 모델명
* 요약
* 제목 후보
* 키워드
* 점수
* 채택 버튼

---

## 9.5 MarkdownDocEditor

문서 편집기

기능:

* MD 편집
* 자동 저장
* 버전 관리
* 승인 상태 표시

---

# 10. 상태/액션 설계

## 10.1 주요 액션 매트릭스

| 화면          | 액션            | 결과        |
| ----------- | ------------- | --------- |
| New Content | Create        | 콘텐츠 생성    |
| Ideas       | Select Result | 채택 결과 반영  |
| Plan        | Approve       | planned   |
| Design      | Approve       | designed  |
| Dev Request | Save & Ready  | ready_dev |
| Git         | Save Git      | Git 정보 연결 |
| Deploy      | Mark Deployed | deployed  |

---

## 10.2 버튼 정책

### 우선 노출 버튼

각 화면에서 다음 단계 버튼을 가장 강하게 노출

예:

* Overview 화면에서 `Generate Plan`
* Plan 화면에서 `Generate Design`
* Design 화면에서 `Generate Dev Request`
* Deploy 화면에서 `Mark as Deployed`

즉, 사용자에게 “다음 해야 할 일”을 계속 제시해야 한다.

---

# 11. 검색/필터 설계

## 11.1 글로벌 검색

검색 대상:

* 콘텐츠 제목
* 키워드
* 문서 제목
* 파일 경로

## 11.2 리스트 필터

* 타입
* 카테고리
* 상태
* 배포 여부
* 생성일
* 최근 수정일

## 11.3 추천 Saved Filters

* Plan 미작성
* Design 미작성
* Ready for Dev
* 배포 대기
* 실패 Job 있음

---

# 12. 반응형 설계 기준

## 데스크톱 우선

이 시스템은 운영 대시보드 성격이 강하므로 **데스크톱 최적화 우선**이 맞다.

## 반응형 기준

* 1280px 이상: 전체 레이아웃
* 1024px 이상: Sidebar 축소 가능
* 768px 이하: 상세 편집 화면은 최소 지원 수준

---

# 13. 구현 우선순위

## P0 화면

* SCR-01 Dashboard
* SCR-02 Contents List
* SCR-03 New Content
* SCR-04 Overview
* SCR-06 Plan
* SCR-07 Design
* SCR-08 Dev Request

## P1 화면

* SCR-05 Ideas
* SCR-09 Git
* SCR-10 Deploy
* SCR-11 Activity
* SCR-13 Jobs

## P2 화면

* SCR-12 Documents
* SCR-15 Deployments
* SCR-16 Prompt Library
* SCR-17 Templates
* SCR-18 Settings

---

# 14. 개발 관점 체크리스트

## 프론트엔드 체크리스트

* [ ] Sidebar + Header 공통 레이아웃 설계
* [ ] 상태 배지 컴포넌트 공통화
* [ ] 콘텐츠 리스트 필터/테이블 공통화
* [ ] 문서 에디터 컴포넌트 공통화
* [ ] 상세 화면 탭 구조 설계
* [ ] Job/Deploy 목록 공통 테이블 구성

## 백엔드 체크리스트

* [ ] content_items CRUD API
* [ ] documents CRUD API
* [ ] generation_jobs 조회/재시도 API
* [ ] 상태 전이 API
* [ ] git/deploy 저장 API
* [ ] activity log API

## 데이터 체크리스트

* [ ] content_items
* [ ] content_ideas
* [ ] documents
* [ ] generation_jobs
* [ ] git_changes
* [ ] deployments
* [ ] activity_logs 추가 고려

---

# 15. 최종 요약

이 IA/화면설계의 핵심은 아래입니다.

## 핵심 구조

* 운영 중심 Dashboard
* 콘텐츠 중심 Contents
* 문서 중심 Documents
* 실행 이력 중심 Jobs
* 반영 결과 중심 Deployments

## 핵심 UX

* “현재 상태”와 “다음 액션”이 항상 보여야 함
* plan / design / dev request가 콘텐츠 상세 안에서 이어져야 함
* 아이디어, 문서, 개발, 배포가 한 엔티티로 연결되어야 함

## 핵심 구현 포인트

* 채팅 UI 확장보다 **콘텐츠 워크플로우 UI**가 우선
* 상세 화면에서 모든 상태 전이가 일어나야 함
* 공통 컴포넌트와 상태 모델을 먼저 설계해야 함

---

다음 단계로 이어서 작업하면 가장 좋습니다.

**추천 다음 문서 순서**

1. `AI Platform — Content Ops Dashboard ERD + DB Schema v1`
2. `AI Platform — Content Ops Dashboard API Spec v1`
3. `AI Platform — Content Ops Dashboard Frontend Component Spec v1`

원하시면 다음으로
**ERD + DB Schema v1** 바로 작성하겠습니다.
