const express = require('express');
const supabase = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

const VALID_TYPES = ['annual', 'longterm'];

// GET /api/my-ai/goals
router.get('/', requireAuth, async (req, res) => {
  const { goal_type } = req.query;

  let query = supabase
    .from('user_asset_goals')
    .select('*')
    .eq('user_id', req.user.id)
    .order('goal_type')
    .order('target_year')
    .order('sort_order');

  if (goal_type) query = query.eq('goal_type', goal_type);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// POST /api/my-ai/goals
router.post('/', requireAuth, async (req, res) => {
  const { goal_type, name, target_amount, target_year, sort_order = 0, description } = req.body;

  if (!goal_type || !name || !target_amount || !target_year) {
    return res.status(400).json({ error: 'goal_type, name, target_amount, target_year는 필수입니다.' });
  }
  if (!VALID_TYPES.includes(goal_type)) {
    return res.status(400).json({ error: 'goal_type은 annual 또는 longterm이어야 합니다.' });
  }

  // 연간 목표는 연도당 1개만 허용
  if (goal_type === 'annual') {
    const { data: existing } = await supabase
      .from('user_asset_goals')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('goal_type', 'annual')
      .eq('target_year', target_year)
      .single();
    if (existing) {
      return res.status(409).json({ error: `${target_year}년 연간 목표가 이미 존재합니다. 기존 목표를 수정해주세요.` });
    }
  }

  const { data, error } = await supabase
    .from('user_asset_goals')
    .insert({ user_id: req.user.id, goal_type, name, target_amount, target_year, sort_order, description })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ data });
});

// PUT /api/my-ai/goals/:id
router.put('/:id', requireAuth, async (req, res) => {
  const FIELDS = ['goal_type', 'name', 'target_amount', 'target_year', 'is_achieved', 'achieved_at', 'sort_order', 'description'];
  const payload = {};
  for (const f of FIELDS) {
    if (req.body[f] !== undefined) payload[f] = req.body[f];
  }

  const { data, error } = await supabase
    .from('user_asset_goals')
    .update(payload)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data)  return res.status(404).json({ error: '목표를 찾을 수 없습니다.' });
  res.json({ data });
});

// DELETE /api/my-ai/goals/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('user_asset_goals')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// GET /api/my-ai/goals/milestones
router.get('/milestones', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('user_asset_milestones')
    .select('*')
    .eq('user_id', req.user.id)
    .order('achieved_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

module.exports = router;
