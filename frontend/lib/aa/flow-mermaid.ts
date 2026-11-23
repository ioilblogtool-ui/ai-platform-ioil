// API Flow Mermaid 변환 (Sprint 8 · 03 §2.2 Mermaid 저장 계약 · 04 §6.11). React·런타임 import 없음 — node --test로 검증한다.
//
// 저장: 본문의 participant id = componentId. 편집기: 참여 순서의 별칭 C1…Cn. 변환은 **식별자 위치에만**:
//   participant/actor 선언, 메시지 양 끝(A->>B, -->>, ->, -->, -x, --x, -), --), <<->>, <<-->>, 활성 +/-),
//   Note over/left of/right of, activate/deactivate.
// 메시지 본문·alt/else/opt/loop 문구는 건드리지 않는다.
import type { ApiFlow, ArchitectureModel } from './architecture-types';

const ID = '[A-Za-z0-9_]+';
const ARROW = '(?:<<-->>|<<->>|-->>|->>|-->|->|--x|-x|--\\)|-\\))';
const RE = {
  // 후속 수정(Sprint 8): create participant/actor와 participant X@{ … } 메타데이터도 선언으로 본다
  // (편집기 변환은 메타데이터를 보존, 렌더·내보내기는 버린다)
  decl: new RegExp(`^(\\s*)((?:create\\s+)?(?:participant|actor))(\\s+)(${ID})(@\\{[^}]*\\})?(\\s+as\\s+.*)?\\s*$`),
  msg: new RegExp(`^(\\s*)(${ID})(\\s*${ARROW}\\s*[+-]?\\s*)(${ID})(\\s*:.*)?$`),
  note: new RegExp(`^(\\s*)(note\\s+(?:over|left of|right of)\\s+)(${ID})(\\s*,\\s*)?(${ID})?(\\s*:.*)?$`, 'i'),
  act: new RegExp(`^(\\s*)(activate|deactivate|destroy)(\\s+)(${ID})\\s*$`, 'i'),
};

/** 한 줄의 식별자 위치를 map으로 바꾼다. 모든 식별자를 onId에도 알린다 */
function mapLine(line: string, map: (id: string) => string, onId?: (id: string) => void): string {
  const f = (id: string) => { onId?.(id); return map(id); };
  let m = RE.decl.exec(line);
  if (m) return `${m[1]}${m[2]}${m[3]}${f(m[4])}${m[5] ?? ''}${m[6] ?? ''}`;
  m = RE.msg.exec(line);
  if (m) return `${m[1]}${f(m[2])}${m[3]}${f(m[4])}${m[5] ?? ''}`;
  m = RE.note.exec(line);
  if (m) return `${m[1]}${m[2]}${f(m[3])}${m[4] ?? ''}${m[5] ? f(m[5]) : ''}${m[6] ?? ''}`;
  m = RE.act.exec(line);
  if (m) return `${m[1]}${m[2]}${m[3]}${f(m[4])}`;
  return line;
}

const mapBody = (body: string, map: (id: string) => string, onId?: (id: string) => void) =>
  body.split('\n').map((line) => mapLine(line, map, onId)).join('\n');

/** 저장 본문 → 편집기 본문 (componentId → C1…Cn) */
export function toEditorText(body: string, participantIds: string[]): string {
  const alias = new Map(participantIds.map((cid, i) => [cid, `C${i + 1}`]));
  return mapBody(body, (id) => alias.get(id) ?? id);
}

/** 편집기 본문 → 저장 본문 (C1…Cn → componentId). 범위 밖 별칭은 그대로 둔다(불일치로 표시됨) */
export function fromEditorText(text: string, participantIds: string[]): string {
  return mapBody(text, (id) => {
    const m = /^C(\d+)$/.exec(id);
    const cid = m ? participantIds[Number(m[1]) - 1] : undefined;
    return cid ?? id;
  });
}

/** 본문에서 쓴 식별자 중 참여 목록 밖의 것 (편집기 기준이면 별칭으로 판단) */
export function unknownIdentifiers(body: string, participantIds: string[], mode: 'stored' | 'editor' = 'stored'): string[] {
  const allowed = new Set(mode === 'stored' ? participantIds : participantIds.map((_, i) => `C${i + 1}`));
  const unknown = new Set<string>();
  mapBody(body, (id) => id, (id) => { if (!allowed.has(id)) unknown.add(id); });
  return [...unknown];
}

/** 렌더 전에 지울 것: 설정 지시문 %%{…}%%, 머리 frontmatter(---…---), click·link·links·href·callback 줄 */
export function sanitizeBody(body: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  let text = body.replace(/\r\n/g, '\n');
  const fm = /^\s*---\n[\s\S]*?\n---\s*(\n|$)/.exec(text);
  if (fm) { removed.push('frontmatter 설정'); text = text.slice(fm[0].length); }
  text = text.replace(/%%\{[\s\S]*?\}%%/g, () => { removed.push('%%{init}%% 지시문'); return ''; });
  text = text.split('\n').filter((line) => {
    if (/^\s*(click|links?|href|callback)\b/i.test(line)) { removed.push(line.trim().split(/\s+/)[0]); return false; }
    return true;
  }).join('\n');
  return { text, removed: [...new Set(removed)] };
}

