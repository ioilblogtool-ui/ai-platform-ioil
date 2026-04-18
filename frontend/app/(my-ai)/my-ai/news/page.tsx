'use client';

import { useEffect, useState } from 'react';
import {
  getKeywords, createKeyword, deleteKeyword,
  generateMyAiReport, getMyAiReports, getMyAiReport,
  UserKeyword, AiReport,
} from '@/lib/api';

const CATEGORIES = ['경제', '부동산', '주식', 'AI·기술', '정치', '사회', '육아', '건강', '기타'];

export default function NewsPage() {
  const [keywords, setKeywords]   = useState<UserKeyword[]>([]);
  const [report, setReport]       = useState<AiReport | null>(null);
  const [reportContent, setReportContent] = useState('');
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError]         = useState('');

  const [addOpen, setAddOpen]     = useState(false);
  const [newKw, setNewKw]         = useState('');
  const [newCat, setNewCat]       = useState('');
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [kwRes, rptRes] = await Promise.all([
        getKeywords(),
        getMyAiReports({ module_key: 'news', limit: 1 }),
      ]);
      setKeywords(kwRes.data ?? []);
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

  async function handleAdd() {
    if (!newKw.trim()) { setFormError('키워드를 입력해주세요.'); return; }
    setSaving(true);
    setFormError('');
    try {
      await createKeyword({ keyword: newKw.trim(), category: newCat || undefined });
      setNewKw('');
      setNewCat('');
      setAddOpen(false);
      load();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, keyword: string) {
    if (!confirm(`"${keyword}" 키워드를 삭제하시겠습니까?`)) return;
    try {
      await deleteKeyword(id);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await generateMyAiReport('news');
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
          <div style={s.breadcrumb}>나만의 AI › 뉴스 브리핑</div>
          <div style={s.title}>📰 뉴스 브리핑</div>
          <div style={s.sub}>매일 06:00 자동 생성 · 관심 키워드 {keywords.length}개</div>
        </div>
        <button
          style={{ ...s.btnPrimary, opacity: generating ? 0.7 : 1 }}
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? '생성 중...' : 'AI 브리핑 생성'}
        </button>
      </div>

      {/* 키워드 관리 */}
      <div style={s.card}>
        <div style={s.cardTitle}>
          관심 키워드
          <span style={s.cardAction} onClick={() => { setAddOpen(true); setFormError(''); }}>+ 추가</span>
        </div>
        {keywords.length === 0 ? (
          <div style={s.empty}>등록된 키워드가 없습니다.<br />"+ 추가"로 관심 키워드를 등록해보세요.</div>
        ) : (
          <div style={s.keywordRow}>
            {keywords.map(kw => (
              <div key={kw.id} style={s.kwChip}>
                {kw.category && <span style={s.kwCat}>{kw.category}</span>}
                {kw.keyword}
                <span style={s.kwRemove} onClick={() => handleDelete(kw.id, kw.keyword)}>×</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 최신 리포트 */}
      {report ? (
        <div style={s.card}>
          <div style={s.cardTitle}>
            최신 브리핑 — {report.title}
            <span style={s.reportDate}>{new Date(report.generated_at).toLocaleDateString('ko-KR')}</span>
          </div>
          <div style={s.reportPreview}>{reportContent}</div>
        </div>
      ) : (
        <div style={{ ...s.card, ...s.emptyReport }}>
          <div style={s.emptyReportIcon}>📰</div>
          <div style={s.emptyReportText}>아직 생성된 브리핑이 없습니다</div>
          <div style={s.emptyReportSub}>키워드를 등록한 뒤 "AI 브리핑 생성"을 눌러보세요.</div>
          <button
            style={{ ...s.btnPrimary, marginTop: 14, opacity: generating ? 0.7 : 1 }}
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? '생성 중...' : '지금 생성하기'}
          </button>
        </div>
      )}

      {/* 키워드 추가 모달 */}
      {addOpen && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setAddOpen(false); }}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>키워드 추가</span>
              <span style={s.modalClose} onClick={() => setAddOpen(false)}>×</span>
            </div>

            <div style={s.field}>
              <label style={s.label}>키워드</label>
              <input
                style={s.input}
                placeholder="예: 반도체, 금리인하, 부동산"
                value={newKw}
                onChange={e => setNewKw(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                autoFocus
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>카테고리 (선택)</label>
              <div style={s.catGrid}>
                {CATEGORIES.map(cat => (
                  <div
                    key={cat}
                    style={{ ...s.catChip, ...(newCat === cat ? s.catChipActive : {}) }}
                    onClick={() => setNewCat(prev => prev === cat ? '' : cat)}
                  >
                    {cat}
                  </div>
                ))}
              </div>
            </div>

            {formError && <div style={s.formError}>{formError}</div>}

            <div style={s.modalFooter}>
              <button style={s.btnSecondary} onClick={() => setAddOpen(false)}>취소</button>
              <button style={{ ...s.btnPrimary, opacity: saving ? 0.7 : 1 }} onClick={handleAdd} disabled={saving}>
                {saving ? '추가 중...' : '추가'}
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
  card:           { background: '#fff', border: '1px solid rgba(83,74,183,0.08)', borderRadius: 14, padding: '16px', marginBottom: 14 },
  cardTitle:      { fontSize: 13, fontWeight: 600, color: '#4A4870', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardAction:     { fontSize: 11, color: '#534AB7', cursor: 'pointer', fontWeight: 400 },
  empty:          { fontSize: 13, color: '#9490C0', textAlign: 'center' as const, padding: '16px 0', lineHeight: 1.8 },
  emptyReport:    { textAlign: 'center' as const, padding: '32px 16px' },
  emptyReportIcon:{ fontSize: 32, marginBottom: 10 },
  emptyReportText:{ fontSize: 14, fontWeight: 500, color: '#4A4870', marginBottom: 6 },
  emptyReportSub: { fontSize: 12, color: '#9490C0' },
  keywordRow:     { display: 'flex', gap: 8, flexWrap: 'wrap' as const },
  kwChip:         { display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: '1px solid rgba(83,74,183,0.2)', borderRadius: 20, fontSize: 12, color: '#4A4870', background: '#F8F7FF' },
  kwCat:          { fontSize: 10, color: '#534AB7', background: '#EEEDFE', padding: '1px 5px', borderRadius: 4, marginRight: 2 },
  kwRemove:       { fontSize: 14, color: '#9490C0', cursor: 'pointer', lineHeight: 1, marginLeft: 2 },
  reportDate:     { fontSize: 11, color: '#9490C0', fontWeight: 400 },
  reportPreview:  { background: '#F8F7FF', borderRadius: 10, padding: '14px', fontSize: 13, lineHeight: 1.85, color: '#4A4870', whiteSpace: 'pre-wrap' as const },
  overlay:        { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal:          { background: '#fff', borderRadius: 16, padding: '24px', width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.12)' },
  modalHeader:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:     { fontSize: 15, fontWeight: 600, color: '#1A1830' },
  modalClose:     { fontSize: 18, color: '#9490C0', cursor: 'pointer', lineHeight: 1 },
  field:          { marginBottom: 14 },
  label:          { display: 'block', fontSize: 12, color: '#4A4870', marginBottom: 6, fontWeight: 500 },
  input:          { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(83,74,183,0.2)', fontSize: 13, color: '#1A1830', outline: 'none', boxSizing: 'border-box' as const, background: '#FAFAFE' },
  catGrid:        { display: 'flex', flexWrap: 'wrap' as const, gap: 6 },
  catChip:        { padding: '5px 11px', borderRadius: 16, fontSize: 12, border: '1px solid rgba(83,74,183,0.15)', color: '#4A4870', cursor: 'pointer', background: '#F8F7FF' },
  catChipActive:  { background: '#EEEDFE', borderColor: '#534AB7', color: '#534AB7', fontWeight: 600 },
  formError:      { fontSize: 12, color: '#E53E3E', marginBottom: 12, background: '#FEE8E8', padding: '8px 12px', borderRadius: 6 },
  modalFooter:    { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 },
};
