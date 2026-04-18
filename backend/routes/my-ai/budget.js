const express = require('express');
const supabase = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

// GET /api/my-ai/budget?year=&month=&record_type=
router.get('/', requireAuth, async (req, res) => {
  const { year, month, record_type } = req.query;

  let query = supabase
    .from('budget_records')
    .select('*')
    .eq('user_id', req.user.id)
    .order('recorded_at', { ascending: false });

  if (record_type) query = query.eq('record_type', record_type);
  if (year && month) {
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const to   = new Date(year, month, 0).toISOString().slice(0, 10); // 월 마지막 날
    query = query.gte('recorded_at', from).lte('recorded_at', to);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const summary = {
    income:  data.filter(r => r.record_type === 'income' ).reduce((s, r) => s + Number(r.amount), 0),
    expense: data.filter(r => r.record_type === 'expense').reduce((s, r) => s + Number(r.amount), 0),
  };
  summary.balance = summary.income - summary.expense;

  res.json({ data, summary });
});

// POST /api/my-ai/budget
router.post('/', requireAuth, async (req, res) => {
  const { record_type, category, amount, memo, recorded_at } = req.body;
  if (!record_type || amount === undefined) {
    return res.status(400).json({ error: 'record_type, amount는 필수입니다.' });
  }
  if (!['income', 'expense'].includes(record_type)) {
    return res.status(400).json({ error: 'record_type은 income 또는 expense입니다.' });
  }

  const { data, error } = await supabase
    .from('budget_records')
    .insert({ user_id: req.user.id, record_type, category, amount, memo, recorded_at })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ data });
});

// DELETE /api/my-ai/budget/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('budget_records')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
