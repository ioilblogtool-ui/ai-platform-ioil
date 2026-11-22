// 내보내기 기준 표기 (Sprint 6 Step 4 · Q12·Q15). README·Ask AI·Mermaid가 같이 쓴다.
// basis: { source: 'draft', revision, latestLabel? } | { source: 'version', label, publishedAt }
// 출력에는 버전 UUID를 넣지 않는다 (라벨·날짜만).

const day = (iso) => String(iso ?? '').slice(0, 10);

/** 본문 "> 기준: …"에 쓰는 문장 */
function basisText(basis) {
  if (basis.source === 'version') return `${basis.label} (발행 ${day(basis.publishedAt)}, 요구사항·개요는 발행 당시 값)`;
  return basis.latestLabel
    ? `Draft rev ${basis.revision} (발행 전 작업본 · 최신 발행본 ${basis.latestLabel})`
    : `Draft rev ${basis.revision} (발행 버전 없음)`;
}

/** 헤더 주석·짧은 표기 */
function basisShort(basis) {
  return basis.source === 'version' ? `${basis.label} (발행 ${day(basis.publishedAt)})` : `Draft rev ${basis.revision}`;
}

/** 파일 이름 조각: draft-rev7 / v1.1 */
function basisFileTag(basis) {
  if (basis.source === 'version') return String(basis.label).trim().replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40) || 'version';
  return `draft-rev${basis.revision}`;
}

/** 출력 JSON에 넣는 기준 (UUID 없음) */
function basisJson(basis) {
  return basis.source === 'version'
    ? { source: 'version', label: basis.label, publishedAt: day(basis.publishedAt) }
    : { source: 'draft', revision: basis.revision };
}

/** 스냅샷 { uuid: { code, kind, … } } → normalize가 받는 요구사항 목록 */
function snapshotRequirements(snapshot) {
  return Object.entries(snapshot ?? {}).map(([id, r]) => ({ id, status: 'active', ...r }));
}

module.exports = { basisText, basisShort, basisFileTag, basisJson, snapshotRequirements };
