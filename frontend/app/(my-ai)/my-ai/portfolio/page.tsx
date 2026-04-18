'use client';

import { useEffect, useState } from 'react';
import { getModuleRecords, createModuleRecord, deleteModuleRecord, generateMyAiReport, getMyAiReports, getMyAiReport, ModuleRecord, AiReport } from '@/lib/api';

const ASSET_TYPES = ['주식', 'ETF', '펀드', '채권', '기타'];
const EMPTY_FORM = { name: '', asset_type: '주식', qty: '', avg_price: '', cur_price: '', recorded_at: new Date().toISOString().slice(0, 10) };

function pct(avg: number, cur: number) {
  if (!avg) return null;
  const v = ((cur - avg) / avg) * 100;
  return { value: v, label: `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, color: v >= 0 ? '#1D9E75' : '#E53E3E' };
}

export default function PortfolioPage() {
  const [records, setRecords]     = useState<ModuleRecord[]>([]);
  const [report, setReport]       = useState<AiReport | null>(null);
  const [reportContent, setReportContent] = useState('');
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError]         = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const [rec, rpt] = await Promise.all([
        getModuleRecords('portfolio'),
        getMyAiReports({ module_key: 'portfolio', limit: 1 }),
      ]);
      setRecords(rec.data ?? []);
      const latest: AiReport | undefined = rpt.data?.[0];
      if (latest) { setReport(latest); const full = await getMyAiReport(latest.id); setReportContent(full.data?.content ?? ''); }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  // 총 평가금액, 총 투자금액, 수익률
  const totalInvest = records.reduce((s, r) => s + (Number(r.data.qty) * Number(r.data.avg_price) || 0), 0);
  const totalCur    = records.reduce((s, r) => s + (Number(r.data.qty) * Number(r.data.cur_price) || 0), 0);
  const totalPnl    = totalCur - totalInvest;
  const totalPct    = totalInvest > 0 ? ((totalPnl / totalInvest) * 100).toFixed(2) : null;

  async function handleSave() {
    if (!form.name.trim()) { setFormError('종목명을 입력해주세요.'); return; }
    if (!form.qty || !form.avg_price) { setFormError('수량과 평균단가를 입력해주세요.'); return; }
    setSaving(true); setFormError('');
    try {
      await createModuleRecord({ module_key: 'portfolio', record_type: form.asset_type, data: { name: form.name.trim(), asset_type: form.asset_type, qty: Number(form.qty), avg_price: Number(form.avg_price), cur_price: Number(form.cur_price) || Number(form.avg_price) }, recorded_at: form.recorded_at });
      setModalOpen(false); load();
    } catch (e: any) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  async function handleGenerate() {
    setGenerating(true);
    try { const res = await generateMyAiReport('portfolio'); setReport(res.data); setReportContent(res.data.content ?? ''); }
    catch (e: any) { alert('리포트 생성 실패: ' + e.message); }
    finally { setGenerating(false); }
  }

  if (loading) return <div style={s.center}>불러오는 중...</div>;
  if (error)   return <div style={s.center} onClick={load}>⚠ {error} — 다시 시도</div>;

  return (
    <div>
      <div style={s.pageHeader}>
        <div>
          <div style={s.breadcrumb}>나만의 AI › 투자 포트폴리오</div>
          <div style={s.title}>📈 투자 포트폴리오</div>
          <div style={s.sub}>종목 {records.length}개 · 주간 AI 분석</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btnSecondary} onClick={() => { setForm(EMPTY_FORM); setFormError(''); setModalOpen(true); }}>+ 종목 추가</button>
          <button style={{ ...s.btnPrimary, opacity: generating ? 0.7 : 1 }} onClick={handleGenerate} disabled={generating}>{generating ? '생성 중...' : 'AI 분석 생성'}</button>
        </div>
      </div>

      {/* 통계 */}
      <div style={s.threeCol}>
        {[
          { label: '총 투자금액', value: totalInvest > 0 ? `${Math.round(totalInvest / 10000).toLocaleString()}만` : '—', sub: '평균단가 기준' },
          { label: '총 평가금액', value: totalCur > 0    ? `${Math.round(totalCur    / 10000).toLocaleString()}만` : '—', sub: '현재가 기준' },
          { label: '평가손익',    value: totalPct ? `${Number(totalPct) >= 0 ? '+' : ''}${totalPct}%` : '—', sub: totalPnl !== 0 ? `${totalPnl >= 0 ? '+' : ''}${Math.round(totalPnl / 10000).toLocaleString()}만원` : '' },
        ].map((st, i) => (
          <div key={i} style={s.statCard}>
            <div style={s.statLabel}>{st.label}</div>
            <div style={s.statValue}>{st.value}</div>
            <div style={s.statSub}>{st.sub}</div>
          </div>
        ))}
      </div>

      <div style={s.twoCol}>
        {/* 종목 리스트 */}
        <div style={s.card}>
          <div style={s.cardTitle}>보유 종목<span style={s.cardAction} onClick={() => { setForm(EMPTY_FORM); setFormError(''); setModalOpen(true); }}>+ 추가</span></div>
          {records.length === 0 ? <div style={s.empty}>보유 종목을 추가해보세요.</div> : records.map(rec => {
            const d = rec.data;
            const p = pct(Number(d.avg_price), Number(d.cur_price));
            return (
              <div key={rec.id} style={s.row}>
                <div style={s.rowIcon}>📈</div>
                <div style={s.rowInfo}>
                  <div style={s.rowTitle}>{d.name}</div>
                  <div style={s.rowMeta}>{d.asset_type} · {d.qty}주 · 평균 {Number(d.avg_price).toLocaleString()}원</div>
                </div>
                <div style={{ textAlign: 'right' as const }}>
                  {p && <div style={{ fontSize: 12, fontWeight: 600, color: p.color }}>{p.label}</div>}
                  <div style={s.rowActions}><span style={s.delBtn} onClick={() => { if(confirm('삭제?')) deleteModuleRecord(rec.id).then(load); }}>×</span></div>
                </div>
              </div>
            );
          })}
        </div>

        {/* AI 리포트 */}
        <div style={s.card}>
          <div style={s.cardTitle}>AI 주간 분석{report && <span style={s.reportDate}>{new Date(report.generated_at).toLocaleDateString('ko-KR')}</span>}</div>
          {reportContent ? <div style={s.reportPreview}>{reportContent}</div> : <div style={s.emptyReport}><div style={s.emptyIcon}>📈</div><div style={s.emptyText}>종목 추가 후 AI 분석을 생성해보세요.</div></div>}
        </div>
      </div>

      {modalOpen && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div style={s.modal}>
            <div style={s.modalHeader}><span style={s.modalTitle}>종목 추가</span><span style={s.modalClose} onClick={() => setModalOpen(false)}>×</span></div>
            <div style={s.field}><label style={s.label}>종목명 *</label><input style={s.input} placeholder="예: 삼성전자, KODEX 200" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div style={s.twoField}>
              <div><label style={s.label}>유형</label><select style={s.input} value={form.asset_type} onChange={e => setForm(f => ({ ...f, asset_type: e.target.value }))}>{ASSET_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
              <div><label style={s.label}>수량</label><input style={s.input} type="number" placeholder="100" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} /></div>
            </div>
            <div style={s.twoField}>
              <div><label style={s.label}>평균단가 (원) *</label><input style={s.input} type="number" placeholder="75000" value={form.avg_price} onChange={e => setForm(f => ({ ...f, avg_price: e.target.value }))} /></div>
              <div><label style={s.label}>현재가 (원)</label><input style={s.input} type="number" placeholder="현재가 입력" value={form.cur_price} onChange={e => setForm(f => ({ ...f, cur_price: e.target.value }))} /></div>
            </div>
            {formError && <div style={s.formError}>{formError}</div>}
            <div style={s.modalFooter}><button style={s.btnSecondary} onClick={() => setModalOpen(false)}>취소</button><button style={{ ...s.btnPrimary, opacity: saving ? 0.7 : 1 }} onClick={handleSave} disabled={saving}>{saving ? '저장 중...' : '추가'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#9490C0', fontSize: 14, cursor: 'pointer' },
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  breadcrumb: { fontSize: 12, color: '#9490C0', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: 600, color: '#1A1830' },
  sub: { fontSize: 12, color: '#9490C0', marginTop: 2 },
  btnPrimary: { fontSize: 12, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#534AB7', color: '#fff', cursor: 'pointer' },
  btnSecondary: { fontSize: 12, padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(83,74,183,0.2)', background: '#fff', color: '#534AB7', cursor: 'pointer' },
  threeCol: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 },
  statCard: { background: '#fff', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(83,74,183,0.08)' },
  statLabel: { fontSize: 11, color: '#9490C0', marginBottom: 5 },
  statValue: { fontSize: 18, fontWeight: 600, color: '#1A1830' },
  statSub: { fontSize: 11, color: '#9490C0', marginTop: 3 },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  card: { background: '#fff', border: '1px solid rgba(83,74,183,0.08)', borderRadius: 14, padding: '16px' },
  cardTitle: { fontSize: 13, fontWeight: 600, color: '#4A4870', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardAction: { fontSize: 11, color: '#534AB7', cursor: 'pointer', fontWeight: 400 },
  empty: { fontSize: 13, color: '#9490C0', textAlign: 'center' as const, padding: '20px 0' },
  emptyReport: { textAlign: 'center' as const, padding: '24px 0' },
  emptyIcon: { fontSize: 28, marginBottom: 8 },
  emptyText: { fontSize: 12, color: '#9490C0' },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(83,74,183,0.06)' },
  rowIcon: { width: 30, height: 30, borderRadius: 8, background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 },
  rowInfo: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 13, fontWeight: 500, color: '#1A1830', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowMeta: { fontSize: 11, color: '#9490C0', marginTop: 2 },
  rowActions: { marginTop: 3 },
  delBtn: { fontSize: 15, color: '#C0BDDA', cursor: 'pointer' },
  reportDate: { fontSize: 11, color: '#9490C0', fontWeight: 400 },
  reportPreview: { background: '#F8F7FF', borderRadius: 10, padding: '14px', fontSize: 13, lineHeight: 1.85, color: '#4A4870', whiteSpace: 'pre-wrap' as const },
  overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal: { background: '#fff', borderRadius: 16, padding: '24px', width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.12)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 15, fontWeight: 600, color: '#1A1830' },
  modalClose: { fontSize: 18, color: '#9490C0', cursor: 'pointer', lineHeight: 1 },
  twoField: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 },
  field: { marginBottom: 14 },
  label: { display: 'block', fontSize: 12, color: '#4A4870', marginBottom: 6, fontWeight: 500 },
  input: { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(83,74,183,0.2)', fontSize: 13, color: '#1A1830', outline: 'none', boxSizing: 'border-box' as const, background: '#FAFAFE' },
  formError: { fontSize: 12, color: '#E53E3E', marginBottom: 12, background: '#FEE8E8', padding: '8px 12px', borderRadius: 6 },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 },
};
