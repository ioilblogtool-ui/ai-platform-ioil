# AGENT.md — 세션 시작 빠른 참조

> 이 파일은 Claude Code가 새 세션을 시작할 때 **가장 먼저** 읽는 빠른 참조 카드다.
> 상세 내용은 `CLAUDE.md` 및 `docs/` 디렉토리를 참조.

---

## 프로젝트 한 줄 요약

Next.js 14 + Express + Supabase로 구성된 **Content Ops Dashboard** — 콘텐츠 기획→AI 생성→개발→배포 워크플로우 관리.

---

## 세션 시작 체크리스트

| 순서 | 작업 | 파일 |
|---|---|---|
| 1 | 프로젝트 규칙·패턴 확인 | `CLAUDE.md` |
| 2 | 현재 작업 상태·다음 후보 확인 | `AGENTS.md` |
| 3 | 새 기능 기획이라면 | `docs/plan-docs/README.md` |
| 4 | 구현 전 설계 확인이라면 | `docs/design-docs/README.md` |
| 5 | 코드 구조 파악이 필요하다면 | `docs/ARCHITECTURE.md` |
| 6 | PR·배포 전 품질 점검 | `docs/QUALITY_SCORE.md` |
| 7 | API키·보안 관련 작업 | `docs/SECURITY.md` |

---

## 핵심 규칙 (반드시 준수)

```
❌ Tailwind 사용 금지 → 모든 스타일은 inline CSS
❌ URLSearchParams 직접 사용 금지 → buildQuery() 헬퍼 사용
✅ API 호출: frontend/lib/api.ts 의 기존 함수 사용
✅ 새 페이지: app/(ops)/ 하위, 'use client' 선언 필수
✅ Claude 응답 JSON 파싱: parseJsonSafe() 사용
✅ 백엔드 AI 생성: runJob() 헬퍼 사용
```

---

## 포트 & 엔드포인트

| 서비스 | 로컬 | 프로덕션 |
|---|---|---|
| Frontend | `http://localhost:3000` | Vercel |
| Backend | `http://localhost:4000` | Railway |
| DB | Supabase (PostgreSQL) | Supabase |

---

## 현재 구현 상태

**Phase 5 완료** — 모든 21개 화면 구현 완료.
개선 후보: Ideas 탭 연동, WebSocket 실시간 업데이트, Settings API 키 관리, 칸반 드래그앤드롭.

---

## 로컬 실행

```bash
cd backend && npm run dev   # 백엔드 (port 4000)
cd frontend && npm run dev  # 프론트엔드 (port 3000)
```

---

## 문서 맵

| 파일 | 용도 | 언제 읽을지 |
|---|---|---|
| `AGENT.md` | 에이전트 빠른 참조 | 세션 시작 직후 |
| `CLAUDE.md` | 프로젝트 규칙 허브 | 세션 시작 시 자동 로드 |
| `AGENTS.md` | 상세 구현 가이드 | 새 컴포넌트·패턴 작성 시 |
| `docs/ARCHITECTURE.md` | 코드 구조 전체 지도 | 새 파일 추가·수정 전 |
| `docs/QUALITY_SCORE.md` | 품질 루브릭 | PR·배포 직전 |
| `docs/SECURITY.md` | 보안 규칙 | API키·외부링크·민감데이터 처리 시 |
| `docs/plan-docs/README.md` | 기획 문서 인덱스 | 새 기능 기획 시 |
| `docs/design-docs/README.md` | 설계 문서 인덱스 | 구현 전 설계 확인 시 |
| `docs/references/README.md` | 외부 레퍼런스 | 라이브러리·API 사용 시 |
| `docs/exec-plans/README.md` | 실행 계획 | 다음 작업 우선순위 결정 시 |
