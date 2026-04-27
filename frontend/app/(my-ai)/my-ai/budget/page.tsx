'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getBudget, getBudgetYearly, getBudgetCompare, getBudgetFixed,
  createBudgetFixed, updateBudgetFixed, deleteBudgetFixed, applyBudgetFixed,
  createBudgetRecord, deleteBudgetRecord,
  generateMyAiReport, getMyAiReports, getMyAiReport,
  BudgetRecord, BudgetFixedItem, MonthSummary, AiReport,
} from '@/lib/api';

// ─── 상수 ────────────────────────────────────────────────────────────────────

const INCOME_CATS = ['월급', '부업·프리랜서', '투자수익', '이자', '기타'];
const MONTH_LABELS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const PALETTE = ['#534AB7','#1D9E75','#E53E3E','#EF9F27','#378ADD','#6B7ADB','#D4A017','#9490C0','#48BB78','#F687B3'];

type TabId = 'monthly' | 'yearly' | 'fixed';

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n === 0) return '0';
  if (Math.abs(n) >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}
function fmtFull(n: number) { return '₩' + Math.round(n).toLocaleString(); }
function diffPct(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}
function pctBadge(pct: number | null, inverse = false) {
  if (pct === null) return null;
  const isUp  = pct > 0;
  const color = (isUp && !inverse) || (!isUp && inverse) ? '#E53E3E' : '#1D9E75';
  return <span style={{ fontSize: 11, color, fontWeight: 600, marginLeft: 4 }}>{isUp ? '▲' : '▼'}{Math.abs(pct)}%</span>;
}

/* 실제 레코드 카테고리 기반 그룹 (고정비 카테고리 포함) */
function buildCatGroups(records: BudgetRecord[]) {
  const catMap: Record<string, number> = {};
  records.filter(r => r.record_type === 'expense').forEach(r => {
    const cat = (r as any).category?.trim() || '미분류';
    catMap[cat] = (catMap[cat] || 0) + Number(r.amount);
  });
  return Object.entries(catMap)
    .map(([cat, sum]) => ({ cat, sum }))
    .filter(g => g.sum > 0)
    .sort((a, b) => b.sum - a.sum);
}

const now = new Date();
type RecForm   = { record_type: 'income'|'expense'; category: string; amount: string; memo: string; recorded_at: string };
type FixedForm = { record_type: 'income'|'expense'; category: string; subcategory: string; person: string; amount: string; memo: string };
const EMPTY_REC:   RecForm   = { record_type: 'expense', category: '', amount: '', memo: '', recorded_at: now.toISOString().slice(0, 10) };
const EMPTY_FIXED: FixedForm = { record_type: 'expense', category: '', subcategory: '', person: '', amount: '', memo: '' };

// ─── Donut 차트 ───────────────────────────────────────────────────────────────

function DonutChart({ groups, total }: { groups: { cat: string; sum: number }[]; total: number }) {
  const [hov, setHov] = useState<number | null>(null);
  const CX = 90, CY = 90, R = 72, IR = 46;

  if (groups.length === 0 || total === 0)
    return <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C0BDDA', fontSize: 13 }}>지출 없음</div>;

  let angle = -Math.PI / 2;
  const slices = groups.slice(0, 8).map((g, i) => {
    const pct   = g.sum / total;
    const start = angle;
    angle += pct * 2 * Math.PI;
    return { ...g, pct, start, end: angle, color: PALETTE[i % PALETTE.length] };
  });

  function arc(s: number, e: number, r: number, ir: number) {
    const large = e - s > Math.PI ? 1 : 0;
    const cos = Math.cos, sin = Math.sin;
    return [
      `M${CX + r * cos(s)},${CY + r * sin(s)}`,
      `A${r},${r},0,${large},1,${CX + r * cos(e)},${CY + r * sin(e)}`,
      `L${CX + ir * cos(e)},${CY + ir * sin(e)}`,
      `A${ir},${ir},0,${large},0,${CX + ir * cos(s)},${CY + ir * sin(s)}`,
      'Z',
    ].join(' ');
  }

  const hovered = hov !== null ? slices[hov] : null;

  return (
    <svg width={180} height={180} style={{ display: 'block', margin: '0 auto' }}>
      {slices.map((sl, i) => sl.pct > 0.005 && (
        <path
          key={i}
          d={arc(sl.start, sl.end, hov === i ? R + 4 : R, IR)}
          fill={sl.color}
          opacity={hov === null || hov === i ? 0.9 : 0.45}
          style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
          onMouseEnter={() => setHov(i)}
          onMouseLeave={() => setHov(null)}
        />
      ))}
      {/* 가운데 텍스트 */}
      {hovered ? (
        <>
          <text x={CX} y={CY - 8} textAnchor="middle" fontSize={9} fill="#9490C0">{hovered.cat}</text>
          <text x={CX} y={CY + 7}  textAnchor="middle" fontSize={13} fontWeight="700" fill="#1A1830">{fmt(hovered.sum)}</text>
          <text x={CX} y={CY + 20} textAnchor="middle" fontSize={10} fill="#9490C0">{(hovered.pct * 100).toFixed(1)}%</text>
        </>
      ) : (
        <>
          <text x={CX} y={CY - 6} textAnchor="middle" fontSize={9} fill="#9490C0">총 지출</text>
          <text x={CX} y={CY + 10} textAnchor="middle" fontSize={14} fontWeight="700" fill="#1A1830">{fmt(total)}</text>
        </>
      )}
    </svg>
  );
}

// ─── 연간 막대 차트 ───────────────────────────────────────────────────────────

