// 내보내기 민감정보 경고 확인 기록 (Sprint 4 Q3, 05 §7.6 "민감정보 검사 범위와 확인 절차").
// 서버 메모리에 10분 보관, 최대 500건. Railway 단일 인스턴스 전제 — 여러 인스턴스로 늘리면 서명 토큰으로 교체한다.
// 확인 ID는 (사용자, 프로젝트, revision, sections, 출력 해시)에 묶인다. 하나라도 다르면 확인이 무효다.
const crypto = require('node:crypto');

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 500;

/** 출력 본문의 SHA-256. 생성 시각 꼬리말은 호출하는 쪽에서 빼고 넘긴다 */
function contentHash(body) {
  return crypto.createHash('sha256').update(String(body), 'utf8').digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  }
  return value;
}

function bindingKey({ userId, projectId, revision, sections, contentHash: hash }) {
  return JSON.stringify(canonical({ userId, projectId, revision, sections: sections ?? {}, hash }));
}

function createScanStore({ ttlMs = TTL_MS, max = MAX_ENTRIES, now = Date.now } = {}) {
  const entries = new Map();   // scanId → { key, expiresAt } (Map은 넣은 순서를 지킨다)

  function prune() {
    const t = now();
    for (const [id, entry] of entries) if (entry.expiresAt <= t) entries.delete(id);
    while (entries.size > max) entries.delete(entries.keys().next().value);
  }

  return {
    /** 경고를 사용자에게 보여줄 때 발급한다 */
    issue(binding) {
      prune();
      const id = `scn_${crypto.randomBytes(12).toString('hex')}`;
      entries.set(id, { key: bindingKey(binding), expiresAt: now() + ttlMs });
      prune();
      return id;
    },
    /** 사용자가 확인하고 다시 요청했을 때: 새로 만든 출력의 binding과 같아야 통과 */
    verify(scanId, binding) {
      if (typeof scanId !== 'string') return false;
      prune();
      const entry = entries.get(scanId);
      return Boolean(entry && entry.key === bindingKey(binding));
    },
    size() {
      prune();
      return entries.size;
    },
  };
}

module.exports = { createScanStore, contentHash, TTL_MS, MAX_ENTRIES };
