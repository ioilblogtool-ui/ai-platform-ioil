-- =============================================
-- AI Platform — 나만의 AI 대시보드 Schema
-- Supabase SQL Editor에서 실행하세요
-- =============================================

-- =============================================
-- 1. user_modules — 사용자 모듈 활성화 설정
-- =============================================
create table public.user_modules (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.users(id) on delete cascade not null,
  module_key text not null,
  is_active  boolean default true,
  config     jsonb default '{}',
  schedule   jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, module_key)
);

create trigger user_modules_updated_at
  before update on public.user_modules
  for each row execute function public.set_updated_at();

-- =============================================
-- 2. user_assets — 자산 데이터
-- =============================================
create table public.user_assets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete cascade not null,
  asset_type  text not null check (asset_type in ('real_estate', 'stock', 'cash', 'crypto', 'debt', 'other')),
  name        text not null,
  amount      numeric not null default 0,
  metadata    jsonb default '{}',
  recorded_at date not null default current_date,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create trigger user_assets_updated_at
  before update on public.user_assets
  for each row execute function public.set_updated_at();

-- =============================================
-- 3. budget_records — 가계부
-- =============================================
create table public.budget_records (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete cascade not null,
  record_type text not null check (record_type in ('income', 'expense')),
  category    text,
  amount      numeric not null,
  memo        text,
  recorded_at date not null default current_date,
  created_at  timestamptz default now()
);

-- =============================================
-- 4. parenting_records — 육아 기록
-- =============================================
create table public.parenting_records (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete cascade not null,
  child_name  text,
  birth_date  date,
  record_type text not null check (record_type in ('growth', 'milestone', 'health', 'daily')),
  data        jsonb default '{}',
  recorded_at date not null default current_date,
  created_at  timestamptz default now()
);

-- =============================================
-- 5. realestate_watchlist — 부동산 관심 매물
-- =============================================
create table public.realestate_watchlist (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.users(id) on delete cascade not null,
  name       text not null,
  address    text,
  area_sqm   numeric,
  interest   text check (interest in ('buy', 'rent')),
  price      numeric,
  note       text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger realestate_watchlist_updated_at
  before update on public.realestate_watchlist
  for each row execute function public.set_updated_at();

-- =============================================
-- 6. user_keywords — 관심 키워드 (뉴스 브리핑)
-- =============================================
create table public.user_keywords (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.users(id) on delete cascade not null,
  keyword    text not null,
  category   text,
  priority   int default 1,
  created_at timestamptz default now(),
  unique(user_id, keyword)
);

-- =============================================
-- 7. ai_reports — AI 생성 리포트
-- =============================================
create table public.ai_reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.users(id) on delete cascade not null,
  module_key   text not null,
  report_type  text not null check (report_type in ('daily', 'weekly', 'monthly')),
  title        text not null,
  content      text not null,
  metadata     jsonb default '{}',
  generated_at timestamptz default now()
);

-- =============================================
-- 8. my_ai_scheduler_logs — 스케줄러 로그
-- =============================================
create table public.my_ai_scheduler_logs (
  id       uuid primary key default gen_random_uuid(),
  job_name text not null,
  status   text not null check (status in ('success', 'failed')),
  detail   jsonb default '{}',
  ran_at   timestamptz default now()
);

-- =============================================
-- RLS 활성화 (서비스 롤로 우회하므로 정책은 생략 가능)
-- =============================================
alter table public.user_modules          enable row level security;
alter table public.user_assets           enable row level security;
alter table public.budget_records        enable row level security;
alter table public.parenting_records     enable row level security;
alter table public.realestate_watchlist  enable row level security;
alter table public.user_keywords         enable row level security;
alter table public.ai_reports            enable row level security;
alter table public.my_ai_scheduler_logs  enable row level security;
