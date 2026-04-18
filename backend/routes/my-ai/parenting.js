const express = require('express');
const supabase = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

const VALID_TYPES = ['growth', 'milestone', 'health', 'daily'];

// GET /api/my-ai/parenting?child_name=&record_type=
router.get('/', requireAuth, async (req, res) => {
  const { child_name, record_type } = req.query;

  let query = supabase
    .from('parenting_records')
    .select('*')
    .eq('user_id', req.user.id)
    .order('recorded_at', { ascending: false });

  if (child_name)  query = query.eq('child_name', child_name);
  if (record_type) query = query.eq('record_type', record_type);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// POST /api/my-ai/parenting
router.post('/', requireAuth, async (req, res) => {
  const { child_name, birth_date, record_type, data: recordData, recorded_at } = req.body;
  if (!record_type) return res.status(400).json({ error: 'record_type은 필수입니다.' });
  if (!VALID_TYPES.includes(record_type)) {
    return res.status(400).json({ error: `record_type은 ${VALID_TYPES.join('|')} 중 하나입니다.` });
  }

  const { data, error } = await supabase
    .from('parenting_records')
    .insert({ user_id: req.user.id, child_name, birth_date, record_type, data: recordData, recorded_at })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ data });
});

// DELETE /api/my-ai/parenting/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('parenting_records')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