/** Mermaid 라벨에 안전하게 — 구문 문자와 꺾쇠를 엔티티로 */
export function encodeLabel(value: string): string {
  // 한 번에 바꾼다 — 순서대로 바꾸면 앞에서 만든 엔티티의 ;까지 다시 바뀐다
  const ENTITY: Record<string, string> = { '#': '#35;', ';': '#59;', '"': '#quot;', '<': '#lt;', '>': '#gt;', ':': '#58;' };
  return value.replace(/[#;"<>:]/g, (ch) => ENTITY[ch]).replace(/[\r\n]+/g, ' ').trim();
}

export type AuthRole = 'tokenIssuer' | 'tokenVerifier' | 'dataAccessor';
export const AUTH_ICON: Record<AuthRole, string> = { tokenIssuer: '🔑', tokenVerifier: '🛡', dataAccessor: '⛁' };
export const AUTH_LABEL: Record<AuthRole, string> = { tokenIssuer: '토큰 발급', tokenVerifier: '토큰 검증', dataAccessor: 'DB 접근' };

/**
 * 렌더용 Mermaid. 선언은 `participant <id> as <이름>`(역할 아이콘 접두)으로 바꾸고, 선언이 없는 참여는 맨 위에 순서대로 넣는다.
 * 참여 밖 식별자는 "⚠ 알 수 없음"으로 선언한다. name은 표시 이름 (README는 컴포넌트 이름, Ask AI는 별칭을 넘길 수 있다)
 */
export function renderSource(flow: ApiFlow, model: Pick<ArchitectureModel, 'components'>, opts: { idFor?: (cid: string, i: number) => string; nameFor?: (cid: string) => string } = {}):
  { source: string; removed: string[]; unknown: string[] } {
  const { text, removed } = sanitizeBody(flow.mermaid ?? '');
  const parts = flow.participantIds;
  const idFor = opts.idFor ?? ((cid: string) => cid);
  const roleOf = (cid: string) => (Object.keys(AUTH_ICON) as AuthRole[]).filter((r) => flow.auth?.[r] === cid).map((r) => AUTH_ICON[r]).join('');
  const nameOf = (cid: string) => {
    const index = parts.indexOf(cid);
    if (index < 0) return '⚠ 알 수 없음';
    const name = opts.nameFor ? opts.nameFor(cid) : model.components[cid]?.name ?? '(삭제된 컴포넌트)';
    const role = roleOf(cid);
    return encodeLabel(role ? `${role} ${name}` : name);
  };
  const declared = new Set<string>();
  const unknown = new Set<string>();
  const outId = (cid: string) => { const i = parts.indexOf(cid); return i >= 0 ? idFor(cid, i) : `X_${cid.replace(/[^A-Za-z0-9_]/g, '')}`; };
  const lines = text.split('\n');
  const body: string[] = [];
  let header = 'sequenceDiagram';
  for (const raw of lines) {
    if (/^\s*sequenceDiagram\s*$/.test(raw)) continue;
    const d = RE.decl.exec(raw);
    if (d) {
      const cid = d[4];
      if (parts.indexOf(cid) < 0) unknown.add(cid);
      if (declared.has(cid)) continue;
      declared.add(cid);
      body.push(`${d[1]}${d[2]} ${outId(cid)} as ${nameOf(cid)}`);
      continue;
    }
    body.push(mapLine(raw, outId, (id) => { if (parts.indexOf(id) < 0) unknown.add(id); }));
  }
  // 선언 없이 쓴 참여·알 수 없는 식별자도 선언 (참여 순서 먼저)
  const extra: string[] = [];
  for (const cid of parts) if (!declared.has(cid)) extra.push(`  participant ${outId(cid)} as ${nameOf(cid)}`);
  for (const id of unknown) if (!declared.has(id)) extra.push(`  participant ${outId(id)} as ${nameOf(id)}`);
  if (/^\s*$/.test(body.join(''))) header = 'sequenceDiagram';
  return { source: [header, ...extra, ...body].join('\n'), removed, unknown: [...unknown] };
}

/** 새 흐름의 본문 템플릿: 참여 순서대로 첫 요청 + alt 성공/else 실패 */
export function templateBody(participantIds: string[], outcomes: { kind: string; label: string }[]): string {
  const [a, b] = participantIds;
  const ok = outcomes.find((o) => o.kind === 'success')?.label ?? '200 OK';
  const fail = outcomes.find((o) => o.kind === 'failure')?.label;
  const lines = ['sequenceDiagram', ...participantIds.map((cid) => `  participant ${cid}`)];
  if (a && b) {
    lines.push(`  ${a}->>${b}: 요청`);
    if (fail) lines.push('  alt 성공', `    ${b}-->>${a}: ${ok}`, '  else 실패', `    ${b}-->>${a}: ${fail}`, '  end');
    else lines.push(`  ${b}-->>${a}: ${ok}`);
  }
  return lines.join('\n');
}
