# AI Platform — Content Ops Dashboard PRD v1

문서 버전: v1
문서 상태: Draft
작성일: 2026-04-10
대상 서비스: `ai-platform-ioil`
연계 서비스: `blog-tool`, `bigyocalc.com`

---

# 1. 문서 개요

## 1.1 배경

비교계산소(`bigyocalc.com`)는 정적 페이지 기반으로 운영되는 콘텐츠 사이트이며, 주요 산출물은 다음 두 가지다.

* 계산기형 콘텐츠
* 비교/분석 리포트형 콘텐츠

현재 운영 방식은 아래 흐름으로 진행되고 있다.

1. Claude / Codex / GPT / Gemini 등을 활용하여 기획 아이디어 발굴
2. `docs/plan` 하위에 웹 콘텐츠 기획 MD 작성
3. `docs/design` 하위에 설계 MD 작성
4. 설계 문서를 바탕으로 개발 요청
5. Git push 및 배포
6. 배포 후 운영/개선

이 흐름은 실제 업무에는 유효하지만, 현재는 다음과 같은 한계가 있다.

* 아이디어 발굴 기록이 여러 AI 도구에 분산됨
* 어떤 아이디어가 실제 `plan`으로 채택되었는지 추적이 어려움
* `plan → design → 개발 → 배포` 상태가 일관되게 연결되지 않음
* 문서, 개발 요청, Git 변경, 배포 결과가 하나의 엔티티로 묶여 있지 않음
* 반복 기획과 리라이팅 시 이력 관리가 어렵다

따라서 기존 `ai-platform-ioil`의 채팅형 MVP를 확장하여,
**콘텐츠 기획·설계·개발·배포를 관리하는 운영형 AI 대시보드**가 필요하다.

---

## 1.2 문서 목적

본 문서는 `ai-platform-ioil`를 기반으로 구축할 **AI Platform — Content Ops Dashboard**의 Phase 1 제품 요구사항을 정의한다.

본 PRD의 목적은 다음과 같다.

* 콘텐츠 운영 흐름을 하나의 시스템으로 정리
* 핵심 사용자 시나리오를 정의
* 데이터 구조, 화면 구조, 상태 전이, API 범위를 명확히 함
* Phase 1 MVP 구현 범위를 확정

---

## 1.3 제품 한 줄 정의

**AI Platform — Content Ops Dashboard**는
비교계산소 콘텐츠의 **아이디어 발굴 → 기획 문서 생성 → 설계 문서 생성 → 개발 요청 → Git/배포 추적**을 하나의 파이프라인으로 관리하는 운영형 AI 대시보드이다.

---

# 2. 문제 정의

## 2.1 현재 운영상 문제

### 문제 1. 아이디어 관리가 분산됨

* Claude / Codex / GPT / Gemini에서 각각 아이디어를 발굴
* 어떤 결과가 실제 채택되었는지 추적이 어려움
* 폐기된 아이디어와 보류 아이디어 구분이 안 됨

### 문제 2. 문서 생성 흐름이 단절됨

* `docs/plan` 문서와 `docs/design` 문서가 논리적으로 연결되어 있어도 시스템상 연결 정보가 없음
* 특정 설계 문서가 어떤 기획 문서에서 시작됐는지 역추적이 불편함

### 문제 3. 개발 요청과 배포 이력이 분리됨

* 설계 문서를 토대로 개발 요청을 하더라도,
  실제 커밋/브랜치/PR/배포 URL이 콘텐츠 단위로 관리되지 않음

### 문제 4. 상태 관리가 수동적임

* 현재는 “진행 중인지”, “기획 완료인지”, “배포되었는지”를 사람이 기억하거나 메모로 관리함
* 콘텐츠 수가 늘어날수록 운영 난이도 상승

### 문제 5. 재사용성과 자동화가 낮음

* 계산기형 / 리포트형 문서 포맷이 반복되는데도 자동 템플릿화가 부족함
* 같은 유형의 업무를 매번 다시 지시하고 있음

---

## 2.2 해결 방향

문제 해결의 핵심은 **대화 중심 시스템이 아니라 콘텐츠 엔티티 중심 시스템**으로 전환하는 것이다.

