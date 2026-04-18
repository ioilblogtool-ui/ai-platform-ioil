'use client';

import { useEffect, useState } from 'react';
import {
  getParentingRecords, createParentingRecord, deleteParentingRecord,
  generateMyAiReport, getMyAiReports, getMyAiReport,
  ParentingRecord, AiReport,
} from '@/lib/api';

const RECORD_TYPES = [
  { value: 'growth',    label: '성장 기록', icon: '📏', color: '#1D9E75', bg: '#E1F5EE' },
  { value: 'milestone', label: '마일스톤',  icon: '🏆', color: '#534AB7', bg: '#EEEDFE' },
  { value: 'health',    label: '건강·접종', icon: '💊', color: '#185FA5', bg: '#E6F1FB' },
  { value: 'daily',     label: '일상 기록', icon: '📝', color: '#854F0B', bg: '#FAEEDA' },
];

function typeInfo(t: string) { return RECORD_TYPES.find(r => r.value === t) ?? RECORD_TYPES[3]; }

function calcAge(birth: string | null): string {
  if (!birth) return '';
  const b = new Date(birth);
  const now = new Date();
  const months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
  if (months < 24) return `${months}개월`;
  return `${Math.floor(months / 12)}세 ${months % 12}개월`;
}

const EMPTY_FORM = {
  child_name: '', birth_date: '', record_type: 'daily' as ParentingRecord['record_type'],
  title: '', detail: '', recorded_at: new Date().toISOString().slice(0, 10),
};

