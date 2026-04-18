-- =============================================
-- AI Platform — 나만의 AI 자산관리 고도화 v3
-- schema_my_ai.sql 실행 후 추가로 실행하세요
-- =============================================

-- =============================================
-- 1. user_asset_snapshots — 월별 자산 스냅샷
-- =============================================
CREATE TABLE public.user_asset_snapshots (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  snapshot_date  date        NOT NULL,
  -- 자산 (양수)
  stock          numeric     NOT NULL DEFAULT 0,  -- 주식/투자
  real_estate    numeric     NOT NULL DEFAULT 0,  -- 부동산 합계
  cash           numeric     NOT NULL DEFAULT 0,  -- 현금
  pension        numeric     NOT NULL DEFAULT 0,  -- 퇴직금
  gold           numeric     NOT NULL DEFAULT 0,  -- 금
  crypto         numeric     NOT NULL DEFAULT 0,  -- 암호화폐
  other          numeric     NOT NULL DEFAULT 0,  -- 기타
  -- 부채 (양수로 입력, 계산 시 차감)
  loan_mortgage  numeric     NOT NULL DEFAULT 0,  -- 담보대출
  loan_credit    numeric     NOT NULL DEFAULT 0,  -- 신용대출
  loan_minus     numeric     NOT NULL DEFAULT 0,  -- 마이너스 통장
  -- 메모
  note           text,
  -- 호기별 부동산 등 상세 확장용
  detail         jsonb       NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);

-- 총 자산 / 총 부채 / 순자산 계산 컬럼 (Generated)
ALTER TABLE public.user_asset_snapshots
  ADD COLUMN total_assets numeric GENERATED ALWAYS AS
    (stock + real_estate + cash + pension + gold + crypto + other) STORED,
  ADD COLUMN total_debt   numeric GENERATED ALWAYS AS
    (loan_mortgage + loan_credit + loan_minus) STORED,
  ADD COLUMN net_worth    numeric GENERATED ALWAYS AS
    (stock + real_estate + cash + pension + gold + crypto + other
     - loan_mortgage - loan_credit - loan_minus) STORED;

CREATE INDEX idx_asset_snapshots_user_date
  ON public.user_asset_snapshots(user_id, snapshot_date DESC);

CREATE TRIGGER user_asset_snapshots_updated_at
  BEFORE UPDATE ON public.user_asset_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_asset_snapshots ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 2. user_asset_goals — 자산 목표 (연간 + 장기)
-- =============================================
CREATE TABLE public.user_asset_goals (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  goal_type     text        NOT NULL CHECK (goal_type IN ('annual', 'longterm')),
  -- annual   : 올해 목표  (ex. 2026년 3억)
  -- longterm : 장기 목표  (ex. 2030년 10억)
  name          text        NOT NULL,
  target_amount numeric     NOT NULL,
  target_year   int         NOT NULL,
  is_achieved   boolean     NOT NULL DEFAULT false,
  achieved_at   date,
  sort_order    int         NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_asset_goals_user
  ON public.user_asset_goals(user_id, goal_type, target_year);

CREATE TRIGGER user_asset_goals_updated_at
  BEFORE UPDATE ON public.user_asset_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_asset_goals ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 3. user_asset_milestones — 마일스톤 달성 기록
-- =============================================
CREATE TABLE public.user_asset_milestones (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  milestone_key  text        NOT NULL,
  -- '1억', '3억', '5억', '10억', '20억', 'annual_goal', 'longterm_goal'
  label          text        NOT NULL,          -- 화면 표시용 (ex. "🥈 3억 달성!")
  net_worth      numeric     NOT NULL,          -- 달성 시점 순자산
  achieved_at    date        NOT NULL,
  goal_id        uuid        REFERENCES public.user_asset_goals(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, milestone_key)               -- 같은 마일스톤은 1회만 기록
);

CREATE INDEX idx_asset_milestones_user
  ON public.user_asset_milestones(user_id, achieved_at DESC);

ALTER TABLE public.user_asset_milestones ENABLE ROW LEVEL SECURITY;