즉, 관리의 중심을 “채팅 세션”이 아니라 아래 단위로 둔다.

* 콘텐츠 카드(Content Item)
* 문서(Document)
* 생성 작업(Job)
* Git 변경(Change)
* 배포(Deployment)

---

# 3. 목표

## 3.1 제품 목표

* 콘텐츠 운영 전체 흐름을 단일 대시보드에서 관리할 수 있어야 한다
* 아이디어부터 배포까지 상태 기반으로 추적할 수 있어야 한다
* AI를 활용하여 `plan`, `design`, `dev request` 문서를 반복 생성할 수 있어야 한다
* 콘텐츠별 이력과 산출물을 구조화해서 저장해야 한다

## 3.2 비즈니스 목표

* 콘텐츠 생산 속도 향상
* 기획 누락/중복 감소
* AI 도구 활용 효율 상승
* 비교계산소 콘텐츠 확장 파이프라인 고도화

## 3.3 사용자 목표

사용자는 다음을 빠르게 수행할 수 있어야 한다.

* 새 콘텐츠 아이디어 등록
* 여러 AI 모델 결과 비교
* 기획 문서 생성
* 설계 문서 생성
* 개발 요청 프롬프트 생성
* 현재 진행 상태 및 배포 여부 확인

---

# 4. 범위

## 4.1 In Scope (Phase 1)

* 콘텐츠 아이디어 등록
* 콘텐츠 리스트/상세 조회
* 상태 관리(idea, planned, designed 등)
* `docs/plan` 문서 생성
* `docs/design` 문서 생성
* `dev request` 문서 생성
* 생성 작업 이력 저장
* 문서 파일 경로 저장
* Git/배포 상태 수동 또는 반자동 기록

## 4.2 Out of Scope (Phase 1)

* GitHub PR 자동 생성
* 실제 repo 파일 자동 커밋
* 완전 자동 배포 트리거
* 검색량/트래픽 외부 API 기반 자동 우선순위 계산
* 고급 성과 분석 대시보드
* 다중 사용자 협업 권한 세분화

---

# 5. 대상 사용자

## 5.1 Primary User

### 1인 운영자 / 콘텐츠 기획자 / 개발자

특징:

* AI를 이용해 콘텐츠를 반복적으로 생산
* 문서 기반으로 개발을 진행
* Git과 정적 배포 흐름을 이해하고 있음
* 아이디어, 기획, 설계, 개발 요청을 한 명이 모두 다룸

대표 니즈:

* 작업 히스토리 관리
* 반복 작업 자동화
* 문서 템플릿 표준화
* 콘텐츠 생산 파이프라인 시각화

## 5.2 Secondary User

### 향후 확장 사용자

* 외주 개발자
* 콘텐츠 보조 기획자
* 리뷰어

Phase 1에서는 고려하되, 본격 대응 범위는 아님.

---

# 6. 주요 사용자 시나리오

## 6.1 시나리오 A — 신규 콘텐츠 아이디어 발굴

1. 사용자가 새 아이디어를 입력한다.
2. 시스템이 콘텐츠 타입(계산기/리포트), 카테고리, 키워드를 설정한다.
3. 여러 AI 모델을 이용해 확장 결과를 생성한다.
4. 사용자는 결과 중 하나를 선택한다.
5. 콘텐츠 카드를 생성한다.
6. 상태는 `idea`로 저장된다.

### 기대 결과

* 아이디어 원문과 AI 결과가 함께 저장된다.
* 채택 여부를 기록할 수 있다.

---

## 6.2 시나리오 B — 기획 문서 생성

1. 사용자가 콘텐츠 카드에서 “Plan 생성”을 클릭한다.
2. 시스템이 선택된 템플릿을 기반으로 `docs/plan`용 MD를 생성한다.
3. 파일명 규칙에 따라 경로를 자동 제안한다.
4. 사용자가 검토 후 저장한다.
5. 상태는 `planned`로 전이된다.

### 기대 결과

* 기획 문서 생성 이력이 남는다.
* plan 파일 경로가 콘텐츠 카드와 연결된다.

---

## 6.3 시나리오 C — 설계 문서 생성

