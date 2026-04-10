const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/prompts?usage_type=&target_model=
router.get('/', requireAuth, async (req, res) => {
  const { usage_type, target_model, category } = req.query;

  let query = supabase
    .from('prompt_library')
    .select('*')
    .eq('user_id', req.user.id)
    .order('last_used_at', { ascending: false, nullsFirst: false });

  if (usage_type)   query = query.eq('usage_type', usage_type);
  if (target_model) query = query.eq('target_model', target_model);
  if (category)     query = query.eq('category', category);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/prompts
router.post('/', requireAuth, async (req, res) => {
  const { title, target_model, usage_type, category, content } = req.body;
  if (!title || !target_model || !usage_type || !content) {
    return res.status(400).json({ error: 'title, target_model, usage_type, content는 필수입니다.' });
  }

  const { data, error } = await supabase
    .from('prompt_library')
    .insert({ user_id: req.user.id, title, target_model, usage_type, category, content })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /api/prompts/:id
router.patch('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase
    .from('prompt_library')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();
  if (!existing) return res.status(404).json({ error: '프롬프트를 찾을 수 없습니다.' });

  const allowed = ['title', 'target_model', 'usage_type', 'category', 'content', 'last_used_at'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const { data, error } = await supabase
    .from('prompt_library')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/prompts/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase
    .from('prompt_library')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();
  if (!existing) return res.status(404).json({ error: '프롬프트를 찾을 수 없습니다.' });

  const { error } = await supabase.from('prompt_library').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
