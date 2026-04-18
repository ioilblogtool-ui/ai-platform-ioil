'use client';

import { useEffect, useState } from 'react';
import { getModuleRecords, createModuleRecord, deleteModuleRecord, generateMyAiReport, getMyAiReports, getMyAiReport, ModuleRecord, AiReport } from '@/lib/api';

const EMPTY_FORM = { subject: '', goal: '', study_min: '', progress: '', memo: '', recorded_at: new Date().toISOString().slice(0, 10) };

export default function LearningPage() {
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
        getModuleRecords('learning'),
        getMyAiReports({ module_key: 'learning', limit: 1 }),
      ]);
      setRecords(rec.data ?? []);
      const latest: AiReport | undefined = rpt.data?.[0];
      if (latest) { setReport(latest); const full = await getMyAiReport(latest.id); setReportContent(full.data?.content ?? ''); }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  // 최근 7일 통계
  const recent7 = records.slice(0, 7);
  const totalMins = recent7.reduce((s, r) => s + (Number(r.data.study_min) || 0), 0);
  const subjects = [...new Set(records.map(r => r.data.subject).filter(Boolean))];
  const studyDays = recent7.filter(r => Number(r.data.study_min) > 0).length;

  async function handleSave() {
    if (!form.subject.trim()) { setFormError('과목/목표를 입력해주세요.'); return; }
    if (!form.study_min) { setFormError('공부 시간을 입력해주세요.'); return; }
    setSaving(true); setFormError('');
    try {
      await createModuleRecord({ module_key: 'learning', record_type: form.subject.trim(), data: { subject: form.subject.trim(), goal: form.goal.trim() || null, study_min: Number(form.study_min), progress: form.progress.trim() || null, memo: form.memo.trim() || null }, recorded_at: form.recorded_at });
      setModalOpen(false); load();
    } catch (e: any) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  async function handleGenerate() {
    setGenerating(true);
    try { const res = await generateMyAiReport('learning'); setReport(res.data); setReportContent(res.data.content ?? ''); }
    catch (e: any) { alert('리포트 생성 실패: ' + e.message); }
    finally { setGenerating(false); }
  }

  if (loading) return <div style={s.center}>불러오는 중...</div>;
  if (error)   return <div style={s.center} onClick={load}>⚠ {error} — 다시 시도</div>;

  return (
    <div>
      <div style={s.pageHeader}>
        <div>
          <div style={s.breadcrumb}>나만의 AI › 학습</div>
          <div style={s.title}>📚 학습</div>
          <div style={s.sub}>기록 {records.length}개 · 과목 {subjects.length}개 · 주간 AI 리포트</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btnSecondary} onClick={() => { setForm(EMPTY_FORM); setFormError(''); setModalOpen(true); }}>+ 학습 기록</button>
          <button style={{ ...s.btnPrimary, opacity: generating ? 0.7 : 1 }} onClick={handleGenerate} disabled={generating}>{generating ? '생성 중...' : 'AI 리포트 생성'}</button>
        </div>
      </div>

      {/* 통계 */}
      <div style={s.threeCol}>
        {[
          { label: '이번 주 학습 시간', value: totalMins > 0 ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m` : '—', sub: `${studyDays}일 학습` },
          { label: '일평균 학습시간',   value: studyDays > 0 ? `${Math.round(totalMins / studyDays)}분`  : '—', sub: '학습일 기준' },
          { label: '진행 중 과목',      value: `${subjects.length}개`, sub: subjects.slice(0, 2).join(', ') || '—' },
        ].map((st, i) => (
          <div key={i} style={s.statCard}>
            <div style={s.statLabel}>{st.label}</div>
            <div style={s.statValue}>{st.value}</div>
            <div style={s.statSub}>{st.sub}</div>
          </div>
        ))}
      </div>

      <div style={s.twoCol}>
        {/* 학습 기록 */}
        <div style={s.card}>
          <div style={s.cardTitle}>학습 기록<span style={s.cardAction} onClick={() => { setForm(EMPTY_FORM); setFormError(''); setModalOpen(true); }}>+ 추가</span></div>
          {records.length === 0 ? <div style={s.empty}>오늘의 학습을 기록해보세요.</div> : records.slice(0, 14).map(rec => {
            const d = rec.data;
            const hrs = Math.floor(Number(d.study_min) / 60);
            const mins = Number(d.study_min) % 60;
            const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}분`;
            return (
              <div key={rec.id} style={s.row}>
                <div style={s.rowDate}>{rec.recorded_at}</div>
                <div style={s.rowInfo}>
                  <div style={s.rowTitle}>{d.subject}</div>
                  <div style={s.rowMeta}>
                    <span style={s.timeChip}>⏱ {timeStr}</span>
                    {d.goal     && <span>목표: {d.goal}</span>}
                    {d.progress && <span>진도: {d.progress}</span>}
                  </div>
                  {d.memo && <div style={s.rowDetail}>{d.memo}</div>}
                </div>
                <span style={s.delBtn} onClick={() => { if(confirm('삭제?')) deleteModuleRecord(rec.id).then(load); }}>×</span>
              </div>
            );
          })}
        </div>

        {/* AI 리포트 */}
        <div style={s.card}>
          <div style={s.cardTitle}>AI 주간 리포트{report && <span style={s.reportDate}>{new Date(report.generated_at).toLocaleDateString('ko-KR')}</span>}</div>
          {reportContent ? <div style={s.reportPreview}>{reportContent}</div> : <div style={s.emptyReport}><div style={s.emptyIcon}>📚</div><div style={s.emptyText}>학습 기록 후 AI 분석을 받아보세요.</div></div>}
        </div>
      </div>

      {modalOpen && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div style={s.modal}>
            <div style={s.modalHeader}><span style={s.modalTitle}>학습 기록 추가</span><span style={s.modalClose} onClick={() => setModalOpen(false)}>×</span></div>
            <div style={s.twoField}>
              <div><label style={s.label}>과목 / 목표 *</label><input style={s.input} placeholder="예: 영어, 자격증, Next.js" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} list="subject-list" />{subjects.length > 0 && <datalist id="subject-list">{subjects.map(s => <option key={s} value={s} />)}</datalist>}</div>
              <div><label style={s.label}>날짜</label><input style={s.input} type="date" value={form.recorded_at} onChange={e => setForm(f => ({ ...f, recorded_at: e.target.value }))} /></div>
            </div>
            <div style={s.twoField}>
              <div><label style={s.label}>공부 시간 (분) *</label><input style={s.input} type="number" placeholder="90" value={form.study_min} onChange={e => setForm(f => ({ ...f, study_min: e.target.value }))} /></div>
              <div><label style={s.label}>오늘의 진도</label><input style={s.input} placeholder="예: 3장 완독, p.120~150" value={form.progress} onChange={e => setForm(f => ({ ...f, progress: e.target.value }))} /></div>
            </div>
            <div style={s.field}><label style={s.label}>학습 목표 (이번 달)</label><input style={s.input} placeholder="예: TOEIC 900점, AWS SAA 취득" value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))} /></div>
            <div style={s.field}><label style={s.label}>메모</label><input style={s.input} placeholder="오늘 배운 것, 느낀 점..." value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} /></div>
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
  row: { display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 0', borderBottom: '1px solid rgba(83,74,183,0.06)' },
  rowDate: { fontSize: 11, color: '#9490C0', flexShrink: 0, width: 68, paddingTop: 1 },
  rowInfo: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 13, fontWeight: 500, color: '#1A1830', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowMeta: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#9490C0', marginTop: 3, flexWrap: 'wrap' as const },
  timeChip: { color: '#534AB7', background: '#EEEDFE', padding: '1px 6px', borderRadius: 4, fontWeight: 600, fontSize: 11 },
  rowDetail: { fontSize: 11, color: '#9490C0', marginTop: 3 },
  delBtn: { fontSize: 15, color: '#C0BDDA', cursor: 'pointer', flexShrink: 0 },
  reportDate: { fontSize: 11, color: '#9490C0', fontWeight: 400 },
  reportPreview: { background: '#F8F7FF', borderRadius: 10, padding: '14px', fontSize: 13, lineHeight: 1.85, color: '#4A4870', whiteSpace: 'pre-wrap' as const },
  overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal: { background: '#fff', borderRadius: 16, padding: '24px', width: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.12)' },
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
