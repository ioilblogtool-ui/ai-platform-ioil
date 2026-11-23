// API Flow 내보내기 (Sprint 8 · 05 §7·§7.6 · Q10). 프론트 lib/aa/flow-mermaid.ts와 같은 규칙.
// 본문 participant id = componentId → 출력에서는 내부 id 대신 순번(README P1…) 또는 번들 별칭(Ask AI C1…)으로 바꾼다.
// 변환은 식별자 위치(선언·메시지 양 끝·Note·activate)에만, 설정 지시문·frontmatter·click/link 줄은 뺀다.
// 참여 목록 밖 식별자는 "(알 수 없는 참여자)"로 선언하고 경고 줄을 남긴다.

const ID = '[A-Za-z0-9_]+';
const ARROW = '(?:<<-->>|<<->>|-->>|->>|-->|->|--x|-x|--\\)|-\\))';
const RE = {
  // 후속 수정: create participant/actor와 participant X@{ … } 메타데이터도 선언 (메타데이터는 출력에서 버린다)
  decl: new RegExp(`^(\\s*)((?:create\\s+)?(?:participant|actor))(\\s+)(${ID})(@\\{[^}]*\\})?(\\s+as\\s+.*)?\\s*$`),
  msg: new RegExp(`^(\\s*)(${ID})(\\s*${ARROW}\\s*[+-]?\\s*)(${ID})(\\s*:.*)?$`),
  note: new RegExp(`^(\\s*)(note\\s+(?:over|left of|right of)\\s+)(${ID})(\\s*,\\s*)?(${ID})?(\\s*:.*)?$`, 'i'),
  act: new RegExp(`^(\\s*)(activate|deactivate|destroy)(\\s+)(${ID})\\s*$`, 'i'),
};
const AUTH_ICON = { tokenIssuer: '🔑', tokenVerifier: '🛡', dataAccessor: '⛁' };
const AUTH_LABEL = { tokenIssuer: '토큰 발급', tokenVerifier: '토큰 검증', dataAccessor: 'DB 접근' };
const CAUSE_LABEL = { auth: '인증', validation: '입력 검증', timeout: '타임아웃', dependency_down: '의존 서비스 장애', queue_retry: '큐 재처리', other: '기타' };

function mapLine(line, map, onId) {
  const f = (id) => { onId?.(id); return map(id); };
  let m = RE.decl.exec(line);
  if (m) return `${m[1]}${m[2]}${m[3]}${f(m[4])}${m[6] ?? ''}`;
  m = RE.msg.exec(line);
  if (m) return `${m[1]}${f(m[2])}${m[3]}${f(m[4])}${m[5] ?? ''}`;
  m = RE.note.exec(line);
  if (m) return `${m[1]}${m[2]}${f(m[3])}${m[4] ?? ''}${m[5] ? f(m[5]) : ''}${m[6] ?? ''}`;
  m = RE.act.exec(line);
  if (m) return `${m[1]}${m[2]}${m[3]}${f(m[4])}`;
  return line;
}

function sanitizeBody(body) {
  let text = String(body ?? '').replace(/\r\n/g, '\n');
  const fm = /^\s*---\n[\s\S]*?\n---\s*(\n|$)/.exec(text);
  if (fm) text = text.slice(fm[0].length);
  text = text.replace(/%%\{[\s\S]*?\}%%/g, '');
  return text.split('\n').filter((line) => !/^\s*(click|links?|href|callback)\b/i.test(line)).join('\n');
}

