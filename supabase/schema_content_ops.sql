-- =============================================
-- AI Platform — Content Ops Dashboard Schema
-- Phase 1: 신규 테이블 추가
-- Supabase SQL Editor에서 실행하세요
-- =============================================

-- =============================================
-- 1. content_items
-- 콘텐츠 운영의 핵심 엔티티
-- =============================================

create table public.content_items (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references public.users(id) on delete cascade not null,
  title         text not null,
  content_type  text not null check (content_type in ('calculator', 'report')),
  category      text not null,
  seo_keyword   text,
  priority      integer default 1 check (priority in (0, 1, 2)), -- 0:낮음 1:보통 2:높음
  status        text not null default 'idea'
                  check (status in ('idea', 'planned', 'designed', 'ready_dev', 'in_dev', 'deployed', 'archived')),
  raw_idea      text,                   -- 아이디어 원문
  target_repo   text,                   -- 대상 레포
  target_path   text,                   -- 목표 경로
  notes         text,
  created_at    timestamp with time zone default now(),
  updated_at    timestamp with time zone default now()
);

-- updated_at 자동 갱신 트리거
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger content_items_updated_at
  before update on public.content_items
  for each row execute function public.set_updated_at();

-- =============================================
-- 2. content_ideas
-- AI 모델별 결과 저장 (복수 결과 비교용)
-- =============================================

create table public.content_ideas (
  id               uuid default gen_random_uuid() primary key,
  content_item_id  uuid references public.content_items(id) on delete cascade not null,
  model            text not null check (model in ('claude', 'gpt', 'gemini', 'codex')),
  result_summary   text,
  suggested_titles jsonb,               -- 제목 후보 배열
  suggested_outline jsonb,              -- 아웃라인 배열
  seo_keywords     jsonb,               -- 키워드 배열
  strengths        text,
  weaknesses       text,
  score            integer,             -- 0~100
  is_selected      boolean default false,
  generation_job_id uuid,               -- 연결 job (nullable, 아래 테이블 생성 후 FK 추가)
  created_at       timestamp with time zone default now()
);

-- =============================================
-- 3. documents
-- plan / design / dev_request 문서
-- =============================================

create table public.documents (
  id               uuid default gen_random_uuid() primary key,
  content_item_id  uuid references public.content_items(id) on delete cascade not null,
  user_id          uuid references public.users(id) on delete cascade not null,
  doc_type         text not null check (doc_type in ('plan', 'design', 'dev_request')),
  version          text not null default 'v1',
  file_path        text,                -- docs/plan/202604/...md
  content          text,                -- Markdown 본문
  status           text not null default 'draft'
                     check (status in ('draft', 'reviewed', 'approved')),
  generated_by     text,                -- 생성 모델명 또는 'manual'
  created_at       timestamp with time zone default now(),
  updated_at       timestamp with time zone default now()
);

create trigger documents_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- =============================================
-- 4. generation_jobs
-- AI 생성 작업 이력
-- =============================================

create table public.generation_jobs (
  id               uuid default gen_random_uuid() primary key,
  content_item_id  uuid references public.content_items(id) on delete cascade,
  user_id          uuid references public.users(id) on delete cascade not null,
  job_type         text not null
                     check (job_type in ('idea_expand', 'plan_gen', 'design_gen', 'dev_request_gen')),
  model            text not null check (model in ('claude', 'gpt', 'gemini', 'codex')),
  status           text not null default 'queued'
                     check (status in ('queued', 'running', 'done', 'failed')),
  prompt           text,                -- 실행한 프롬프트
  result           text,                -- 결과 원문
  error_message    text,
  tokens_used      integer default 0,
  created_at       timestamp with time zone default now(),
  updated_at       timestamp with time zone default now()
);

create trigger generation_jobs_updated_at
  before update on public.generation_jobs
  for each row execute function public.set_updated_at();

-- content_ideas.generation_job_id FK (테이블 생성 후 추가)
alter table public.content_ideas
  add constraint content_ideas_generation_job_id_fkey
  foreign key (generation_job_id) references public.generation_jobs(id) on delete set null;

-- =============================================
-- 5. git_changes
-- Git / PR 연결 정보
-- =============================================

create table public.git_changes (
  id               uuid default gen_random_uuid() primary key,
  content_item_id  uuid references public.content_items(id) on delete cascade not null,
  branch_name      text,
  commit_sha       text,
  pr_url           text,
  merge_status     text default 'open' check (merge_status in ('open', 'merged', 'closed')),
  notes            text,
  created_at       timestamp with time zone default now(),
  updated_at       timestamp with time zone default now()
);

create trigger git_changes_updated_at
  before update on public.git_changes
  for each row execute function public.set_updated_at();

-- =============================================
-- 6. deployments
-- 배포 이력
-- =============================================

