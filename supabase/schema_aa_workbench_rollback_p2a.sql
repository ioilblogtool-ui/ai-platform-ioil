-- =====================================================================
-- AA Workbench P2a 되돌리기 (Sprint 5: 외부 AI 수동 리뷰)
-- 리뷰·답변 데이터가 모두 지워진다. 데이터가 있으면 실행 전에 사용자 확인.
-- P1 객체(aa_projects·drafts·requirements·RPC 2개)는 건드리지 않는다.
-- =====================================================================
begin;
drop function if exists public.aa_create_manual_review(uuid, uuid, int, text, jsonb, text, text, text, uuid);
drop table if exists public.aa_review_answers;
drop table if exists public.aa_reviews;
commit;

notify pgrst, 'reload schema';
