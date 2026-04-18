-- =============================================
-- AI Platform — 나만의 AI 자산 목표 상세 설명 추가
-- schema_my_ai_v3.sql 실행 후 추가로 실행하세요
-- =============================================

ALTER TABLE public.user_asset_goals
  ADD COLUMN IF NOT EXISTS description text;