1. 사용자가 기존 `plan` 문서를 기반으로 “Design 생성”을 클릭한다.
2. 시스템이 설계 문서 템플릿으로 `docs/design` MD를 생성한다.
3. 사용자가 수정/저장한다.
4. 상태는 `designed`로 변경된다.

### 기대 결과

* 설계 문서가 plan과 연결된다.
* 이후 개발 요청 문서 생성의 기준 문서가 된다.

---

## 6.4 시나리오 D — 개발 요청 문서 생성

1. 사용자가 설계 문서를 기준으로 “개발 요청 생성”을 클릭한다.
2. 시스템이 Claude Code / Codex용 개발 프롬프트 문서를 생성한다.
3. 사용자는 이를 복사 또는 저장하여 실제 구현에 활용한다.
4. 상태는 `ready_dev`로 변경된다.

---

## 6.5 시나리오 E — 배포 상태 추적

1. 사용자가 브랜치명, 커밋, PR URL, 배포 URL을 입력한다.
2. 시스템은 이를 콘텐츠 카드에 연결한다.
3. 상태를 `in_dev` 또는 `deployed`로 변경한다.

### 기대 결과

* 특정 콘텐츠가 어디까지 진행되었는지 한눈에 확인 가능
* 문서와 코드 이력이 연결됨

---

# 7. 핵심 기능 요구사항

## 7.1 콘텐츠 관리

### 요구사항

* 사용자는 콘텐츠를 생성/조회/수정할 수 있어야 한다.
* 콘텐츠는 타입, 카테고리, 상태, 키워드, 우선순위를 가져야 한다.
* 콘텐츠 목록은 상태/유형/카테고리/검색어 기준으로 필터링 가능해야 한다.

### 필수 필드

* 제목
* 유형(calculator/report)
* 카테고리
* 상태
* 우선순위
* 주요 키워드
* 메모

---

## 7.2 아이디어 관리

### 요구사항

* 사용자는 아이디어 원문을 저장할 수 있어야 한다.
* AI 모델별 생성 결과를 여러 개 저장할 수 있어야 한다.
* 어떤 결과를 채택했는지 표시할 수 있어야 한다.

### 기대 UX

* “Claude 결과”
* “GPT 결과”
* “Gemini 결과”
* “Codex 결과”
  를 탭 또는 카드로 비교

---

## 7.3 문서 생성

### 요구사항

* 시스템은 콘텐츠 타입에 따라 다른 문서 템플릿을 적용해야 한다.
* 생성 대상 문서 타입:

  * plan
  * design
  * dev_request

### 예시 규칙

* `report` 타입이면 리포트형 목차 사용
* `calculator` 타입이면 입력값/결과값/로직/예외 처리 섹션 포함
* 카테고리가 투자면 비교표, CAGR, 리스크 섹션 포함
* 카테고리가 육아면 정책/지원금/기간/조건 섹션 포함

---

## 7.4 상태 관리

### 상태 정의

| 상태        | 설명          |
| --------- | ----------- |
| idea      | 아이디어 등록 완료  |
| planned   | 기획 문서 작성 완료 |
| designed  | 설계 문서 작성 완료 |
| ready_dev | 개발 요청 준비 완료 |
| in_dev    | 개발 진행 중     |
| deployed  | 배포 완료       |
| archived  | 보관/중단       |

### 상태 전이 규칙

| 현재 상태     | 액션             | 다음 상태     |
| --------- | -------------- | --------- |
| idea      | plan 생성        | planned   |
| planned   | design 생성      | designed  |
| designed  | dev request 생성 | ready_dev |
| ready_dev | 개발 시작          | in_dev    |
| in_dev    | 배포 완료          | deployed  |

---

## 7.5 Git / 배포 추적

### 요구사항

* 사용자는 브랜치명, 커밋 SHA, PR URL을 저장할 수 있어야 한다.
* 사용자는 배포 플랫폼, 배포 URL, 성공 여부를 저장할 수 있어야 한다.
* 콘텐츠 상세 화면에서 문서와 코드/배포 이력을 함께 조회할 수 있어야 한다.

### Phase 1 범위

* 수동 입력 또는 간단한 API 기록
* 자동 PR 생성은 제외

---

# 8. 비기능 요구사항

## 8.1 성능

