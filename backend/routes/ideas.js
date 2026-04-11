const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const { content_item_id } = req.query;

  let query = supabase
    .from('content_ideas')
    .select(`
      *,
      content_items!inner(user_id)
    `)
    .eq('content_items.user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (content_item_id) {
    query = query.eq('content_item_id', content_item_id);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json((data || []).map(({ content_items, ...idea }) => idea));
});

router.post('/:id/select', requireAuth, async (req, res) => {
  const { data: idea, error } = await supabase
    .from('content_ideas')
    .select(`
      id,
      content_item_id,
      content_items!inner(user_id)
    `)
    .eq('id', req.params.id)
    .eq('content_items.user_id', req.user.id)
    .single();

  if (error || !idea) {
    return res.status(404).json({ error: 'Idea not found.' });
  }

  const { error: resetError } = await supabase
    .from('content_ideas')
    .update({ is_selected: false })
    .eq('content_item_id', idea.content_item_id);

  if (resetError) return res.status(500).json({ error: resetError.message });

  const { data: selectedIdea, error: selectError } = await supabase
    .from('content_ideas')
    .update({ is_selected: true })
    .eq('id', req.params.id)
    .select('*')
    .single();

  if (selectError) return res.status(500).json({ error: selectError.message });

  res.json(selectedIdea);
});

module.exports = router;
