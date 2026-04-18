const express = require('express');
const supabase = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

// 마일스톤 임계값 (순자산 기준)
const STANDARD_MILESTONES = [
  { key: '1억',  label: '🥉 1억 달성!',  amount: 100_000_000 },
  { key: '3억',  label: '🥈 3억 달성!',  amount: 300_000_000 },
  { key: '5억',  label: '🥇 5억 달성!',  amount: 500_000_000 },
  { key: '10억', label: '💎 10억 달성!', amount: 1_000_000_000 },
  { key: '20억', label: '👑 20억 달성!', amount: 2_000_000_000 },
];

// 스냅샷 저장 후 마일스톤 체크
async function checkMilestones(userId, netWorth, snapshotDate, goals) {
  // 1. 표준 마일스톤
  for (const m of STANDARD_MILESTONES) {
    if (netWorth >= m.amount) {
      await supabase.from('user_asset_milestones').upsert(
        { user_id: userId, milestone_key: m.key, label: m.label, net_worth: netWorth, achieved_at: snapshotDate },
        { onConflict: 'user_id,milestone_key', ignoreDuplicates: true }
      );
    }
  }

  // 2. 사용자 목표 달성 체크
  for (const goal of goals) {
    if (!goal.is_achieved && netWorth >= goal.target_amount) {
      // 목표 달성 플래그 업데이트
      await supabase.from('user_asset_goals')
        .update({ is_achieved: true, achieved_at: snapshotDate })
        .eq('id', goal.id);

      const key = `${goal.goal_type}_goal_${goal.id}`;
      const label = goal.goal_type === 'annual'
        ? `🎯 ${goal.target_year}년 목표 달성! (${goal.name})`
        : `🏆 장기 목표 달성! (${goal.name})`;

      await supabase.from('user_asset_milestones').upsert(
        { user_id: userId, milestone_key: key, label, net_worth: netWorth, achieved_at: snapshotDate, goal_id: goal.id },
        { onConflict: 'user_id,milestone_key', ignoreDuplicates: true }
      );
    }
  }
}

// GET /api/my-ai/snapshots/stats — 집계 통계
router.get('/stats', requireAuth, async (req, res) => {
  const { data: snapshots, error } = await supabase
    .from('user_asset_snapshots')
    .select('snapshot_date, net_worth, total_assets, total_debt')
    .eq('user_id', req.user.id)
    .order('snapshot_date', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  if (!snapshots || snapshots.length === 0) return res.json({ data: null });

  const latest  = snapshots[snapshots.length - 1];
  const current = Number(latest.net_worth);

  // 전월 대비
  const prev = snapshots[snapshots.length - 2] ?? null;
  const mom  = prev
    ? ((current - Number(prev.net_worth)) / Number(prev.net_worth)) * 100
    : null;

  // 전년 동월 대비
  const latestDate = new Date(latest.snapshot_date);
  const yoyDate    = new Date(latestDate);
  yoyDate.setFullYear(yoyDate.getFullYear() - 1);
  const yoySnap = snapshots
    .filter(s => new Date(s.snapshot_date) <= yoyDate)
    .at(-1) ?? null;
  const yoy = yoySnap
    ? ((current - Number(yoySnap.net_worth)) / Number(yoySnap.net_worth)) * 100
    : null;

  // CAGR (연 평균 성장률)
  const first       = snapshots[0];
  const firstAmount = Number(first.net_worth);
  const years = (new Date(latest.snapshot_date) - new Date(first.snapshot_date))
    / (1000 * 60 * 60 * 24 * 365.25);
  const cagr = years >= 0.1 && firstAmount > 0
    ? (Math.pow(current / firstAmount, 1 / years) - 1) * 100
    : null;

  // 목표 달성 예상 연도 계산 (goals 별도 조회)
  const { data: goals } = await supabase
    .from('user_asset_goals')
    .select('*')
    .eq('user_id', req.user.id)
    .eq('is_achieved', false);

  const goalProjections = (goals || []).map(g => {
    if (!cagr || cagr <= 0) return { ...g, expected_year: null };
    const yearsNeeded = Math.log(Number(g.target_amount) / current) / Math.log(1 + cagr / 100);
    const expectedYear = Math.ceil(new Date().getFullYear() + yearsNeeded);
    return { ...g, expected_year: expectedYear };
  });

  // 총 누적 증가
  const totalGain    = current - firstAmount;
  const totalGainPct = firstAmount > 0 ? (totalGain / firstAmount) * 100 : null;

  res.json({
    data: {
      current_net_worth: current,
      mom_rate:          mom   !== null ? Math.round(mom   * 100) / 100 : null,
      yoy_rate:          yoy   !== null ? Math.round(yoy   * 100) / 100 : null,
      cagr:              cagr  !== null ? Math.round(cagr  * 100) / 100 : null,
      total_gain:        totalGain,
      total_gain_pct:    totalGainPct !== null ? Math.round(totalGainPct * 100) / 100 : null,
      first_snapshot:    { date: first.snapshot_date, net_worth: firstAmount },
      latest_snapshot:   { date: latest.snapshot_date, net_worth: current },
      months_recorded:   snapshots.length,
      goal_projections:  goalProjections,
    },
  });
});

// GET /api/my-ai/snapshots?from=&to=&limit=
router.get('/', requireAuth, async (req, res) => {
  const { from, to, limit = 60 } = req.query;

  let query = supabase
    .from('user_asset_snapshots')
    .select('*')
    .eq('user_id', req.user.id)
    .order('snapshot_date', { ascending: false })
    .limit(Number(limit));

  if (from) query = query.gte('snapshot_date', from);
  if (to)   query = query.lte('snapshot_date', to);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// POST /api/my-ai/snapshots
router.post('/', requireAuth, async (req, res) => {
  const {
    snapshot_date, stock = 0, real_estate = 0, cash = 0,
    pension = 0, gold = 0, crypto = 0, other = 0,
    loan_mortgage = 0, loan_credit = 0, loan_minus = 0,
    note, detail = {},
  } = req.body;

  if (!snapshot_date) return res.status(400).json({ error: 'snapshot_date는 필수입니다.' });

  const { data, error } = await supabase
    .from('user_asset_snapshots')
    .upsert(
      {
        user_id: req.user.id, snapshot_date,
        stock, real_estate, cash, pension, gold, crypto, other,
        loan_mortgage, loan_credit, loan_minus,
        note, detail,
      },
      { onConflict: 'user_id,snapshot_date' }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // 마일스톤 체크
  const { data: goals } = await supabase
    .from('user_asset_goals')
    .select('*')
    .eq('user_id', req.user.id)
    .eq('is_achieved', false);

  await checkMilestones(req.user.id, Number(data.net_worth), snapshot_date, goals || []);

  res.status(201).json({ data });
});

// PUT /api/my-ai/snapshots/:id
router.put('/:id', requireAuth, async (req, res) => {
  const FIELDS = [
    'snapshot_date', 'stock', 'real_estate', 'cash', 'pension',
    'gold', 'crypto', 'other', 'loan_mortgage', 'loan_credit', 'loan_minus',
    'note', 'detail',
  ];
  const payload = {};
  for (const f of FIELDS) {
    if (req.body[f] !== undefined) payload[f] = req.body[f];
  }

  const { data, error } = await supabase
    .from('user_asset_snapshots')
    .update(payload)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data)  return res.status(404).json({ error: '스냅샷을 찾을 수 없습니다.' });
  res.json({ data });
});

// DELETE /api/my-ai/snapshots/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('user_asset_snapshots')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