create table public.deployments (
  id               uuid default gen_random_uuid() primary key,
  content_item_id  uuid references public.content_items(id) on delete cascade not null,
  user_id          uuid references public.users(id) on delete cascade not null,
  platform         text not null check (platform in ('cloudflare', 'vercel', 'railway', 'other')),
  environment      text not null default 'prod' check (environment in ('prod', 'staging', 'dev')),
  status           text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  deploy_url       text,
  deployed_at      timestamp with time zone,
  notes            text,
  created_at       timestamp with time zone default now(),
  updated_at       timestamp with time zone default now()
);

create trigger deployments_updated_at
  before update on public.deployments
  for each row execute function public.set_updated_at();

-- =============================================
-- 7. activity_logs
-- 전체 이벤트 로그
-- =============================================

create table public.activity_logs (
  id               uuid default gen_random_uuid() primary key,
  content_item_id  uuid references public.content_items(id) on delete cascade,
  user_id          uuid references public.users(id) on delete cascade not null,
  event_type       text not null
                     check (event_type in (
                       'content_created', 'status_changed',
                       'idea_generated', 'idea_selected',
                       'document_generated', 'document_approved',
                       'git_saved', 'deployment_saved', 'deployment_success',
                       'job_failed', 'job_retried'
                     )),
  description      text,
  metadata         jsonb default '{}',  -- 상태 before/after, 모델명 등 부가 정보
  created_at       timestamp with time zone default now()
);

-- =============================================
-- 8. prompt_library
-- 재사용 프롬프트 관리
-- =============================================

create table public.prompt_library (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references public.users(id) on delete cascade not null,
  title        text not null,
  target_model text not null check (target_model in ('claude', 'gpt', 'gemini', 'codex')),
  usage_type   text not null check (usage_type in ('idea', 'plan', 'design', 'dev_request')),
  category     text,                    -- report / calculator 등
  content      text not null,
  last_used_at timestamp with time zone,
  created_at   timestamp with time zone default now(),
  updated_at   timestamp with time zone default now()
);

create trigger prompt_library_updated_at
  before update on public.prompt_library
  for each row execute function public.set_updated_at();

-- =============================================
-- 9. doc_templates
-- 문서 템플릿
-- =============================================

create table public.doc_templates (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references public.users(id) on delete cascade not null,
  name          text not null,
  doc_type      text not null check (doc_type in ('plan', 'design', 'dev_request')),
  content_type  text check (content_type in ('calculator', 'report')), -- null이면 공통
  content       text not null,
  is_default    boolean default false,
  created_at    timestamp with time zone default now(),
  updated_at    timestamp with time zone default now()
);

create trigger doc_templates_updated_at
  before update on public.doc_templates
  for each row execute function public.set_updated_at();

-- =============================================
-- RLS (Row Level Security)
-- =============================================

alter table public.content_items    enable row level security;
alter table public.content_ideas    enable row level security;
alter table public.documents        enable row level security;
alter table public.generation_jobs  enable row level security;
alter table public.git_changes      enable row level security;
alter table public.deployments      enable row level security;
alter table public.activity_logs    enable row level security;
alter table public.prompt_library   enable row level security;
alter table public.doc_templates    enable row level security;

-- content_items: 본인 것만
create policy "content_items_own" on public.content_items
  for all using (auth.uid() = user_id);

-- content_ideas: content_item 소유자만
create policy "content_ideas_own" on public.content_ideas
  for all using (
    exists (
      select 1 from public.content_items
      where id = content_ideas.content_item_id
      and user_id = auth.uid()
    )
  );

-- documents: 본인 것만
create policy "documents_own" on public.documents
  for all using (auth.uid() = user_id);

-- generation_jobs: 본인 것만
create policy "generation_jobs_own" on public.generation_jobs
  for all using (auth.uid() = user_id);

-- git_changes: content_item 소유자만
create policy "git_changes_own" on public.git_changes
  for all using (
    exists (
      select 1 from public.content_items
      where id = git_changes.content_item_id
      and user_id = auth.uid()
    )
  );

-- deployments: 본인 것만
create policy "deployments_own" on public.deployments
  for all using (auth.uid() = user_id);

-- activity_logs: 본인 것만
create policy "activity_logs_own" on public.activity_logs
  for all using (auth.uid() = user_id);

-- prompt_library: 본인 것만
create policy "prompt_library_own" on public.prompt_library
  for all using (auth.uid() = user_id);

-- doc_templates: 본인 것만
create policy "doc_templates_own" on public.doc_templates
  for all using (auth.uid() = user_id);

-- =============================================
-- 인덱스 (조회 성능)
-- =============================================

create index on public.content_items (user_id, status);
create index on public.content_items (user_id, content_type);
create index on public.content_items (user_id, updated_at desc);
create index on public.content_ideas (content_item_id);
create index on public.documents (content_item_id, doc_type);
create index on public.documents (user_id, status);
create index on public.generation_jobs (user_id, status);
create index on public.generation_jobs (content_item_id);
create index on public.deployments (user_id, status);
create index on public.activity_logs (content_item_id, created_at desc);
create index on public.activity_logs (user_id, created_at desc);
