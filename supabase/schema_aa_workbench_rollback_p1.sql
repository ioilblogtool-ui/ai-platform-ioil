-- AA Workbench P1 되돌리기 — 필요할 때만 실행. AA 데이터가 모두 삭제된다. 기존 테이블에는 영향 없음.
drop function if exists public.aa_save_draft(uuid, uuid, int, jsonb);
drop function if exists public.aa_create_project(uuid, text, text, text, jsonb);
drop table if exists public.aa_requirements, public.aa_architecture_drafts, public.aa_projects cascade;
drop function if exists public.aa_next_code(uuid, text);
drop function if exists public.aa_touch_updated_at();
