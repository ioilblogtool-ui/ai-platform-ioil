const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/activity?content_item_id=&limit=
router.get('/', requireAuth, async (req, res) => {
  const { content_item_id, limit = 30, offset = 0 } = req.query;

  let query = supabase
    .from('activity_logs')
    .select('*', { count: 'exact' })
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (content_item_id) query = query.eq('content_item_id', content_item_id);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data, total: count });
});

module.exports = router;
