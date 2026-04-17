# 기획 문서 인덱스 (plan-docs)

> 새 기능을 기획할 때 이 디렉토리를 먼저 확인하라.
> 기획 문서는 구현 전에 작성하고 승인받은 뒤 개발을 시작한다.

---

## 문서 목록

| 문서 | 설명 | 상태 | 날짜 |
|---|---|---|---|
| _(상위 디렉토리)_ `../plan/AI Platform — Content Ops Dashboard PRD v1.md` | 초기 PRD | ✅ 완료 | 2024 |
| _(상위 디렉토리)_ `../plan/AI Platform — Content Ops Dashboard IA + 화면설계서 v1.md` | IA + 화면 설계 | ✅ 완료 | 2024 |

---

## 새 기획 문서 작성 가이드

### 파일 명명 규칙
```
YYYY-MM-DD_{기능명}-PRD.md
예: 2025-01-15_kanban-board-PRD.md
```

### 기획 문서 필수 포함 항목

```markdown
## 배경 & 목적
왜 이 기능이 필요한가

## 사용자 스토리
누가 어떤 상황에서 무엇을 하고 싶은가

## 기능 요구사항
- 필수 (Must Have)
- 권장 (Should Have)
- 선택 (Nice to Have)

## 비기능 요구사항
성능, 보안, 접근성 등

## 기술 제약
현재 스택(Next.js 14 / Express / Supabase)에서의 구현 가능성

## 성공 지표
어떻게 성공을 측정할 것인가

## 제외 범위
이번 구현에서 다루지 않는 것
```

---

## 기획 승인 프로세스

1. `plan-docs/` 에 PRD 초안 작성
2. 기술 검토: `docs/ARCHITECTURE.md` 와 충돌 여부 확인
3. 보안 검토: `docs/SECURITY.md` 요구사항 충족 여부 확인
4. 승인 후 `docs/design-docs/` 에 설계 문서 작성
5. 승인 후 `docs/exec-plans/` 에 실행 계획 작성

---

## 현재 개선 후보 기능 (미기획)

| 기능 | 우선순위 | 비고 |
|---|---|---|
| 칸반 보드 (드래그앤드롭) | Medium | 현재 버튼 클릭 방식 |
| Jobs WebSocket 실시간 업데이트 | Low | 현재 4초 폴링 |
| Settings API 키 관리 백엔드 연동 | Low | 현재 localStorage |
| Ideas 탭 content_ideas 테이블 직접 연동 | Low | 현재 activity 로그 복원 |
| 모바일 반응형 대응 | Low | 현재 데스크톱 전용 |
