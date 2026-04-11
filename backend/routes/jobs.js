const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../lib/activity');

const router = express.Router();

// GET /api/jobs?status=&content_item_id=&limit=
router.get('/', requireAuth, async (req, res) => {
  const { status, content_item_id, limit = 50, offset = 0 } = req.query;

  let query = supabase
    .from('generation_jobs')
    .select('*, content_items(title, content_type)', { count: 'exact' })
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (status)          query = query.eq('status', status);
  if (content_item_id) query = query.eq('content_item_id', content_item_id);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data, total: count });
});

// GET /api/jobs/:id
router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('generation_jobs')
    .select('*, content_items(title, content_type, category)')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Job을 찾을 수 없습니다.' });
  res.json(data);
});

// POST /api/jobs/:id/skip — 실패/Queued job 스킵 처리
router.post('/:id/skip', requireAuth, async (req, res) => {
  const { data: job } = await supabase
    .from('generation_jobs')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (!job) return res.status(404).json({ error: 'Job을 찾을 수 없습니다.' });
  if (!['failed', 'queued'].includes(job.status)) {
    return res.status(400).json({ error: 'Failed 또는 Queued 상태만 스킵할 수 있습니다.' });
  }

  await supabase
    .from('generation_jobs')
    .update({ status: 'skipped' })
    .eq('id', req.params.id);

  res.json({ success: true });
});

// POST /api/jobs/:id/retry — 실패한 job 재시도
router.post('/:id/retry', requireAuth, async (req, res) => {
  const { data: job } = await supabase
    .from('generation_jobs')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (!job) return res.status(404).json({ error: 'Job을 찾을 수 없습니다.' });
  if (job.status !== 'failed') {
    return res.status(400).json({ error: '실패 상태의 Job만 재시도할 수 있습니다.' });
  }

  // job 타입에 맞는 generate 엔드포인트를 내부 호출하는 대신
  // 재시도용 신규 job 레코드를 queued로 생성 후 프론트에서 generate 재호출하도록 안내
  await supabase
    .from('generation_jobs')
    .update({ status: 'queued', error_message: null })
    .eq('id', req.params.id);

  await logActivity({
    content_item_id: job.content_item_id,
    user_id: req.user.id,
    event_type: 'job_retried',
    description: `${job.job_type} 재시도`,
    metadata: { job_id: job.id },
  });

  res.json({ success: true, job_id: job.id, job_type: job.job_type, content_item_id: job.content_item_id });
});

module.exports = router;
