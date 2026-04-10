const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/conversations — 내 대화 목록
router.get('/', requireAuth, async (req, res) => {
  const { project_id } = req.query;

  let query = supabase
    .from('conversations')
    .select('id, title, agent_type, created_at, updated_at')
    .eq('user_id', req.user.id)
    .order('updated_at', { ascending: false });

  if (project_id) query = query.eq('project_id', project_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json(data);
});

// GET /api/conversations/:id/messages — 특정 대화의 메시지
router.get('/:id/messages', requireAuth, async (req, res) => {
  // 본인 대화인지 확인
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (!conv) return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });

  const { data, error } = await supabase
    .from('messages')
    .select('id, role, content, tokens_used, created_at')
    .eq('conversation_id', req.params.id)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  res.json(data);
});

// DELETE /api/conversations/:id — 대화 삭제
router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ success: true });
});

// GET /api/conversations/projects — 내 프로젝트 목록
router.get('/projects/list', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, description, stage, created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  res.json(data);
});

// POST /api/conversations/projects — 새 프로젝트 생성
router.post('/projects', requireAuth, async (req, res) => {
  const { name, description, system_prompt } = req.body;

  if (!name) return res.status(400).json({ error: '프로젝트 이름이 필요합니다.' });

  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: req.user.id,
      name,
      description,
      system_prompt: system_prompt || '당신은 1인 기업 운영을 돕는 AI 어시스턴트입니다.',
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json(data);
});

module.exports = router;
