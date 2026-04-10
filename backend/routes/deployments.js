const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../lib/activity');

const router = express.Router();

// GET /api/deployments?content_item_id=&status=&limit=
router.get('/', requireAuth, async (req, res) => {
  const { content_item_id, status, limit = 50, offset = 0 } = req.query;

  let query = supabase
    .from('deployments')
    .select('*, content_items(title, content_type)', { count: 'exact' })
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (content_item_id) query = query.eq('content_item_id', content_item_id);
  if (status)          query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data, total: count });
});

// POST /api/deployments
router.post('/', requireAuth, async (req, res) => {
  const { content_item_id, platform, environment, status, deploy_url, deployed_at, notes } = req.body;
  if (!content_item_id || !platform) {
    return res.status(400).json({ error: 'content_item_id, platform은 필수입니다.' });
  }

  const { data: item } = await supabase
    .from('content_items')
    .select('id')
    .eq('id', content_item_id)
    .eq('user_id', req.user.id)
    .single();
  if (!item) return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다.' });

  const { data, error } = await supabase
    .from('deployments')
    .insert({
      content_item_id,
      user_id: req.user.id,
      platform,
      environment: environment || 'prod',
      status: status || 'pending',
      deploy_url,
      deployed_at: deployed_at || null,
      notes,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await logActivity({
    content_item_id,
    user_id: req.user.id,
    event_type: 'deployment_saved',
    description: `배포 등록: ${platform} / ${environment || 'prod'}`,
    metadata: { deployment_id: data.id, platform, deploy_url },
  });

  res.status(201).json(data);
});

// PATCH /api/deployments/:id
router.patch('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase
    .from('deployments')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();
  if (!existing) return res.status(404).json({ error: '배포 정보를 찾을 수 없습니다.' });

  const allowed = ['platform', 'environment', 'status', 'deploy_url', 'deployed_at', 'notes'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const { data, error } = await supabase
    .from('deployments')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/deployments/:id/mark-success — 성공 처리 + content 상태 deployed
router.post('/:id/mark-success', requireAuth, async (req, res) => {
  const { deploy_url } = req.body;

  const { data: dep } = await supabase
    .from('deployments')
    .select('*, content_items(id, status)')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();
  if (!dep) return res.status(404).json({ error: '배포 정보를 찾을 수 없습니다.' });

  // 배포 성공 처리
  await supabase
    .from('deployments')
    .update({ status: 'success', deployed_at: new Date().toISOString(), deploy_url: deploy_url || dep.deploy_url })
    .eq('id', req.params.id);

  // content_item → deployed
  await supabase
    .from('content_items')
    .update({ status: 'deployed' })
    .eq('id', dep.content_item_id);

  await logActivity({
    content_item_id: dep.content_item_id,
    user_id: req.user.id,
    event_type: 'deployment_success',
    description: '배포 성공 → 상태 deployed',
    metadata: { deployment_id: dep.id, deploy_url: deploy_url || dep.deploy_url },
  });

  res.json({ success: true });
});

module.exports = router;
