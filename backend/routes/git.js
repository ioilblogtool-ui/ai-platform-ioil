const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../lib/activity');

const router = express.Router();

// GET /api/git?content_item_id=
router.get('/', requireAuth, async (req, res) => {
  const { content_item_id } = req.query;
  if (!content_item_id) return res.status(400).json({ error: 'content_item_id가 필요합니다.' });

  const { data, error } = await supabase
    .from('git_changes')
    .select('*')
    .eq('content_item_id', content_item_id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/git
router.post('/', requireAuth, async (req, res) => {
  const { content_item_id, branch_name, commit_sha, pr_url, merge_status, notes } = req.body;
  if (!content_item_id) return res.status(400).json({ error: 'content_item_id가 필요합니다.' });

  // 소유 확인
  const { data: item } = await supabase
    .from('content_items')
    .select('id')
    .eq('id', content_item_id)
    .eq('user_id', req.user.id)
    .single();
  if (!item) return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다.' });

  const { data, error } = await supabase
    .from('git_changes')
    .insert({ content_item_id, branch_name, commit_sha, pr_url, merge_status: merge_status || 'open', notes })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await logActivity({
    content_item_id,
    user_id: req.user.id,
    event_type: 'git_saved',
    description: `Git 정보 등록: ${branch_name || commit_sha || ''}`,
    metadata: { git_id: data.id, branch_name, pr_url },
  });

  res.status(201).json(data);
});

// PATCH /api/git/:id
router.patch('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase
    .from('git_changes')
    .select('id, content_items(user_id)')
    .eq('id', req.params.id)
    .single();

  if (!existing || existing.content_items?.user_id !== req.user.id) {
    return res.status(404).json({ error: 'Git 정보를 찾을 수 없습니다.' });
  }

  const allowed = ['branch_name', 'commit_sha', 'pr_url', 'merge_status', 'notes'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const { data, error } = await supabase
    .from('git_changes')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
