'use client';

import { useEffect, useState } from 'react';
import {
  getAssets, createAsset, updateAsset, deleteAsset,
  getSnapshots, getSnapshotStats, createSnapshot, updateSnapshot, deleteSnapshot,
  getGoals, createGoal, updateGoal, deleteGoal,
  getMilestones,
  generateMyAiReport, getMyAiReports, getMyAiReport,
  UserAsset, AssetType, SnapshotPayload, GoalPayload, GoalType,
} from '@/lib/api';

// ─── 상수 ────────────────────────────────────────────────────────────────────

const ASSET_TYPES: { value: AssetType; label: string; icon: string; color: string; bg: string; isDebt?: boolean }[] = [
  // 자산
  { value: 'real_estate',   label: '부동산',      icon: '🏠', color: '#534AB7', bg: '#EEEDFE' },
  { value: 'stock',         label: '주식·ETF',    icon: '📈', color: '#1D9E75', bg: '#E1F5EE' },
  { value: 'cash',          label: '현금·예금',   icon: '🏦', color: '#378ADD', bg: '#E6F1FB' },
  { value: 'pension',       label: '퇴직금·연금', icon: '🏦', color: '#6B7ADB', bg: '#EEEEFF' },
  { value: 'gold',          label: '금·귀금속',   icon: '⭐', color: '#D4A017', bg: '#FDF6E3' },
  { value: 'crypto',        label: '암호화폐',    icon: '₿',  color: '#EF9F27', bg: '#FAEEDA' },
  { value: 'other',         label: '기타자산',    icon: '⬡',  color: '#9490C0', bg: '#F4F3FF' },
  // 부채
  { value: 'loan_mortgage', label: '담보대출',    icon: '🏦', color: '#E53E3E', bg: '#FEE8E8', isDebt: true },
  { value: 'loan_credit',   label: '신용대출',    icon: '💳', color: '#E53E3E', bg: '#FEE8E8', isDebt: true },
  { value: 'loan_minus',    label: '마이너스통장', icon: '📉', color: '#E53E3E', bg: '#FEE8E8', isDebt: true },
  { value: 'debt',          label: '기타부채',    icon: '📉', color: '#E53E3E', bg: '#FEE8E8', isDebt: true },
];

type SnapField = { key: string; label: string; icon: string; isDebt?: boolean };

const SNAPSHOT_FIELDS: SnapField[] = [
  { key: 'stock',         label: '주식/투자',    icon: '📈' },
  { key: 'real_estate',   label: '부동산',       icon: '🏠' },
  { key: 'cash',          label: '현금',         icon: '🏦' },
  { key: 'pension',       label: '퇴직금',       icon: '🏦' },
  { key: 'gold',          label: '금',           icon: '⭐' },
  { key: 'crypto',        label: '암호화폐',     icon: '₿'  },
  { key: 'other',         label: '기타',         icon: '⬡'  },
  { key: 'loan_mortgage', label: '담보대출',     icon: '🏦', isDebt: true },
  { key: 'loan_credit',   label: '신용대출',     icon: '💳', isDebt: true },
  { key: 'loan_minus',    label: '마이너스통장', icon: '📉', isDebt: true },
];

const EMPTY_SNAPSHOT: Record<string, string | number> = {
  snapshot_date: new Date().toISOString().slice(0, 10),
  stock: '', real_estate: '', cash: '', pension: '',
  gold: '', crypto: '', other: '',
  loan_mortgage: '', loan_credit: '', loan_minus: '',
  note: '',
};

const EMPTY_GOAL = { goal_type: 'annual' as GoalType, name: '', target_amount: '', target_year: new Date().getFullYear(), description: '' };

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function formatMoney(n: number) {
  return '₩' + Math.round(n).toLocaleString();
}

