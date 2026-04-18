'use client';

import { useEffect, useState } from 'react';
import {
  getBudget, createBudgetRecord, deleteBudgetRecord,
  generateMyAiReport, getMyAiReports, getMyAiReport,
  BudgetRecord, AiReport,
} from '@/lib/api';

const EXPENSE_CATS = ['식비', '교통', '쇼핑', '의료', '교육', '문화·여가', '통신', '주거·관리비', '보험', '기타'];
const INCOME_CATS  = ['월급', '부업·프리랜서', '투자수익', '이자', '기타'];

function formatAmount(n: number) {
  if (n === 0) return '0';
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만원`;
  return `${n.toLocaleString()}원`;
}

function formatAmountShort(n: number) {
  if (Math.abs(n) >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}

const now = new Date();
const EMPTY_FORM = {
  record_type: 'expense' as 'income' | 'expense',
  category: '',
  amount: '',
  memo: '',
  recorded_at: now.toISOString().slice(0, 10),
};

export default function BudgetPage() {
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [records, setRecords]     = useState<BudgetRecord[]>([]);
  const [summary, setSummary]     = useState({ income: 0, expense: 0, balance: 0 });
  const [report, setReport]       = useState<AiReport | null>(null);
  const [reportContent, setReportContent] = useState('');
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError]         = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [budgetRes, rptRes] = await Promise.all([
        getBudget({ year, month }),
        getMyAiReports({ module_key: 'budget', limit: 1 }),
      ]);
      setRecords(budgetRes.data ?? []);
      setSummary(budgetRes.summary ?? { income: 0, expense: 0, balance: 0 });
      const latest: AiReport | undefined = rptRes.data?.[0];
      if (latest) {
        setReport(latest);
        const full = await getMyAiReport(latest.id);
        setReportContent(full.data?.content ?? '');
      } else {
        setReport(null);
        setReportContent('');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [year, month]);

  // 카테고리별 지출 집계
  const expenseRecords = records.filter(r => r.record_type === 'expense');
  const catGroups = EXPENSE_CATS.map(cat => ({
    cat,
    sum: expenseRecords.filter(r => r.category === cat).reduce((s, r) => s + Number(r.amount), 0),
  })).filter(g => g.sum > 0).sort((a, b) => b.sum - a.sum);

  const displayed = typeFilter === 'all' ? records : records.filter(r => r.record_type === typeFilter);

  // 월 이동
  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
    if (isCurrentMonth) return;
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  async function handleSave() {
    const amountNum = Number(form.amount);
    if (!form.amount || isNaN(amountNum) || amountNum <= 0) { setFormError('금액을 올바르게 입력해주세요.'); return; }
    setSaving(true);
    setFormError('');
    try {
      await createBudgetRecord({
        record_type: form.record_type,
        category:    form.category    || undefined,
        amount:      amountNum,
        memo:        form.memo.trim() || undefined,
        recorded_at: form.recorded_at,
      });
      setModalOpen(false);
      load();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('이 내역을 삭제하시겠습니까?')) return;
    try { await deleteBudgetRecord(id); load(); }
    catch (e: any) { alert(e.message); }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await generateMyAiReport('budget');
      setReport(res.data);
      setReportContent(res.data.content ?? '');
    } catch (e: any) {
      alert('리포트 생성 실패: ' + e.message);
    } finally {
      setGenerating(false);
    }
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  if (loading) return <div style={s.center}>불러오는 중...</div>;
  if (error)   return <div style={s.center} onClick={load} role="button">⚠ {error} — 다시 시도</div>;

  return (
    <div>
      {/* 헤더 */}
      <div style={s.pageHeader}>
        <div>
          <div style={s.breadcrumb}>나만의 AI › 가계부</div>
          <div style={s.title}>📊 가계부</div>
          <div style={s.sub}>{year}년 {month}월 · 내역 {records.length}건</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* 월 이동 */}
          <div style={s.monthNav}>
            <span style={s.monthBtn} onClick={prevMonth}>‹</span>
            <span style={s.monthLabel}>{year}.{String(month).padStart(2, '0')}</span>
            <span style={{ ...s.monthBtn, opacity: isCurrentMonth ? 0.3 : 1 }} onClick={nextMonth}>›</span>
          </div>
          <button style={s.btnSecondary} onClick={() => { setForm(EMPTY_FORM); setFormError(''); setModalOpen(true); }}>+ 내역 추가</button>
          <button style={{ ...s.btnPrimary, opacity: generating ? 0.7 : 1 }} onClick={handleGenerate} disabled={generating}>
            {generating ? '생성 중...' : 'AI 리포트'}
          </button>
        </div>
      </div>

      {/* 요약 통계 */}
      <div style={s.threeCol}>
        <div style={{ ...s.statCard, borderTop: '3px solid #1D9E75' }}>
          <div style={s.statLabel}>총 수입</div>
          <div style={{ ...s.statValue, color: '#1D9E75' }}>+{formatAmountShort(summary.income)}</div>
          <div style={s.statSub}>{records.filter(r => r.record_type === 'income').length}건</div>
        </div>
        <div style={{ ...s.statCard, borderTop: '3px solid #E53E3E' }}>
          <div style={s.statLabel}>총 지출</div>
          <div style={{ ...s.statValue, color: '#E53E3E' }}>-{formatAmountShort(summary.expense)}</div>
          <div style={s.statSub}>{records.filter(r => r.record_type === 'expense').length}건</div>
        </div>
        <div style={{ ...s.statCard, borderTop: `3px solid ${summary.balance >= 0 ? '#534AB7' : '#E53E3E'}` }}>
          <div style={s.statLabel}>잔액 (수입 - 지출)</div>
          <div style={{ ...s.statValue, color: summary.balance >= 0 ? '#534AB7' : '#E53E3E' }}>
            {summary.balance >= 0 ? '+' : ''}{formatAmountShort(summary.balance)}
          </div>
          <div style={s.statSub}>{summary.balance >= 0 ? '흑자' : '적자'}</div>
        </div>
      </div>

      <div style={s.twoCol}>
        {/* 지출 카테고리 */}
        <div style={s.card}>
          <div style={s.cardTitle}>지출 카테고리</div>
          {catGroups.length === 0 ? (
            <div style={s.empty}>이번 달 지출 내역이 없습니다.</div>
          ) : (
            catGroups.map(g => {
              const pct = summary.expense > 0 ? Math.round((g.sum / summary.expense) * 100) : 0;
              return (
                <div key={g.cat} style={s.barWrap}>
                  <div style={s.barLabel}>
                    <span>{g.cat}</span>
                    <span>{pct}% · {formatAmountShort(g.sum)}</span>
                  </div>
                  <div style={s.barTrack}>
                    <div style={{ ...s.barFill, width: `${pct}%` }} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* AI 리포트 */}
        <div style={s.card}>
          <div style={s.cardTitle}>
            AI 월간 리포트
            {report && <span style={s.reportDate}>{new Date(report.generated_at).toLocaleDateString('ko-KR')}</span>}
          </div>
          {reportContent ? (
            <div style={s.reportPreview}>{reportContent}</div>
          ) : (
            <div style={s.emptyReport}>
              <div style={s.emptyIcon}>📊</div>
              <div style={s.emptyText}>아직 생성된 리포트가 없습니다</div>
              <div style={s.emptySub}>내역 입력 후 AI 리포트를 생성해보세요.</div>
              <button style={{ ...s.btnPrimary, marginTop: 12, opacity: generating ? 0.7 : 1 }} onClick={handleGenerate} disabled={generating}>
                {generating ? '생성 중...' : '지금 생성'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 내역 목록 */}
      <div style={s.card}>
        <div style={s.cardTitle}>
          수입·지출 내역
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'income', 'expense'] as const).map(t => (
              <span
                key={t}
                style={{ ...s.typeTab, ...(typeFilter === t ? s.typeTabActive : {}) }}
                onClick={() => setTypeFilter(t)}
              >
                {t === 'all' ? '전체' : t === 'income' ? '수입' : '지출'}
              </span>
            ))}
          </div>
        </div>
        {displayed.length === 0 ? (
          <div style={s.empty}>내역이 없습니다.</div>
        ) : (
          displayed.map(rec => (
            <div key={rec.id} style={s.recRow}>
              <div style={{ ...s.recType, ...(rec.record_type === 'income' ? s.incomeType : s.expenseType) }}>
                {rec.record_type === 'income' ? '수입' : '지출'}
              </div>
              <div style={s.recInfo}>
                <div style={s.recTitle}>{rec.memo || rec.category || '—'}</div>
                <div style={s.recMeta}>{rec.category && `${rec.category} · `}{rec.recorded_at}</div>
              </div>
              <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                <div style={{ ...s.recAmount, color: rec.record_type === 'income' ? '#1D9E75' : '#E53E3E' }}>
                  {rec.record_type === 'income' ? '+' : '-'}{formatAmount(Number(rec.amount))}
                </div>
              </div>
              <span style={s.deleteBtn} onClick={() => handleDelete(rec.id)}>×</span>
            </div>
          ))
        )}
      </div>

      {/* 내역 추가 모달 */}
      {modalOpen && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>내역 추가</span>
              <span style={s.modalClose} onClick={() => setModalOpen(false)}>×</span>
            </div>

            {/* 수입/지출 토글 */}
            <div style={s.field}>
              <div style={s.toggleRow}>
                <div
                  style={{ ...s.toggleBtn, ...(form.record_type === 'expense' ? s.toggleExpense : s.toggleOff) }}
                  onClick={() => setForm(f => ({ ...f, record_type: 'expense', category: '' }))}
                >지출</div>
                <div
                  style={{ ...s.toggleBtn, ...(form.record_type === 'income' ? s.toggleIncome : s.toggleOff) }}
                  onClick={() => setForm(f => ({ ...f, record_type: 'income', category: '' }))}
                >수입</div>
              </div>
            </div>

            <div style={s.field}>
              <label style={s.label}>카테고리</label>
              <div style={s.catGrid}>
                {(form.record_type === 'expense' ? EXPENSE_CATS : INCOME_CATS).map(cat => (
                  <div
                    key={cat}
                    style={{ ...s.catChip, ...(form.category === cat ? s.catChipActive : {}) }}
                    onClick={() => setForm(f => ({ ...f, category: f.category === cat ? '' : cat }))}
                  >
                    {cat}
                  </div>
                ))}
              </div>
            </div>

            <div style={s.field}>
              <label style={s.label}>금액 (원) *</label>
              <input
                style={s.input}
                type="number"
                placeholder="예: 50000"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                autoFocus
              />
              {form.amount && !isNaN(Number(form.amount)) && Number(form.amount) > 0 && (
                <div style={s.amountPreview}>{formatAmount(Number(form.amount))}</div>
              )}
            </div>

            <div style={s.twoFieldRow}>
              <div>
                <label style={s.label}>메모</label>
                <input style={s.input} placeholder="예: 스타벅스 아메리카노" value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} />
              </div>
              <div>
                <label style={s.label}>날짜</label>
                <input style={s.input} type="date" value={form.recorded_at} onChange={e => setForm(f => ({ ...f, recorded_at: e.target.value }))} />
              </div>
            </div>

            {formError && <div style={s.formError}>{formError}</div>}

            <div style={s.modalFooter}>
              <button style={s.btnSecondary} onClick={() => setModalOpen(false)}>취소</button>
              <button style={{ ...s.btnPrimary, opacity: saving ? 0.7 : 1 }} onClick={handleSave} disabled={saving}>
                {saving ? '저장 중...' : '추가'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  center:        { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#9490C0', fontSize: 14, cursor: 'pointer' },
  pageHeader:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  breadcrumb:    { fontSize: 12, color: '#9490C0', marginBottom: 4 },
  title:         { fontSize: 18, fontWeight: 600, color: '#1A1830' },
  sub:           { fontSize: 12, color: '#9490C0', marginTop: 2 },
  btnPrimary:    { fontSize: 12, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#534AB7', color: '#fff', cursor: 'pointer' },
  btnSecondary:  { fontSize: 12, padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(83,74,183,0.2)', background: '#fff', color: '#534AB7', cursor: 'pointer' },
  monthNav:      { display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid rgba(83,74,183,0.15)', borderRadius: 8, padding: '5px 10px' },
  monthBtn:      { fontSize: 16, color: '#534AB7', cursor: 'pointer', lineHeight: 1, userSelect: 'none' as const },
  monthLabel:    { fontSize: 13, fontWeight: 600, color: '#1A1830', minWidth: 52, textAlign: 'center' as const },
  threeCol:      { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 },
  statCard:      { background: '#fff', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(83,74,183,0.08)' },
  statLabel:     { fontSize: 11, color: '#9490C0', marginBottom: 6 },
  statValue:     { fontSize: 20, fontWeight: 700 },
  statSub:       { fontSize: 11, color: '#9490C0', marginTop: 4 },
  twoCol:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 },
  card:          { background: '#fff', border: '1px solid rgba(83,74,183,0.08)', borderRadius: 14, padding: '16px', marginBottom: 14 },
  cardTitle:     { fontSize: 13, fontWeight: 600, color: '#4A4870', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  empty:         { fontSize: 13, color: '#9490C0', textAlign: 'center' as const, padding: '16px 0' },
  emptyReport:   { textAlign: 'center' as const, padding: '20px 0' },
  emptyIcon:     { fontSize: 28, marginBottom: 8 },
  emptyText:     { fontSize: 13, fontWeight: 500, color: '#4A4870', marginBottom: 4 },
  emptySub:      { fontSize: 11, color: '#9490C0' },
  barWrap:       { marginBottom: 11 },
  barLabel:      { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#4A4870', marginBottom: 5 },
  barTrack:      { height: 6, background: '#F0EFFF', borderRadius: 3, overflow: 'hidden' },
  barFill:       { height: '100%', borderRadius: 3, background: '#534AB7', transition: 'width 0.4s ease' },
  typeTab:       { fontSize: 11, padding: '3px 9px', borderRadius: 10, cursor: 'pointer', color: '#9490C0', border: '1px solid transparent' },
  typeTabActive: { color: '#534AB7', background: '#EEEDFE', fontWeight: 600 },
  recRow:        { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(83,74,183,0.06)' },
  recType:       { fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600, flexShrink: 0 },
  incomeType:    { color: '#0F6E56', background: '#E1F5EE' },
  expenseType:   { color: '#A32D2D', background: '#FEE8E8' },
  recInfo:       { flex: 1, minWidth: 0 },
  recTitle:      { fontSize: 13, fontWeight: 500, color: '#1A1830', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  recMeta:       { fontSize: 11, color: '#9490C0', marginTop: 1 },
  recAmount:     { fontSize: 13, fontWeight: 600 },
  deleteBtn:     { fontSize: 16, color: '#C0BDDA', cursor: 'pointer', flexShrink: 0, padding: '2px 4px' },
  reportDate:    { fontSize: 11, color: '#9490C0', fontWeight: 400 },
  reportPreview: { background: '#F8F7FF', borderRadius: 10, padding: '14px', fontSize: 13, lineHeight: 1.85, color: '#4A4870', whiteSpace: 'pre-wrap' as const, maxHeight: 280, overflowY: 'auto' as const },
  overlay:       { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal:         { background: '#fff', borderRadius: 16, padding: '24px', width: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.12)' },
  modalHeader:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:    { fontSize: 15, fontWeight: 600, color: '#1A1830' },
  modalClose:    { fontSize: 18, color: '#9490C0', cursor: 'pointer', lineHeight: 1 },
  field:         { marginBottom: 14 },
  label:         { display: 'block', fontSize: 12, color: '#4A4870', marginBottom: 6, fontWeight: 500 },
  input:         { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(83,74,183,0.2)', fontSize: 13, color: '#1A1830', outline: 'none', boxSizing: 'border-box' as const, background: '#FAFAFE' },
  amountPreview: { fontSize: 11, color: '#534AB7', marginTop: 4, fontWeight: 500 },
  toggleRow:     { display: 'flex', gap: 8 },
  toggleBtn:     { flex: 1, padding: '10px', borderRadius: 8, textAlign: 'center' as const, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1.5px solid transparent' },
  toggleIncome:  { background: '#E1F5EE', color: '#0F6E56', borderColor: '#1D9E75' },
  toggleExpense: { background: '#FEE8E8', color: '#A32D2D', borderColor: '#E53E3E' },
  toggleOff:     { background: '#F4F3FF', color: '#9490C0', borderColor: 'rgba(83,74,183,0.15)' },
  catGrid:       { display: 'flex', flexWrap: 'wrap' as const, gap: 6 },
  catChip:       { padding: '5px 11px', borderRadius: 16, fontSize: 12, border: '1px solid rgba(83,74,183,0.15)', color: '#4A4870', cursor: 'pointer', background: '#F8F7FF' },
  catChipActive: { background: '#EEEDFE', borderColor: '#534AB7', color: '#534AB7', fontWeight: 600 },
  twoFieldRow:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 },
  formError:     { fontSize: 12, color: '#E53E3E', marginBottom: 12, background: '#FEE8E8', padding: '8px 12px', borderRadius: 6 },
  modalFooter:   { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 },
};
