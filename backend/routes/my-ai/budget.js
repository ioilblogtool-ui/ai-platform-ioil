const express = require('express');
const supabase = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

async function getMonthSummary(userId, year, month) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const to   = new Date(year, month, 0).toISOString().slice(0, 10);
  const { data } = await supabase
    .from('budget_records')
    .select('record_type, amount')
    .eq('user_id', userId)
    .gte('recorded_at', from)
    .lte('recorded_at', to);
  const income  = (data || []).filter(r => r.record_type === 'income' ).reduce((s, r) => s + Number(r.amount), 0);
  const expense = (data || []).filter(r => r.record_type === 'expense').reduce((s, r) => s + Number(r.amount), 0);
  return { income, expense, balance: income - expense };
}

// ─── 고정비 CRUD (순서 중요: /:id 보다 먼저 등록) ─────────────────────────────

// GET /api/my-ai/budget/fixed
router.get('/fixed', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('budget_fixed_items')
    .select('*')
    .eq('user_id', req.user.id)
    .order('sort_order')
    .order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// POST /api/my-ai/budget/fixed/apply — 이번 달 고정비 일괄 적용
router.post('/fixed/apply', requireAuth, async (req, res) => {
  const { year, month } = req.body;
  if (!year || !month) return res.status(400).json({ error: 'year, month는 필수입니다.' });

  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const to   = new Date(year, month, 0).toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from('budget_records')
    .select('fixed_item_id')
    .eq('user_id', req.user.id)
    .gte('recorded_at', from)
    .lte('recorded_at', to)
    .not('fixed_item_id', 'is', null);

  const appliedIds = new Set((existing || []).map(r => r.fixed_item_id));

  const { data: fixedItems } = await supabase
    .from('budget_fixed_items')
    .select('*')
    .eq('user_id', req.user.id)
    .eq('is_active', true);

  if (!fixedItems || fixedItems.length === 0) {
    return res.status(400).json({ error: '적용할 고정비 항목이 없습니다.' });
  }

  const toInsert = fixedItems
    .filter(item => !appliedIds.has(item.id))
    .map(item => ({
      user_id:       req.user.id,
      record_type:   item.record_type,
      category:      item.category,
      amount:        item.amount,
      memo:          item.memo,
      recorded_at:   from,
      fixed_item_id: item.id,
    }));

  if (toInsert.length === 0) {
    return res.json({ applied: 0, message: '이미 모든 고정비가 적용되어 있습니다.' });
  }

  const { data: inserted, error } = await supabase
    .from('budget_records')
    .insert(toInsert)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ applied: inserted.length, data: inserted });
});

// POST /api/my-ai/budget/fixed
router.post('/fixed', requireAuth, async (req, res) => {
  const { category, subcategory, person, amount, memo, record_type, sort_order } = req.body;
  if (!category || amount === undefined || !memo) {
    return res.status(400).json({ error: 'category, amount, memo는 필수입니다.' });
  }
  const { data, error } = await supabase
    .from('budget_fixed_items')
    .insert({
      user_id: req.user.id,
      category,
      subcategory: subcategory || null,
      person:      person      || null,
      amount:      Number(amount),
      memo,
      record_type: record_type || 'expense',
      sort_order:  sort_order  || 0,
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ data });
});

// PUT /api/my-ai/budget/fixed/:id
router.put('/fixed/:id', requireAuth, async (req, res) => {
  const fields = ['category', 'subcategory', 'person', 'amount', 'memo', 'record_type', 'sort_order', 'is_active'];
  const update = {};
  fields.forEach(f => { if (req.body[f] !== undefined) update[f] = req.body[f]; });
  if (update.amount !== undefined) update.amount = Number(update.amount);
  update.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('budget_fixed_items')
    .update(update)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// DELETE /api/my-ai/budget/fixed/:id
router.delete('/fixed/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('budget_fixed_items')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ─── 연간 요약 ─────────────────────────────────────────────────────────────────

// GET /api/my-ai/budget/yearly?year=
router.get('/yearly', requireAuth, async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const from = `${year}-01-01`;
  const to   = `${year}-12-31`;

  const { data, error } = await supabase
    .from('budget_records')
    .select('record_type, amount, recorded_at')
    .eq('user_id', req.user.id)
    .gte('recorded_at', from)
    .lte('recorded_at', to);

  if (error) return res.status(500).json({ error: error.message });

  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, income: 0, expense: 0, balance: 0,
  }));

  (data || []).forEach(r => {
    const m = new Date(r.recorded_at).getMonth();
    if (r.record_type === 'income')  months[m].income  += Number(r.amount);
    if (r.record_type === 'expense') months[m].expense += Number(r.amount);
  });

  months.forEach(m => { m.balance = m.income - m.expense; });

  const total = {
    income:  months.reduce((s, m) => s + m.income,  0),
    expense: months.reduce((s, m) => s + m.expense, 0),
  };
  total.balance = total.income - total.expense;

  res.json({ year, months, total });
});

// ─── 전월/작년 비교 ────────────────────────────────────────────────────────────

// GET /api/my-ai/budget/compare?year=&month=
router.get('/compare', requireAuth, async (req, res) => {
  const year  = Number(req.query.year)  || new Date().getFullYear();
  const month = Number(req.query.month) || new Date().getMonth() + 1;

  const prevYear  = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;

  const [prev, lastYear] = await Promise.all([
    getMonthSummary(req.user.id, prevYear, prevMonth),
    getMonthSummary(req.user.id, year - 1, month),
  ]);

  res.json({ prev, lastYear });
});

// ─── 기본 CRUD ─────────────────────────────────────────────────────────────────

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
    const to   = new Date(year, month, 0).toISOString().slice(0, 10);
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
  if (!record_type || amount === undefined)
    return res.status(400).json({ error: 'record_type, amount는 필수입니다.' });
  if (!['income', 'expense'].includes(record_type))
    return res.status(400).json({ error: 'record_type은 income 또는 expense입니다.' });

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
