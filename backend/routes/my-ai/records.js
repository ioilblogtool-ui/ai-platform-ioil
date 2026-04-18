const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const supabase = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VALID_MODULES = ['portfolio', 'health', 'career', 'learning'];

// GET /api/my-ai/records?module_key=&record_type=&limit=
router.get('/', requireAuth, async (req, res) => {
  const { module_key, record_type, limit = 50 } = req.query;
  if (!module_key) return res.status(400).json({ error: 'module_key는 필수입니다.' });

  let query = supabase
    .from('user_module_records')
    .select('*')
    .eq('user_id', req.user.id)
    .eq('module_key', module_key)
    .order('recorded_at', { ascending: false })
    .limit(Number(limit));

  if (record_type) query = query.eq('record_type', record_type);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// POST /api/my-ai/records
router.post('/', requireAuth, async (req, res) => {
  const { module_key, record_type, data: recordData, recorded_at } = req.body;
  if (!module_key) return res.status(400).json({ error: 'module_key는 필수입니다.' });
  if (!VALID_MODULES.includes(module_key)) return res.status(400).json({ error: '유효하지 않은 module_key입니다.' });

  const { data, error } = await supabase
    .from('user_module_records')
    .insert({ user_id: req.user.id, module_key, record_type, data: recordData, recorded_at })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ data });
});

// DELETE /api/my-ai/records/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('user_module_records')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