* 리스트 화면은 일반적인 콘텐츠 수(수백 건)에서 빠르게 조회 가능해야 한다
* 문서 생성 요청은 비동기 job 처리 구조를 고려해야 한다

## 8.2 확장성

* 향후 다중 모델 호출을 붙일 수 있어야 한다
* Phase 2에서 GitHub 자동화 / 배포 자동화를 붙일 수 있어야 한다

## 8.3 유지보수성

* 프론트/백엔드는 기능별 모듈로 분리
* 문서 생성 템플릿은 코드와 분리된 설정 파일 구조를 권장

## 8.4 신뢰성

* 생성 작업 실패 시 재시도 가능해야 한다
* 실패 이력을 저장해야 한다

---

# 9. 정보 구조

## 9.1 메인 메뉴

* Dashboard
* Contents
* Ideas
* Documents
* Jobs
* Deployments
* Settings

## 9.2 Dashboard 구성

* 전체 콘텐츠 수
* 상태별 건수
* 이번 주 신규 아이디어 수
* 문서 생성 완료 수
* 배포 완료 수
* 실패 Job 수

## 9.3 Contents 상세 탭

* Overview
* Idea History
* Plan
* Design
* Dev Request
* Git / PR
* Deployment
* Activity Log

---

# 10. 데이터 모델

## 10.1 content_items

| 컬럼             | 타입        | 설명                             |
| -------------- | --------- | ------------------------------ |
| id             | uuid      | PK                             |
| title          | text      | 콘텐츠 제목                         |
| slug           | text      | 슬러그                            |
| content_type   | text      | calculator/report              |
| category       | text      | 카테고리                           |
| status         | text      | 상태                             |
| priority       | text      | 우선순위                           |
| seo_keyword    | text      | 주요 키워드                         |
| source_channel | text      | claude/gpt/gemini/codex/manual |
| target_repo    | text      | 대상 레포                          |
| target_path    | text      | 목표 경로                          |
| notes          | text      | 비고                             |
| created_at     | timestamp | 생성일                            |
| updated_at     | timestamp | 수정일                            |

## 10.2 content_ideas

| 컬럼                  | 타입        | 설명     |
| ------------------- | --------- | ------ |
| id                  | uuid      | PK     |
| content_item_id     | uuid      | FK     |
| raw_input           | text      | 사용자 입력 |
| ai_model            | text      | 모델명    |
| output_summary      | text      | 결과 요약  |
| full_output         | text      | 전체 결과  |
| chosen              | boolean   | 채택 여부  |
| score_search        | numeric   | 검색성    |
| score_monetize      | numeric   | 수익화    |
| score_build         | numeric   | 구현 난이도 |
| score_internal_link | numeric   | 내부 연결성 |
| created_at          | timestamp | 생성일    |

## 10.3 documents

| 컬럼              | 타입        | 설명                      |
| --------------- | --------- | ----------------------- |
| id              | uuid      | PK                      |
| content_item_id | uuid      | FK                      |
| doc_type        | text      | plan/design/dev_request |
| version         | text      | v1/v2                   |
| file_path       | text      | 문서 경로                   |
| title           | text      | 문서 제목                   |
| content_md      | text      | 문서 원문                   |
| status          | text      | draft/reviewed/approved |
| generated_by    | text      | manual/model            |
| created_at      | timestamp | 생성일                     |

## 10.4 generation_jobs

| 컬럼              | 타입        | 설명                                                             |
| --------------- | --------- | -------------------------------------------------------------- |
| id              | uuid      | PK                                                             |
| content_item_id | uuid      | FK                                                             |
| job_type        | text      | idea_expand/plan_generate/design_generate/dev_request_generate |
| model           | text      | 실행 모델                                                          |
| input_payload   | jsonb     | 입력                                                             |
| output_payload  | jsonb     | 결과                                                             |
| status          | text      | queued/running/done/failed                                     |
| error_message   | text      | 실패 메시지                                                         |
| created_at      | timestamp | 생성일                                                            |

## 10.5 git_changes

| 컬럼              | 타입        | 설명     |
| --------------- | --------- | ------ |
| id              | uuid      | PK     |
| content_item_id | uuid      | FK     |
| branch_name     | text      | 브랜치명   |
| commit_sha      | text      | 커밋 SHA |
| pr_url          | text      | PR 주소  |
| merged_at       | timestamp | 머지 시각  |

