const express = require('express');
const supabase = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

// GET /api/my-ai/keywords
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('user_keywords')
    .select('*')
    .eq('user_id', req.user.id)
    .order('priority', { ascending: false })
    .order('created_at');

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// POST /api/my-ai/keywords
router.post('/', requireAuth, async (req, res) => {
  const { keyword, category, priority } = req.body;
  if (!keyword) return res.status(400).json({ error: 'keyword는 필수입니다.' });

  const { data, error } = await supabase
    .from('user_keywords')
    .insert({ user_id: req.user.id, keyword: keyword.trim(), category, priority })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: '이미 등록된 키워드입니다.' });
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json({ data });
});

// DELETE /api/my-ai/keywords/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('user_keywords')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
