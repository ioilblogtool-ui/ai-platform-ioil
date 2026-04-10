# Agent Guide — AI Platform Content Ops

이 파일은 Claude Code가 이 프로젝트를 이어받을 때 빠르게 컨텍스트를 복원하기 위한 가이드다.  
상세 아키텍처는 `CLAUDE.md` 참조.

---

## 현재 작업 상태

**Phase 5 완료** — 모든 화면 구현 완료.

| Phase | 항목 | 상태 |
|---|---|---|
| Phase 1 | DB Schema | ✅ |
| Phase 2 | 백엔드 API | ✅ |
| Phase 3 | 레이아웃 + 컴포넌트 | ✅ |
| Phase 4 P0 | Dashboard, Contents, Content 탭 (Overview/Plan/Design/DevReq) | ✅ |
| Phase 4 P1 | Ideas/Git/Deploy/Activity 탭, Jobs 목록 | ✅ |
| Phase 5 | Documents, Deployments, Prompt Library, Templates, Settings | ✅ |

---

## 다음 작업 후보

현재 남은 미구현 기능은 없음. 아래는 개선/추가 가능한 항목들:

- [ ] Ideas 탭: `content_ideas` 테이블 연동 확인 (현재 activity 로그에서 복원 시도)
- [ ] Jobs 탭: WebSocket 실시간 업데이트 (현재 4초 polling)
- [ ] Settings: API Key 관리, 백엔드 연동 (현재 localStorage 저장)
- [ ] Contents 탭: 드래그 앤 드롭 칸반 (현재 버튼 클릭 방식)
- [ ] 전체: 모바일 반응형 대응

---

## 새 페이지 만들 때 체크리스트

- [ ] `app/(ops)/` 하위에 디렉토리 생성
- [ ] `'use client'` 선언 필수
- [ ] API 함수는 `frontend/lib/api.ts`의 기존 함수 사용 (`buildQuery` 헬퍼 확인)
- [ ] 인라인 CSS만 사용 (Tailwind 금지)
- [ ] `PageHeader` 컴포넌트로 상단 헤더 구성
- [ ] Content [id] 탭 추가 시 `layout.tsx`의 `TABS` 배열에도 추가

---

## 공통 컴포넌트 사용법

```tsx
// Card
import Card, { CardHeader, CardTitle, EmptyState } from '@/components/Card';
<Card style={{ padding: '16px 20px' }}>...</Card>
<EmptyState icon="◈" text="데이터 없음" />

// Button
import Button from '@/components/Button';
// variant: 'primary' | 'secondary' | 'ghost' | 'danger'
// size: 'sm' | 'md' | 'lg'
<Button variant="primary" size="sm" onClick={fn}>텍스트</Button>

// PageHeader
import PageHeader from '@/components/PageHeader';
<PageHeader title="Jobs" badge="12 items" actions={<Button>...</Button>} />

// StatusBadge
import { ContentStatusBadge, DocStatusBadge, JobStatusBadge, DeployStatusDot } from '@/components/StatusBadge';
<ContentStatusBadge value={item.status} size="sm" />
<JobStatusBadge value={job.status} />
<DeployStatusDot value={dep.status} />
```

---

## 디자인 토큰

```
배경:          #080809
카드 배경:     rgba(255,255,255,0.025)
보더:          rgba(255,255,255,0.06)
텍스트 주:    #c8c6c0  /  #e2e0db (강조)
텍스트 보조:  #9a98a8
텍스트 희미:  #5a5870  /  #3a3850 (더 희미)
골드 액센트:  #c8a96e
초록 (성공):   #4ade80
빨강 (에러):   #f87171
노랑 (경고):   #fbbf24
파랑:          #60a5fa
보라:          #a78bfa
주황:          #fb923c
```

---

## 알려진 패턴

### 목록 페이지 레이아웃 구조
```tsx
<div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
  <PageHeader title="..." badge="..." actions={...} />
  <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
    {/* 통계 카드 */}
    {/* 필터 바 */}
    {/* 테이블 or 카드 그리드 */}
  </div>
</div>
```

### 마스터-디테일 레이아웃 (prompt-library, templates)
```tsx
<div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
  <div style={{ flex: selected ? '0 0 400px' : 1, ... }}>  {/* 목록 */}
  {selected && <div style={{ flex: 1, ... }}>...</div>}     {/* 디테일 */}
</div>
```

### Content [id] 탭 추가 방법
1. `frontend/app/(ops)/contents/[id]/<tab-name>/page.tsx` 생성
2. `frontend/app/(ops)/contents/[id]/layout.tsx` → `TABS` 배열에 `{ label: '탭명', href: 'tab-name' }` 추가

---

## 알려진 버그 & 해결된 이슈

| 이슈 | 상태 | 해결 |
|---|---|---|
| URLSearchParams undefined → "undefined" 직렬화 | ✅ | `buildQuery()` 헬퍼 사용 |
| `/dashboard` 라우트 충돌 | ✅ | `app/dashboard/` 디렉토리 삭제 |
| deployments `Record<string, number>` 타입 추론 오류 | ✅ | 명시적 타입 선언 |
