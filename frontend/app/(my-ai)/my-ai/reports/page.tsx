'use client';

import { useEffect, useState } from 'react';
import { getMyAiReports, getMyAiReport, AiReport } from '@/lib/api';

const MODULE_META: Record<string, { label: string; dot: string; icon: string }> = {
  assets:     { label: '자산 관리',    dot: '#854F0B', icon: '💰' },
  budget:     { label: '가계부',       dot: '#1D9E75', icon: '📊' },
  realestate: { label: '부동산',       dot: '#185FA5', icon: '🏠' },
  portfolio:  { label: '투자',         dot: '#3B6D11', icon: '📈' },
  parenting:  { label: '육아',         dot: '#534AB7', icon: '👶' },
  health:     { label: '건강',         dot: '#E53E3E', icon: '🏋️' },
  career:     { label: '커리어',       dot: '#EF9F27', icon: '💼' },
  learning:   { label: '학습',         dot: '#9490C0', icon: '📚' },
  news:       { label: '뉴스 브리핑',  dot: '#185FA5', icon: '📰' },
};

const REPORT_TYPE_LABELS: Record<string, string> = {
  daily: '일간', weekly: '주간', monthly: '월간',
};

const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  daily:   { color: '#185FA5', bg: '#E6F1FB' },
  weekly:  { color: '#0F6E56', bg: '#E1F5EE' },
  monthly: { color: '#854F0B', bg: '#FAEEDA' },
};

function timeAgo(dt: string): string {
  const diff = Date.now() - new Date(dt).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `${Math.floor(diff / 60_000)}분 전`;
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return new Date(dt).toLocaleDateString('ko-KR');
}

const ALL_MODULES = ['전체', ...Object.keys(MODULE_META)];
const PAGE_SIZE = 20;

