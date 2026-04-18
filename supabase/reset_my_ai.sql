-- =============================================
-- 나만의 AI 전체 데이터 초기화
-- Supabase SQL Editor에서 실행하세요
-- ⚠️ 되돌릴 수 없습니다
-- =============================================

TRUNCATE TABLE
  public.user_module_records,   -- schema_my_ai_v2 (portfolio/health/career/learning)
  public.my_ai_scheduler_logs,
  public.ai_reports,
  public.user_keywords,
  public.realestate_watchlist,
  public.parenting_records,
  public.budget_records,
  public.user_assets,
  public.user_modules
CASCADE;
