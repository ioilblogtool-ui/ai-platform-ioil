-- =====================================================================
-- AA Workbench P2b 되돌리기 (Sprint 6: 버전)
-- 원칙(Sprint 6 U6): 문제가 생기면 먼저 코드만 되돌린다. 이 파일은 버전과 버전 기준 리뷰가
-- 하나도 없을 때만 실행된다(있으면 아무것도 바꾸지 않고 중단). 버전 기준 리뷰는 draft_revision이
-- NULL이라 버전 테이블이 없어지면 기준을 잃기 때문이다.
-- P1·P2a 객체(옛 aa_create_manual_review 포함)는 건드리지 않는다.
-- =====================================================================
begin;

do $$
declare v int; r int;
begin
  select count(*) into v from public.aa_architecture_versions;
  select count(*) into r from public.aa_reviews where version_id is not null;
  if v > 0 or r > 0 then
    raise exception 'P2b 되돌리기 중단: 버전 %건, 버전 기준 리뷰 %건이 있습니다. 코드만 되돌리고 DB는 유지하세요.', v, r;
  end if;
end $$;

drop function if exists public.aa_create_manual_review_at(uuid, uuid, int, uuid, text, jsonb, text, text, text, uuid);
drop function if exists public.aa_restore_version(uuid, uuid, uuid, int, jsonb);
drop function if exists public.aa_publish_version(uuid, uuid, int, uuid, text, text, text, jsonb, jsonb);
drop index if exists public.aa_reviews_project_version_idx;
drop index if exists public.aa_drafts_base_version_idx;
alter table public.aa_reviews drop constraint if exists aa_reviews_version_fkey;
alter table public.aa_architecture_drafts drop constraint if exists aa_drafts_base_version_fkey;
update public.aa_architecture_drafts set base_version_id = null where base_version_id is not null;   -- 버전이 0건이면 0행
drop table if exists public.aa_architecture_versions;          -- 트리거도 함께 삭제
drop function if exists public.aa_versions_immutable();

commit;

notify pgrst, 'reload schema';