export default function ParentingPage() {
  const [records, setRecords]     = useState<ParentingRecord[]>([]);
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
    setLoading(true);
    setError('');
    try {
      const [recRes, rptRes] = await Promise.all([
        getParentingRecords(),
        getMyAiReports({ module_key: 'parenting', limit: 1 }),
      ]);
      setRecords(recRes.data ?? []);
      const latest: AiReport | undefined = rptRes.data?.[0];
      if (latest) {
        setReport(latest);
        const full = await getMyAiReport(latest.id);
        setReportContent(full.data?.content ?? '');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const childNames = [...new Set(records.map(r => r.child_name).filter(Boolean))] as string[];
  const filtered = filter ? records.filter(r => r.record_type === filter) : records;
  const firstChild = records.find(r => r.child_name);
  const age = firstChild ? calcAge(firstChild.birth_date) : null;

  async function handleSave() {
    if (!form.title.trim()) { setFormError('내용을 입력해주세요.'); return; }
    setSaving(true);
    setFormError('');
    try {
      await createParentingRecord({
        child_name:  form.child_name.trim() || undefined,
        birth_date:  form.birth_date        || undefined,
        record_type: form.record_type,
        data:        { title: form.title.trim(), detail: form.detail.trim() },
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
    if (!confirm('이 기록을 삭제하시겠습니까?')) return;
    try {
      await deleteParentingRecord(id);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await generateMyAiReport('parenting');
      setReport(res.data);
      setReportContent(res.data.content ?? '');
    } catch (e: any) {
      alert('리포트 생성 실패: ' + e.message);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <div style={s.center}>불러오는 중...</div>;
  if (error)   return <div style={s.center} onClick={load} role="button">⚠ {error} — 다시 시도</div>;

  return (
    <div>
      <div style={s.pageHeader}>
        <div>
          <div style={s.breadcrumb}>나만의 AI › 육아</div>
          <div style={s.title}>👶 육아</div>
          <div style={s.sub}>기록 {records.length}개{age ? ` · ${age}` : ''} · 주간 AI 리포트</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btnSecondary} onClick={() => { setForm(EMPTY_FORM); setFormError(''); setModalOpen(true); }}>+ 기록 추가</button>
          <button style={{ ...s.btnPrimary, opacity: generating ? 0.7 : 1 }} onClick={handleGenerate} disabled={generating}>
            {generating ? '생성 중...' : 'AI 리포트 생성'}
          </button>
        </div>
      </div>

      {/* 유형 필터 */}
      <div style={s.filterRow}>
        <div style={{ ...s.filterChip, ...(filter === '' ? s.filterActive : {}) }} onClick={() => setFilter('')}>전체 ({records.length})</div>
        {RECORD_TYPES.map(t => {
          const cnt = records.filter(r => r.record_type === t.value).length;
          return (
            <div
              key={t.value}
              style={{ ...s.filterChip, ...(filter === t.value ? s.filterActive : {}) }}
              onClick={() => setFilter(prev => prev === t.value ? '' : t.value)}
            >
              {t.icon} {t.label} ({cnt})
            </div>
          );
        })}
      </div>

      <div style={s.twoCol}>
        {/* 기록 목록 */}
        <div style={s.card}>
          <div style={s.cardTitle}>육아 기록</div>
          {filtered.length === 0 ? (
            <div style={s.empty}>기록이 없습니다.<br />"+ 기록 추가"로 육아 일지를 써보세요.</div>
          ) : (
            filtered.map(rec => {
              const info = typeInfo(rec.record_type);
              const title = rec.data?.title || rec.record_type;
              return (
                <div key={rec.id} style={s.recRow}>
                  <div style={{ ...s.recIcon, background: info.bg }}>{info.icon}</div>
                  <div style={s.recInfo}>
                    <div style={s.recTitle}>{title}</div>
                    <div style={s.recMeta}>
                      <span style={{ ...s.recBadge, color: info.color, background: info.bg }}>{info.label}</span>
                      {rec.child_name && <span>· {rec.child_name}</span>}
                      <span>· {rec.recorded_at}</span>
                    </div>
                    {rec.data?.detail && <div style={s.recDetail}>{rec.data.detail}</div>}
                  </div>
                  <span style={s.deleteBtn} onClick={() => handleDelete(rec.id)}>×</span>
                </div>
              );
            })
          )}
        </div>

        {/* AI 리포트 */}
        <div style={s.card}>
          <div style={s.cardTitle}>
            AI 주간 리포트
            {report && <span style={s.reportDate}>{new Date(report.generated_at).toLocaleDateString('ko-KR')}</span>}
          </div>
          {reportContent ? (
            <div style={s.reportPreview}>{reportContent}</div>
          ) : (
            <div style={s.emptyReport}>
              <div style={s.emptyReportIcon}>👶</div>
              <div style={s.emptyReportText}>아직 생성된 리포트가 없습니다</div>
              <div style={s.emptyReportSub}>기록을 추가한 뒤 AI 리포트를 생성해보세요.</div>
            </div>
          )}
        </div>
      </div>

      {/* 기록 추가 모달 */}
      {modalOpen && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>육아 기록 추가</span>
              <span style={s.modalClose} onClick={() => setModalOpen(false)}>×</span>
            </div>

            <div style={s.field}>
              <label style={s.label}>기록 유형</label>
              <div style={s.typeGrid}>
                {RECORD_TYPES.map(t => (
                  <div
                    key={t.value}
                    style={{ ...s.typeChip, ...(form.record_type === t.value ? { background: t.bg, borderColor: t.color, color: t.color, fontWeight: 600 } : {}) }}
                    onClick={() => setForm(f => ({ ...f, record_type: t.value as ParentingRecord['record_type'] }))}
                  >
                    {t.icon} {t.label}
                  </div>
                ))}
              </div>
            </div>

            <div style={s.twoFieldRow}>
              <div>
                <label style={s.label}>아이 이름</label>
                <input
                  style={s.input}
                  placeholder="예: 민준"
                  value={form.child_name}
                  onChange={e => setForm(f => ({ ...f, child_name: e.target.value }))}
                  list="child-names"
                />
                {childNames.length > 0 && (
                  <datalist id="child-names">
                    {childNames.map(n => <option key={n} value={n} />)}
                  </datalist>
                )}
              </div>
              <div>
                <label style={s.label}>기준일</label>
                <input style={s.input} type="date" value={form.recorded_at} onChange={e => setForm(f => ({ ...f, recorded_at: e.target.value }))} />
              </div>
            </div>

            {!firstChild && (
              <div style={s.field}>
                <label style={s.label}>생년월일 (처음 입력 시)</label>
                <input style={s.input} type="date" value={form.birth_date} onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))} />
              </div>
            )}

            <div style={s.field}>
              <label style={s.label}>내용 *</label>
              <input
                style={s.input}
                placeholder="예: 혼자 서기 성공, 체중 10.2kg"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>상세 메모</label>
              <textarea
                style={{ ...s.input, height: 72, resize: 'vertical' as const }}
                placeholder="상세 내용을 입력하세요"
                value={form.detail}
                onChange={e => setForm(f => ({ ...f, detail: e.target.value }))}
              />
            </div>

            {formError && <div style={s.formError}>{formError}</div>}

            <div style={s.modalFooter}>
              <button style={s.btnSecondary} onClick={() => setModalOpen(false)}>취소</button>
              <button style={{ ...s.btnPrimary, opacity: saving ? 0.7 : 1 }} onClick={handleSave} disabled={saving}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  center:         { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#9490C0', fontSize: 14, cursor: 'pointer' },
  pageHeader:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  breadcrumb:     { fontSize: 12, color: '#9490C0', marginBottom: 4 },
  title:          { fontSize: 18, fontWeight: 600, color: '#1A1830' },
  sub:            { fontSize: 12, color: '#9490C0', marginTop: 2 },
  btnPrimary:     { fontSize: 12, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#534AB7', color: '#fff', cursor: 'pointer' },
  btnSecondary:   { fontSize: 12, padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(83,74,183,0.2)', background: '#fff', color: '#534AB7', cursor: 'pointer' },
  filterRow:      { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' as const },
  filterChip:     { fontSize: 12, padding: '5px 12px', borderRadius: 16, border: '1px solid rgba(83,74,183,0.12)', color: '#4A4870', cursor: 'pointer', background: '#fff' },
  filterActive:   { background: '#EEEDFE', borderColor: '#534AB7', color: '#534AB7', fontWeight: 600 },
  twoCol:         { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  card:           { background: '#fff', border: '1px solid rgba(83,74,183,0.08)', borderRadius: 14, padding: '16px' },
  cardTitle:      { fontSize: 13, fontWeight: 600, color: '#4A4870', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  empty:          { fontSize: 13, color: '#9490C0', textAlign: 'center' as const, padding: '20px 0', lineHeight: 1.8 },
  emptyReport:    { textAlign: 'center' as const, padding: '24px 0' },
  emptyReportIcon:{ fontSize: 28, marginBottom: 8 },
  emptyReportText:{ fontSize: 13, fontWeight: 500, color: '#4A4870', marginBottom: 4 },
  emptyReportSub: { fontSize: 11, color: '#9490C0' },
  recRow:         { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(83,74,183,0.06)' },
  recIcon:        { width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 },
  recInfo:        { flex: 1, minWidth: 0 },
  recTitle:       { fontSize: 13, fontWeight: 500, color: '#1A1830', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  recMeta:        { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#9490C0', marginTop: 3, flexWrap: 'wrap' as const },
  recBadge:       { fontSize: 10, padding: '1px 5px', borderRadius: 4, fontWeight: 500 },
  recDetail:      { fontSize: 11, color: '#9490C0', marginTop: 3, lineHeight: 1.5 },
  deleteBtn:      { fontSize: 16, color: '#9490C0', cursor: 'pointer', flexShrink: 0, lineHeight: 1, padding: '2px 4px' },
  reportDate:     { fontSize: 11, color: '#9490C0', fontWeight: 400 },
  reportPreview:  { background: '#F8F7FF', borderRadius: 10, padding: '14px', fontSize: 13, lineHeight: 1.85, color: '#4A4870', whiteSpace: 'pre-wrap' as const },
  overlay:        { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal:          { background: '#fff', borderRadius: 16, padding: '24px', width: 460, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', maxHeight: '90vh', overflowY: 'auto' as const },
  modalHeader:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:     { fontSize: 15, fontWeight: 600, color: '#1A1830' },
  modalClose:     { fontSize: 18, color: '#9490C0', cursor: 'pointer', lineHeight: 1 },
  typeGrid:       { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 0 },
  typeChip:       { padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(83,74,183,0.15)', fontSize: 12, color: '#4A4870', cursor: 'pointer', textAlign: 'center' as const, background: '#F8F7FF' },
  twoFieldRow:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 },
  field:          { marginBottom: 14 },
  label:          { display: 'block', fontSize: 12, color: '#4A4870', marginBottom: 6, fontWeight: 500 },
  input:          { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(83,74,183,0.2)', fontSize: 13, color: '#1A1830', outline: 'none', boxSizing: 'border-box' as const, background: '#FAFAFE' },
  formError:      { fontSize: 12, color: '#E53E3E', marginBottom: 12, background: '#FEE8E8', padding: '8px 12px', borderRadius: 6 },
  modalFooter:    { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 },
};