function YearBarChart({ months }: { months: MonthSummary[] }) {
  const W = 660, H = 150, PX = 6;
  const maxVal = Math.max(...months.flatMap(m => [m.income, m.expense]), 1);
  const groupW = (W - PX * 2) / 12;
  const bw = Math.min(12, (groupW - 8) / 2);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 24}`} style={{ display: 'block' }}>
      {[0.25, 0.5, 0.75, 1].map(p => (
        <line key={p} x1={PX} x2={W - PX} y1={H - p * H} y2={H - p * H} stroke="rgba(83,74,183,0.08)" strokeWidth={1} />
      ))}
      {months.map((m, i) => {
        const cx = PX + groupW * i + groupW / 2;
        const incH = (m.income / maxVal) * H;
        const expH = (m.expense / maxVal) * H;
        return (
          <g key={i}>
            {m.income  > 0 && <rect x={cx - bw - 1} y={H - incH} width={bw} height={incH} fill="#1D9E75" rx={2} opacity={0.85} />}
            {m.expense > 0 && <rect x={cx + 1}      y={H - expH} width={bw} height={expH} fill="#E53E3E" rx={2} opacity={0.85} />}
            <text x={cx} y={H + 16} textAnchor="middle" fontSize={9} fill="#9490C0">{i + 1}</text>
          </g>
        );
      })}
      {months.some(m => m.balance !== 0) && (
        <polyline
          points={months.map((m, i) => {
            const cx = PX + groupW * i + groupW / 2;
            return `${cx},${H - (Math.max(m.balance, 0) / maxVal) * H}`;
          }).join(' ')}
          fill="none" stroke="#534AB7" strokeWidth={1.5} strokeDasharray="4,2" opacity={0.55} />
      )}
    </svg>
  );
}

// ─── Markdown Viewer ──────────────────────────────────────────────────────────

function MdView({ content }: { content: string }) {
  if (!content) return <div style={{ color: '#C0BDDA', fontSize: 13, padding: '20px 0', textAlign: 'center' as const }}>내용이 없습니다.</div>;

  const bold = (t: string): React.ReactNode[] =>
    t.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
      p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p
    );

  const lines = content.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (/^---+$/.test(line.trim())) {
      nodes.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid rgba(83,74,183,0.1)', margin: '14px 0' }} />);
      i++; continue;
    }
    if (line.startsWith('# ')) {
      nodes.push(<div key={i} style={{ fontSize: 16, fontWeight: 700, color: '#1A1830', margin: '0 0 10px', lineHeight: 1.4 }}>{bold(line.slice(2))}</div>);
      i++; continue;
    }
    if (line.startsWith('## ')) {
      nodes.push(<div key={i} style={{ fontSize: 13, fontWeight: 700, color: '#534AB7', margin: '16px 0 6px', lineHeight: 1.4 }}>{bold(line.slice(3))}</div>);
      i++; continue;
    }
    if (line.startsWith('### ')) {
      nodes.push(<div key={i} style={{ fontSize: 12, fontWeight: 700, color: '#4A4870', margin: '12px 0 4px' }}>{bold(line.slice(4))}</div>);
      i++; continue;
    }
    if (line.startsWith('> ')) {
      nodes.push(
        <div key={i} style={{ borderLeft: '3px solid #534AB7', paddingLeft: 10, margin: '6px 0', color: '#7B72D4', fontSize: 12, lineHeight: 1.65 }}>
          {bold(line.slice(2))}
        </div>
      );
      i++; continue;
    }
    if (line.startsWith('- [ ] ') || line.startsWith('- [x] ')) {
      const done = line.startsWith('- [x] ');
      nodes.push(
        <div key={i} style={{ display: 'flex', gap: 7, margin: '3px 0', fontSize: 12, color: '#4A4870' }}>
          <span style={{ color: done ? '#1D9E75' : '#9490C0', flexShrink: 0 }}>{done ? '✅' : '☐'}</span>
          <span style={{ textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1, lineHeight: 1.6 }}>{bold(line.slice(6))}</span>
        </div>
      );
      i++; continue;
    }
    if (line.startsWith('- ')) {
      nodes.push(
        <div key={i} style={{ display: 'flex', gap: 7, margin: '3px 0', fontSize: 12, color: '#4A4870', lineHeight: 1.65 }}>
          <span style={{ color: '#534AB7', flexShrink: 0 }}>•</span>
          <span>{bold(line.slice(2))}</span>
        </div>
      );
      i++; continue;
    }
    if (line.startsWith('|')) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) { rows.push(lines[i]); i++; }
      const parsed = rows.filter(r => !/^[\s|:-]+$/.test(r)).map(r => r.split('|').filter((_, j) => j > 0 && j < r.split('|').length - 1).map(c => c.trim()));
      nodes.push(
        <div key={`t${i}`} style={{ overflowX: 'auto', margin: '8px 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            {parsed.map((row, ri) => (
              <tr key={ri} style={{ background: ri === 0 ? '#F4F3FF' : ri % 2 === 0 ? '#FAFAFE' : '#fff' }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ padding: '5px 8px', border: '1px solid rgba(83,74,183,0.1)', color: ri === 0 ? '#534AB7' : '#4A4870', fontWeight: ri === 0 ? 700 : 400 }}>
                    {bold(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </table>
        </div>
      );
      continue;
    }
    if (line.trim() === '') {
      nodes.push(<div key={i} style={{ height: 6 }} />);
    } else {
      nodes.push(<div key={i} style={{ fontSize: 12, color: '#4A4870', lineHeight: 1.75, marginBottom: 2 }}>{bold(line)}</div>);
    }
    i++;
  }
  return <>{nodes}</>;
}

// ─── 저축률 도넛 차트 ─────────────────────────────────────────────────────────

function SavingsDonut({ rate, income, expense }: { rate: number; income: number; expense: number }) {
  const CX = 54, CY = 54, R = 44, IR = 28;
  const color  = rate >= 20 ? '#1D9E75' : rate >= 0 ? '#EF9F27' : '#E53E3E';
  const saving = Math.max(0, income - expense);
  const pct    = income > 0 ? Math.min(saving / income, 1) : 0;

  function arc(s: number, e: number) {
    if (e - s >= 2 * Math.PI - 0.001) e = s + 2 * Math.PI - 0.001;
    const large = e - s > Math.PI ? 1 : 0;
    const cos = Math.cos, sin = Math.sin;
    return [
      `M${CX + R * cos(s)},${CY + R * sin(s)}`,
      `A${R},${R},0,${large},1,${CX + R * cos(e)},${CY + R * sin(e)}`,
      `L${CX + IR * cos(e)},${CY + IR * sin(e)}`,
      `A${IR},${IR},0,${large},0,${CX + IR * cos(s)},${CY + IR * sin(s)}`,
      'Z',
    ].join(' ');
  }

  const start = -Math.PI / 2;
  const end   = start + pct * 2 * Math.PI;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width={108} height={108} style={{ flexShrink: 0 }}>
        <path d={arc(start, start + 2 * Math.PI - 0.001)} fill="#F0EFFF" />
        {pct > 0.005 && <path d={arc(start, end)} fill={color} opacity={0.9} />}
        <text x={CX} y={CY - 5} textAnchor="middle" fontSize={14} fontWeight="700" fill={color}>{rate.toFixed(1)}%</text>
        <text x={CX} y={CY + 9} textAnchor="middle" fontSize={9} fill="#9490C0">저축률</text>
      </svg>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
          <span style={{ color: '#9490C0' }}>저축</span>
          <span style={{ color, fontWeight: 700 }}>{fmt(saving)}</span>
        </div>
        <div style={{ height: 4, background: '#F0EFFF', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
          <div style={{ height: '100%', width: `${pct * 100}%`, background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
        </div>
        <div style={{ fontSize: 10, color: '#9490C0' }}>
          {rate >= 30 ? '🟢 우수 (30% 이상)' : rate >= 20 ? '🟡 양호 (권장 20%)' : rate >= 0 ? '🟠 개선 필요' : '🔴 적자'}
        </div>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function BudgetPage() {
  const [tab, setTab] = useState<TabId>('monthly');

  // ── 월별 탭
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [records,    setRecords]    = useState<BudgetRecord[]>([]);
  const [summary,    setSummary]    = useState({ income: 0, expense: 0, balance: 0 });
  const [compare,    setCompare]    = useState<{ prev: any; lastYear: any } | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all'|'income'|'expense'>('all');
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  // ── AI 리포트
  const [allReports,     setAllReports]     = useState<AiReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<AiReport | null>(null);
  const [reportContent,  setReportContent]  = useState('');
  const [reportLoading,  setReportLoading]  = useState(false);
  const [showReportList, setShowReportList] = useState(false);
  const [generating,     setGenerating]     = useState(false);

  // ── 연간
  const [yearlyYear,    setYearlyYear]    = useState(now.getFullYear());
  const [yearlyData,    setYearlyData]    = useState<{ months: MonthSummary[]; total: any } | null>(null);
  const [yearlyLoading, setYearlyLoading] = useState(false);

  // ── 고정비
  const [fixedItems,   setFixedItems]   = useState<BudgetFixedItem[]>([]);
  const [fixedLoading, setFixedLoading] = useState(false);
  const [fixedModal,   setFixedModal]   = useState(false);
  const [editItem,     setEditItem]     = useState<BudgetFixedItem | null>(null);
  const [fixedForm,    setFixedForm]    = useState<FixedForm>(EMPTY_FIXED);
  const [fixedSaving,  setFixedSaving]  = useState(false);
  const [fixedFormErr, setFixedFormErr] = useState('');
  const [applying,     setApplying]     = useState(false);

  // ── 내역 추가 모달
  const [recModal,   setRecModal]   = useState(false);
  const [recForm,    setRecForm]    = useState<RecForm>(EMPTY_REC);
  const [recSaving,  setRecSaving]  = useState(false);
  const [recFormErr, setRecFormErr] = useState('');

  // ── 선택 월에 맞는 리포트 찾기
  function findMonthReport(reports: AiReport[], y: number, m: number) {
    return reports.find(r => {
      const d = new Date(r.generated_at);
      return d.getFullYear() === y && d.getMonth() + 1 === m;
    }) ?? null;
  }

  // ── 월별 데이터 로드
  const loadMonthly = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [budgetRes, compareRes, rptRes] = await Promise.all([
        getBudget({ year, month }),
        getBudgetCompare(year, month),
        getMyAiReports({ module_key: 'budget', limit: 36 }),
      ]);
      setRecords(budgetRes.data ?? []);
      setSummary(budgetRes.summary ?? { income: 0, expense: 0, balance: 0 });
      setCompare(compareRes);

      const rpts: AiReport[] = rptRes.data ?? [];
      setAllReports(rpts);

      // 선택 월 리포트 자동 선택
      const monthRpt = findMonthReport(rpts, year, month);
      const target   = monthRpt ?? rpts[0] ?? null;
      if (target && target.id !== selectedReport?.id) {
        setSelectedReport(target);
        setReportContent('');
        setReportLoading(true);
        const full = await getMyAiReport(target.id);
        setReportContent(full.data?.content ?? '');
        setReportLoading(false);
      } else if (!target) {
        setSelectedReport(null);
        setReportContent('');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  useEffect(() => { loadMonthly(); }, [loadMonthly]);

  // ── 연간 데이터
  const loadYearly = useCallback(async () => {
    setYearlyLoading(true);
    try { setYearlyData(await getBudgetYearly(yearlyYear)); }
    catch { /* silent */ } finally { setYearlyLoading(false); }
  }, [yearlyYear]);

  useEffect(() => { if (tab === 'yearly') loadYearly(); }, [tab, loadYearly]);

  // ── 고정비
  const loadFixed = useCallback(async () => {
    setFixedLoading(true);
    try { const r = await getBudgetFixed(); setFixedItems(r.data ?? []); }
    catch { /* silent */ } finally { setFixedLoading(false); }
  }, []);

  useEffect(() => { if (tab === 'fixed') loadFixed(); }, [tab, loadFixed]);

  // ── 리포트 선택
  async function selectReport(rpt: AiReport) {
    if (rpt.id === selectedReport?.id) { setShowReportList(false); return; }
    setSelectedReport(rpt);
    setReportContent('');
    setReportLoading(true);
    setShowReportList(false);
    try {
      const full = await getMyAiReport(rpt.id);
      setReportContent(full.data?.content ?? '');
    } catch { /* silent */ } finally { setReportLoading(false); }
  }

  // ── 월 이동
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  function prevMonth() { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); }
  function nextMonth() {
    if (isCurrentMonth) return;
    if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1);
  }

  // ── 리포트 생성
  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await generateMyAiReport('budget', { year, month });
      const newRpt = res.data;
      setAllReports(prev => [newRpt, ...prev]);
      setSelectedReport(newRpt);
      setReportContent(newRpt.content ?? '');
    } catch (e: any) { alert('리포트 생성 실패: ' + e.message); }
    finally { setGenerating(false); }
  }

  // ── 내역 저장
  async function handleRecSave() {
    const amt = Number(recForm.amount);
    if (!recForm.amount || isNaN(amt) || amt <= 0) { setRecFormErr('금액을 올바르게 입력해주세요.'); return; }
    setRecSaving(true); setRecFormErr('');
    try {
      await createBudgetRecord({ record_type: recForm.record_type, category: recForm.category || undefined, amount: amt, memo: recForm.memo.trim() || undefined, recorded_at: recForm.recorded_at });
      setRecModal(false); loadMonthly();
    } catch (e: any) { setRecFormErr(e.message); } finally { setRecSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('이 내역을 삭제하시겠습니까?')) return;
    try { await deleteBudgetRecord(id); loadMonthly(); }
    catch (e: any) { alert(e.message); }
  }

  // ── 고정비 저장
  async function handleFixedSave() {
    const amt = Number(fixedForm.amount);
    if (!fixedForm.category || !fixedForm.memo || !fixedForm.amount || isNaN(amt) || amt <= 0) {
      setFixedFormErr('카테고리, 항목명, 금액은 필수입니다.'); return;
    }
    setFixedSaving(true); setFixedFormErr('');
    try {
      if (editItem) {
        await updateBudgetFixed(editItem.id, { category: fixedForm.category, subcategory: fixedForm.subcategory || undefined, person: fixedForm.person || undefined, amount: amt, memo: fixedForm.memo, record_type: fixedForm.record_type });
      } else {
        await createBudgetFixed({ category: fixedForm.category, subcategory: fixedForm.subcategory || undefined, person: fixedForm.person || undefined, amount: amt, memo: fixedForm.memo, record_type: fixedForm.record_type });
      }
      setFixedModal(false); setEditItem(null); loadFixed();
    } catch (e: any) { setFixedFormErr(e.message); } finally { setFixedSaving(false); }
  }

  async function handleFixedDelete(id: string) {
    if (!confirm('이 고정비 항목을 삭제하시겠습니까?')) return;
    try { await deleteBudgetFixed(id); loadFixed(); }
    catch (e: any) { alert(e.message); }
  }

  async function handleFixedToggle(item: BudgetFixedItem) {
    try { await updateBudgetFixed(item.id, { is_active: !item.is_active }); loadFixed(); }
    catch (e: any) { alert(e.message); }
  }

  function openEditFixed(item: BudgetFixedItem) {
    setEditItem(item);
    setFixedForm({ record_type: item.record_type, category: item.category, subcategory: item.subcategory ?? '', person: item.person ?? '', amount: String(item.amount), memo: item.memo });
    setFixedFormErr(''); setFixedModal(true);
  }

  async function handleApplyFixed() {
    if (!confirm(`${year}년 ${month}월에 고정비를 적용하시겠습니까?`)) return;
    setApplying(true);
    try {
      const res = await applyBudgetFixed(year, month);
      alert(res.applied > 0 ? `${res.applied}개 고정비가 적용되었습니다.` : (res.message || '이미 적용되었습니다.'));
      if (res.applied > 0) loadMonthly();
    } catch (e: any) { alert(e.message); } finally { setApplying(false); }
  }

  // ── 파생 계산
  const catGroups  = buildCatGroups(records);
  const savingsRate = summary.income > 0 ? (summary.balance / summary.income) * 100 : 0;
  const fixedByCategory = fixedItems.reduce((acc, item) => { const k = item.category; if (!acc[k]) acc[k] = []; acc[k].push(item); return acc; }, {} as Record<string, BudgetFixedItem[]>);
  const fixedTotal = fixedItems.filter(i => i.is_active && i.record_type === 'expense').reduce((s, i) => s + Number(i.amount), 0);
  const displayed  = typeFilter === 'all' ? records : records.filter(r => r.record_type === typeFilter);
  const isMonthReport = selectedReport ? (() => { const d = new Date(selectedReport.generated_at); return d.getFullYear() === year && d.getMonth() + 1 === month; })() : false;

  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div>
      {/* ── 헤더 */}
      <div style={s.pageHeader}>
        <div>
          <div style={s.breadcrumb}>나만의 AI › 가계부</div>
          <div style={s.title}>📊 가계부</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }}>
          {tab === 'monthly' && <>
            <div style={s.monthNav}>
              <span style={s.monthBtn} onClick={prevMonth}>‹</span>
              <span style={s.monthLabel}>{year}.{String(month).padStart(2, '0')}</span>
              <span style={{ ...s.monthBtn, opacity: isCurrentMonth ? 0.3 : 1 }} onClick={nextMonth}>›</span>
            </div>
            <button style={s.btnSecondary} onClick={() => { setRecForm(EMPTY_REC); setRecFormErr(''); setRecModal(true); }}>+ 내역 추가</button>
            <button style={{ ...s.btnSecondary, opacity: applying ? 0.7 : 1 }} onClick={handleApplyFixed} disabled={applying}>{applying ? '적용 중...' : '고정비 적용'}</button>
            <button style={{ ...s.btnPrimary, opacity: generating ? 0.7 : 1 }} onClick={handleGenerate} disabled={generating}>{generating ? '생성 중...' : 'AI 리포트'}</button>
          </>}
        </div>
      </div>

      {/* ── 탭 바 */}
      <div style={s.tabBar}>
        {([['monthly','월별'], ['yearly','연간 요약'], ['fixed','고정비 관리']] as [TabId, string][]).map(([id, label]) => (
          <div key={id} style={{ ...s.tabItem, ...(tab === id ? s.tabActive : {}) }} onClick={() => setTab(id)}>{label}</div>
        ))}
      </div>

      {/* ══ 탭: 월별 ══ */}
      {tab === 'monthly' && (
        loading ? <div style={s.center}>불러오는 중...</div>
        : error   ? <div style={s.center} onClick={loadMonthly} role="button">⚠ {error} — 다시 시도</div>
        : <>
          {/* 4 stat 카드 */}
          <div style={s.fourCol}>
            <div style={{ ...s.statCard, borderTop: '3px solid #1D9E75' }}>
              <div style={s.statLabel}>총 수입</div>
              <div style={{ ...s.statValue, color: '#1D9E75' }}>+{fmt(summary.income)}</div>
              <div style={s.statMeta}>
                <span style={s.statSub}>{records.filter(r => r.record_type === 'income').length}건</span>
                {compare && <>{pctBadge(diffPct(summary.income, compare.prev.income))}<span style={s.cmpLabel}>전월</span></>}
              </div>
            </div>
            <div style={{ ...s.statCard, borderTop: '3px solid #E53E3E' }}>
              <div style={s.statLabel}>총 지출</div>
              <div style={{ ...s.statValue, color: '#E53E3E' }}>-{fmt(summary.expense)}</div>
              <div style={s.statMeta}>
                <span style={s.statSub}>{records.filter(r => r.record_type === 'expense').length}건</span>
                {compare && <>{pctBadge(diffPct(summary.expense, compare.prev.expense), true)}<span style={s.cmpLabel}>전월</span></>}
              </div>
            </div>
            <div style={{ ...s.statCard, borderTop: `3px solid ${summary.balance >= 0 ? '#534AB7' : '#E53E3E'}` }}>
              <div style={s.statLabel}>잔액</div>
              <div style={{ ...s.statValue, color: summary.balance >= 0 ? '#534AB7' : '#E53E3E' }}>
                {summary.balance >= 0 ? '+' : ''}{fmt(summary.balance)}
              </div>
              <div style={s.statMeta}>
                <span style={s.statSub}>{summary.balance >= 0 ? '흑자' : '적자'}</span>
                {compare && <><span style={s.cmpLabel}>작년 동월 잔액</span><span style={{ fontSize: 11, color: '#9490C0' }}>{fmt(compare.lastYear.balance)}</span></>}
              </div>
            </div>
            <div style={{ ...s.statCard, borderTop: `3px solid ${savingsRate >= 20 ? '#1D9E75' : savingsRate >= 0 ? '#EF9F27' : '#E53E3E'}` }}>
              <div style={s.statLabel}>저축률</div>
              {summary.income > 0
                ? <SavingsDonut rate={savingsRate} income={summary.income} expense={summary.expense} />
                : <div style={{ fontSize: 20, fontWeight: 700, color: '#9490C0', marginTop: 4 }}>—</div>
              }
            </div>
          </div>

          {/* 차트 + AI 리포트 */}
          <div style={s.twoCol}>
            {/* 도넛 차트 + 범례 */}
            <div style={s.card}>
              <div style={s.cardTitle}>카테고리별 지출</div>
              {catGroups.length === 0 ? (
                <div style={s.empty}>이번 달 지출 내역이 없습니다.</div>
              ) : (
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ flexShrink: 0 }}>
                    <DonutChart groups={catGroups} total={summary.expense} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {catGroups.slice(0, 8).map((g, i) => {
                      const pct = summary.expense > 0 ? (g.sum / summary.expense * 100) : 0;
                      return (
                        <div key={g.cat} style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#4A4870' }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: PALETTE[i % PALETTE.length], flexShrink: 0, display: 'inline-block' }} />
                              {g.cat}
                            </span>
                            <span style={{ fontSize: 11, color: '#9490C0' }}>{pct.toFixed(1)}% · {fmt(g.sum)}</span>
                          </div>
                          <div style={{ height: 4, background: '#F0EFFF', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: PALETTE[i % PALETTE.length], borderRadius: 2 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* AI 리포트 패널 */}
            <div style={s.card}>
              <div style={{ ...s.cardTitle, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>AI 월간 리포트</span>
                  {isMonthReport
                    ? <span style={s.monthBadgeOn}>{year}년 {month}월</span>
                    : selectedReport
                      ? <span style={s.monthBadgeOff}>다른 달 리포트</span>
                      : null}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {allReports.length > 0 && (
                    <span style={s.linkBtn} onClick={() => setShowReportList(v => !v)}>{showReportList ? '닫기' : `목록 (${allReports.length})`}</span>
                  )}
                  <button style={{ ...s.btnPrimary, fontSize: 11, padding: '4px 10px', opacity: generating ? 0.7 : 1 }} onClick={handleGenerate} disabled={generating}>
                    {generating ? '생성 중...' : '생성'}
                  </button>
                </div>
              </div>

              {/* 리포트 목록 */}
              {showReportList && (
                <div style={s.rptList}>
                  {allReports.map(rpt => {
                    const d  = new Date(rpt.generated_at);
                    const isMon = d.getFullYear() === year && d.getMonth() + 1 === month;
                    return (
                      <div key={rpt.id} style={{ ...s.rptItem, ...(selectedReport?.id === rpt.id ? s.rptItemActive : {}) }} onClick={() => selectReport(rpt)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#4A4870' }}>{d.getFullYear()}년 {d.getMonth() + 1}월</span>
                          {isMon && <span style={s.monthBadgeOn}>이달</span>}
                        </div>
                        <span style={{ fontSize: 10, color: '#9490C0' }}>{d.toLocaleDateString('ko-KR')}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 리포트 내용 */}
              {reportLoading ? (
                <div style={{ ...s.empty, marginTop: 12 }}>리포트 로딩 중...</div>
              ) : reportContent ? (
                <div style={s.rptBody}><MdView content={reportContent} /></div>
              ) : (
                <div style={s.emptyReport}>
                  <div style={s.emptyIcon}>📊</div>
                  <div style={s.emptyText}>{year}년 {month}월 리포트가 없습니다</div>
                  <div style={s.emptySub}>내역 입력 후 AI 리포트를 생성해보세요.</div>
                </div>
              )}
            </div>
          </div>

          {/* 내역 목록 */}
          <div style={s.card}>
            <div style={s.cardTitle}>
              수입·지출 내역 <span style={{ color: '#9490C0', fontWeight: 400, fontSize: 12 }}>{records.length}건</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['all','income','expense'] as const).map(t => (
                  <span key={t} style={{ ...s.typeTab, ...(typeFilter === t ? s.typeTabActive : {}) }} onClick={() => setTypeFilter(t)}>
                    {t === 'all' ? '전체' : t === 'income' ? '수입' : '지출'}
                  </span>
                ))}
              </div>
            </div>
            {displayed.length === 0 ? <div style={s.empty}>내역이 없습니다.</div>
              : displayed.map(rec => (
                <div key={rec.id} style={s.recRow}>
                  <div style={{ ...s.recType, ...(rec.record_type === 'income' ? s.incomeType : s.expenseType) }}>
                    {rec.record_type === 'income' ? '수입' : '지출'}
                  </div>
                  <div style={s.recInfo}>
                    <div style={s.recTitle}>{rec.memo || (rec as any).category || '—'}</div>
                    <div style={s.recMeta}>{(rec as any).category && `${(rec as any).category} · `}{rec.recorded_at}</div>
                  </div>
                  <div style={{ ...s.recAmount, color: rec.record_type === 'income' ? '#1D9E75' : '#E53E3E' }}>
                    {rec.record_type === 'income' ? '+' : '-'}{fmtFull(Number(rec.amount))}
                  </div>
                  <span style={s.deleteBtn} onClick={() => handleDelete(rec.id)}>×</span>
                </div>
              ))
            }
          </div>
        </>
      )}

      {/* ══ 탭: 연간 요약 ══ */}
      {tab === 'yearly' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={s.monthNav}>
              <span style={s.monthBtn} onClick={() => setYearlyYear(y => y - 1)}>‹</span>
              <span style={{ ...s.monthLabel, minWidth: 44 }}>{yearlyYear}년</span>
              <span style={{ ...s.monthBtn, opacity: yearlyYear >= now.getFullYear() ? 0.3 : 1 }}
                onClick={() => { if (yearlyYear < now.getFullYear()) setYearlyYear(y => y + 1); }}>›</span>
            </div>
          </div>
          {yearlyLoading ? <div style={s.center}>불러오는 중...</div> : !yearlyData ? null : (
            <>
              <div style={s.fourCol}>
                <div style={{ ...s.statCard, borderTop: '3px solid #1D9E75' }}>
                  <div style={s.statLabel}>연간 총 수입</div>
                  <div style={{ ...s.statValue, color: '#1D9E75' }}>+{fmt(yearlyData.total.income)}</div>
                  <div style={s.statSub}>{fmtFull(yearlyData.total.income)}</div>
                </div>
                <div style={{ ...s.statCard, borderTop: '3px solid #E53E3E' }}>
                  <div style={s.statLabel}>연간 총 지출</div>
                  <div style={{ ...s.statValue, color: '#E53E3E' }}>-{fmt(yearlyData.total.expense)}</div>
                  <div style={s.statSub}>{fmtFull(yearlyData.total.expense)}</div>
                </div>
                <div style={{ ...s.statCard, borderTop: `3px solid ${yearlyData.total.balance >= 0 ? '#534AB7' : '#E53E3E'}` }}>
                  <div style={s.statLabel}>연간 잔액</div>
                  <div style={{ ...s.statValue, color: yearlyData.total.balance >= 0 ? '#534AB7' : '#E53E3E' }}>
                    {yearlyData.total.balance >= 0 ? '+' : ''}{fmt(yearlyData.total.balance)}
                  </div>
                  <div style={s.statSub}>{yearlyData.total.balance >= 0 ? '흑자' : '적자'}</div>
                </div>
                <div style={{ ...s.statCard, borderTop: '3px solid #EF9F27' }}>
                  <div style={s.statLabel}>연간 평균 저축률</div>
                  <div style={{ ...s.statValue, color: '#EF9F27' }}>
                    {yearlyData.total.income > 0 ? `${((yearlyData.total.balance / yearlyData.total.income) * 100).toFixed(1)}%` : '—'}
                  </div>
                  <div style={s.statSub}>{yearlyData.months.filter(m => m.income > 0).length}개월 데이터</div>
                </div>
              </div>

              <div style={{ ...s.card, marginBottom: 14 }}>
                <div style={s.cardTitle}>
                  월별 수입·지출
                  <div style={{ display: 'flex', gap: 14 }}>
                    {[['#1D9E75','수입'],['#E53E3E','지출'],['#534AB7','잔액']].map(([c, l]) => (
                      <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#9490C0' }}>
                        <span style={{ width: 10, height: l === '잔액' ? 2 : 10, background: c, borderRadius: l === '잔액' ? 1 : 2, display: 'inline-block', opacity: l === '잔액' ? 0.6 : 1 }} />{l}
                      </span>
                    ))}
                  </div>
                </div>
                <YearBarChart months={yearlyData.months} />
              </div>

              <div style={s.card}>
                <div style={s.cardTitle}>월별 상세</div>
                <div style={{ overflowX: 'auto' as const }}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        {['월','수입','지출','잔액','저축률'].map((h, i) => (
                          <th key={h} style={{ ...s.th, color: ['','#1D9E75','#E53E3E','#534AB7','#EF9F27'][i] || s.th.color }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {yearlyData.months.map((m, i) => {
                        const sv = m.income > 0 ? Math.round((m.balance / m.income) * 100) : 0;
                        const has = m.income > 0 || m.expense > 0;
                        return (
                          <tr key={i} style={{ opacity: has ? 1 : 0.35 }}>
                            <td style={s.td}>{MONTH_LABELS[i]}</td>
                            <td style={{ ...s.td, color: '#1D9E75' }}>{m.income > 0 ? '+' + fmt(m.income) : '-'}</td>
                            <td style={{ ...s.td, color: '#E53E3E' }}>{m.expense > 0 ? '-' + fmt(m.expense) : '-'}</td>
                            <td style={{ ...s.td, color: m.balance >= 0 ? '#534AB7' : '#E53E3E', fontWeight: 600 }}>{has ? (m.balance >= 0 ? '+' : '') + fmt(m.balance) : '-'}</td>
                            <td style={{ ...s.td, color: sv >= 20 ? '#1D9E75' : sv < 0 ? '#E53E3E' : '#9490C0' }}>{has ? `${sv}%` : '-'}</td>
                          </tr>
                        );
                      })}
                      <tr style={{ borderTop: '2px solid rgba(83,74,183,0.12)', fontWeight: 700 }}>
                        <td style={s.td}>합계</td>
                        <td style={{ ...s.td, color: '#1D9E75' }}>+{fmt(yearlyData.total.income)}</td>
                        <td style={{ ...s.td, color: '#E53E3E' }}>-{fmt(yearlyData.total.expense)}</td>
                        <td style={{ ...s.td, color: yearlyData.total.balance >= 0 ? '#534AB7' : '#E53E3E' }}>{yearlyData.total.balance >= 0 ? '+' : ''}{fmt(yearlyData.total.balance)}</td>
                        <td style={s.td}>{yearlyData.total.income > 0 ? `${Math.round((yearlyData.total.balance / yearlyData.total.income) * 100)}%` : '-'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ 탭: 고정비 관리 ══ */}
      {tab === 'fixed' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: '#4A4870' }}>
              활성 고정비 합계: <strong style={{ color: '#E53E3E' }}>-{fmtFull(fixedTotal)}</strong>
              <span style={{ fontSize: 11, color: '#9490C0', marginLeft: 8 }}>(매월 자동 반복 항목)</span>
            </div>
            <button style={s.btnPrimary} onClick={() => { setEditItem(null); setFixedForm(EMPTY_FIXED); setFixedFormErr(''); setFixedModal(true); }}>+ 고정비 추가</button>
          </div>

          {fixedLoading ? <div style={s.center}>불러오는 중...</div>
          : fixedItems.length === 0 ? (
            <div style={{ ...s.card, textAlign: 'center' as const, padding: 40 }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>📌</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#4A4870', marginBottom: 6 }}>등록된 고정비가 없습니다</div>
              <div style={{ fontSize: 12, color: '#9490C0', marginBottom: 16 }}>매월 반복되는 보험료, 대출, 통신비 등을 등록하면<br />월별 탭에서 한 번에 적용할 수 있습니다.</div>
              <button style={s.btnPrimary} onClick={() => { setEditItem(null); setFixedForm(EMPTY_FIXED); setFixedFormErr(''); setFixedModal(true); }}>첫 고정비 추가</button>
            </div>
          ) : Object.entries(fixedByCategory).map(([cat, items]) => (
            <div key={cat} style={{ ...s.card, marginBottom: 10 }}>
              <div style={s.cardTitle}>
                {cat}
                <span style={{ fontSize: 11, color: '#9490C0', fontWeight: 400 }}>
                  {fmtFull(items.filter(i => i.is_active && i.record_type === 'expense').reduce((s, i) => s + Number(i.amount), 0))}
                </span>
              </div>
              {items.map(item => (
                <div key={item.id} style={{ ...s.recRow, opacity: item.is_active ? 1 : 0.4 }}>
                  <div style={{ ...s.recType, ...(item.record_type === 'income' ? s.incomeType : s.expenseType) }}>
                    {item.record_type === 'income' ? '수입' : '지출'}
                  </div>
                  <div style={s.recInfo}>
                    <div style={s.recTitle}>
                      {item.memo}
                      {item.person && <span style={s.personBadge}>{item.person}</span>}
                    </div>
                    {item.subcategory && <div style={s.recMeta}>{item.subcategory}</div>}
                  </div>
                  <div style={{ ...s.recAmount, color: item.record_type === 'income' ? '#1D9E75' : '#E53E3E', flexShrink: 0 }}>
                    {item.record_type === 'income' ? '+' : '-'}{fmtFull(Number(item.amount))}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <span style={s.iconBtn} onClick={() => handleFixedToggle(item)} title={item.is_active ? '비활성화' : '활성화'}>{item.is_active ? '●' : '○'}</span>
                    <span style={s.iconBtn} onClick={() => openEditFixed(item)}>✎</span>
                    <span style={{ ...s.iconBtn, color: '#E53E3E' }} onClick={() => handleFixedDelete(item.id)}>×</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── 내역 추가 모달 */}
      {recModal && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setRecModal(false); }}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>내역 추가</span>
              <span style={s.modalClose} onClick={() => setRecModal(false)}>×</span>
            </div>
            <div style={s.field}>
              <div style={s.toggleRow}>
                <div style={{ ...s.toggleBtn, ...(recForm.record_type === 'expense' ? s.toggleExpense : s.toggleOff) }} onClick={() => setRecForm(f => ({ ...f, record_type: 'expense', category: '' }))}>지출</div>
                <div style={{ ...s.toggleBtn, ...(recForm.record_type === 'income'  ? s.toggleIncome  : s.toggleOff) }} onClick={() => setRecForm(f => ({ ...f, record_type: 'income',  category: '' }))}>수입</div>
              </div>
            </div>
            <div style={s.field}>
              <label style={s.label}>카테고리 (직접 입력 또는 선택)</label>
              <input style={{ ...s.input, marginBottom: 8 }} placeholder="카테고리 입력 (예: 보험료, 주거비)" value={recForm.category}
                onChange={e => setRecForm(f => ({ ...f, category: e.target.value }))} />
              <div style={s.catGrid}>
                {(recForm.record_type === 'expense'
                  ? ['식비','교통','쇼핑','의료','교육','문화·여가','통신','주거·관리비','보험','기타']
                  : INCOME_CATS
                ).map(cat => (
                  <div key={cat} style={{ ...s.catChip, ...(recForm.category === cat ? s.catChipActive : {}) }}
                    onClick={() => setRecForm(f => ({ ...f, category: f.category === cat ? '' : cat }))}>
                    {cat}
                  </div>
                ))}
              </div>
            </div>
            <div style={s.field}>
              <label style={s.label}>금액 (원) *</label>
              <input style={s.input} type="number" placeholder="예: 50000" value={recForm.amount}
                onChange={e => setRecForm(f => ({ ...f, amount: e.target.value }))} autoFocus />
              {recForm.amount && !isNaN(Number(recForm.amount)) && Number(recForm.amount) > 0 && (
                <div style={s.amountPreview}>{fmtFull(Number(recForm.amount))}</div>
              )}
            </div>
            <div style={s.twoFieldRow}>
              <div>
                <label style={s.label}>메모</label>
                <input style={s.input} placeholder="예: 스타벅스" value={recForm.memo} onChange={e => setRecForm(f => ({ ...f, memo: e.target.value }))} />
              </div>
              <div>
                <label style={s.label}>날짜</label>
                <input style={s.input} type="date" value={recForm.recorded_at} onChange={e => setRecForm(f => ({ ...f, recorded_at: e.target.value }))} />
              </div>
            </div>
            {recFormErr && <div style={s.formError}>{recFormErr}</div>}
            <div style={s.modalFooter}>
              <button style={s.btnSecondary} onClick={() => setRecModal(false)}>취소</button>
              <button style={{ ...s.btnPrimary, opacity: recSaving ? 0.7 : 1 }} onClick={handleRecSave} disabled={recSaving}>{recSaving ? '저장 중...' : '추가'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 고정비 추가/편집 모달 */}
      {fixedModal && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) { setFixedModal(false); setEditItem(null); } }}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>{editItem ? '고정비 수정' : '고정비 추가'}</span>
              <span style={s.modalClose} onClick={() => { setFixedModal(false); setEditItem(null); }}>×</span>
            </div>
            <div style={s.field}>
              <div style={s.toggleRow}>
                <div style={{ ...s.toggleBtn, ...(fixedForm.record_type === 'expense' ? s.toggleExpense : s.toggleOff) }} onClick={() => setFixedForm(f => ({ ...f, record_type: 'expense' }))}>지출</div>
                <div style={{ ...s.toggleBtn, ...(fixedForm.record_type === 'income'  ? s.toggleIncome  : s.toggleOff) }} onClick={() => setFixedForm(f => ({ ...f, record_type: 'income'  }))}>수입</div>
              </div>
            </div>
            <div style={s.field}>
              <label style={s.label}>카테고리 *</label>
              <input style={{ ...s.input, marginBottom: 8 }} placeholder="예: 보험료, 주거, 통신비" value={fixedForm.category}
                onChange={e => setFixedForm(f => ({ ...f, category: e.target.value }))} autoFocus />
              <div style={s.catGrid}>
                {(fixedForm.record_type === 'expense'
                  ? ['식비','교통','쇼핑','의료','교육','문화·여가','통신','주거·관리비','보험','대출','세금·공과금','기타']
                  : INCOME_CATS
                ).map(cat => (
                  <div key={cat} style={{ ...s.catChip, ...(fixedForm.category === cat ? s.catChipActive : {}) }}
                    onClick={() => setFixedForm(f => ({ ...f, category: f.category === cat ? '' : cat }))}>
                    {cat}
                  </div>
                ))}
              </div>
            </div>
            <div style={s.twoFieldRow}>
              <div>
                <label style={s.label}>소분류</label>
                <input style={s.input} placeholder="예: DB손해보험(종합)" value={fixedForm.subcategory} onChange={e => setFixedForm(f => ({ ...f, subcategory: e.target.value }))} />
              </div>
            </div>
            <div style={s.twoFieldRow}>
              <div>
                <label style={s.label}>항목명 *</label>
                <input style={s.input} placeholder="예: 승스 종합보험" value={fixedForm.memo} onChange={e => setFixedForm(f => ({ ...f, memo: e.target.value }))} />
              </div>
              <div>
                <label style={s.label}>대상자</label>
                <input style={s.input} placeholder="예: 승스, 승이, 공통" value={fixedForm.person} onChange={e => setFixedForm(f => ({ ...f, person: e.target.value }))} />
              </div>
            </div>
            <div style={s.field}>
              <label style={s.label}>금액 (원) *</label>
              <input style={s.input} type="number" placeholder="예: 97060" value={fixedForm.amount} onChange={e => setFixedForm(f => ({ ...f, amount: e.target.value }))} />
              {fixedForm.amount && !isNaN(Number(fixedForm.amount)) && Number(fixedForm.amount) > 0 && (
                <div style={s.amountPreview}>{fmtFull(Number(fixedForm.amount))}</div>
              )}
            </div>
            {fixedFormErr && <div style={s.formError}>{fixedFormErr}</div>}
            <div style={s.modalFooter}>
              <button style={s.btnSecondary} onClick={() => { setFixedModal(false); setEditItem(null); }}>취소</button>
              <button style={{ ...s.btnPrimary, opacity: fixedSaving ? 0.7 : 1 }} onClick={handleFixedSave} disabled={fixedSaving}>{fixedSaving ? '저장 중...' : editItem ? '수정' : '추가'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 스타일 ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  center:        { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#9490C0', fontSize: 14, cursor: 'pointer' },
  pageHeader:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  breadcrumb:    { fontSize: 12, color: '#9490C0', marginBottom: 4 },
  title:         { fontSize: 18, fontWeight: 600, color: '#1A1830' },
  btnPrimary:    { fontSize: 12, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#534AB7', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecondary:  { fontSize: 12, padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(83,74,183,0.2)', background: '#fff', color: '#534AB7', cursor: 'pointer', whiteSpace: 'nowrap' },
  monthNav:      { display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid rgba(83,74,183,0.15)', borderRadius: 8, padding: '5px 10px' },
  monthBtn:      { fontSize: 16, color: '#534AB7', cursor: 'pointer', lineHeight: 1, userSelect: 'none' },
  monthLabel:    { fontSize: 13, fontWeight: 600, color: '#1A1830', minWidth: 52, textAlign: 'center' },
  tabBar:        { display: 'flex', marginBottom: 20, borderBottom: '2px solid rgba(83,74,183,0.1)' },
  tabItem:       { fontSize: 13, padding: '9px 18px', cursor: 'pointer', color: '#9490C0', borderBottom: '2px solid transparent', marginBottom: -2, fontWeight: 500 },
  tabActive:     { color: '#534AB7', borderBottomColor: '#534AB7', fontWeight: 700 },
  fourCol:       { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 },
  statCard:      { background: '#fff', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(83,74,183,0.08)' },
  statLabel:     { fontSize: 11, color: '#9490C0', marginBottom: 6 },
  statValue:     { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  statSub:       { fontSize: 11, color: '#9490C0' },
  statMeta:      { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 2 },
  cmpLabel:      { fontSize: 10, color: '#C0BDDA', marginLeft: 2 },
  twoCol:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 },
  card:          { background: '#fff', border: '1px solid rgba(83,74,183,0.08)', borderRadius: 14, padding: '16px', marginBottom: 14 },
  cardTitle:     { fontSize: 13, fontWeight: 600, color: '#4A4870', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  empty:         { fontSize: 13, color: '#9490C0', textAlign: 'center', padding: '16px 0' },
  emptyReport:   { textAlign: 'center', padding: '20px 0' },
  emptyIcon:     { fontSize: 28, marginBottom: 8 },
  emptyText:     { fontSize: 13, fontWeight: 500, color: '#4A4870', marginBottom: 4 },
  emptySub:      { fontSize: 11, color: '#9490C0' },
  monthBadgeOn:  { fontSize: 10, padding: '2px 7px', borderRadius: 8, background: '#E1F5EE', color: '#0F6E56', fontWeight: 600 },
  monthBadgeOff: { fontSize: 10, padding: '2px 7px', borderRadius: 8, background: '#F4F3FF', color: '#9490C0', fontWeight: 600 },
  linkBtn:       { fontSize: 11, color: '#534AB7', cursor: 'pointer', textDecoration: 'underline' },
  rptList:       { maxHeight: 180, overflowY: 'auto', border: '1px solid rgba(83,74,183,0.1)', borderRadius: 8, marginBottom: 10 },
  rptItem:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(83,74,183,0.06)' },
  rptItemActive: { background: '#EEEDFE' },
  rptBody:       { background: '#F8F7FF', borderRadius: 10, padding: '14px', maxHeight: 340, overflowY: 'auto' },
  typeTab:       { fontSize: 11, padding: '3px 9px', borderRadius: 10, cursor: 'pointer', color: '#9490C0', border: '1px solid transparent' },
  typeTabActive: { color: '#534AB7', background: '#EEEDFE', fontWeight: 600 },
  recRow:        { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(83,74,183,0.06)' },
  recType:       { fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600, flexShrink: 0 },
  incomeType:    { color: '#0F6E56', background: '#E1F5EE' },
  expenseType:   { color: '#A32D2D', background: '#FEE8E8' },
  recInfo:       { flex: 1, minWidth: 0 },
  recTitle:      { fontSize: 13, fontWeight: 500, color: '#1A1830', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 },
  recMeta:       { fontSize: 11, color: '#9490C0', marginTop: 1 },
  recAmount:     { fontSize: 13, fontWeight: 600, textAlign: 'right' },
  deleteBtn:     { fontSize: 16, color: '#C0BDDA', cursor: 'pointer', flexShrink: 0, padding: '2px 4px' },
  personBadge:   { fontSize: 10, padding: '1px 6px', borderRadius: 8, background: '#F0EFFF', color: '#534AB7', fontWeight: 600 },
  iconBtn:       { fontSize: 14, color: '#9490C0', cursor: 'pointer', padding: '2px 5px', borderRadius: 4 },
  overlay:       { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal:         { background: '#fff', borderRadius: 16, padding: '24px', width: 460, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', maxHeight: '90vh', overflowY: 'auto' },
  modalHeader:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:    { fontSize: 15, fontWeight: 600, color: '#1A1830' },
  modalClose:    { fontSize: 18, color: '#9490C0', cursor: 'pointer', lineHeight: 1 },
  field:         { marginBottom: 14 },
  label:         { display: 'block', fontSize: 12, color: '#4A4870', marginBottom: 6, fontWeight: 500 },
  input:         { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(83,74,183,0.2)', fontSize: 13, color: '#1A1830', outline: 'none', boxSizing: 'border-box', background: '#FAFAFE' },
  amountPreview: { fontSize: 11, color: '#534AB7', marginTop: 4, fontWeight: 500 },
  toggleRow:     { display: 'flex', gap: 8 },
  toggleBtn:     { flex: 1, padding: '10px', borderRadius: 8, textAlign: 'center', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1.5px solid transparent' },
  toggleIncome:  { background: '#E1F5EE', color: '#0F6E56', borderColor: '#1D9E75' },
  toggleExpense: { background: '#FEE8E8', color: '#A32D2D', borderColor: '#E53E3E' },
  toggleOff:     { background: '#F4F3FF', color: '#9490C0', borderColor: 'rgba(83,74,183,0.15)' },
  catGrid:       { display: 'flex', flexWrap: 'wrap', gap: 6 },
  catChip:       { padding: '5px 11px', borderRadius: 16, fontSize: 12, border: '1px solid rgba(83,74,183,0.15)', color: '#4A4870', cursor: 'pointer', background: '#F8F7FF' },
  catChipActive: { background: '#EEEDFE', borderColor: '#534AB7', color: '#534AB7', fontWeight: 600 },
  twoFieldRow:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 },
  formError:     { fontSize: 12, color: '#E53E3E', marginBottom: 12, background: '#FEE8E8', padding: '8px 12px', borderRadius: 6 },
  modalFooter:   { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 },
  table:         { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:            { padding: '8px 12px', textAlign: 'left', fontSize: 11, color: '#9490C0', fontWeight: 600, borderBottom: '1px solid rgba(83,74,183,0.1)' },
  td:            { padding: '9px 12px', color: '#4A4870', borderBottom: '1px solid rgba(83,74,183,0.05)' },
};