export default function ReportsPage() {
  const [reports, setReports]     = useState<AiReport[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [moduleFilter, setModuleFilter] = useState('전체');
  const [offset, setOffset]       = useState(0);

  // 상세 패널
  const [selected, setSelected]   = useState<AiReport | null>(null);
  const [detailContent, setDetailContent] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);

  async function load(mod: string, off: number) {
    setLoading(true);
    setError('');
    try {
      const res = await getMyAiReports({
        module_key: mod === '전체' ? undefined : mod,
        limit: PAGE_SIZE,
        offset: off,
      });
      setReports(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(moduleFilter, offset); }, [moduleFilter, offset]);

  function changeModule(mod: string) {
    setModuleFilter(mod);
    setOffset(0);
    setSelected(null);
    setDetailContent('');
  }

  async function openDetail(report: AiReport) {
    setSelected(report);
    setDetailContent('');
    setDetailLoading(true);
    try {
      const full = await getMyAiReport(report.id);
      setDetailContent(full.data?.content ?? '');
    } catch {
      setDetailContent('내용을 불러올 수 없습니다.');
    } finally {
      setDetailLoading(false);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div>
      <div style={s.pageHeader}>
        <div>
          <div style={s.breadcrumb}>나만의 AI › 리포트 아카이브</div>
          <div style={s.title}>📋 리포트 아카이브</div>
          <div style={s.sub}>총 {total}개의 AI 리포트</div>
        </div>
      </div>

      {/* 모듈 필터 */}
      <div style={s.tabRow}>
        {ALL_MODULES.map(mod => {
          const meta = MODULE_META[mod];
          return (
            <button
              key={mod}
              style={{ ...s.tab, ...(moduleFilter === mod ? s.tabActive : {}) }}
              onClick={() => changeModule(mod)}
            >
              {meta ? `${meta.icon} ${meta.label}` : '전체'}
            </button>
          );
        })}
      </div>

      <div style={selected ? s.splitLayout : {}}>
        {/* 리포트 목록 */}
        <div style={selected ? s.listPanel : {}}>
          {loading ? (
            <div style={s.center}>불러오는 중...</div>
          ) : error ? (
            <div style={s.center} onClick={() => load(moduleFilter, offset)} role="button">⚠ {error} — 다시 시도</div>
          ) : reports.length === 0 ? (
            <div style={s.emptyWrap}>
              <div style={s.emptyIcon}>📋</div>
              <div style={s.emptyText}>아직 생성된 리포트가 없습니다</div>
              <div style={s.emptySub}>각 모듈 페이지에서 AI 리포트를 생성해보세요.</div>
            </div>
          ) : (
            <>
              <div style={s.reportList}>
                {reports.map(r => {
                  const meta = MODULE_META[r.module_key];
                  const typeC = TYPE_COLORS[r.report_type] ?? TYPE_COLORS.monthly;
                  const isActive = selected?.id === r.id;
                  return (
                    <div
                      key={r.id}
                      style={{ ...s.reportItem, ...(isActive ? s.reportItemActive : {}) }}
                      onClick={() => openDetail(r)}
                    >
                      <div style={{ ...s.reportDot, background: meta?.dot ?? '#9490C0' }} />
                      <div style={s.reportMeta}>
                        <div style={s.reportTitle}>{r.title}</div>
                        <div style={s.reportSub}>
                          <span style={s.moduleLabel}>{meta?.icon} {meta?.label ?? r.module_key}</span>
                          <span style={{ ...s.typeBadge, color: typeC.color, background: typeC.bg }}>
                            {REPORT_TYPE_LABELS[r.report_type] ?? r.report_type}
                          </span>
                        </div>
                      </div>
                      <div style={s.reportTime}>{timeAgo(r.generated_at)}</div>
                      <div style={{ ...s.reportArrow, color: isActive ? '#534AB7' : '#C0BDDA' }}>›</div>
                    </div>
                  );
                })}
              </div>

              {/* 페이지네이션 */}
              {totalPages > 1 && (
                <div style={s.pagination}>
                  <span
                    style={{ ...s.pageBtn, opacity: currentPage === 1 ? 0.3 : 1 }}
                    onClick={() => { if (currentPage > 1) setOffset(offset - PAGE_SIZE); }}
                  >‹ 이전</span>
                  <span style={s.pageInfo}>{currentPage} / {totalPages}</span>
                  <span
                    style={{ ...s.pageBtn, opacity: currentPage === totalPages ? 0.3 : 1 }}
                    onClick={() => { if (currentPage < totalPages) setOffset(offset + PAGE_SIZE); }}
                  >다음 ›</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* 상세 패널 */}
        {selected && (
          <div style={s.detailPanel}>
            <div style={s.detailHeader}>
              <div>
                <div style={s.detailModule}>
                  {MODULE_META[selected.module_key]?.icon} {MODULE_META[selected.module_key]?.label ?? selected.module_key}
                  {' · '}
                  <span style={{ ...s.typeBadge, ...TYPE_COLORS[selected.report_type] }}>
                    {REPORT_TYPE_LABELS[selected.report_type]}
                  </span>
                </div>
                <div style={s.detailTitle}>{selected.title}</div>
                <div style={s.detailDate}>{new Date(selected.generated_at).toLocaleString('ko-KR')}</div>
              </div>
              <span style={s.detailClose} onClick={() => { setSelected(null); setDetailContent(''); }}>×</span>
            </div>
            <div style={s.detailContent}>
              {detailLoading ? '불러오는 중...' : detailContent}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  center:          { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#9490C0', fontSize: 14, cursor: 'pointer' },
  pageHeader:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  breadcrumb:      { fontSize: 12, color: '#9490C0', marginBottom: 4 },
  title:           { fontSize: 18, fontWeight: 600, color: '#1A1830' },
  sub:             { fontSize: 12, color: '#9490C0', marginTop: 2 },
  tabRow:          { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' as const },
  tab:             { fontSize: 12, padding: '6px 13px', borderRadius: 20, border: '1px solid rgba(83,74,183,0.15)', background: '#fff', color: '#4A4870', cursor: 'pointer' },
  tabActive:       { background: '#534AB7', color: '#fff', borderColor: '#534AB7', fontWeight: 600 },
  splitLayout:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' },
  listPanel:       {},
  reportList:      { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  reportItem:      { display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', background: '#fff', border: '1px solid rgba(83,74,183,0.08)', borderRadius: 12, cursor: 'pointer', boxShadow: '0 1px 4px rgba(83,74,183,0.04)' },
  reportItemActive:{ borderColor: '#534AB7', background: '#FAFAFE', boxShadow: '0 0 0 2px rgba(83,74,183,0.15)' },
  reportDot:       { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  reportMeta:      { flex: 1, minWidth: 0 },
  reportTitle:     { fontSize: 13, fontWeight: 500, color: '#1A1830', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  reportSub:       { display: 'flex', alignItems: 'center', gap: 6 },
  moduleLabel:     { fontSize: 11, color: '#9490C0' },
  typeBadge:       { fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 600 },
  reportTime:      { fontSize: 11, color: '#9490C0', flexShrink: 0 },
  reportArrow:     { fontSize: 14, flexShrink: 0 },
  pagination:      { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 16 },
  pageBtn:         { fontSize: 12, color: '#534AB7', cursor: 'pointer', padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(83,74,183,0.2)', background: '#fff' },
  pageInfo:        { fontSize: 12, color: '#9490C0' },
  emptyWrap:       { textAlign: 'center' as const, padding: '48px 0' },
  emptyIcon:       { fontSize: 36, marginBottom: 12 },
  emptyText:       { fontSize: 14, fontWeight: 500, color: '#4A4870', marginBottom: 6 },
  emptySub:        { fontSize: 12, color: '#9490C0' },
  detailPanel:     { background: '#fff', border: '1px solid rgba(83,74,183,0.1)', borderRadius: 14, padding: '20px', position: 'sticky' as const, top: 72 },
  detailHeader:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid rgba(83,74,183,0.08)' },
  detailModule:    { fontSize: 12, color: '#9490C0', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 },
  detailTitle:     { fontSize: 14, fontWeight: 600, color: '#1A1830', lineHeight: 1.4, marginBottom: 4 },
  detailDate:      { fontSize: 11, color: '#9490C0' },
  detailClose:     { fontSize: 18, color: '#9490C0', cursor: 'pointer', lineHeight: 1, flexShrink: 0, padding: '0 4px' },
  detailContent:   { fontSize: 13, lineHeight: 1.85, color: '#4A4870', whiteSpace: 'pre-wrap' as const, maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' as const },
};
