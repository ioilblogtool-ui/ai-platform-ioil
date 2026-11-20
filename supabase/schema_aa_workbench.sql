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
