const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/templates?doc_type=&content_type=
router.get('/', requireAuth, async (req, res) => {
  const { doc_type, content_type } = req.query;

  let query = supabase
    .from('doc_templates')
    .select('*')
    .eq('user_id', req.user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  if (doc_type)     query = query.eq('doc_type', doc_type);
  if (content_type) query = query.or(`content_type.eq.${content_type},content_type.is.null`);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/templates
router.post('/', requireAuth, async (req, res) => {
  const { name, doc_type, content_type, content, is_default } = req.body;
  if (!name || !doc_type || !content) {
    return res.status(400).json({ error: 'name, doc_type, content는 필수입니다.' });
  }

  // is_default 설정 시 기존 default 해제
  if (is_default) {
    await supabase
      .from('doc_templates')
      .update({ is_default: false })
      .eq('user_id', req.user.id)
      .eq('doc_type', doc_type)
      .eq('is_default', true);
  }

  const { data, error } = await supabase
    .from('doc_templates')
    .insert({ user_id: req.user.id, name, doc_type, content_type: content_type || null, content, is_default: is_default || false })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /api/templates/:id
router.patch('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase
    .from('doc_templates')
    .select('id, doc_type')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();
  if (!existing) return res.status(404).json({ error: '템플릿을 찾을 수 없습니다.' });

  if (req.body.is_default) {
    await supabase
      .from('doc_templates')
      .update({ is_default: false })
      .eq('user_id', req.user.id)
      .eq('doc_type', existing.doc_type)
      .eq('is_default', true);
  }

  const allowed = ['name', 'content_type', 'content', 'is_default'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const { data, error } = await supabase
    .from('doc_templates')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/templates/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase
    .from('doc_templates')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();
  if (!existing) return res.status(404).json({ error: '템플릿을 찾을 수 없습니다.' });

  const { error } = await supabase.from('doc_templates').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