## 10.6 deployments

| 컬럼                | 타입        | 설명                             |
| ----------------- | --------- | ------------------------------ |
| id                | uuid      | PK                             |
| content_item_id   | uuid      | FK                             |
| platform          | text      | Cloudflare/Vercel 등            |
| environment       | text      | prod                           |
| deployment_status | text      | queued/building/success/failed |
| deployment_url    | text      | 결과 URL                         |
| deployed_at       | timestamp | 배포 일시                          |

---

# 11. API 요구사항

## 11.1 Contents

* `POST /api/content`
* `GET /api/content`
* `GET /api/content/:id`
* `PATCH /api/content/:id`
* `PATCH /api/content/:id/status`

## 11.2 Ideas

* `POST /api/ideas`
* `GET /api/content/:id/ideas`
* `POST /api/content/:id/ideas/generate`
* `PATCH /api/ideas/:id/select`

## 11.3 Documents

* `POST /api/content/:id/plan`
* `POST /api/content/:id/design`
* `POST /api/content/:id/dev-request`
* `GET /api/content/:id/documents`

## 11.4 Jobs

* `GET /api/jobs`
* `GET /api/jobs/:id`
* `POST /api/jobs/:id/retry`

## 11.5 Git / Deploy

* `POST /api/content/:id/git`
* `POST /api/content/:id/deployment`
* `GET /api/content/:id/activity`

---

# 12. UI/UX 요구사항

## 12.1 Dashboard

### 핵심 위젯

| 위젯            | 설명       |
| ------------- | -------- |
| 신규 아이디어 수     | 최근 생성량   |
| planned 수     | 기획 완료 건수 |
| designed 수    | 설계 완료 건수 |
| ready_dev 수   | 개발 대기 건수 |
| deployed 수    | 배포 완료 건수 |
| failed jobs 수 | 실패 작업 수  |

---

## 12.2 Contents 리스트

### 화면 요구사항

* 테이블 + 카드 혼합 가능
* 상태별 필터 제공
* 타입별 필터 제공
* 카테고리별 필터 제공
* 검색 기능 제공

### 리스트 컬럼 예시

| 컬럼     | 설명                |
| ------ | ----------------- |
| 제목     | 콘텐츠 제목            |
| 타입     | 계산기 / 리포트         |
| 상태     | 현재 단계             |
| 카테고리   | 연봉/육아/투자 등        |
| 문서 상태  | plan/design 생성 여부 |
| 배포 상태  | deployed 여부       |
| 최근 수정일 | 최근 갱신 일시          |

---

## 12.3 Contents 상세

### 섹션

1. 기본 정보
2. 아이디어 결과 비교
3. plan 문서
4. design 문서
5. dev request 문서
6. Git 정보
7. 배포 정보
8. 활동 로그

---

# 13. 템플릿 정책

## 13.1 plan 문서 템플릿

### calculator용 기본 목차

* 문서 목적
* 사용자 문제
* 입력값
* 계산 로직
* 출력값
* 예외 처리
* UI 구성
* SEO 포인트
* 내부 링크 구조

### report용 기본 목차

* 문서 목적
* 타깃 독자
* 핵심 메시지
* 비교 축
* 표/차트 구성
* 데이터 포인트
* SEO 포인트
* 내부 링크 구조

## 13.2 design 문서 템플릿

* 화면 구조
* 컴포넌트 구성
* 상태/쿼리 구조
* 데이터 모델
* URL/라우팅
* 에러 처리
* 구현 범위
* QA 체크리스트

## 13.3 dev request 템플릿

* 개발 목표
* 참고 문서
* 요구사항
* 컴포넌트 구현 범위
* 파일 생성/수정 대상
* 예외 처리
* 완료 기준

---

# 14. 아키텍처 방향

## 14.1 현재 기반

* Frontend: Next.js 14
* Backend: Node.js + Express
* DB/Auth: Supabase
* Front deploy: Vercel
* Backend deploy: Railway

## 14.2 Phase 1 구현 방향

기존 구조를 유지한 상태에서 콘텐츠 운영 기능을 추가한다.

