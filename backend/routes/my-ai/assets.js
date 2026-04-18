const express = require('express');
const supabase = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

const VALID_TYPES = ['real_estate', 'stock', 'cash', 'pension', 'gold', 'crypto', 'loan_mortgage', 'loan_credit', 'loan_minus', 'debt', 'other'];

// GET /api/my-ai/assets?asset_type=&recorded_at=
router.get('/', requireAuth, async (req, res) => {
  const { asset_type, recorded_at } = req.query;

  let query = supabase
    .from('user_assets')
    .select('*')
    .eq('user_id', req.user.id)
    .order('asset_type')
    .order('created_at', { ascending: false });

  if (asset_type)  query = query.eq('asset_type', asset_type);
  if (recorded_at) query = query.eq('recorded_at', recorded_at);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// POST /api/my-ai/assets
router.post('/', requireAuth, async (req, res) => {
  const { asset_type, name, amount, metadata, recorded_at } = req.body;
  if (!asset_type || !name || amount === undefined) {
    return res.status(400).json({ error: 'asset_type, name, amount는 필수입니다.' });
  }
  if (!VALID_TYPES.includes(asset_type)) {
    return res.status(400).json({ error: '유효하지 않은 asset_type입니다.' });
  }

  const { data, error } = await supabase
    .from('user_assets')
    .insert({ user_id: req.user.id, asset_type, name, amount, metadata, recorded_at })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ data });
});

// PUT /api/my-ai/assets/:id
router.put('/:id', requireAuth, async (req, res) => {
  const { asset_type, name, amount, metadata, recorded_at } = req.body;
  const payload = {};
  if (asset_type  !== undefined) payload.asset_type  = asset_type;
  if (name        !== undefined) payload.name        = name;
  if (amount      !== undefined) payload.amount      = amount;
  if (metadata    !== undefined) payload.metadata    = metadata;
  if (recorded_at !== undefined) payload.recorded_at = recorded_at;

  const { data, error } = await supabase
    .from('user_assets')
    .update(payload)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: '자산을 찾을 수 없습니다.' });
  res.json({ data });
});

// DELETE /api/my-ai/assets/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('user_assets')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
