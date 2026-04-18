const express = require('express');
const supabase = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

// GET /api/my-ai/realestate
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('realestate_watchlist')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// POST /api/my-ai/realestate
router.post('/', requireAuth, async (req, res) => {
  const { name, address, area_sqm, interest, price, note } = req.body;
  if (!name) return res.status(400).json({ error: 'name은 필수입니다.' });

  const { data, error } = await supabase
    .from('realestate_watchlist')
    .insert({ user_id: req.user.id, name, address, area_sqm, interest, price, note })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ data });
});

// PUT /api/my-ai/realestate/:id
router.put('/:id', requireAuth, async (req, res) => {
  const { name, address, area_sqm, interest, price, note } = req.body;
  const payload = {};
  if (name     !== undefined) payload.name     = name;
  if (address  !== undefined) payload.address  = address;
  if (area_sqm !== undefined) payload.area_sqm = area_sqm;
  if (interest !== undefined) payload.interest = interest;
  if (price    !== undefined) payload.price    = price;
  if (note     !== undefined) payload.note     = note;

  const { data, error } = await supabase
    .from('realestate_watchlist')
    .update(payload)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: '매물을 찾을 수 없습니다.' });
  res.json({ data });
});

// DELETE /api/my-ai/realestate/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('realestate_watchlist')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
