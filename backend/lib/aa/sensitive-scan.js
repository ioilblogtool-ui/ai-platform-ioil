// 민감정보 검사 — Sprint 1 최소판 (V12: 키·토큰·PEM은 저장 자체를 거부).
// Phase 2에서 IP·내부 도메인·이메일 규칙(확인 후 진행)을 추가한다 (06 §6).
const BLOCK_RULES = [
  { rule: 'aws_key',        re: /AKIA[0-9A-Z]{16}/ },
  { rule: 'generic_secret', re: /\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|xox[bp]-[A-Za-z0-9-]{10,}|sb_secret_[A-Za-z0-9_-]{10,})/ },
  { rule: 'jwt',            re: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  { rule: 'pem',            re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

function mask(s) {
  const t = String(s);
  return t.length <= 6 ? '****' : t.slice(0, 4) + '****';
}

// 객체 안의 모든 문자열 값을 검사해 [{ rule, path, sample }] 반환. sample은 마스킹된 값.
function scanForSecrets(value, basePath = '') {
  const hits = [];
  const walk = (v, path) => {
    if (typeof v === 'string') {
      for (const { rule, re } of BLOCK_RULES) {
        const m = v.match(re);
        if (m) hits.push({ rule, path: path || '(root)', sample: mask(m[0]) });
      }
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, `${path}[${i}]`));
    } else if (v && typeof v === 'object') {
      for (const [k, item] of Object.entries(v)) walk(item, path ? `${path}.${k}` : k);
    }
  };
  walk(value, basePath);
  return hits;
}

module.exports = { scanForSecrets };