const ENTITY = { '#': '#35;', ';': '#59;', '"': '#quot;', '<': '#lt;', '>': '#gt;', ':': '#58;' };
const encodeLabel = (v) => String(v).replace(/[#;"<>:]/g, (ch) => ENTITY[ch]).replace(/[\r\n]+/g, ' ').trim();

/**
 * @param {object} flow ApiFlow
 * @param {object} model 컴포넌트 이름을 읽을 모델
 * @param {{ idFor: (cid: string, i: number) => string, nameFor?: (cid: string, i: number) => string }} opts
 * @returns {{ source: string, unknown: number }}
 */
function flowSequence(flow, model, opts) {
  const parts = flow.participantIds ?? [];
  const idFor = (cid) => { const i = parts.indexOf(cid); return i >= 0 ? opts.idFor(cid, i) : `X${unknownIds.indexOf(cid) + 1}`; };
  const unknownIds = [];
  const roleOf = (cid) => Object.keys(AUTH_ICON).filter((r) => flow.auth?.[r] === cid).map((r) => AUTH_ICON[r]).join('');
  const labelOf = (cid) => {
    const i = parts.indexOf(cid);
    if (i < 0) return '(알 수 없는 참여자)';
    const name = opts.nameFor ? opts.nameFor(cid, i) : model.components?.[cid]?.name ?? '(삭제된 컴포넌트)';
    const role = roleOf(cid);
    return encodeLabel(role ? `${role} ${name}` : name);
  };
  const note = (id) => { if (parts.indexOf(id) < 0 && !unknownIds.includes(id)) unknownIds.push(id); };
  const lines = sanitizeBody(flow.mermaid).split('\n');
  // 먼저 알 수 없는 식별자를 모은다 (X1… 번호가 선언 순서와 맞게)
  for (const raw of lines) mapLine(raw, (x) => x, note);
  const declared = new Set();
  const body = [];
  for (const raw of lines) {
    if (/^\s*sequenceDiagram\s*$/.test(raw)) continue;
    const d = RE.decl.exec(raw);
    if (d) {
      if (declared.has(d[4])) continue;
      declared.add(d[4]);
      body.push(`${d[1]}${d[2]} ${idFor(d[4])} as ${labelOf(d[4])}`);
      continue;
    }
    body.push(mapLine(raw, idFor));
  }
  const extra = [];
  for (const cid of parts) if (!declared.has(cid)) extra.push(`  participant ${idFor(cid)} as ${labelOf(cid)}`);
  for (const id of unknownIds) if (!declared.has(id)) extra.push(`  participant ${idFor(id)} as ${labelOf(id)}`);
  // 안전망: 어떤 문법으로든 남은 내부 id(cmp_·flw_·out_)는 내보내기에 남기지 않는다 — 참여면 출력 id, 아니면 X…
  const scrub = (text) => text.replace(/\b(?:cmp|flw|out)_[A-Za-z0-9_-]+\b/g, (id) => {
    if (parts.includes(id)) return idFor(id);
    if (!unknownIds.includes(id)) unknownIds.push(id);
    return `X${unknownIds.indexOf(id) + 1}`;
  });
  const lines2 = [...extra, ...body].map(scrub);
  return { source: ['sequenceDiagram', ...lines2].join('\n').trimEnd(), unknown: unknownIds.length };
}

/** 사람이 읽는 흐름 요약 줄 (README·Ask AI 공통). nameFor는 표시 이름 */
function flowSummaryLines(flow, { nameFor, reqCodes }) {
  const out = [];
  if (flow.endpoint) out.push(`- 엔드포인트: \`${flow.endpoint.method} ${flow.endpoint.path}\``);
  if (flow.description) out.push(`- 설명: ${String(flow.description).replace(/\r?\n/g, ' ')}`);
  out.push(`- 참여: ${(flow.participantIds ?? []).map((cid, i) => nameFor(cid, i)).join(' → ')}`);
  out.push(`- 결과: ${(flow.outcomes ?? []).map((o) => `${o.kind === 'success' ? '✓' : '✕'} ${o.label}${o.cause ? ` (${CAUSE_LABEL[o.cause] ?? o.cause})` : ''}`).join(' / ')}`);
  const roles = Object.keys(AUTH_LABEL).filter((r) => flow.auth?.[r]).map((r) => `${AUTH_ICON[r]} ${AUTH_LABEL[r]} ${nameFor(flow.auth[r], (flow.participantIds ?? []).indexOf(flow.auth[r]))}`);
  if (roles.length) out.push(`- 인증·데이터 경계: ${roles.join(' · ')}`);
  if (reqCodes.length) out.push(`- 요구사항: ${reqCodes.join(', ')}`);
  return out;
}

module.exports = { flowSequence, flowSummaryLines, sanitizeBody, encodeLabel, AUTH_LABEL, CAUSE_LABEL };
