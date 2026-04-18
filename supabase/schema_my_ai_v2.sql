-- =============================================
-- AI Platform — 나만의 AI v2 (투자·건강·커리어·학습)
-- schema_my_ai.sql 실행 후 추가로 실행하세요
-- =============================================

CREATE TABLE public.user_module_records (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete cascade not null,
  module_key  text not null,
  record_type text,
  data        jsonb default '{}',
  recorded_at date not null default current_date,
  created_at  timestamptz default now()
);

CREATE INDEX idx_user_module_records_user ON public.user_module_records(user_id, module_key);

ALTER TABLE public.user_module_records ENABLE ROW LEVEL SECURITY;
