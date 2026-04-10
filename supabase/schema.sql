-- =============================================
-- AI Platform — Supabase Schema
-- SQL Editor에 붙여넣고 실행하세요
-- =============================================

-- users 테이블 (Supabase Auth와 연동)
create table public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  email text unique not null,
  name text,
  plan text default 'free' check (plan in ('free', 'pro')),
  created_at timestamp with time zone default now()
);

-- projects 테이블
create table public.projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  name text not null,
  description text,
  stage text default 'planning' check (stage in ('planning', 'design', 'development', 'testing', 'deployed')),
  system_prompt text default '당신은 1인 기업 운영을 돕는 AI 어시스턴트입니다. 사용자의 비즈니스를 효율적으로 지원하세요.',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- conversations 테이블
create table public.conversations (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  title text default '새 대화',
  agent_type text default 'general' check (agent_type in ('general', 'planning', 'design', 'development', 'ops')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- messages 테이블
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  tokens_used integer default 0,
  created_at timestamp with time zone default now()
);

-- tasks 테이블
create table public.tasks (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  title text not null,
  description text,
  status text default 'todo' check (status in ('todo', 'in_progress', 'done')),
  assigned_agent text default 'general',
  priority integer default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- =============================================
-- RLS (Row Level Security) 설정
-- =============================================

alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.tasks enable row level security;

-- users: 본인 데이터만
create policy "users_own" on public.users
  for all using (auth.uid() = id);

-- projects: 본인 프로젝트만
create policy "projects_own" on public.projects
  for all using (auth.uid() = user_id);

-- conversations: 본인 대화만
create policy "conversations_own" on public.conversations
  for all using (auth.uid() = user_id);

-- messages: 본인 대화의 메시지만
create policy "messages_own" on public.messages
  for all using (
    exists (
      select 1 from public.conversations
      where id = messages.conversation_id
      and user_id = auth.uid()
    )
  );

-- tasks: 본인 프로젝트의 태스크만
create policy "tasks_own" on public.tasks
  for all using (
    exists (
      select 1 from public.projects
      where id = tasks.project_id
      and user_id = auth.uid()
    )
  );

-- =============================================
-- 신규 유저 자동 등록 트리거
-- =============================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================
-- 샘플 데이터 (선택사항)
-- =============================================
-- 로그인 후 직접 프로젝트를 만들거나 아래 주석 해제 후 실행
-- insert into public.projects (user_id, name, description)
-- values (auth.uid(), '내 첫 번째 프로젝트', 'AI 자동화 플랫폼 테스트');