### Frontend 확장 포인트

* `dashboard/page.tsx`를 콘텐츠 운영 화면으로 확장
* 콘텐츠 리스트/상세 페이지 추가
* 문서 생성/비교 UI 추가

### Backend 확장 포인트

* `routes/content.js`
* `routes/ideas.js`
* `routes/documents.js`
* `routes/jobs.js`
* `routes/deployments.js`

### DB 확장 포인트

* 기존 conversation 중심에서 content/document/job 중심으로 확장

---

# 15. 성공 지표

## 15.1 운영 KPI

| 지표              | 정의                         |
| --------------- | -------------------------- |
| 아이디어→plan 전환율   | 아이디어 중 plan까지 간 비율         |
| plan→design 전환율 | 기획 문서 중 설계 문서까지 간 비율       |
| design→배포 전환율   | 설계 문서 중 배포 완료된 비율          |
| 평균 리드타임         | idea부터 deployed까지 걸린 시간    |
| 재작업률            | 동일 콘텐츠의 plan/design 재생성 비율 |
| 모델 채택률          | 모델별 최종 채택 비율               |

## 15.2 사용자 체감 KPI

* 콘텐츠 상태를 한눈에 파악 가능
* 문서 작성 시간이 줄어듦
* 중복 기획이 줄어듦
* Git/배포 추적이 쉬워짐

---

# 16. 리스크 및 대응

## 리스크 1. 생성 결과 품질 편차

### 대응

* 모델별 결과 비교 UI 제공
* 수동 수정 및 저장 허용
* 템플릿 기반 생성 강화

## 리스크 2. 상태 관리가 번거로워질 수 있음

### 대응

* 주요 액션 시 자동 상태 변경
* 수동 수정 기능 유지

## 리스크 3. Git/배포 자동화 범위 과다

### 대응

* Phase 1은 수동 입력 중심
* Phase 2에서 자동화 확대

## 리스크 4. 문서가 많아지며 관리 복잡도 증가

### 대응

* 콘텐츠별 연결 구조 유지
* 파일 경로 규칙 통일
* 버전 관리 필드 제공

---

# 17. 출시 범위 제안

## Phase 1

* 콘텐츠 엔티티 관리
* 아이디어 기록
* plan/design/dev request 생성
* 상태 관리 보드
* Git/배포 기록 저장

## Phase 2

* GitHub API 연동
* PR 자동 생성
* 배포 상태 자동 수집
* 검색량/성과 기반 우선순위 추천
* 기존 콘텐츠 리프레시 추천

---

# 18. 개발 우선순위

## P0

* content_items
* documents
* 상태 관리
* plan 생성
* design 생성

## P1

* 아이디어 비교
* dev request 생성
* activity log

## P2

* Git/배포 연동
* job retry
* 고급 필터/검색

---

# 19. 오픈 이슈

1. 문서 실제 파일 쓰기를 플랫폼에서 직접 수행할지, 복붙형으로 갈지 결정 필요
2. AI 모델 호출을 서버에서 직접 통합할지, 외부 툴 결과를 입력받을지 결정 필요
3. `blog-tool` 레포와의 연동 수준(PAT / GitHub App / 수동) 결정 필요
4. 문서 템플릿을 DB 저장형으로 할지 코드 파일형으로 할지 결정 필요

---

# 20. 최종 요약

AI Platform — Content Ops Dashboard의 핵심은 다음이다.

* 채팅이 아니라 **콘텐츠 카드 중심**
* 대화 로그가 아니라 **산출물 중심**
* 단발성 생성이 아니라 **상태 기반 파이프라인**
* 아이디어, 문서, 개발, 배포를 **한 엔티티로 연결**

이 제품이 구축되면 비교계산소 운영 흐름은 아래처럼 정리된다.

`아이디어 발굴 → 콘텐츠 카드 생성 → plan 생성 → design 생성 → dev request 생성 → Git/배포 추적 → 운영`

이 구조가 승스님의 현재 업무 방식과 가장 잘 맞는 Phase 1 제품 정의다.

원하면 다음 단계로 바로 이어서
**“AI Platform — Content Ops Dashboard IA + 화면설계서 v1”**까지 이어서 작성하겠습니다.
