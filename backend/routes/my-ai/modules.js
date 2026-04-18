const express = require('express');
const supabase = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

const VALID_MODULES = ['assets', 'budget', 'realestate', 'portfolio', 'parenting', 'health', 'career', 'learning', 'news'];

// GET /api/my-ai/modules
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('user_modules')
    .select('*')
    .eq('user_id', req.user.id)
    .order('module_key');

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// PUT /api/my-ai/modules/:key
router.put('/:key', requireAuth, async (req, res) => {
  const { key } = req.params;
  if (!VALID_MODULES.includes(key)) {
    return res.status(400).json({ error: '유효하지 않은 모듈 키입니다.' });
  }

  const { is_active, config, schedule } = req.body;
  const payload = {};
  if (is_active !== undefined) payload.is_active = is_active;
  if (config    !== undefined) payload.config    = config;
  if (schedule  !== undefined) payload.schedule  = schedule;

  const { data, error } = await supabase
    .from('user_modules')
    .upsert({ user_id: req.user.id, module_key: key, ...payload }, { onConflict: 'user_id,module_key' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

module.exports = router;
