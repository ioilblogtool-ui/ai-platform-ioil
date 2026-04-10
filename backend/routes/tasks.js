const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/tasks?project_id=
router.get('/', requireAuth, async (req, res) => {
  const { project_id } = req.query;
  if (!project_id) return res.status(400).json({ error: 'project_id가 필요합니다.' });

  // 본인 프로젝트인지 확인
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', project_id)
    .eq('user_id', req.user.id)
    .single();

  if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });

  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, description, status, priority, assigned_agent, created_at')
    .eq('project_id', project_id)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/tasks
router.post('/', requireAuth, async (req, res) => {
  const { project_id, title, description, status, priority } = req.body;
  if (!project_id || !title) return res.status(400).json({ error: 'project_id와 title이 필요합니다.' });

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', project_id)
    .eq('user_id', req.user.id)
    .single();

  if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });

  const { data, error } = await supabase
    .from('tasks')
    .insert({ project_id, title, description, status: status || 'todo', priority: priority ?? 1 })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PATCH /api/tasks/:id
router.patch('/:id', requireAuth, async (req, res) => {
  const { title, description, status, priority } = req.body;

  // 본인 태스크인지 확인
  const { data: task } = await supabase
    .from('tasks')
    .select('id, projects(user_id)')
    .eq('id', req.params.id)
    .single();

  if (!task || task.projects?.user_id !== req.user.id) {
    return res.status(404).json({ error: '태스크를 찾을 수 없습니다.' });
  }

  const updates = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;
  if (priority !== undefined) updates.priority = priority;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/tasks/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { data: task } = await supabase
    .from('tasks')
    .select('id, projects(user_id)')
    .eq('id', req.params.id)
    .single();

  if (!task || task.projects?.user_id !== req.user.id) {
    return res.status(404).json({ error: '태스크를 찾을 수 없습니다.' });
  }

  const { error } = await supabase.from('tasks').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
