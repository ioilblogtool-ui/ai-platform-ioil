'use client';

import { useEffect, useState } from 'react';
import { getModuleRecords, createModuleRecord, deleteModuleRecord, generateMyAiReport, getMyAiReports, getMyAiReport, ModuleRecord, AiReport } from '@/lib/api';

const EXERCISE_TYPES = ['달리기', '걷기', '헬스', '수영', '자전거', '요가', '필라테스', '기타'];
const EMPTY_FORM = { weight: '', sleep: '', exercise_type: '', exercise_min: '', memo: '', recorded_at: new Date().toISOString().slice(0, 10) };

export default function HealthPage() {
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
        getModuleRecords('health'),
        getMyAiReports({ module_key: 'health', limit: 1 }),
      ]);
      setRecords(rec.data ?? []);
      const latest: AiReport | undefined = rpt.data?.[0];
      if (latest) { setReport(latest); const full = await getMyAiReport(latest.id); setReportContent(full.data?.content ?? ''); }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  // 최근 7일 평균
  const recent7 = records.slice(0, 7);
  const avgWeight = recent7.filter(r => r.data.weight).reduce((s, r, _, a) => s + Number(r.data.weight) / a.length, 0);
  const avgSleep  = recent7.filter(r => r.data.sleep ).reduce((s, r, _, a) => s + Number(r.data.sleep)  / a.length, 0);
  const exerciseDays = recent7.filter(r => r.data.exercise_min && Number(r.data.exercise_min) > 0).length;

  async function handleSave() {
    if (!form.weight && !form.sleep && !form.exercise_min) { setFormError('체중, 수면, 운동 중 하나 이상을 입력해주세요.'); return; }
    setSaving(true); setFormError('');
    try {
      await createModuleRecord({ module_key: 'health', data: { weight: form.weight ? Number(form.weight) : null, sleep: form.sleep ? Number(form.sleep) : null, exercise_type: form.exercise_type || null, exercise_min: form.exercise_min ? Number(form.exercise_min) : null, memo: form.memo.trim() || null }, recorded_at: form.recorded_at });
      setModalOpen(false); load();
    } catch (e: any) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  async function handleGenerate() {
    setGenerating(true);
    try { const res = await generateMyAiReport('health'); setReport(res.data); setReportContent(res.data.content ?? ''); }
    catch (e: any) { alert('리포트 생성 실패: ' + e.message); }
    finally { setGenerating(false); }
  }

  if (loading) return <div style={s.center}>불러오는 중...</div>;
  if (error)   return <div style={s.center} onClick={load}>⚠ {error} — 다시 시도</div>;

  return (
    <div>
      <div style={s.pageHeader}>
        <div>
          <div style={s.breadcrumb}>나만의 AI › 건강</div>
          <div style={s.title}>🏋️ 건강</div>
          <div style={s.sub}>기록 {records.length}개 · 주간 AI 리포트</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btnSecondary} onClick={() => { setForm(EMPTY_FORM); setFormError(''); setModalOpen(true); }}>+ 오늘 기록</button>
          <button style={{ ...s.btnPrimary, opacity: generating ? 0.7 : 1 }} onClick={handleGenerate} disabled={generating}>{generating ? '생성 중...' : 'AI 리포트 생성'}</button>
        </div>
      </div>

      {/* 최근 7일 통계 */}
      <div style={s.threeCol}>
        {[
          { label: '평균 체중 (7일)', value: avgWeight ? `${avgWeight.toFixed(1)} kg` : '—', sub: '최근 7일 평균' },
          { label: '평균 수면 (7일)', value: avgSleep  ? `${avgSleep.toFixed(1)} h`  : '—', sub: '권장 7-9h' },
          { label: '운동 일수 (7일)', value: `${exerciseDays}일`, sub: exerciseDays >= 3 ? '✓ 목표 달성' : '목표 3일 이상' },
        ].map((st, i) => (
          <div key={i} style={s.statCard}>
            <div style={s.statLabel}>{st.label}</div>
            <div style={s.statValue}>{st.value}</div>
            <div style={s.statSub}>{st.sub}</div>
          </div>
        ))}
      </div>

      <div style={s.twoCol}>
        {/* 기록 목록 */}
        <div style={s.card}>
          <div style={s.cardTitle}>건강 기록<span style={s.cardAction} onClick={() => { setForm(EMPTY_FORM); setFormError(''); setModalOpen(true); }}>+ 추가</span></div>
          {records.length === 0 ? <div style={s.empty}>오늘의 건강 기록을 시작해보세요.</div> : records.slice(0, 14).map(rec => {
            const d = rec.data;
            return (
              <div key={rec.id} style={s.row}>
                <div style={s.rowDate}>{rec.recorded_at}</div>
                <div style={s.rowInfo}>
                  <div style={s.rowChips}>
                    {d.weight    && <span style={{ ...s.chip, color: '#534AB7', background: '#EEEDFE' }}>⚖ {d.weight}kg</span>}
                    {d.sleep     && <span style={{ ...s.chip, color: '#185FA5', background: '#E6F1FB' }}>💤 {d.sleep}h</span>}
                    {d.exercise_min && <span style={{ ...s.chip, color: '#1D9E75', background: '#E1F5EE' }}>🏃 {d.exercise_type || '운동'} {d.exercise_min}분</span>}
                  </div>
                  {d.memo && <div style={s.rowMemo}>{d.memo}</div>}
                </div>
                <span style={s.delBtn} onClick={() => { if(confirm('삭제?')) deleteModuleRecord(rec.id).then(load); }}>×</span>
              </div>
            );
          })}
        </div>

        {/* AI 리포트 */}
        <div style={s.card}>
          <div style={s.cardTitle}>AI 주간 리포트{report && <span style={s.reportDate}>{new Date(report.generated_at).toLocaleDateString('ko-KR')}</span>}</div>
          {reportContent ? <div style={s.reportPreview}>{reportContent}</div> : <div style={s.emptyReport}><div style={s.emptyIcon}>🏋️</div><div style={s.emptyText}>기록을 쌓은 후 AI 리포트를 생성해보세요.</div></div>}
        </div>
      </div>

      {modalOpen && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div style={s.modal}>
            <div style={s.modalHeader}><span style={s.modalTitle}>오늘의 건강 기록</span><span style={s.modalClose} onClick={() => setModalOpen(false)}>×</span></div>
            <div style={s.twoField}>
              <div><label style={s.label}>체중 (kg)</label><input style={s.input} type="number" step="0.1" placeholder="68.5" value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} /></div>
              <div><label style={s.label}>수면 (시간)</label><input style={s.input} type="number" step="0.5" placeholder="7.5" value={form.sleep} onChange={e => setForm(f => ({ ...f, sleep: e.target.value }))} /></div>
            </div>
            <div style={s.twoField}>
              <div><label style={s.label}>운동 종류</label><select style={s.input} value={form.exercise_type} onChange={e => setForm(f => ({ ...f, exercise_type: e.target.value }))}><option value="">선택 안 함</option>{EXERCISE_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
              <div><label style={s.label}>운동 시간 (분)</label><input style={s.input} type="number" placeholder="30" value={form.exercise_min} onChange={e => setForm(f => ({ ...f, exercise_min: e.target.value }))} /></div>
            </div>
            <div style={s.field}><label style={s.label}>메모</label><input style={s.input} placeholder="오늘 컨디션, 특이사항..." value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} /></div>
            <div style={s.field}><label style={s.label}>날짜</label><input style={s.input} type="date" value={form.recorded_at} onChange={e => setForm(f => ({ ...f, recorded_at: e.target.value }))} /></div>
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
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(83,74,183,0.06)' },
  rowDate: { fontSize: 11, color: '#9490C0', flexShrink: 0, width: 68 },
  rowInfo: { flex: 1, minWidth: 0 },
  rowChips: { display: 'flex', gap: 5, flexWrap: 'wrap' as const },
  chip: { fontSize: 11, padding: '2px 7px', borderRadius: 5, fontWeight: 500 },
  rowMemo: { fontSize: 11, color: '#9490C0', marginTop: 3 },
  delBtn: { fontSize: 15, color: '#C0BDDA', cursor: 'pointer', flexShrink: 0 },
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
