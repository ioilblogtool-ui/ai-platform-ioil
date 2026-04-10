const { createClient } = require('@supabase/supabase-js');

// 서버에서는 service_role 키 사용 (RLS 우회 가능)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = supabase;
