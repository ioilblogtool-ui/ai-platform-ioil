'use client';

import { useEffect, useState } from 'react';
import {
  getRealestate, createRealestateItem, updateRealestateItem, deleteRealestateItem,
  generateMyAiReport, getMyAiReports, getMyAiReport,
  RealestateItem, AiReport,
} from '@/lib/api';

function formatPrice(n: number | null) {
  if (!n) return '—';
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}

type ModalMode = 'add' | 'edit';
const EMPTY_FORM = { name: '', address: '', area_sqm: '', interest: 'buy' as 'buy' | 'rent', price: '', note: '' };

export default function RealEstatePage() {
  const [items, setItems]         = useState<RealestateItem[]>([]);
  const [report, setReport]       = useState<AiReport | null>(null);
  const [reportContent, setReportContent] = useState('');
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError]         = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('add');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [itemsRes, rptRes] = await Promise.all([
        getRealestate(),
        getMyAiReports({ module_key: 'realestate', limit: 1 }),
      ]);
      setItems(itemsRes.data ?? []);
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

  function openAdd() {
    setForm(EMPTY_FORM);
    setFormError('');
    setModalMode('add');
    setEditingId(null);
    setModalOpen(true);
  }

  function openEdit(item: RealestateItem) {
    setForm({
      name: item.name,
      address: item.address ?? '',
      area_sqm: item.area_sqm != null ? String(item.area_sqm) : '',
      interest: item.interest ?? 'buy',
      price: item.price != null ? String(item.price) : '',
      note: item.note ?? '',
    });
    setFormError('');
    setModalMode('edit');
    setEditingId(item.id);
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormError('매물명을 입력해주세요.'); return; }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        name: form.name.trim(),
        address:  form.address.trim()  || undefined,
        area_sqm: form.area_sqm        ? Number(form.area_sqm) : undefined,
        interest: form.interest,
        price:    form.price           ? Number(form.price)    : undefined,
        note:     form.note.trim()     || undefined,
      };
      if (modalMode === 'add') {
        await createRealestateItem(payload);
      } else if (editingId) {
        await updateRealestateItem(editingId, payload);
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" 매물을 삭제하시겠습니까?`)) return;
    try {
      await deleteRealestateItem(id);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await generateMyAiReport('realestate');
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
          <div style={s.breadcrumb}>나만의 AI › 부동산</div>
          <div style={s.title}>🏠 부동산 관심 매물</div>
          <div style={s.sub}>매물 {items.length}개 등록 · 주간 AI 분석</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btnSecondary} onClick={openAdd}>+ 매물 추가</button>
          <button style={{ ...s.btnPrimary, opacity: generating ? 0.7 : 1 }} onClick={handleGenerate} disabled={generating}>
            {generating ? '생성 중...' : 'AI 분석 생성'}
          </button>
        </div>
      </div>

      <div style={s.twoCol}>
        {/* 관심 매물 목록 */}
        <div style={s.card}>
          <div style={s.cardTitle}>
            관심 매물
            <span style={s.cardAction} onClick={openAdd}>+ 추가</span>
          </div>
          {items.length === 0 ? (
            <div style={s.empty}>등록된 관심 매물이 없습니다.<br />"+ 매물 추가"로 관심 물건을 등록해보세요.</div>
          ) : (
            items.map(item => (
              <div key={item.id} style={s.propRow}>
                <div style={s.propIcon}>🏢</div>
                <div style={s.propInfo}>
                  <div style={s.propName}>{item.name}</div>
                  <div style={s.propDetail}>
                    {item.address && `${item.address} · `}
                    {item.area_sqm && `${item.area_sqm}㎡ · `}
                    <span style={{ ...s.interestBadge, ...(item.interest === 'buy' ? s.buyBadge : s.rentBadge) }}>
                      {item.interest === 'buy' ? '매수' : '전·월세'}
                    </span>
                    {item.note && <span style={s.noteText}> · {item.note}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                  <div style={s.propValue}>{formatPrice(item.price)}</div>
                  <div style={s.assetActions}>
                    <span style={s.actionBtn} onClick={() => openEdit(item)}>편집</span>
                    <span style={{ ...s.actionBtn, color: '#E53E3E' }} onClick={() => handleDelete(item.id, item.name)}>삭제</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* AI 분석 */}
        <div style={s.card}>
          <div style={s.cardTitle}>
            AI 주간 분석
            {report && <span style={s.reportDate}>{new Date(report.generated_at).toLocaleDateString('ko-KR')}</span>}
          </div>
          {reportContent ? (
            <div style={s.reportPreview}>{reportContent}</div>
          ) : (
            <div style={s.emptyReport}>
              <div style={s.emptyReportIcon}>🏠</div>
              <div style={s.emptyReportText}>아직 생성된 분석이 없습니다</div>
              <div style={s.emptyReportSub}>매물을 등록한 뒤 AI 분석을 생성해보세요.</div>
            </div>
          )}
        </div>
      </div>

      {/* 매물 입력 모달 */}
      {modalOpen && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>{modalMode === 'add' ? '매물 추가' : '매물 편집'}</span>
              <span style={s.modalClose} onClick={() => setModalOpen(false)}>×</span>
            </div>

            <div style={s.field}>
              <label style={s.label}>매물명 *</label>
              <input style={s.input} placeholder="예: 래미안원베일리 84㎡" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            <div style={s.field}>
              <label style={s.label}>주소</label>
              <input style={s.input} placeholder="예: 서울 서초구 반포동" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>

            <div style={s.twoFieldRow}>
              <div style={{ flex: 1 }}>
                <label style={s.label}>면적 (㎡)</label>
                <input style={s.input} type="number" placeholder="84" value={form.area_sqm} onChange={e => setForm(f => ({ ...f, area_sqm: e.target.value }))} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={s.label}>관심 유형</label>
                <select style={s.select} value={form.interest} onChange={e => setForm(f => ({ ...f, interest: e.target.value as 'buy' | 'rent' }))}>
                  <option value="buy">매수</option>
                  <option value="rent">전·월세</option>
                </select>
              </div>
            </div>

            <div style={s.field}>
              <label style={s.label}>가격 (원)</label>
              <input style={s.input} type="number" placeholder="예: 3850000000 (38.5억)" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
              {form.price && !isNaN(Number(form.price)) && (
                <div style={s.pricePreview}>{formatPrice(Number(form.price))}</div>
              )}
            </div>

            <div style={s.field}>
              <label style={s.label}>메모</label>
              <input style={s.input} placeholder="예: 실거주 목적, 역세권 중요" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
            </div>

            {formError && <div style={s.formError}>{formError}</div>}

            <div style={s.modalFooter}>
              <button style={s.btnSecondary} onClick={() => setModalOpen(false)}>취소</button>
              <button style={{ ...s.btnPrimary, opacity: saving ? 0.7 : 1 }} onClick={handleSave} disabled={saving}>
                {saving ? '저장 중...' : (modalMode === 'add' ? '추가' : '저장')}
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
  pageHeader:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  breadcrumb:     { fontSize: 12, color: '#9490C0', marginBottom: 4 },
  title:          { fontSize: 18, fontWeight: 600, color: '#1A1830' },
  sub:            { fontSize: 12, color: '#9490C0', marginTop: 2 },
  btnPrimary:     { fontSize: 12, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#534AB7', color: '#fff', cursor: 'pointer' },
  btnSecondary:   { fontSize: 12, padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(83,74,183,0.2)', background: '#fff', color: '#534AB7', cursor: 'pointer' },
  twoCol:         { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 },
  card:           { background: '#fff', border: '1px solid rgba(83,74,183,0.08)', borderRadius: 14, padding: '16px' },
  cardTitle:      { fontSize: 13, fontWeight: 600, color: '#4A4870', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardAction:     { fontSize: 11, color: '#534AB7', cursor: 'pointer', fontWeight: 400 },
  empty:          { fontSize: 13, color: '#9490C0', textAlign: 'center' as const, padding: '20px 0', lineHeight: 1.8 },
  emptyReport:    { textAlign: 'center' as const, padding: '24px 0' },
  emptyReportIcon:{ fontSize: 28, marginBottom: 8 },
  emptyReportText:{ fontSize: 13, fontWeight: 500, color: '#4A4870', marginBottom: 4 },
  emptyReportSub: { fontSize: 11, color: '#9490C0' },
  propRow:        { display: 'flex', alignItems: 'flex-start', padding: '11px 0', borderBottom: '1px solid rgba(83,74,183,0.06)' },
  propIcon:       { width: 32, height: 32, borderRadius: 8, background: '#EEEDFE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, marginRight: 10, flexShrink: 0 },
  propInfo:       { flex: 1, minWidth: 0 },
  propName:       { fontSize: 13, fontWeight: 500, color: '#1A1830', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  propDetail:     { fontSize: 11, color: '#9490C0', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  interestBadge:  { fontSize: 10, padding: '1px 5px', borderRadius: 4, fontWeight: 500 },
  buyBadge:       { color: '#185FA5', background: '#E6F1FB' },
  rentBadge:      { color: '#854F0B', background: '#FAEEDA' },
  noteText:       { color: '#9490C0' },
  propValue:      { fontSize: 13, fontWeight: 600, color: '#1A1830' },
  assetActions:   { display: 'flex', gap: 8, marginTop: 3, justifyContent: 'flex-end' },
  actionBtn:      { fontSize: 11, color: '#534AB7', cursor: 'pointer' },
  reportDate:     { fontSize: 11, color: '#9490C0', fontWeight: 400 },
  reportPreview:  { background: '#F8F7FF', borderRadius: 10, padding: '14px', fontSize: 13, lineHeight: 1.85, color: '#4A4870', whiteSpace: 'pre-wrap' as const },
  overlay:        { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal:          { background: '#fff', borderRadius: 16, padding: '24px', width: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.12)' },
  modalHeader:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:     { fontSize: 15, fontWeight: 600, color: '#1A1830' },
  modalClose:     { fontSize: 18, color: '#9490C0', cursor: 'pointer', lineHeight: 1 },
  twoFieldRow:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 },
  field:          { marginBottom: 14 },
  label:          { display: 'block', fontSize: 12, color: '#4A4870', marginBottom: 6, fontWeight: 500 },
  input:          { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(83,74,183,0.2)', fontSize: 13, color: '#1A1830', outline: 'none', boxSizing: 'border-box' as const, background: '#FAFAFE' },
  select:         { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(83,74,183,0.2)', fontSize: 13, color: '#1A1830', outline: 'none', boxSizing: 'border-box' as const, background: '#FAFAFE' },
  pricePreview:   { fontSize: 11, color: '#534AB7', marginTop: 4, fontWeight: 500 },
  formError:      { fontSize: 12, color: '#E53E3E', marginBottom: 12, background: '#FEE8E8', padding: '8px 12px', borderRadius: 6 },
  modalFooter:    { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 },
};