function formatCompact(n: number) {
  if (Math.abs(n) >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}억`;
  if (Math.abs(n) >= 10_000)      return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}

function formatPct(n: number | null, sign = true): string {
  if (n === null || n === undefined) return '—';
  const s = sign && n > 0 ? '+' : '';
  return `${s}${n.toFixed(2)}%`;
}

function pctColor(n: number | null) {
  if (n === null) return '#9490C0';
  return n > 0 ? '#1D9E75' : n < 0 ? '#E53E3E' : '#9490C0';
}

function downloadMd(content: string, title: string) {
  const blob = new Blob([content], { type: 'text/markdown; charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${title}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── SVG 라인 차트 ────────────────────────────────────────────────────────────

function LineChart({ data }: { data: { date: string; value: number }[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (data.length < 2) return (
    <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9490C0', fontSize: 13 }}>
      스냅샷 2개 이상 추가하면 차트가 표시됩니다.
    </div>
  );

  const W = 700, H = 180;
  const PAD = { top: 16, right: 24, bottom: 36, left: 72 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const vals   = sorted.map(d => d.value);
  const minV   = Math.min(...vals);
  const maxV   = Math.max(...vals);
  const range  = maxV - minV || 1;

  const px = (i: number) => PAD.left + (i / (sorted.length - 1)) * plotW;
  const py = (v: number) => PAD.top + (1 - (v - minV) / range) * plotH;

  const points = sorted.map((d, i) => ({ x: px(i), y: py(d.value), ...d }));
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const fillPath = `${linePath} L${points.at(-1)!.x},${PAD.top + plotH} L${points[0].x},${PAD.top + plotH} Z`;

  // Y축 레이블 3개
  const yLabels = [maxV, (maxV + minV) / 2, minV];

  // X축 레이블 (최대 8개)
  const step = Math.ceil(sorted.length / 8);
  const xLabels = sorted.filter((_, i) => i % step === 0 || i === sorted.length - 1);

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#534AB7" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#534AB7" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* 그리드 라인 */}
        {yLabels.map((v, i) => (
          <line key={i} x1={PAD.left} x2={PAD.left + plotW} y1={py(v)} y2={py(v)}
            stroke="rgba(83,74,183,0.08)" strokeWidth="1" strokeDasharray="4 4" />
        ))}

        {/* 채움 */}
        <path d={fillPath} fill="url(#chartFill)" />

        {/* 라인 */}
        <path d={linePath} fill="none" stroke="#534AB7" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Y축 레이블 */}
        {yLabels.map((v, i) => (
          <text key={i} x={PAD.left - 8} y={py(v) + 4} textAnchor="end"
            fontSize="10" fill="#9490C0">
            {v >= 100_000_000 ? `${(v / 100_000_000).toFixed(1)}억` : `${Math.round(v / 10_000)}만`}
          </text>
        ))}

        {/* X축 레이블 */}
        {xLabels.map((d, i) => {
          const idx = sorted.indexOf(d);
          return (
            <text key={i} x={px(idx)} y={H - 4} textAnchor="middle" fontSize="10" fill="#9490C0">
              {d.date.slice(0, 7)}
            </text>
          );
        })}

        {/* 호버 닷 */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={hovered === i ? 5 : 3}
            fill={hovered === i ? '#534AB7' : '#fff'}
            stroke="#534AB7" strokeWidth="2"
            style={{ cursor: 'pointer', transition: 'r 0.1s' }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}

        {/* 호버 툴팁 */}
        {hovered !== null && (() => {
          const p = points[hovered];
          const label = p.value >= 100_000_000
            ? `${(p.value / 100_000_000).toFixed(2)}억`
            : `${Math.round(p.value / 10_000).toLocaleString()}만`;
          const boxW = 110, boxH = 36;
          const bx = Math.min(p.x - boxW / 2, W - PAD.right - boxW);
          const by = p.y - boxH - 8;
          return (
            <g pointerEvents="none">
              <rect x={bx} y={by} width={boxW} height={boxH} rx="6"
                fill="#1A1830" fillOpacity="0.9" />
              <text x={bx + boxW / 2} y={by + 13} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.7)">{p.date}</text>
              <text x={bx + boxW / 2} y={by + 27} textAnchor="middle" fontSize="12" fill="#fff" fontWeight="600">₩{label}</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

// ─── 마크다운 뷰어 ─────────────────────────────────────────────────────────────

function MarkdownViewer({ content }: { content: string }) {
  if (!content) return <div style={{ color: '#9490C0', fontSize: 13, padding: '20px 0' }}>내용이 없습니다.</div>;

  const boldify = (text: string): React.ReactNode[] => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      p.startsWith('**') && p.endsWith('**')
        ? <strong key={i}>{p.slice(2, -2)}</strong>
        : p
    );
  };

  const lines  = content.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 수평선
    if (/^---+$/.test(line.trim())) {
      nodes.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid rgba(83,74,183,0.1)', margin: '16px 0' }} />);
      i++; continue;
    }
    // h1
    if (line.startsWith('# ')) {
      nodes.push(<h1 key={i} style={{ fontSize: 18, fontWeight: 700, color: '#1A1830', margin: '0 0 12px', lineHeight: 1.4 }}>{boldify(line.slice(2))}</h1>);
      i++; continue;
    }
    // h2
    if (line.startsWith('## ')) {
      nodes.push(<h2 key={i} style={{ fontSize: 15, fontWeight: 700, color: '#534AB7', margin: '20px 0 8px', lineHeight: 1.4 }}>{boldify(line.slice(3))}</h2>);
      i++; continue;
    }
    // h3
    if (line.startsWith('### ')) {
      nodes.push(<h3 key={i} style={{ fontSize: 13, fontWeight: 700, color: '#4A4870', margin: '14px 0 6px', lineHeight: 1.4 }}>{boldify(line.slice(4))}</h3>);
      i++; continue;
    }
    // blockquote
    if (line.startsWith('> ')) {
      nodes.push(
        <div key={i} style={{ borderLeft: '3px solid #534AB7', paddingLeft: 12, margin: '8px 0', color: '#7B72D4', fontSize: 12, lineHeight: 1.7 }}>
          {boldify(line.slice(2))}
        </div>
      );
      i++; continue;
    }
    // 체크리스트
    if (line.startsWith('- [ ] ') || line.startsWith('- [x] ')) {
      const done = line.startsWith('- [x] ');
      nodes.push(
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '4px 0', fontSize: 13, color: '#4A4870' }}>
          <span style={{ marginTop: 1, flexShrink: 0, color: done ? '#1D9E75' : '#9490C0' }}>{done ? '✅' : '☐'}</span>
          <span style={{ textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1 }}>{boldify(line.slice(6))}</span>
        </div>
      );
      i++; continue;
    }
    // 불릿
    if (line.startsWith('- ')) {
      nodes.push(
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '3px 0', fontSize: 13, color: '#4A4870', lineHeight: 1.7 }}>
          <span style={{ color: '#534AB7', flexShrink: 0, marginTop: 2 }}>•</span>
          <span>{boldify(line.slice(2))}</span>
        </div>
      );
      i++; continue;
    }
    // 테이블
    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines.filter(l => !l.replace(/[\s|:-]/g, '').length === false || !/^[\s|:-]+$/.test(l));
      nodes.push(
        <div key={`table-${i}`} style={{ overflowX: 'auto', margin: '10px 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {rows.map((row, ri) => {
                const cells = row.split('|').slice(1, -1).map(c => c.trim());
                const isHeader = ri === 0;
                return (
                  <tr key={ri} style={{ background: isHeader ? '#F0EFFF' : ri % 2 === 0 ? '#fff' : '#FAFAFE' }}>
                    {cells.map((cell, ci) => {
                      const Tag = isHeader ? 'th' : 'td';
                      return (
                        <Tag key={ci} style={{ padding: '7px 10px', border: '1px solid rgba(83,74,183,0.1)', textAlign: 'left', color: isHeader ? '#534AB7' : '#4A4870', fontWeight: isHeader ? 600 : 400 }}>
                          {boldify(cell)}
                        </Tag>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    // 빈 줄
    if (line.trim() === '') {
      nodes.push(<div key={i} style={{ height: 6 }} />);
      i++; continue;
    }
    // 일반 텍스트
    nodes.push(
      <p key={i} style={{ fontSize: 13, color: '#4A4870', lineHeight: 1.85, margin: '3px 0' }}>
        {boldify(line)}
      </p>
    );
    i++;
  }

  return <div>{nodes}</div>;
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function AssetsPage() {
  const [assets,         setAssets]         = useState<UserAsset[]>([]);
  const [snapshots,      setSnapshots]      = useState<any[]>([]);
  const [stats,          setStats]          = useState<any>(null);
  const [goals,          setGoals]          = useState<any[]>([]);
  const [milestones,     setMilestones]     = useState<any[]>([]);
  const [reports,         setReports]         = useState<any[]>([]);
  const [selectedReport,  setSelectedReport]  = useState<any>(null);
  const [selectedContent, setSelectedContent] = useState('');
  const [loadingReport,   setLoadingReport]   = useState(false);

  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error,      setError]      = useState('');
  const [showTable,  setShowTable]  = useState(false);

  // 스냅샷 모달
  const [snapModal,    setSnapModal]    = useState(false);
  const [editingSnap,  setEditingSnap]  = useState<any>(null);
  const [snapForm,     setSnapForm]     = useState<typeof EMPTY_SNAPSHOT>({ ...EMPTY_SNAPSHOT });
  const [snapSaving,   setSnapSaving]   = useState(false);
  const [snapError,    setSnapError]    = useState('');

  // 목표 모달
  const [goalModal,     setGoalModal]     = useState(false);
  const [editingGoal,   setEditingGoal]   = useState<any>(null);
  const [goalForm,      setGoalForm]      = useState<typeof EMPTY_GOAL>({ ...EMPTY_GOAL });
  const [goalSaving,    setGoalSaving]    = useState(false);
  const [goalError,     setGoalError]     = useState('');

  // 자산 항목 모달 (기존 user_assets)
  const [assetModal,  setAssetModal]  = useState(false);
  const [editingAsset, setEditingAsset] = useState<UserAsset | null>(null);
  const [assetForm,   setAssetForm]   = useState({
    asset_type: 'stock' as AssetType,
    name: '', amount: '', recorded_at: new Date().toISOString().slice(0, 10),
    interest_rate: '',        // 금리 (부채 공통)
    repayment_method: '',     // 상환방법 (담보대출)
    loan_term_years: '',      // 대출기간 년 (담보대출)
    start_date: '',           // 대출 시작일
  });
  const [assetSaving, setAssetSaving] = useState(false);
  const [assetError,  setAssetError]  = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [assetsRes, snapsRes, statsRes, goalsRes, milestonesRes, reportsRes] = await Promise.all([
        getAssets(),
        getSnapshots({ limit: 36 }),
        getSnapshotStats(),
        getGoals(),
        getMilestones(),
        getMyAiReports({ module_key: 'assets', limit: 24 }),
      ]);
      setAssets(assetsRes?.data ?? []);
      setSnapshots(snapsRes?.data ?? []);
      setStats(statsRes?.data ?? null);
      setGoals(goalsRes?.data ?? []);
      setMilestones(milestonesRes?.data ?? []);

      const list = reportsRes?.data ?? [];
      setReports(list);
      if (list.length > 0 && !selectedReport) {
        await selectReport(list[0]);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // ── 스냅샷 모달 ──────────────────────────────────────────────────────────────

  function openSnapAdd() {
    setSnapForm({ ...EMPTY_SNAPSHOT, snapshot_date: new Date().toISOString().slice(0, 10) });
    setEditingSnap(null);
    setSnapError('');
    setSnapModal(true);
  }

  function openSnapEdit(snap: any) {
    const form: Record<string, string | number> = { snapshot_date: snap.snapshot_date, note: snap.note ?? '' };
    for (const f of SNAPSHOT_FIELDS) form[f.key] = snap[f.key] ?? '';
    setSnapForm(form);
    setEditingSnap(snap);
    setSnapError('');
    setSnapModal(true);
  }

  function copyPrevSnapshot() {
    const sorted = [...snapshots].sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));
    const prev   = editingSnap
      ? sorted.find(s => s.snapshot_date < editingSnap.snapshot_date)
      : sorted[0];
    if (!prev) return;
    const form: Record<string, string | number> = { ...snapForm };
    for (const f of SNAPSHOT_FIELDS) form[f.key] = prev[f.key] ?? '';
    setSnapForm(form);
  }

  async function handleSnapSave() {
    if (!snapForm.snapshot_date) { setSnapError('기준일을 입력해주세요.'); return; }
    setSnapSaving(true); setSnapError('');
    try {
      const payload: SnapshotPayload = { snapshot_date: String(snapForm.snapshot_date) };
      for (const f of SNAPSHOT_FIELDS) {
        (payload as any)[f.key] = Number(snapForm[f.key]) || 0;
      }
      payload.note = String(snapForm.note || '');

      if (editingSnap) {
        await updateSnapshot(editingSnap.id, payload);
      } else {
        await createSnapshot(payload);
      }
      setSnapModal(false);
      load();
    } catch (e: any) { setSnapError(e.message); }
    finally { setSnapSaving(false); }
  }

  async function handleSnapDelete(id: string) {
    if (!confirm('이 스냅샷을 삭제하시겠습니까?')) return;
    await deleteSnapshot(id);
    load();
  }

  // ── 목표 모달 ────────────────────────────────────────────────────────────────

  function openGoalModal(existing?: any, defaultType: GoalType = 'annual') {
    if (existing) {
      setGoalForm({ goal_type: existing.goal_type, name: existing.name, target_amount: String(existing.target_amount), target_year: existing.target_year, description: existing.description ?? '' });
      setEditingGoal(existing);
    } else {
      const thisYear = new Date().getFullYear();
      // 연간 목표: 올해 이미 있으면 바로 수정 모드
      if (defaultType === 'annual') {
        const dup = goals.find(g => g.goal_type === 'annual' && g.target_year === thisYear);
        if (dup) { openGoalModal(dup); return; }
      }
      setGoalForm({ goal_type: defaultType, name: '', target_amount: '', target_year: thisYear, description: '' });
      setEditingGoal(null);
    }
    setGoalError('');
    setGoalModal(true);
  }

  // 연간 목표 — 연도 변경 시 해당 연도에 기존 목표 있으면 자동 수정 모드 전환
  function handleGoalYearChange(year: number) {
    setGoalForm(f => ({ ...f, target_year: year }));
    if (goalForm.goal_type === 'annual') {
      const dup = goals.find(g => g.goal_type === 'annual' && g.target_year === year && g.id !== editingGoal?.id);
      if (dup) {
        setGoalForm({ goal_type: 'annual', name: dup.name, target_amount: String(dup.target_amount), target_year: year, description: dup.description ?? '' });
        setEditingGoal(dup);
        setGoalError(`${year}년 목표가 이미 있어 수정 모드로 전환됐습니다.`);
      } else {
        if (editingGoal?.goal_type === 'annual' && editingGoal?.target_year !== year) {
          setEditingGoal(null);
          setGoalError('');
        }
      }
    }
  }

  async function handleGoalSave() {
    if (!goalForm.name.trim() || !goalForm.target_amount) { setGoalError('목표명과 목표 금액을 입력해주세요.'); return; }
    setGoalSaving(true); setGoalError('');
    try {
      if (editingGoal) {
        await updateGoal(editingGoal.id, { name: goalForm.name, target_amount: Number(goalForm.target_amount), target_year: goalForm.target_year, description: goalForm.description });
      } else {
        await createGoal({ ...goalForm, target_amount: Number(goalForm.target_amount), description: goalForm.description } as GoalPayload);
      }
      setGoalModal(false);
      load();
    } catch (e: any) { setGoalError(e.message); }
    finally { setGoalSaving(false); }
  }

  async function handleGoalDelete(id: string) {
    if (!confirm('목표를 삭제하시겠습니까?')) return;
    await deleteGoal(id);
    load();
  }

  // ── 자산 항목 모달 ────────────────────────────────────────────────────────────

  const EMPTY_ASSET_FORM = {
    asset_type: 'stock' as AssetType, name: '', amount: '',
    recorded_at: new Date().toISOString().slice(0, 10),
    interest_rate: '', repayment_method: '', loan_term_years: '', start_date: '',
  };

  function openAssetModal(asset?: UserAsset) {
    if (asset) {
      const m = (asset as any).metadata ?? {};
      setAssetForm({
        asset_type: asset.asset_type, name: asset.name,
        amount: String(asset.amount), recorded_at: asset.recorded_at,
        interest_rate:    String(m.interest_rate    ?? ''),
        repayment_method: String(m.repayment_method ?? ''),
        loan_term_years:  String(m.loan_term_years  ?? ''),
        start_date:       String(m.start_date       ?? ''),
      });
      setEditingAsset(asset);
    } else {
      setAssetForm({ ...EMPTY_ASSET_FORM });
      setEditingAsset(null);
    }
    setAssetError('');
    setAssetModal(true);
  }

  async function handleAssetSave() {
    if (!assetForm.name.trim() || isNaN(Number(assetForm.amount))) { setAssetError('자산명과 금액을 입력해주세요.'); return; }
    setAssetSaving(true); setAssetError('');

    const isDebtType = ASSET_TYPES.find(t => t.value === assetForm.asset_type)?.isDebt;
    const metadata: Record<string, any> = {};
    if (isDebtType) {
      if (assetForm.interest_rate)    metadata.interest_rate    = Number(assetForm.interest_rate);
      if (assetForm.repayment_method) metadata.repayment_method = assetForm.repayment_method;
      if (assetForm.loan_term_years)  metadata.loan_term_years  = Number(assetForm.loan_term_years);
      if (assetForm.start_date)       metadata.start_date       = assetForm.start_date;
    }

    try {
      const payload = { asset_type: assetForm.asset_type, name: assetForm.name, amount: Number(assetForm.amount), recorded_at: assetForm.recorded_at, metadata: Object.keys(metadata).length ? metadata : undefined };
      if (editingAsset) {
        await updateAsset(editingAsset.id, payload);
      } else {
        await createAsset(payload);
      }
      setAssetModal(false);
      load();
    } catch (e: any) { setAssetError(e.message); }
    finally { setAssetSaving(false); }
  }

  async function handleAssetDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return;
    await deleteAsset(id);
    load();
  }

  // ── AI 리포트 ─────────────────────────────────────────────────────────────────

  async function selectReport(r: any) {
    setSelectedReport(r);
    if (r.content) { setSelectedContent(r.content); return; }
    setLoadingReport(true);
    try {
      const full = await getMyAiReport(r.id);
      const content = full?.data?.content ?? '';
      setSelectedContent(content);
      // 캐시: reports 배열에도 content 저장
      setReports(prev => prev.map(p => p.id === r.id ? { ...p, content } : p));
    } finally {
      setLoadingReport(false);
    }
  }

  async function handleGenerateReport() {
    setGenerating(true);
    try {
      const res = await generateMyAiReport('assets');
      const newReport = res.data;
      setReports(prev => [newReport, ...prev]);
      await selectReport(newReport);
    } catch (e: any) {
      alert('리포트 생성 실패: ' + e.message);
    } finally {
      setGenerating(false);
    }
  }

  // ── 파생 데이터 ───────────────────────────────────────────────────────────────

  const sortedSnaps = [...snapshots].sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));

  // 전월 증가율 계산 (화면 출력용)
  const snapsWithMom = sortedSnaps.map((s, i) => {
    const prev  = sortedSnaps[i + 1];
    const mom   = prev && Number(prev.net_worth) > 0
      ? ((Number(s.net_worth) - Number(prev.net_worth)) / Number(prev.net_worth)) * 100
      : null;
    return { ...s, mom };
  });

  // 연간 목표 (올해)
  const annualGoal = goals.find(g => g.goal_type === 'annual' && g.target_year === new Date().getFullYear());
  const annualPct  = annualGoal && stats
    ? Math.min(100, (stats.current_net_worth / Number(annualGoal.target_amount)) * 100)
    : null;
  const annualRemain   = annualGoal && stats ? Math.max(0, Number(annualGoal.target_amount) - stats.current_net_worth) : null;
  const remainMonths   = 12 - new Date().getMonth();
  const monthlyNeeded  = annualRemain !== null && remainMonths > 0 ? Math.round(annualRemain / remainMonths) : null;

  // 장기 목표
  const longtermGoals = goals.filter(g => g.goal_type === 'longterm');

  // 자산 구성 (최신 스냅샷 기준)
  const latestSnap = sortedSnaps[0];
  const compositionBars = latestSnap
    ? [
        { key: 'stock',       label: '주식/투자', icon: '📈', color: '#1D9E75', value: Number(latestSnap.stock) },
        { key: 'real_estate', label: '부동산',    icon: '🏠', color: '#534AB7', value: Number(latestSnap.real_estate) },
        { key: 'cash',        label: '현금',      icon: '🏦', color: '#378ADD', value: Number(latestSnap.cash) },
        { key: 'pension',     label: '퇴직금',    icon: '🏦', color: '#9490C0', value: Number(latestSnap.pension) },
        { key: 'gold',        label: '금',        icon: '⭐', color: '#EF9F27', value: Number(latestSnap.gold) },
        { key: 'crypto',      label: '암호화폐',  icon: '₿',  color: '#E53E3E', value: Number(latestSnap.crypto) },
        { key: 'other',       label: '기타',      icon: '⬡',  color: '#B0A9E0', value: Number(latestSnap.other) },
      ].filter(b => b.value > 0)
    : [];

  const totalAssetComp = compositionBars.reduce((s, b) => s + b.value, 0);

  if (loading) return <div style={s.center}>불러오는 중...</div>;
  if (error)   return <div style={s.center} onClick={load}>⚠ {error} — 다시 시도</div>;

  return (
    <div>
      {/* ── 헤더 ─────────────────────────────────────────────────────────────── */}
      <div style={s.pageHeader}>
        <div>
          <div style={s.breadcrumb}>나만의 AI › 자산 관리</div>
          <div style={s.title}>💰 자산 관리</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btnSecondary} onClick={() => openGoalModal(undefined, 'annual')}>
            {goals.find(g => g.goal_type === 'annual' && g.target_year === new Date().getFullYear()) ? '✎ 올해 목표 수정' : '+ 목표 추가'}
          </button>
          <button style={s.btnSecondary} onClick={openSnapAdd}>+ 스냅샷 추가</button>
          <button
            style={{ ...s.btnPrimary, opacity: generating ? 0.7 : 1 }}
            onClick={handleGenerateReport}
            disabled={generating}
          >
            {generating ? '생성 중...' : '✦ AI 리포트 생성'}
          </button>
        </div>
      </div>

      {/* ── 연간 목표 배너 ───────────────────────────────────────────────────── */}
      {annualGoal && (
        <div style={s.goalBanner}>
          <div style={s.goalBannerLeft}>
            <div style={s.goalBannerLabel}>🎯 {annualGoal.target_year}년 목표</div>
            <div style={s.goalBannerName}>{annualGoal.name}</div>
            <div style={s.goalBannerSub}>
              {annualGoal.is_achieved
                ? '🎉 목표 달성!'
                : `달성까지 ${formatCompact(annualRemain ?? 0)} 남음 · 남은 ${remainMonths}개월 · 월 ${formatCompact(monthlyNeeded ?? 0)} 필요`}
            </div>
          </div>
          <div style={s.goalBannerRight}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={s.goalBannerPct}>{annualPct?.toFixed(1)}%</span>
              <span style={s.goalBannerTarget}>{formatCompact(Number(annualGoal.target_amount))}</span>
            </div>
            <div style={s.goalGaugeTrack}>
              <div style={{ ...s.goalGaugeFill, width: `${Math.min(100, annualPct ?? 0)}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* ── 통계 4칸 ─────────────────────────────────────────────────────────── */}
      <div style={s.fourCol}>
        {[
          {
            label: '총 순자산',
            value: stats ? formatCompact(stats.current_net_worth) : '—',
            sub: stats ? formatMoney(stats.current_net_worth) : '스냅샷을 추가하세요',
          },
          {
            label: '전월 대비',
            value: formatPct(stats?.mom_rate),
            sub: stats?.mom_rate != null ? (stats.mom_rate > 0 ? '▲ 증가' : '▼ 감소') : '—',
            color: pctColor(stats?.mom_rate),
          },
          {
            label: '전년 동월 대비',
            value: formatPct(stats?.yoy_rate),
            sub: stats?.months_recorded ? `${stats.months_recorded}개월 기록 중` : '—',
            color: pctColor(stats?.yoy_rate),
          },
          {
            label: '연평균 성장률(CAGR)',
            value: formatPct(stats?.cagr),
            sub: stats?.total_gain != null ? `총 ${formatCompact(stats.total_gain)} 증가` : '—',
            color: pctColor(stats?.cagr),
          },
        ].map((st, i) => (
          <div key={i} style={s.statCard}>
            <div style={s.statLabel}>{st.label}</div>
            <div style={{ ...s.statValue, color: st.color ?? '#1A1830' }}>{st.value}</div>
            <div style={s.statSub}>{st.sub}</div>
          </div>
        ))}
      </div>

      {/* ── 자산 구성 + 자산 항목 ────────────────────────────────────────────── */}
      <div style={s.twoCol}>
        {/* 자산 구성 바 차트 */}
        <div style={s.card}>
          <div style={s.cardTitle}>
            자산 구성
            <span style={s.cardSub}>{latestSnap ? `${latestSnap.snapshot_date} 기준` : '스냅샷 없음'}</span>
          </div>
          {compositionBars.length === 0 ? (
            <div style={s.empty}>스냅샷을 추가하면 자산 구성이 표시됩니다.</div>
          ) : (
            compositionBars.map(bar => {
              const pct = totalAssetComp > 0 ? Math.round((bar.value / totalAssetComp) * 100) : 0;
              return (
                <div key={bar.key} style={s.barWrap}>
                  <div style={s.barLabel}>
                    <span>{bar.icon} {bar.label}</span>
                    <span style={{ color: bar.color }}>{pct}% · {formatCompact(bar.value)}</span>
                  </div>
                  <div style={s.barTrack}>
                    <div style={{ ...s.barFill, width: `${pct}%`, background: bar.color }} />
                  </div>
                </div>
              );
            })
          )}
          {latestSnap && Number(latestSnap.total_debt) > 0 && (
            <div style={{ ...s.barWrap, marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(83,74,183,0.08)' }}>
              <div style={s.barLabel}>
                <span>📉 부채 합계</span>
                <span style={{ color: '#E53E3E' }}>−{formatCompact(Number(latestSnap.total_debt))}</span>
              </div>
            </div>
          )}
        </div>

        {/* 자산 항목 리스트 (user_assets) */}
        <div style={s.card}>
          <div style={s.cardTitle}>
            자산 항목 상세
            <span style={s.cardAction} onClick={() => openAssetModal()}>+ 추가</span>
          </div>
          {assets.length === 0 ? (
            <div style={s.empty}>항목별 자산을 등록하면 구성 상세를 볼 수 있습니다.</div>
          ) : (
            assets.map(asset => {
              const info = ASSET_TYPES.find(t => t.value === asset.asset_type) ?? ASSET_TYPES[5];
              return (
                <div key={asset.id} style={s.assetRow}>
                  <div style={{ ...s.assetIcon, background: info.bg }}>{info.icon}</div>
                  <div style={s.assetInfo}>
                    <div style={s.assetName}>{asset.name}</div>
                    <div style={s.assetDetail}>{info.label} · {asset.recorded_at}</div>
                    {info.isDebt && (() => {
                      const m = (asset as any).metadata ?? {};
                      const parts: string[] = [];
                      if (m.interest_rate)    parts.push(`금리 ${m.interest_rate}%`);
                      if (m.repayment_method) parts.push(m.repayment_method);
                      if (m.loan_term_years)  parts.push(`${m.loan_term_years}년`);
                      if (m.start_date)       parts.push(`시작 ${m.start_date}`);
                      return parts.length > 0
                        ? <div style={{ fontSize: 11, color: '#E53E3E', marginTop: 2 }}>{parts.join(' · ')}</div>
                        : null;
                    })()}
                  </div>
                  <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                    <div style={s.assetValue}>{formatCompact(Number(asset.amount))}</div>
                    <div style={s.assetActions}>
                      <span style={s.actionBtn} onClick={() => openAssetModal(asset)}>편집</span>
                      <span style={{ ...s.actionBtn, color: '#E53E3E' }} onClick={() => handleAssetDelete(asset.id)}>삭제</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── 월별 자산 추이 (차트 + 테이블) ─────────────────────────────────── */}
      <div style={s.card}>
        <div style={s.cardTitle}>
          월별 자산 추이
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button style={s.cardBtn} onClick={() => setShowTable(v => !v)}>
              {showTable ? '▲ 테이블 접기' : '▼ 테이블 펼치기'}
            </button>
            <button style={s.cardBtn} onClick={openSnapAdd}>+ 스냅샷 추가</button>
          </div>
        </div>

        {/* 라인 차트 */}
        <LineChart
          data={[...snapshots]
            .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
            .map(s => ({ date: s.snapshot_date, value: Number(s.net_worth) }))}
        />

        {/* 테이블 (토글) */}
        {showTable && (
          <div style={{ marginTop: 16 }}>
            {snapsWithMom.length === 0 ? (
              <div style={s.empty}>아직 스냅샷이 없습니다.</div>
            ) : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      {['날짜', '전월 증가율', '순자산', '주식/투자', '부동산', '현금', '퇴직금', '금', '암호화폐', '부채', '비고', ''].map(h => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {snapsWithMom.map((snap) => (
                      <tr key={snap.id} style={s.tr}>
                        <td style={{ ...s.td, whiteSpace: 'nowrap', fontWeight: 500 }}>{snap.snapshot_date}</td>
                        <td style={{ ...s.td, color: pctColor(snap.mom), fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {snap.mom !== null ? formatPct(snap.mom) : '—'}
                        </td>
                        <td style={{ ...s.td, fontWeight: 600, whiteSpace: 'nowrap' }}>{formatCompact(Number(snap.net_worth))}</td>
                        <td style={s.td}>{Number(snap.stock)       > 0 ? formatCompact(Number(snap.stock))       : '—'}</td>
                        <td style={s.td}>{Number(snap.real_estate) > 0 ? formatCompact(Number(snap.real_estate)) : '—'}</td>
                        <td style={s.td}>{Number(snap.cash)        > 0 ? formatCompact(Number(snap.cash))        : '—'}</td>
                        <td style={s.td}>{Number(snap.pension)     > 0 ? formatCompact(Number(snap.pension))     : '—'}</td>
                        <td style={s.td}>{Number(snap.gold)        > 0 ? formatCompact(Number(snap.gold))        : '—'}</td>
                        <td style={s.td}>{Number(snap.crypto)      > 0 ? formatCompact(Number(snap.crypto))      : '—'}</td>
                        <td style={{ ...s.td, color: '#E53E3E' }}>
                          {Number(snap.total_debt) > 0 ? `−${formatCompact(Number(snap.total_debt))}` : '—'}
                        </td>
                        <td style={{ ...s.td, color: '#9490C0', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {snap.note || ''}
                        </td>
                        <td style={s.td}>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <span style={s.actionBtn} onClick={() => openSnapEdit(snap)}>편집</span>
                            <span style={{ ...s.actionBtn, color: '#E53E3E' }} onClick={() => handleSnapDelete(snap.id)}>삭제</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 장기 목표 + 마일스톤 ─────────────────────────────────────────────── */}
      <div style={s.twoCol}>
        {/* 장기 목표 */}
        <div style={s.card}>
          <div style={s.cardTitle}>
            장기 목표
            <span style={s.cardAction} onClick={() => openGoalModal(undefined, 'longterm')}>+ 추가</span>
          </div>
          {longtermGoals.length === 0 ? (
            <div style={s.empty}>장기 자산 목표를 설정해보세요.</div>
          ) : (
            longtermGoals.map(goal => {
              const projection = stats?.goal_projections?.find((p: any) => p.id === goal.id);
              const pct = stats ? Math.min(100, (stats.current_net_worth / Number(goal.target_amount)) * 100) : 0;
              return (
                <div key={goal.id} style={s.goalCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={s.goalName}>{goal.is_achieved ? '✅' : '🏆'} {goal.name}</div>
                      <div style={s.goalMeta}>
                        목표: {formatCompact(Number(goal.target_amount))} · {goal.target_year}년
                        {projection?.expected_year && !goal.is_achieved && (
                          <span style={{ color: '#9490C0' }}> · 예상 달성 {projection.expected_year}년</span>
                        )}
                      </div>
                      {goal.description && (
                        <div style={s.goalDesc}>{goal.description}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ ...s.goalPctBadge, background: goal.is_achieved ? '#E1F5EE' : '#EEEDFE', color: goal.is_achieved ? '#1D9E75' : '#534AB7' }}>
                        {pct.toFixed(1)}%
                      </span>
                      <span style={s.actionBtn} onClick={() => openGoalModal(goal)}>편집</span>
                      <span style={{ ...s.actionBtn, color: '#E53E3E' }} onClick={() => handleGoalDelete(goal.id)}>삭제</span>
                    </div>
                  </div>
                  <div style={s.goalGaugeTrack}>
                    <div style={{ ...s.goalGaugeFill, width: `${pct}%`, background: goal.is_achieved ? '#1D9E75' : '#534AB7' }} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 마일스톤 */}
        <div style={s.card}>
          <div style={s.cardTitle}>마일스톤</div>
          {milestones.length === 0 ? (
            <div style={s.empty}>자산 목표를 달성하면 마일스톤이 기록됩니다.</div>
          ) : (
            milestones.slice(0, 8).map((m: any) => (
              <div key={m.id} style={s.milestoneRow}>
                <div style={s.milestoneBadge}>{m.label}</div>
                <div style={s.milestoneMeta}>
                  {m.achieved_at} · {formatCompact(Number(m.net_worth))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── AI 리포트 ─────────────────────────────────────────────────────────── */}
      <div style={s.card}>
        <div style={s.cardTitle}>AI 리포트</div>
        {reports.length === 0 ? (
          <div style={s.empty}>아직 생성된 리포트가 없습니다. 위 버튼으로 생성해보세요.</div>
        ) : (
          <div style={{ display: 'flex', gap: 0, minHeight: 400 }}>
            {/* 리포트 목록 */}
            <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid rgba(83,74,183,0.1)', paddingRight: 0, overflowY: 'auto', maxHeight: 560 }}>
              {reports.map(r => (
                <div
                  key={r.id}
                  onClick={() => selectReport(r)}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    borderBottom: '1px solid rgba(83,74,183,0.07)',
                    background: selectedReport?.id === r.id ? 'rgba(83,74,183,0.08)' : 'transparent',
                    borderLeft: selectedReport?.id === r.id ? '3px solid #534AB7' : '3px solid transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: selectedReport?.id === r.id ? 700 : 500, color: selectedReport?.id === r.id ? '#534AB7' : '#1A1830', lineHeight: 1.4, wordBreak: 'break-all' }}>
                    {r.title}
                  </div>
                  <div style={{ fontSize: 11, color: '#9490C0', marginTop: 3 }}>
                    {new Date(r.generated_at).toLocaleDateString('ko-KR')}
                  </div>
                </div>
              ))}
            </div>

            {/* 리포트 뷰어 */}
            <div style={{ flex: 1, paddingLeft: 24, minWidth: 0 }}>
              {selectedReport ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1830' }}>{selectedReport.title}</div>
                      <div style={{ fontSize: 11, color: '#9490C0', marginTop: 3 }}>{new Date(selectedReport.generated_at).toLocaleString('ko-KR')}</div>
                    </div>
                    <button
                      style={s.cardBtn}
                      onClick={() => downloadMd(selectedContent, selectedReport.title)}
                      disabled={!selectedContent}
                    >
                      ⬇ MD 다운로드
                    </button>
                  </div>
                  <div style={{ borderTop: '1px solid rgba(83,74,183,0.08)', paddingTop: 16 }}>
                    {loadingReport
                      ? <div style={{ color: '#9490C0', fontSize: 13 }}>내용을 불러오는 중...</div>
                      : <MarkdownViewer content={selectedContent} />
                    }
                  </div>
                </>
              ) : (
                <div style={s.empty}>좌측에서 리포트를 선택하세요.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ────────────────── 스냅샷 입력 모달 ───────────────────────────────── */}
      {snapModal && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setSnapModal(false); }}>
          <div style={{ ...s.modal, width: 520, maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>{editingSnap ? '스냅샷 편집' : '스냅샷 추가'}</span>
              <span style={s.modalClose} onClick={() => setSnapModal(false)}>×</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={s.field2}>
                <label style={s.label}>기준일</label>
                <input
                  style={s.input}
                  type="date"
                  value={String(snapForm.snapshot_date)}
                  onChange={e => setSnapForm(f => ({ ...f, snapshot_date: e.target.value }))}
                />
              </div>
              <button style={{ ...s.btnSecondary, marginTop: 18, fontSize: 11 }} onClick={copyPrevSnapshot}>
                전월 값 복사
              </button>
            </div>

            <div style={s.sectionLabel}>자산</div>
            <div style={s.twoColForm}>
              {SNAPSHOT_FIELDS.filter(f => !f.isDebt).map(f => (
                <div key={f.key} style={s.field2}>
                  <label style={s.label}>{f.icon} {f.label}</label>
                  <input
                    style={s.input}
                    type="number"
                    placeholder="0"
                    value={snapForm[f.key] as string}
                    onChange={e => setSnapForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  />
                  {snapForm[f.key] !== '' && !isNaN(Number(snapForm[f.key])) && Number(snapForm[f.key]) > 0 && (
                    <div style={s.amountPreview}>{formatCompact(Number(snapForm[f.key]))}</div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ ...s.sectionLabel, color: '#E53E3E' }}>부채</div>
            <div style={s.twoColForm}>
              {SNAPSHOT_FIELDS.filter(f => f.isDebt).map(f => (
                <div key={f.key} style={s.field2}>
                  <label style={s.label}>{f.icon} {f.label}</label>
                  <input
                    style={s.input}
                    type="number"
                    placeholder="0"
                    value={snapForm[f.key] as string}
                    onChange={e => setSnapForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  />
                  {snapForm[f.key] !== '' && !isNaN(Number(snapForm[f.key])) && Number(snapForm[f.key]) > 0 && (
                    <div style={{ ...s.amountPreview, color: '#E53E3E' }}>−{formatCompact(Number(snapForm[f.key]))}</div>
                  )}
                </div>
              ))}
            </div>

            <div style={s.field}>
              <label style={s.label}>비고</label>
              <input
                style={s.input}
                placeholder="이번 달 특이사항 (예: 2억 달성, 연말정산 환급)"
                value={String(snapForm.note)}
                onChange={e => setSnapForm(f => ({ ...f, note: e.target.value }))}
              />
            </div>

            {snapError && <div style={s.formError}>{snapError}</div>}
            <div style={s.modalFooter}>
              <button style={s.btnSecondary} onClick={() => setSnapModal(false)}>취소</button>
              <button style={{ ...s.btnPrimary, opacity: snapSaving ? 0.7 : 1 }} onClick={handleSnapSave} disabled={snapSaving}>
                {snapSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── 목표 입력 모달 ─────────────────────────────────── */}
      {goalModal && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setGoalModal(false); }}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>{editingGoal ? '올해 목표 수정' : '자산 목표 추가'}</span>
              <span style={s.modalClose} onClick={() => setGoalModal(false)}>×</span>
            </div>

            <div style={s.field}>
              <label style={s.label}>목표 유형</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['annual', 'longterm'] as GoalType[]).map(t => (
                  <button
                    key={t}
                    style={{ ...s.typeBtn, ...(goalForm.goal_type === t ? s.typeBtnActive : {}) }}
                    onClick={() => {
                      setGoalForm(f => ({ ...f, goal_type: t }));
                      setGoalError('');
                    }}
                    disabled={!!editingGoal}
                  >
                    {t === 'annual' ? '🎯 연간 목표' : '🏆 장기 목표'}
                  </button>
                ))}
              </div>
              {editingGoal && <div style={{ fontSize: 11, color: '#9490C0', marginTop: 5 }}>수정 중에는 유형을 변경할 수 없습니다.</div>}
            </div>

            <div style={s.field}>
              <label style={s.label}>목표 이름</label>
              <input
                style={s.input}
                placeholder="예: 3억 달성, 10억 달성"
                value={goalForm.name}
                onChange={e => setGoalForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div style={s.twoColForm}>
              <div style={s.field2}>
                <label style={s.label}>목표 금액 (원)</label>
                <input
                  style={s.input}
                  type="number"
                  placeholder="300000000"
                  value={goalForm.target_amount}
                  onChange={e => setGoalForm(f => ({ ...f, target_amount: e.target.value }))}
                />
                {goalForm.target_amount && !isNaN(Number(goalForm.target_amount)) && (
                  <div style={s.amountPreview}>{formatCompact(Number(goalForm.target_amount))}</div>
                )}
              </div>
              <div style={s.field2}>
                <label style={s.label}>목표 연도</label>
                <input
                  style={s.input}
                  type="number"
                  value={goalForm.target_year}
                  onChange={e => handleGoalYearChange(Number(e.target.value))}
                />
              </div>
            </div>

            <div style={s.field}>
              <label style={s.label}>상세 목표 <span style={{ color: '#9490C0', fontWeight: 400 }}>(선택)</span></label>
              <textarea
                style={{ ...s.input, height: 80, resize: 'vertical' as const, lineHeight: 1.6 }}
                placeholder="예) 2030년까지 부동산 2채(서울·수도권), 주식 10억, 부채 5억 이하로 총 자산 20억·순자산 10억 달성"
                value={goalForm.description}
                onChange={e => setGoalForm(f => ({ ...f, description: e.target.value }))}
              />
              <div style={{ fontSize: 11, color: '#9490C0', marginTop: 4 }}>AI 리포트 작성 시 목표 맥락으로 활용됩니다.</div>
            </div>

            {goalError && <div style={s.formError}>{goalError}</div>}
            <div style={s.modalFooter}>
              <button style={s.btnSecondary} onClick={() => setGoalModal(false)}>취소</button>
              <button style={{ ...s.btnPrimary, opacity: goalSaving ? 0.7 : 1 }} onClick={handleGoalSave} disabled={goalSaving}>
                {goalSaving ? '저장 중...' : editingGoal ? '수정' : '추가'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── 자산 항목 모달 ─────────────────────────────────── */}
      {assetModal && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setAssetModal(false); }}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>{editingAsset ? '자산 편집' : '자산 항목 추가'}</span>
              <span style={s.modalClose} onClick={() => setAssetModal(false)}>×</span>
            </div>
            <div style={s.field}>
              <label style={s.label}>유형</label>
              <select style={s.select} value={assetForm.asset_type} onChange={e => setAssetForm(f => ({ ...f, asset_type: e.target.value as AssetType }))}>
                <optgroup label="── 자산">
                  {ASSET_TYPES.filter(t => !t.isDebt).map(t => (
                    <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                  ))}
                </optgroup>
                <optgroup label="── 부채">
                  {ASSET_TYPES.filter(t => t.isDebt).map(t => (
                    <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div style={s.field}>
              <label style={s.label}>자산명</label>
              <input style={s.input} placeholder="예: 삼성전자, 토스뱅크" value={assetForm.name} onChange={e => setAssetForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div style={s.field}>
              <label style={s.label}>금액 (원)</label>
              <input style={s.input} type="number" value={assetForm.amount} onChange={e => setAssetForm(f => ({ ...f, amount: e.target.value }))} />
              {assetForm.amount && !isNaN(Number(assetForm.amount)) && (
                <div style={s.amountPreview}>{formatCompact(Number(assetForm.amount))}</div>
              )}
            </div>
            <div style={s.field}>
              <label style={s.label}>기준일</label>
              <input style={s.input} type="date" value={assetForm.recorded_at} onChange={e => setAssetForm(f => ({ ...f, recorded_at: e.target.value }))} />
            </div>

            {/* 부채 전용 필드 */}
            {ASSET_TYPES.find(t => t.value === assetForm.asset_type)?.isDebt && (
              <>
                <div style={{ ...s.sectionLabel, color: '#E53E3E', marginTop: 12 }}>부채 상세 정보</div>
                <div style={s.twoColForm}>
                  <div style={s.field2}>
                    <label style={s.label}>금리 (%/년)</label>
                    <input
                      style={s.input} type="number" step="0.01" placeholder="예: 3.5"
                      value={assetForm.interest_rate}
                      onChange={e => setAssetForm(f => ({ ...f, interest_rate: e.target.value }))}
                    />
                  </div>
                  <div style={s.field2}>
                    <label style={s.label}>대출 시작일</label>
                    <input
                      style={s.input} type="date"
                      value={assetForm.start_date}
                      onChange={e => setAssetForm(f => ({ ...f, start_date: e.target.value }))}
                    />
                  </div>
                </div>

                {assetForm.asset_type === 'loan_mortgage' && (
                  <div style={s.twoColForm}>
                    <div style={s.field2}>
                      <label style={s.label}>상환 방법</label>
                      <select
                        style={s.select}
                        value={assetForm.repayment_method}
                        onChange={e => setAssetForm(f => ({ ...f, repayment_method: e.target.value }))}
                      >
                        <option value="">선택</option>
                        <option value="원리금균등">원리금균등상환</option>
                        <option value="원금균등">원금균등상환</option>
                        <option value="만기일시">만기일시상환</option>
                        <option value="혼합형">혼합형</option>
                      </select>
                    </div>
                    <div style={s.field2}>
                      <label style={s.label}>대출 기간 (년)</label>
                      <input
                        style={s.input} type="number" placeholder="예: 30"
                        value={assetForm.loan_term_years}
                        onChange={e => setAssetForm(f => ({ ...f, loan_term_years: e.target.value }))}
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {assetError && <div style={s.formError}>{assetError}</div>}
            <div style={s.modalFooter}>
              <button style={s.btnSecondary} onClick={() => setAssetModal(false)}>취소</button>
              <button style={{ ...s.btnPrimary, opacity: assetSaving ? 0.7 : 1 }} onClick={handleAssetSave} disabled={assetSaving}>
                {assetSaving ? '저장 중...' : (editingAsset ? '저장' : '추가')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 스타일 ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  center:       { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#9490C0', fontSize: 14, cursor: 'pointer' },
  pageHeader:   { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  breadcrumb:   { fontSize: 12, color: '#9490C0', marginBottom: 4 },
  title:        { fontSize: 18, fontWeight: 700, color: '#1A1830' },
  btnSecondary: { fontSize: 12, padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(83,74,183,0.2)', background: '#fff', color: '#534AB7', cursor: 'pointer' },
  btnPrimary:   { fontSize: 12, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#534AB7', color: '#fff', cursor: 'pointer' },

  // 연간 목표 배너
  goalBanner:      { background: 'linear-gradient(135deg,#534AB7,#7B72D4)', borderRadius: 14, padding: '18px 24px', marginBottom: 16, display: 'flex', gap: 24, alignItems: 'center' },
  goalBannerLeft:  { flex: 1, minWidth: 0 },
  goalBannerRight: { width: 280, flexShrink: 0 },
  goalBannerLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  goalBannerName:  { fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 4 },
  goalBannerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  goalBannerPct:   { fontSize: 15, fontWeight: 700, color: '#fff' },
  goalBannerTarget:{ fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  goalGaugeTrack:  { height: 8, background: 'rgba(255,255,255,0.25)', borderRadius: 4, overflow: 'hidden' },
  goalGaugeFill:   { height: '100%', background: '#fff', borderRadius: 4, transition: 'width 0.5s ease' },

  // 통계
  fourCol:    { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 },
  statCard:   { background: '#fff', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(83,74,183,0.08)' },
  statLabel:  { fontSize: 11, color: '#9490C0', marginBottom: 6 },
  statValue:  { fontSize: 20, fontWeight: 700 },
  statSub:    { fontSize: 11, color: '#9490C0', marginTop: 4 },

  // 카드
  twoCol:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 },
  card:       { background: '#fff', border: '1px solid rgba(83,74,183,0.08)', borderRadius: 14, padding: '18px', marginBottom: 16 },
  cardTitle:  { fontSize: 13, fontWeight: 600, color: '#4A4870', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardSub:    { fontSize: 11, color: '#9490C0', fontWeight: 400 },
  cardAction: { fontSize: 11, color: '#534AB7', cursor: 'pointer', fontWeight: 400 },
  cardBtn:    { fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(83,74,183,0.2)', background: '#fff', color: '#534AB7', cursor: 'pointer' },
  empty:      { fontSize: 13, color: '#9490C0', textAlign: 'center' as const, padding: '20px 0', lineHeight: 1.8 },

  // 바 차트
  barWrap:  { marginBottom: 12 },
  barLabel: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#4A4870', marginBottom: 5 },
  barTrack: { height: 6, background: '#F0EFFF', borderRadius: 3, overflow: 'hidden' },
  barFill:  { height: '100%', borderRadius: 3, transition: 'width 0.4s ease' },

  // 자산 항목
  assetRow:    { display: 'flex', alignItems: 'center', paddingTop: 10, paddingBottom: 10, borderBottom: '1px solid rgba(83,74,183,0.06)' },
  assetIcon:   { width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, marginRight: 10, flexShrink: 0 },
  assetInfo:   { flex: 1, minWidth: 0 },
  assetName:   { fontSize: 13, fontWeight: 500, color: '#1A1830', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  assetDetail: { fontSize: 11, color: '#9490C0', marginTop: 1 },
  assetValue:  { fontSize: 13, fontWeight: 600, color: '#1A1830' },
  assetActions:{ display: 'flex', gap: 8, marginTop: 3, justifyContent: 'flex-end' },
  actionBtn:   { fontSize: 11, color: '#534AB7', cursor: 'pointer' },

  // 스냅샷 테이블
  tableWrap: { overflowX: 'auto' as const },
  table:     { width: '100%', borderCollapse: 'collapse' as const, fontSize: 12 },
  th:        { padding: '8px 12px', background: '#F8F7FF', color: '#9490C0', fontWeight: 600, textAlign: 'left' as const, whiteSpace: 'nowrap', borderBottom: '1px solid rgba(83,74,183,0.1)' },
  tr:        { borderBottom: '1px solid rgba(83,74,183,0.06)' },
  td:        { padding: '9px 12px', color: '#4A4870', fontSize: 12, whiteSpace: 'nowrap' },

  // 장기 목표 카드
  goalCard:     { background: '#F8F7FF', borderRadius: 10, padding: '12px 14px', marginBottom: 10 },
  goalName:     { fontSize: 13, fontWeight: 600, color: '#1A1830', marginBottom: 3 },
  goalMeta:     { fontSize: 11, color: '#9490C0' },
  goalPctBadge: { fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6 },
  goalDesc:     { fontSize: 11, color: '#7B72D4', marginTop: 5, lineHeight: 1.6, whiteSpace: 'pre-wrap' as const },

  // 마일스톤
  milestoneRow:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(83,74,183,0.06)' },
  milestoneBadge:{ fontSize: 13, fontWeight: 500, color: '#1A1830' },
  milestoneMeta: { fontSize: 11, color: '#9490C0' },

  // AI 리포트
  reportWrap:    { maxHeight: 480, overflowY: 'auto' as const, borderRadius: 10, background: '#F8F7FF', padding: '16px' },
  reportContent: { fontSize: 13, lineHeight: 1.9, color: '#4A4870', whiteSpace: 'pre-wrap' as const, fontFamily: 'inherit', margin: 0 },

  // 모달
  overlay:     { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal:       { background: '#fff', borderRadius: 16, padding: '24px', width: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.12)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:  { fontSize: 15, fontWeight: 600, color: '#1A1830' },
  modalClose:  { fontSize: 20, color: '#9490C0', cursor: 'pointer', lineHeight: 1 },
  sectionLabel:{ fontSize: 11, fontWeight: 700, color: '#534AB7', letterSpacing: '0.05em', marginBottom: 10, marginTop: 4 },
  twoColForm:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  field:       { marginBottom: 14 },
  field2:      { marginBottom: 12 },
  label:       { display: 'block', fontSize: 12, color: '#4A4870', marginBottom: 5, fontWeight: 500 },
  input:       { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(83,74,183,0.2)', fontSize: 13, color: '#1A1830', outline: 'none', boxSizing: 'border-box' as const, background: '#FAFAFE' },
  select:      { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(83,74,183,0.2)', fontSize: 13, color: '#1A1830', outline: 'none', boxSizing: 'border-box' as const, background: '#FAFAFE' },
  amountPreview:{ fontSize: 11, color: '#534AB7', marginTop: 3, fontWeight: 600 },
  formError:   { fontSize: 12, color: '#E53E3E', marginBottom: 12, background: '#FEE8E8', padding: '8px 12px', borderRadius: 6 },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 },
  typeBtn:     { flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid rgba(83,74,183,0.2)', background: '#fff', color: '#4A4870', cursor: 'pointer', fontSize: 12 },
  typeBtnActive:{ background: '#EEEDFE', color: '#534AB7', borderColor: '#534AB7', fontWeight: 600 },
};
