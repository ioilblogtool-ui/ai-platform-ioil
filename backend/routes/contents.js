const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../lib/activity');

const router = express.Router();

const VALID_TRANSITIONS = {
  idea:      ['planned', 'archived'],
  planned:   ['designed', 'idea', 'archived'],
  designed:  ['ready_dev', 'planned', 'archived'],
  ready_dev: ['in_dev', 'designed', 'archived'],
  in_dev:    ['deployed', 'ready_dev', 'archived'],
  deployed:  ['archived'],
  archived:  ['idea'],
};

// GET /api/contents
router.get('/', requireAuth, async (req, res) => {
  const { status, content_type, category, search, limit = 50, offset = 0 } = req.query;

  let query = supabase
    .from('content_items')
    .select('*', { count: 'exact' })
    .eq('user_id', req.user.id)
    .order('updated_at', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (status)       query = query.eq('status', status);
  if (content_type) query = query.eq('content_type', content_type);
  if (category)     query = query.eq('category', category);
  if (search)       query = query.ilike('title', `%${search}%`);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data, total: count });
});

// GET /api/contents/stats  — Dashboard KPI
router.get('/stats', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('content_items')
    .select('status')
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });

  const counts = {};
  for (const row of data) {
    counts[row.status] = (counts[row.status] || 0) + 1;
  }
  res.json(counts);
});

// GET /api/contents/:id
router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('content_items')
    .select(`
      *,
      documents (id, doc_type, version, status, file_path, updated_at),
      deployments (id, platform, environment, status, deploy_url, deployed_at),
      git_changes (id, branch_name, pr_url, merge_status)
    `)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (error || !data) return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다.' });
  res.json(data);
});

// POST /api/contents
router.post('/', requireAuth, async (req, res) => {
  const { title, content_type, category, seo_keyword, priority, raw_idea, target_repo, target_path, notes } = req.body;
  if (!title || !content_type || !category) {
    return res.status(400).json({ error: 'title, content_type, category는 필수입니다.' });
  }

  const { data, error } = await supabase
    .from('content_items')
    .insert({
      user_id: req.user.id,
      title, content_type, category,
      seo_keyword, priority: priority ?? 1,
      raw_idea, target_repo, target_path, notes,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await logActivity({
    content_item_id: data.id,
    user_id: req.user.id,
    event_type: 'content_created',
    description: `콘텐츠 생성: ${title}`,
  });

  res.status(201).json(data);
});

// PATCH /api/contents/:id
router.patch('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase
    .from('content_items')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (!existing) return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다.' });

  const allowed = ['title', 'content_type', 'category', 'seo_keyword', 'priority', 'raw_idea', 'target_repo', 'target_path', 'notes'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const { data, error } = await supabase
    .from('content_items')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/contents/:id/transition — 상태 전이
router.post('/:id/transition', requireAuth, async (req, res) => {
  const { status: nextStatus } = req.body;
  if (!nextStatus) return res.status(400).json({ error: 'status가 필요합니다.' });

  const { data: item } = await supabase
    .from('content_items')
    .select('id, status, title')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (!item) return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다.' });

  const allowed = VALID_TRANSITIONS[item.status] || [];
  if (!allowed.includes(nextStatus)) {
    return res.status(400).json({
      error: `${item.status} → ${nextStatus} 전이는 허용되지 않습니다.`,
      allowed,
    });
  }

  const { data, error } = await supabase
    .from('content_items')
    .update({ status: nextStatus })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await logActivity({
    content_item_id: item.id,
    user_id: req.user.id,
    event_type: 'status_changed',
    description: `상태 변경: ${item.status} → ${nextStatus}`,
    metadata: { from: item.status, to: nextStatus },
  });

  res.json(data);
});

// DELETE /api/contents/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase
    .from('content_items')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (!existing) return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다.' });

  const { error } = await supabase.from('content_items').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
