'use client';

import { useEffect, useState } from 'react';
import { getModuleRecords, createModuleRecord, deleteModuleRecord, generateMyAiReport, getMyAiReports, getMyAiReport, ModuleRecord, AiReport } from '@/lib/api';

const REC_TYPES = ['목표', '스킬 습득', '성과', '교육·자격증', '네트워킹', '기타'];
const EMPTY_FORM = { record_type: '목표', title: '', detail: '', salary: '', recorded_at: new Date().toISOString().slice(0, 10) };

const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  '목표':      { color: '#534AB7', bg: '#EEEDFE' },
  '스킬 습득': { color: '#1D9E75', bg: '#E1F5EE' },
  '성과':      { color: '#854F0B', bg: '#FAEEDA' },
  '교육·자격증':{ color: '#185FA5', bg: '#E6F1FB' },
  '네트워킹':  { color: '#3B6D11', bg: '#EAF3DE' },
  '기타':      { color: '#9490C0', bg: '#F4F3FF' },
};

export default function CareerPage() {
  const [records, setRecords]     = useState<ModuleRecord[]>([]);
  const [report, setReport]       = useState<AiReport | null>(null);
  const [reportContent, setReportContent] = useState('');
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError]         = useState('');
  const [filter, setFilter]       = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const [rec, rpt] = await Promise.all([
        getModuleRecords('career'),
        getMyAiReports({ module_key: 'career', limit: 1 }),
      ]);
      setRecords(rec.data ?? []);
      const latest: AiReport | undefined = rpt.data?.[0];
      if (latest) { setReport(latest); const full = await getMyAiReport(latest.id); setReportContent(full.data?.content ?? ''); }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const displayed = filter ? records.filter(r => r.record_type === filter) : records;

  async function handleSave() {
    if (!form.title.trim()) { setFormError('내용을 입력해주세요.'); return; }
    setSaving(true); setFormError('');
    try {
      await createModuleRecord({ module_key: 'career', record_type: form.record_type, data: { title: form.title.trim(), detail: form.detail.trim() || null, salary: form.salary ? Number(form.salary) : null }, recorded_at: form.recorded_at });
      setModalOpen(false); load();
    } catch (e: any) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  async function handleGenerate() {
    setGenerating(true);
    try { const res = await generateMyAiReport('career'); setReport(res.data); setReportContent(res.data.content ?? ''); }
    catch (e: any) { alert('리포트 생성 실패: ' + e.message); }
    finally { setGenerating(false); }
  }

  if (loading) return <div style={s.center}>불러오는 중...</div>;
  if (error)   return <div style={s.center} onClick={load}>⚠ {error} — 다시 시도</div>;

  return (
    <div>
      <div style={s.pageHeader}>
        <div>
          <div style={s.breadcrumb}>나만의 AI › 커리어</div>
          <div style={s.title}>💼 커리어</div>
          <div style={s.sub}>기록 {records.length}개 · 월간 AI 리포트</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btnSecondary} onClick={() => { setForm(EMPTY_FORM); setFormError(''); setModalOpen(true); }}>+ 기록 추가</button>
          <button style={{ ...s.btnPrimary, opacity: generating ? 0.7 : 1 }} onClick={handleGenerate} disabled={generating}>{generating ? '생성 중...' : 'AI 리포트 생성'}</button>
        </div>
      </div>

      {/* 유형 필터 */}
      <div style={s.filterRow}>
        <div style={{ ...s.filterChip, ...(filter === '' ? s.filterActive : {}) }} onClick={() => setFilter('')}>전체 ({records.length})</div>
        {REC_TYPES.map(t => {
          const cnt = records.filter(r => r.record_type === t).length;
          if (!cnt && filter !== t) return null;
          return <div key={t} style={{ ...s.filterChip, ...(filter === t ? s.filterActive : {}) }} onClick={() => setFilter(p => p === t ? '' : t)}>{t} ({cnt})</div>;
        })}
      </div>

      <div style={s.twoCol}>
        {/* 기록 목록 */}
        <div style={s.card}>
          <div style={s.cardTitle}>커리어 기록</div>
          {displayed.length === 0 ? <div style={s.empty}>커리어 목표, 성과, 스킬을 기록해보세요.</div> : displayed.map(rec => {
            const tc = TYPE_COLORS[rec.record_type ?? '기타'] ?? TYPE_COLORS['기타'];
            return (
              <div key={rec.id} style={s.row}>
                <div style={s.rowInfo}>
                  <div style={s.rowTitle}>{rec.data.title}</div>
                  <div style={s.rowMeta}>
                    <span style={{ ...s.typeBadge, ...tc }}>{rec.record_type}</span>
                    <span>· {rec.recorded_at}</span>
                    {rec.data.salary && <span>· 연봉 {(rec.data.salary / 10000).toFixed(0)}만</span>}
                  </div>
                  {rec.data.detail && <div style={s.rowDetail}>{rec.data.detail}</div>}
                </div>
                <span style={s.delBtn} onClick={() => { if(confirm('삭제?')) deleteModuleRecord(rec.id).then(load); }}>×</span>
              </div>
            );
          })}
        </div>

        {/* AI 리포트 */}
        <div style={s.card}>
          <div style={s.cardTitle}>AI 월간 리포트{report && <span style={s.reportDate}>{new Date(report.generated_at).toLocaleDateString('ko-KR')}</span>}</div>
          {reportContent ? <div style={s.reportPreview}>{reportContent}</div> : <div style={s.emptyReport}><div style={s.emptyIcon}>💼</div><div style={s.emptyText}>기록을 추가한 뒤 AI 리포트를 생성해보세요.</div></div>}
        </div>
      </div>

      {modalOpen && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div style={s.modal}>
            <div style={s.modalHeader}><span style={s.modalTitle}>커리어 기록 추가</span><span style={s.modalClose} onClick={() => setModalOpen(false)}>×</span></div>
            <div style={s.field}>
              <label style={s.label}>유형</label>
              <div style={s.typeGrid}>{REC_TYPES.map(t => { const tc = TYPE_COLORS[t]; return <div key={t} style={{ ...s.typeChip, ...(form.record_type === t ? { background: tc.bg, borderColor: tc.color, color: tc.color, fontWeight: 600 } : {}) }} onClick={() => setForm(f => ({ ...f, record_type: t }))}>{t}</div>; })}</div>
            </div>
            <div style={s.field}><label style={s.label}>내용 *</label><input style={s.input} placeholder="예: Next.js 마스터, 팀장 승진 목표, AWS SAA 취득" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div style={s.field}><label style={s.label}>상세 내용</label><textarea style={{ ...s.input, height: 64, resize: 'vertical' as const }} placeholder="구체적인 계획이나 결과를 기록하세요" value={form.detail} onChange={e => setForm(f => ({ ...f, detail: e.target.value }))} /></div>
            <div style={s.twoField}>
              <div><label style={s.label}>현재 연봉 (원, 선택)</label><input style={s.input} type="number" placeholder="50000000" value={form.salary} onChange={e => setForm(f => ({ ...f, salary: e.target.value }))} /></div>
              <div><label style={s.label}>날짜</label><input style={s.input} type="date" value={form.recorded_at} onChange={e => setForm(f => ({ ...f, recorded_at: e.target.value }))} /></div>
            </div>
            {formError && <div style={s.formError}>{formError}</div>}
            <div style={s.modalFooter}><button style={s.btnSecondary} onClick={() => setModalOpen(false)}>취소</button><button style={{ ...s.btnPrimary, opacity: saving ? 0.7 : 1 }} onClick={handleSave} disabled={saving}>{saving ? '저장 중...' : '저장'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#9490C0', fontSize: 14, cursor: 'pointer' },
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  breadcrumb: { fontSize: 12, color: '#9490C0', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: 600, color: '#1A1830' },
  sub: { fontSize: 12, color: '#9490C0', marginTop: 2 },
  btnPrimary: { fontSize: 12, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#534AB7', color: '#fff', cursor: 'pointer' },
  btnSecondary: { fontSize: 12, padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(83,74,183,0.2)', background: '#fff', color: '#534AB7', cursor: 'pointer' },
  filterRow: { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' as const },
  filterChip: { fontSize: 12, padding: '5px 12px', borderRadius: 16, border: '1px solid rgba(83,74,183,0.12)', color: '#4A4870', cursor: 'pointer', background: '#fff' },
  filterActive: { background: '#EEEDFE', borderColor: '#534AB7', color: '#534AB7', fontWeight: 600 },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  card: { background: '#fff', border: '1px solid rgba(83,74,183,0.08)', borderRadius: 14, padding: '16px' },
  cardTitle: { fontSize: 13, fontWeight: 600, color: '#4A4870', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  empty: { fontSize: 13, color: '#9490C0', textAlign: 'center' as const, padding: '20px 0' },
  emptyReport: { textAlign: 'center' as const, padding: '24px 0' },
  emptyIcon: { fontSize: 28, marginBottom: 8 },
  emptyText: { fontSize: 12, color: '#9490C0' },
  row: { display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 0', borderBottom: '1px solid rgba(83,74,183,0.06)' },
  rowInfo: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 13, fontWeight: 500, color: '#1A1830', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowMeta: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#9490C0', marginTop: 3, flexWrap: 'wrap' as const },
  typeBadge: { fontSize: 10, padding: '1px 5px', borderRadius: 4, fontWeight: 600 },
  rowDetail: { fontSize: 11, color: '#9490C0', marginTop: 3, lineHeight: 1.5 },
  delBtn: { fontSize: 15, color: '#C0BDDA', cursor: 'pointer', flexShrink: 0 },
  reportDate: { fontSize: 11, color: '#9490C0', fontWeight: 400 },
  reportPreview: { background: '#F8F7FF', borderRadius: 10, padding: '14px', fontSize: 13, lineHeight: 1.85, color: '#4A4870', whiteSpace: 'pre-wrap' as const },
  overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal: { background: '#fff', borderRadius: 16, padding: '24px', width: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', maxHeight: '90vh', overflowY: 'auto' as const },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 15, fontWeight: 600, color: '#1A1830' },
  modalClose: { fontSize: 18, color: '#9490C0', cursor: 'pointer', lineHeight: 1 },
  typeGrid: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 },
  typeChip: { padding: '7px', borderRadius: 8, border: '1px solid rgba(83,74,183,0.15)', fontSize: 11, color: '#4A4870', cursor: 'pointer', textAlign: 'center' as const, background: '#F8F7FF' },
  twoField: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 },
  field: { marginBottom: 14 },
  label: { display: 'block', fontSize: 12, color: '#4A4870', marginBottom: 6, fontWeight: 500 },
  input: { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(83,74,183,0.2)', fontSize: 13, color: '#1A1830', outline: 'none', boxSizing: 'border-box' as const, background: '#FAFAFE' },
  formError: { fontSize: 12, color: '#E53E3E', marginBottom: 12, background: '#FEE8E8', padding: '8px 12px', borderRadius: 6 },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 },
};
