-- =============================================
-- Budget 고도화 v2 마이그레이션
-- Supabase SQL Editor에서 실행하세요
-- =============================================

-- 1. 고정비 항목 테이블
create table if not exists public.budget_fixed_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete cascade not null,
  record_type text not null default 'expense' check (record_type in ('income', 'expense')),
  category    text not null,
  subcategory text,
  person      text,
  amount      numeric not null default 0,
  memo        text not null,
  sort_order  int default 0,
  is_active   boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create trigger budget_fixed_items_updated_at
  before update on public.budget_fixed_items
  for each row execute function public.set_updated_at();

alter table public.budget_fixed_items enable row level security;

-- 2. budget_records에 fixed_item_id 컬럼 추가
alter table public.budget_records
  add column if not exists fixed_item_id uuid references public.budget_fixed_items(id) on delete set null;
