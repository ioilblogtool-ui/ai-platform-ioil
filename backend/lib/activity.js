const supabase = require('./supabase');

/**
 * activity_logs에 이벤트 기록
 * 실패해도 메인 요청에 영향 없도록 에러를 삼킴
 */
async function logActivity({ content_item_id, user_id, event_type, description, metadata = {} }) {
  try {
    await supabase.from('activity_logs').insert({
      content_item_id: content_item_id || null,
      user_id,
      event_type,
      description,
      metadata,
    });
  } catch (err) {
    console.error('activity log error:', err.message);
  }
}

module.exports = { logActivity };
