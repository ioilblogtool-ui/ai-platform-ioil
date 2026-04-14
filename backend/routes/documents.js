const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../lib/activity');

const router = express.Router();

// GET /api/documents?content_item_id=&doc_type=&status=&limit=&offset=
router.get('/', requireAuth, async (req, res) => {
  const { content_item_id, doc_type, status, limit = 20, offset = 0 } = req.query;

  // content_item_id로 필터링 시 content 포함 (탭 에디터용), 전체 목록은 제외
  const fields = content_item_id
    ? '*'
    : 'id, content_item_id, doc_type, version, status, generated_by, created_at, updated_at';

  let query = supabase
    .from('documents')
    .select(fields, { count: 'exact' })
    .eq('user_id', req.user.id)
    .order('updated_at', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (content_item_id) query = query.eq('content_item_id', content_item_id);
  if (doc_type)        query = query.eq('doc_type', doc_type);
  if (status)          query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data, total: count });
});

// GET /api/documents/:id
router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('documents')
    .select('*, content_items(title, status, content_type)')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (error || !data) return res.status(404).json({ error: '문서를 찾을 수 없습니다.' });
  res.json(data);
});

// POST /api/documents
router.post('/', requireAuth, async (req, res) => {
  const { content_item_id, doc_type, version, file_path, content, generated_by } = req.body;
  if (!content_item_id || !doc_type) {
    return res.status(400).json({ error: 'content_item_id, doc_type은 필수입니다.' });
  }

  // 해당 content_item 소유 확인
  const { data: item } = await supabase
    .from('content_items')
    .select('id')
    .eq('id', content_item_id)
    .eq('user_id', req.user.id)
    .single();
  if (!item) return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다.' });

  const { data, error } = await supabase
    .from('documents')
    .insert({
      content_item_id,
      user_id: req.user.id,
      doc_type,
      version: version || 'v1',
      file_path,
      content,
      generated_by: generated_by || 'manual',
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await logActivity({
    content_item_id,
    user_id: req.user.id,
    event_type: 'document_generated',
    description: `${doc_type} 문서 생성`,
    metadata: { doc_id: data.id, doc_type, generated_by },
  });

  res.status(201).json(data);
});

// PATCH /api/documents/:id
router.patch('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase
    .from('documents')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (!existing) return res.status(404).json({ error: '문서를 찾을 수 없습니다.' });

  const allowed = ['version', 'file_path', 'content', 'status'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const { data, error } = await supabase
    .from('documents')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/documents/:id/approve — 승인 + 콘텐츠 상태 자동 전이
router.post('/:id/approve', requireAuth, async (req, res) => {
  const { data: doc } = await supabase
    .from('documents')
    .select('*, content_items(id, status)')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (!doc) return res.status(404).json({ error: '문서를 찾을 수 없습니다.' });

  // 문서 승인
  await supabase
    .from('documents')
    .update({ status: 'approved' })
    .eq('id', req.params.id);

  // doc_type → content status 자동 전이 매핑
  const AUTO_TRANSITION = { plan: 'planned', design: 'designed', dev_request: 'ready_dev' };
  const nextStatus = AUTO_TRANSITION[doc.doc_type];
  let updatedItem = null;

  if (nextStatus) {
    const { data: item } = await supabase
      .from('content_items')
      .update({ status: nextStatus })
      .eq('id', doc.content_item_id)
      .select()
      .single();
    updatedItem = item;

    await logActivity({
      content_item_id: doc.content_item_id,
      user_id: req.user.id,
      event_type: 'document_approved',
      description: `${doc.doc_type} 승인 → 상태 ${nextStatus}`,
      metadata: { doc_id: doc.id, from: doc.content_items?.status, to: nextStatus },
    });
  }

  res.json({ success: true, content_item: updatedItem });
});

// DELETE /api/documents/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase
    .from('documents')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (!existing) return res.status(404).json({ error: '문서를 찾을 수 없습니다.' });

  const { error } = await supabase.from('documents').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
