-- =====================================================================
-- AA Workbench — schema (Phase별 블록)
-- 적용: Supabase SQL Editor에서 블록 단위로 실행. 기존 테이블은 건드리지 않는다.
-- 원칙: AA 테이블·함수는 Express API(service_role) 전용. anon/authenticated 접근 차단.
-- =====================================================================

-- =====================================================================
-- P1 (Phase 1 · Sprint 1) — projects · drafts · requirements · RPC 2개 · 권한
-- PostgreSQL 15 전용 구문 없음. 다시 실행해도 안전(if not exists / create or replace).
-- =====================================================================
begin;

-- 공통: updated_at 자동 갱신 ------------------------------------------
create or replace function public.aa_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- 1. projects ---------------------------------------------------------
create table if not exists public.aa_projects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 120),
  description   text,
  status        text not null default 'active' check (status in ('active','archived')),
  readme_md     text not null default '' check (octet_length(readme_md) <= 65536),
  ai_settings   jsonb not null default '{"apiReview": false, "monthlyRunLimit": 0, "maxInputTokens": 60000}'::jsonb,
  seq_counters  jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, user_id)                       -- 하위 테이블 복합 FK 대상 (프로젝트 경계)
);
alter table public.aa_projects enable row level security;   -- 정책 없음 = anon/authenticated 기본 거부
create index if not exists aa_projects_user_status_idx
  on public.aa_projects (user_id, status, updated_at desc);
create or replace trigger aa_projects_touch before update on public.aa_projects
  for each row execute function public.aa_touch_updated_at();

-- 프로젝트 단위 순번: aa_next_code(project, 'NFR') → 'NFR-006' (행 잠금으로 원자적)
create or replace function public.aa_next_code(p_project uuid, p_prefix text)
returns text
language plpgsql
set search_path = public
as $$
declare n int;
begin
  update public.aa_projects
     set seq_counters = jsonb_set(seq_counters, array[p_prefix],
                          to_jsonb(coalesce((seq_counters->>p_prefix)::int, 0) + 1))
   where id = p_project
  returning (seq_counters->>p_prefix)::int into n;
  if n is null then raise exception 'project not found'; end if;
  return p_prefix || '-' || lpad(n::text, 3, '0');
end $$;

-- 2. drafts (프로젝트당 1행) ------------------------------------------
-- base_version_id의 FK는 P2 블록에서 versions 테이블과 함께 추가한다.
create table if not exists public.aa_architecture_drafts (
  project_id       uuid primary key,
  user_id          uuid not null,
  model            jsonb not null,
  revision         int  not null default 1 check (revision >= 1),
  base_version_id  uuid,
  updated_at       timestamptz not null default now(),
  foreign key (project_id, user_id) references public.aa_projects(id, user_id) on delete cascade
);
alter table public.aa_architecture_drafts enable row level security;   -- 정책 없음 = anon/authenticated 기본 거부
create or replace trigger aa_drafts_touch before update on public.aa_architecture_drafts
  for each row execute function public.aa_touch_updated_at();

-- 3. requirements -----------------------------------------------------
create table if not exists public.aa_requirements (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null,
  user_id       uuid not null,
  code          text not null,
  kind          text not null check (kind in ('fr','nfr')),
  category      text check (category in ('availability','performance','scalability','security','operability','cost','other')),
  title         text not null,
  description   text,
  target        text,
  metric        text,
  measurement   jsonb not null default '{}'::jsonb,
  priority      text not null default 'should' check (priority in ('must','should','could')),
  status        text not null default 'active' check (status in ('active','deprecated')),
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (project_id, user_id) references public.aa_projects(id, user_id) on delete cascade,
  unique (project_id, id),
  unique (project_id, code)
);
alter table public.aa_requirements enable row level security;   -- 정책 없음 = anon/authenticated 기본 거부
create index if not exists aa_requirements_project_kind_idx
  on public.aa_requirements (project_id, kind, sort_order);
