-- =============================================
-- AI Platform — user_assets asset_type 확장
-- schema_my_ai_v4.sql 실행 후 추가로 실행하세요
-- =============================================

ALTER TABLE public.user_assets
  DROP CONSTRAINT IF EXISTS user_assets_asset_type_check;

ALTER TABLE public.user_assets
  ADD CONSTRAINT user_assets_asset_type_check
  CHECK (asset_type IN (
    'real_estate',    -- 부동산
    'stock',          -- 주식·ETF
    'cash',           -- 현금·예금·적금
    'pension',        -- 퇴직금·연금
    'gold',           -- 금·귀금속
    'crypto',         -- 암호화폐
    'loan_mortgage',  -- 담보대출
    'loan_credit',    -- 신용대출
    'loan_minus',     -- 마이너스통장
    'debt',           -- 기타부채 (레거시)
    'other'           -- 기타자산
  ));
