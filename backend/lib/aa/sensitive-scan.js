// 민감정보 검사 (06 §6).
// - scanForSecrets: V12 — 키·토큰·PEM은 Draft·개요·요구사항 저장 자체를 거부한다.
// - scanForExport: 내보내기 출력 전체 — 차단(V12와 같은 규칙) + 경고(IP·내부 도메인·이메일, 확인 후 진행).
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

// 내보내기 경고 규칙 (Sprint 4, 05 §7.6 · EXP-07): 확인하면 진행할 수 있다. Draft 저장(V12)에는 쓰지 않는다.
const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const WARN_RULES = [
  { rule: 'ip_address',      re: new RegExp(`(?<![\\d.])${OCTET}(?:\\.${OCTET}){3}(?![\\d.])`, 'g') },
  { rule: 'internal_domain', re: /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:internal|local|corp|lan)\b/gi },
  { rule: 'email',           re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g },
];
// 설정 예시에서 흔하고 외부에 의미가 없는 주소는 경고하지 않는다
const IGNORED_IPS = new Set(['0.0.0.0', '127.0.0.1']);

function walkStrings(value, basePath, visit) {
  const walk = (v, path) => {
    if (typeof v === 'string') visit(v, path || '(root)');
    else if (Array.isArray(v)) v.forEach((item, i) => walk(item, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, item] of Object.entries(v)) walk(item, path ? `${path}.${k}` : k);
  };
  walk(value, basePath);
}

// 객체 안의 모든 문자열 값을 검사해 [{ rule, path, sample }] 반환. sample은 마스킹된 값.
function scanForSecrets(value, basePath = '') {
  const hits = [];
  walkStrings(value, basePath, (text, path) => {
    for (const { rule, re } of BLOCK_RULES) {
      const m = text.match(re);
      if (m) hits.push({ rule, path, sample: mask(m[0]) });
    }
  });
  return hits;
}

/**
 * 내보내기 출력 검사. blocks는 확인과 무관하게 거부(V12와 같은 규칙), warnings는 사용자 확인 후 진행.
 * 같은 위치에서 같은 값은 한 번만 보고한다. 원문은 돌려주지 않고 마스킹 샘플만 준다.
 * @returns {{ blocks: {rule,path,sample}[], warnings: {rule,path,sample}[] }}
 */
function scanForExport(value, basePath = '') {
  const blocks = scanForSecrets(value, basePath);
  const warnings = [];
  const seen = new Set();
  walkStrings(value, basePath, (text, path) => {
    for (const { rule, re } of WARN_RULES) {
      for (const m of text.matchAll(re)) {
        if (rule === 'ip_address' && IGNORED_IPS.has(m[0])) continue;
        const id = `${rule}|${path}|${m[0]}`;
        if (seen.has(id)) continue;
        seen.add(id);
        warnings.push({ rule, path, sample: mask(m[0]) });
      }
    }
  });
  return { blocks, warnings };
}

module.exports = { scanForSecrets, scanForExport };