create or replace trigger aa_requirements_touch before update on public.aa_requirements
  for each row execute function public.aa_touch_updated_at();

-- 4. RPC: 프로젝트 + Draft(rev 1) 한 트랜잭션 생성 ----------------------
create or replace function public.aa_create_project(
  p_user uuid, p_name text, p_description text, p_readme_md text, p_model jsonb
)
returns public.aa_projects
language plpgsql
security invoker
set search_path = public
as $$
declare v public.aa_projects;
begin
  insert into public.aa_projects (user_id, name, description, readme_md)
  values (p_user, p_name, p_description, coalesce(p_readme_md, ''))
  returning * into v;

  insert into public.aa_architecture_drafts (project_id, user_id, model, revision)
  values (v.id, p_user, p_model, 1);

  return v;
end $$;

-- 5. RPC: Draft 저장 (낙관적 잠금) --------------------------------------
-- base_revision이 현재 revision과 같을 때만 저장하고 revision을 1 올린다.
-- 다르면 저장하지 않고 { conflict: true, revision: 현재값 } 반환 → API가 409로 변환.
-- force(검사 생략) 옵션은 없다 (D-20).
create or replace function public.aa_save_draft(
  p_project uuid, p_user uuid, p_base_revision int, p_model jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare v_rev int; v_at timestamptz;
begin
  update public.aa_architecture_drafts
     set model = p_model, revision = revision + 1
   where project_id = p_project and user_id = p_user and revision = p_base_revision
  returning revision, updated_at into v_rev, v_at;

  if found then
    return jsonb_build_object('conflict', false, 'revision', v_rev, 'updated_at', v_at);
  end if;

  select revision, updated_at into v_rev, v_at
    from public.aa_architecture_drafts
   where project_id = p_project and user_id = p_user;

  if not found then
    return jsonb_build_object('conflict', false, 'not_found', true);
  end if;

  return jsonb_build_object('conflict', true, 'revision', v_rev, 'updated_at', v_at);
end $$;

-- 6. 권한: Express API(service_role) 전용 -------------------------------
-- 테이블: anon/authenticated 권한 회수 (RLS는 각 create table 바로 아래에서 켬)
do $$
declare t text;
begin
  foreach t in array array['aa_projects','aa_architecture_drafts','aa_requirements'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- 함수: 새 함수의 기본 PUBLIC EXECUTE와 Supabase 기본 권한을 회수, service_role에만 허용
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'aa\_%'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

commit;

-- PostgREST 스키마 캐시 갱신 (API에서 새 테이블·함수를 바로 인식)
notify pgrst, 'reload schema';

-- =====================================================================
-- P1 적용 후 확인용 (따로 실행)
-- =====================================================================
-- select table_name from information_schema.tables
--  where table_schema = 'public' and table_name like 'aa\_%';                -- 3행
-- select grantee, table_name, privilege_type from information_schema.role_table_grants
--  where table_name like 'aa\_%' and grantee in ('anon','authenticated');    -- 0행
-- select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_exec,
--        has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname like 'aa\_%';                     -- 전부 false

-- 되돌리기 SQL은 schema_aa_workbench_rollback_p1.sql (별도 파일)

-- =====================================================================
-- P2a (Phase 2 · Sprint 5) — 외부 AI 수동 리뷰: reviews · review_answers · RPC 1개 · 권한
-- 03 P2 블록 중 Sprint 5에 필요한 부분만 (Sprint 5 실행계획 Q1·Q7·Q8·Q11).
-- 버전 FK(aa_reviews.version_id → aa_architecture_versions, Postgres 15 구문)는 P2b(Sprint 6)에서 추가한다.
-- 이 블록의 version_id는 항상 NULL이다 (Draft 기준만).
-- PostgreSQL 15 전용 구문 없음. 다시 실행해도 안전. 권한은 이 블록이 만든 객체에만 적용한다.
-- 적용 전: 이 Supabase 프로젝트가 운영과 같은지 확인 (Sprint 5 U1).
-- =====================================================================
begin;

-- 5. reviews (manual) -------------------------------------------------
create table if not exists public.aa_reviews (
  id                     uuid primary key default gen_random_uuid(),
  project_id             uuid not null,
  user_id                uuid not null,
  version_id             uuid,                       -- P2b에서 버전 FK 추가. P2a에서는 항상 NULL
  draft_revision         int,
  mode                   text not null default 'manual' check (mode in ('manual','api')),
  model_snapshot         jsonb,
  bundle_id              text check (bundle_id is null or char_length(bundle_id) <= 40),
  bundle_scope           jsonb,                      -- { format, scopeLabel, scope, template, question } — format: ai-md | ai-json
  bundle_md              text check (bundle_md is null or octet_length(bundle_md) <= 524288),  -- 실제로 복사한 원문 (ai-json이면 JSON 원문)
  requirements_snapshot  jsonb not null default '{}'::jsonb,
  model_hash             text,
  areas                  text[] not null default '{}',
  status                 text not null default 'queued' check (status in ('queued','running','done','failed')),
  worker_id              text,
  heartbeat_at           timestamptz,
  error                  text,
  ai_model               text,
  input_tokens           int,
  output_tokens          int,
  summary                text,
  started_at             timestamptz,
  finished_at            timestamptz,
  client_request_id      uuid,                       -- 저장 재시도 중복 방지 (Q11)
  created_at             timestamptz not null default now(),
  foreign key (project_id, user_id) references public.aa_projects(id, user_id) on delete cascade,
  unique (project_id, id),
  unique (project_id, client_request_id),
  check (version_id is not null or draft_revision is not null),
  check (mode <> 'api' or (model_snapshot is not null and model_hash is not null))
);
alter table public.aa_reviews enable row level security;

-- 5-1. 수동 리뷰 답변 (REV-M2·M7) -------------------------------------
create table if not exists public.aa_review_answers (
  id                 uuid primary key default gen_random_uuid(),
  review_id          uuid not null,
  project_id         uuid not null,
  user_id            uuid not null,
  tool               text not null check (char_length(tool) between 1 and 60),
  answer_md          text not null check (octet_length(answer_md) <= 262144),
  follow_up_of       uuid,
  follow_up_question text check (follow_up_question is null or char_length(follow_up_question) <= 2000),
  client_request_id  uuid,
  created_at         timestamptz not null default now(),
  foreign key (project_id, user_id) references public.aa_projects(id, user_id) on delete cascade,
  foreign key (project_id, review_id) references public.aa_reviews(project_id, id) on delete cascade,
  unique (project_id, id),
  unique (project_id, client_request_id)
);
alter table public.aa_review_answers enable row level security;

create index if not exists aa_review_answers_review_idx on public.aa_review_answers (review_id, created_at);
create index if not exists aa_reviews_project_created_idx on public.aa_reviews (project_id, created_at desc);
create index if not exists aa_reviews_active_status_idx on public.aa_reviews (status) where status in ('queued','running');

-- RPC: 수동 리뷰 + 첫 답변을 한 트랜잭션으로 (05 §5).
-- 같은 client_request_id면 새로 만들지 않고 기존 것을 돌려준다 (existing = true).
create or replace function public.aa_create_manual_review(
  p_project uuid, p_user uuid, p_draft_revision int,
  p_bundle_id text, p_bundle_scope jsonb, p_bundle_md text,
  p_tool text, p_answer_md text, p_client_request_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare v_review uuid; v_answer uuid;
begin
  if p_client_request_id is not null then
    select r.id into v_review from public.aa_reviews r
     where r.project_id = p_project and r.user_id = p_user and r.client_request_id = p_client_request_id;
    if found then
      select a.id into v_answer from public.aa_review_answers a
       where a.project_id = p_project and a.review_id = v_review order by a.created_at, a.id limit 1;
      return jsonb_build_object('review_id', v_review, 'answer_id', v_answer, 'existing', true);
    end if;
  end if;

  insert into public.aa_reviews (project_id, user_id, version_id, draft_revision, mode, status,
                                 bundle_id, bundle_scope, bundle_md, finished_at, client_request_id)
  values (p_project, p_user, null, p_draft_revision, 'manual', 'done',
          p_bundle_id, p_bundle_scope, p_bundle_md, now(), p_client_request_id)
  returning id into v_review;

  insert into public.aa_review_answers (review_id, project_id, user_id, tool, answer_md)
  values (v_review, p_project, p_user, p_tool, p_answer_md)
  returning id into v_answer;

  return jsonb_build_object('review_id', v_review, 'answer_id', v_answer, 'existing', false);
exception when unique_violation then
  -- 같은 요청이 동시에 두 번 들어온 경우: 먼저 커밋된 것을 돌려준다 (이 블록의 insert는 모두 취소됨)
  select r.id into v_review from public.aa_reviews r
   where r.project_id = p_project and r.user_id = p_user and r.client_request_id = p_client_request_id;
  if not found then raise; end if;
  select a.id into v_answer from public.aa_review_answers a
   where a.project_id = p_project and a.review_id = v_review order by a.created_at, a.id limit 1;
  return jsonb_build_object('review_id', v_review, 'answer_id', v_answer, 'existing', true);
end $$;

-- 권한: 이 블록이 만든 객체만 (기존 P1 객체는 건드리지 않음)
revoke all on public.aa_reviews, public.aa_review_answers from anon, authenticated;
grant all on public.aa_reviews, public.aa_review_answers to service_role;
revoke execute on function public.aa_create_manual_review(uuid, uuid, int, text, jsonb, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.aa_create_manual_review(uuid, uuid, int, text, jsonb, text, text, text, uuid) to service_role;

commit;

notify pgrst, 'reload schema';

-- =====================================================================
-- P2a 적용 후 확인용 (따로 실행)
-- =====================================================================
-- select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
--  where n.nspname = 'public' and c.relname in ('aa_reviews','aa_review_answers');                               -- 2행, true
-- select grantee, table_name, privilege_type from information_schema.role_table_grants
--  where table_name in ('aa_reviews','aa_review_answers') and grantee in ('anon','authenticated');              -- 0행
-- select has_function_privilege('anon', 'public.aa_create_manual_review(uuid, uuid, int, text, jsonb, text, text, text, uuid)', 'execute') as anon_exec,
--        has_function_privilege('authenticated', 'public.aa_create_manual_review(uuid, uuid, int, text, jsonb, text, text, text, uuid)', 'execute') as auth_exec;  -- false, false

-- 되돌리기 SQL은 schema_aa_workbench_rollback_p2a.sql (별도 파일)

-- =====================================================================
-- P2b (Phase 2 · Sprint 6) — 버전: versions · 불변 트리거 · drafts·reviews 복합 FK · RPC 3개 · 권한
-- Sprint 6 실행계획 Q1~Q5·Q8·Q9·Q15. 노트(aa_notes)는 P2c(Sprint 9).
-- PostgreSQL 15 구문(on delete set null (col)) 사용 — Supabase 17.6 확인 (Sprint 6 U1).
-- 다시 실행해도 안전. 권한은 이 블록이 만든 객체에만 적용한다. 기존 aa_create_manual_review는 그대로 둔다.
-- 적용 순서(Sprint 6 U4): 리허설 SQL(되돌림) → 이 블록 → 확인 쿼리.
-- =====================================================================
begin;

-- 2. versions (불변) ---------------------------------------------------
create table if not exists public.aa_architecture_versions (
  id                     uuid primary key default gen_random_uuid(),
  project_id             uuid not null,
  user_id                uuid not null,
  version_no             int  not null check (version_no >= 1),
  label                  text not null check (char_length(label) between 1 and 40),        -- 'v1.0', 'v1.1'
  note                   text check (note is null or char_length(note) <= 2000),
  model                  jsonb not null,                                                    -- 발행 시점 Draft 모델 그대로 (좌표 포함)
  requirements_snapshot  jsonb not null default '{}'::jsonb,                                -- 모델이 참조한 요구사항의 발행 시점 값 (03 §6.2)
  readme_md              text not null default '' check (octet_length(readme_md) <= 65536), -- 발행 시점 프로젝트 개요 (Q15, P2-9)
  model_hash             text not null,                                                     -- 의미 해시 (좌표·크기·viewport 제외, Q3)
  diff_summary           jsonb,                                                             -- 직전 버전 대비 요약 (Q5), 발행 때 확정
  source_revision        int  not null,                                                     -- 발행한 Draft revision
  created_at             timestamptz not null default now(),
  foreign key (project_id, user_id) references public.aa_projects(id, user_id) on delete cascade,
  unique (project_id, id),                    -- B3: 하위 행이 같은 프로젝트 버전만 가리키게
  unique (project_id, version_no),
  unique (project_id, label)
);
alter table public.aa_architecture_versions enable row level security;   -- 정책 없음 = 기본 거부

-- 불변: UPDATE 금지, DELETE는 부모 프로젝트가 이미 없을 때(프로젝트 삭제 cascade)만 (D-09)
create or replace function public.aa_versions_immutable()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.aa_projects where id = old.project_id) then
    return old;
  end if;
  raise exception 'aa_architecture_versions is immutable' using errcode = 'P0001';
end $$;
create or replace trigger aa_versions_no_update before update on public.aa_architecture_versions
  for each row execute function public.aa_versions_immutable();
create or replace trigger aa_versions_no_delete before delete on public.aa_architecture_versions
  for each row execute function public.aa_versions_immutable();

-- 3·5. 복합 FK (B3) ----------------------------------------------------
-- 03대로 둘 다 set null (col): project_id는 그대로 두고 버전 id만 비운다.
-- 버전은 프로젝트 삭제 cascade로만 지워진다. 그때 리뷰 행의 cascade 삭제가 set null보다 먼저 실행되므로
-- 버전 기준 리뷰(draft_revision NULL)의 check에 걸리지 않는다 — 리허설 7번·로컬 실측(생성 순서 두 가지)으로 확인.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'aa_drafts_base_version_fkey') then
    alter table public.aa_architecture_drafts
      add constraint aa_drafts_base_version_fkey foreign key (project_id, base_version_id)
      references public.aa_architecture_versions(project_id, id) on delete set null (base_version_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'aa_reviews_version_fkey') then
    alter table public.aa_reviews
      add constraint aa_reviews_version_fkey foreign key (project_id, version_id)
      references public.aa_architecture_versions(project_id, id) on delete set null (version_id);
  end if;
end $$;
create index if not exists aa_reviews_project_version_idx on public.aa_reviews (project_id, version_id) where version_id is not null;
create index if not exists aa_drafts_base_version_idx on public.aa_architecture_drafts (project_id, base_version_id) where base_version_id is not null;

-- RPC: 발행 (03 §6.2, Sprint 6 Q4·Q5·Q7) --------------------------------
-- Draft 행을 잠근 뒤 (1) revision (2) Node가 비교한 직전 버전이 지금도 최신인지 (3) 변경 없음(해시·요구사항 스냅샷 모두 같음)
-- (4) 라벨 중복을 확인하고, 잠긴 Draft의 model을 그대로 복사한다. Draft revision은 올리지 않는다.
-- 결과 status: ok | not_found | conflict | version_changed | no_changes | label_taken
create or replace function public.aa_publish_version(
  p_project uuid, p_user uuid, p_base_revision int, p_expected_latest uuid,
  p_label text, p_note text, p_model_hash text, p_requirements_snapshot jsonb, p_diff_summary jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_draft public.aa_architecture_drafts;
  v_latest_id uuid; v_latest_no int; v_latest_label text; v_latest_hash text; v_latest_snap jsonb;
  v_id uuid; v_no int; v_created timestamptz;
begin
  select * into v_draft from public.aa_architecture_drafts
   where project_id = p_project and user_id = p_user
   for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_draft.revision <> p_base_revision then
    return jsonb_build_object('status', 'conflict', 'revision', v_draft.revision);
  end if;

  select v.id, v.version_no, v.label, v.model_hash, v.requirements_snapshot
    into v_latest_id, v_latest_no, v_latest_label, v_latest_hash, v_latest_snap
    from public.aa_architecture_versions v
   where v.project_id = p_project
   order by v.version_no desc
   limit 1;
  if v_latest_id is distinct from p_expected_latest then
    return jsonb_build_object('status', 'version_changed', 'latest_id', v_latest_id, 'latest_label', v_latest_label);
  end if;
  if v_latest_id is not null and v_latest_hash = p_model_hash
     and v_latest_snap = coalesce(p_requirements_snapshot, '{}'::jsonb) then
    return jsonb_build_object('status', 'no_changes', 'latest_id', v_latest_id, 'latest_label', v_latest_label);
  end if;
  if exists (select 1 from public.aa_architecture_versions where project_id = p_project and label = p_label) then
    return jsonb_build_object('status', 'label_taken');
  end if;

  v_no := coalesce(v_latest_no, 0) + 1;
  insert into public.aa_architecture_versions
    (project_id, user_id, version_no, label, note, model, requirements_snapshot, readme_md,
     model_hash, diff_summary, source_revision)
  select p_project, p_user, v_no, p_label, p_note, v_draft.model, coalesce(p_requirements_snapshot, '{}'::jsonb),
         p.readme_md, p_model_hash, p_diff_summary, v_draft.revision
    from public.aa_projects p
   where p.id = p_project and p.user_id = p_user
  returning id, created_at into v_id, v_created;

  update public.aa_architecture_drafts set base_version_id = v_id
   where project_id = p_project and user_id = p_user;

  return jsonb_build_object('status', 'ok', 'id', v_id, 'version_no', v_no, 'label', p_label,
                            'created_at', v_created, 'revision', v_draft.revision);
exception when unique_violation then
  -- 같은 라벨이 경합으로 먼저 들어온 경우 (version_no는 Draft 잠금 아래에서 계산하므로 겹치지 않음)
  return jsonb_build_object('status', 'label_taken');
end $$;

-- RPC: 복원 (Sprint 6 Q8) ---------------------------------------------
-- p_model은 Node가 버전 모델에서 지금 없는 요구사항 참조만 뺀 것 (V9를 같은 저장에서 정리).
-- 결과 status: ok | not_found | version_not_found | conflict
create or replace function public.aa_restore_version(
  p_project uuid, p_user uuid, p_version uuid, p_base_revision int, p_model jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare v_rev int; v_at timestamptz;
begin
  select revision into v_rev from public.aa_architecture_drafts
   where project_id = p_project and user_id = p_user
   for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not exists (select 1 from public.aa_architecture_versions
                  where project_id = p_project and user_id = p_user and id = p_version) then
    return jsonb_build_object('status', 'version_not_found');
  end if;
  if v_rev <> p_base_revision then
    return jsonb_build_object('status', 'conflict', 'revision', v_rev);
  end if;

  update public.aa_architecture_drafts
     set model = p_model, revision = revision + 1, base_version_id = p_version
   where project_id = p_project and user_id = p_user
  returning revision, updated_at into v_rev, v_at;

  return jsonb_build_object('status', 'ok', 'revision', v_rev, 'updated_at', v_at);
end $$;

-- RPC: 수동 리뷰 (Draft 또는 버전 기준) (Sprint 6 Q9) ---------------------
-- 기존 aa_create_manual_review(Draft 전용)는 그대로 둔다. 기준은 둘 중 정확히 하나.
-- 같은 client_request_id면 원래 리뷰·첫 답변·원래 기준을 그대로 돌려준다.
-- 결과 status: ok | version_not_found
create or replace function public.aa_create_manual_review_at(
  p_project uuid, p_user uuid, p_draft_revision int, p_version uuid,
  p_bundle_id text, p_bundle_scope jsonb, p_bundle_md text,
  p_tool text, p_answer_md text, p_client_request_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare v_review uuid; v_answer uuid; v_ver uuid; v_rev int;
begin
  if (p_draft_revision is null) = (p_version is null) then
    raise exception 'exactly one of p_draft_revision, p_version is required' using errcode = '22023';
  end if;

  if p_client_request_id is not null then
    select r.id, r.version_id, r.draft_revision into v_review, v_ver, v_rev from public.aa_reviews r
     where r.project_id = p_project and r.user_id = p_user and r.client_request_id = p_client_request_id;
    if found then
      select a.id into v_answer from public.aa_review_answers a
       where a.project_id = p_project and a.review_id = v_review order by a.created_at, a.id limit 1;
      return jsonb_build_object('status', 'ok', 'review_id', v_review, 'answer_id', v_answer, 'existing', true,
                                'version_id', v_ver, 'draft_revision', v_rev);
    end if;
  end if;

  if p_version is not null and not exists (
    select 1 from public.aa_architecture_versions where project_id = p_project and user_id = p_user and id = p_version
  ) then
    return jsonb_build_object('status', 'version_not_found');
  end if;

  insert into public.aa_reviews (project_id, user_id, version_id, draft_revision, mode, status,
                                 bundle_id, bundle_scope, bundle_md, finished_at, client_request_id)
  values (p_project, p_user, p_version, p_draft_revision, 'manual', 'done',
          p_bundle_id, p_bundle_scope, p_bundle_md, now(), p_client_request_id)
  returning id into v_review;

  insert into public.aa_review_answers (review_id, project_id, user_id, tool, answer_md)
  values (v_review, p_project, p_user, p_tool, p_answer_md)
  returning id into v_answer;

  return jsonb_build_object('status', 'ok', 'review_id', v_review, 'answer_id', v_answer, 'existing', false,
                            'version_id', p_version, 'draft_revision', p_draft_revision);
exception when unique_violation then
  select r.id, r.version_id, r.draft_revision into v_review, v_ver, v_rev from public.aa_reviews r
   where r.project_id = p_project and r.user_id = p_user and r.client_request_id = p_client_request_id;
  if not found then raise; end if;
  select a.id into v_answer from public.aa_review_answers a
   where a.project_id = p_project and a.review_id = v_review order by a.created_at, a.id limit 1;
  return jsonb_build_object('status', 'ok', 'review_id', v_review, 'answer_id', v_answer, 'existing', true,
                            'version_id', v_ver, 'draft_revision', v_rev);
end $$;

-- 권한: 이 블록이 만든 객체만 (P1·P2a 객체는 건드리지 않음)
revoke all on public.aa_architecture_versions from anon, authenticated;
grant all on public.aa_architecture_versions to service_role;
revoke execute on function public.aa_versions_immutable() from public, anon, authenticated;
revoke execute on function public.aa_publish_version(uuid, uuid, int, uuid, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.aa_publish_version(uuid, uuid, int, uuid, text, text, text, jsonb, jsonb) to service_role;
revoke execute on function public.aa_restore_version(uuid, uuid, uuid, int, jsonb) from public, anon, authenticated;
grant execute on function public.aa_restore_version(uuid, uuid, uuid, int, jsonb) to service_role;
revoke execute on function public.aa_create_manual_review_at(uuid, uuid, int, uuid, text, jsonb, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.aa_create_manual_review_at(uuid, uuid, int, uuid, text, jsonb, text, text, text, uuid) to service_role;

commit;

notify pgrst, 'reload schema';

-- =====================================================================
-- P2b 적용 후 확인: docs/aa-workbench/sql/2026-11-22_p2b-check.sql
-- 되돌리기 SQL은 schema_aa_workbench_rollback_p2b.sql (버전·버전 기준 리뷰가 0건일 때만)
-- =====================================================================
