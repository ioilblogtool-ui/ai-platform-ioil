// Mermaid flowchart 가져오기 파서 (Sprint 4 Step 2 · IMP-01~04 · 05 "Mermaid flowchart 가져오기").
// 브라우저에서만 돈다. 서버 호출·Draft 변경 없음. React·네트워크·다른 lib 모듈 런타임 import 없음
// (node --test가 확장자 없는 .ts import를 풀지 못한다 — 아래 두 상수는 테스트가 원본과 같은지 확인한다).
//
// 지원 범위(PRD IMP-02, 실행계획 v0.2): flowchart/graph + TD·TB·LR, 노드 A[..] A([..]) A[(..)] A((..)),
// 연결 --> --- -.-> ==> 와 -->|라벨|, 한 줄 체인, subgraph 1단계. 그 밖은 줄 번호와 함께 경고하고 그 줄을 무시한다.
import type { TypeRegistry } from '../architecture-types';

/** model-ops.ts PROTOCOLS와 같아야 한다 (테스트로 확인) */
export const IMPORT_PROTOCOLS = ['HTTP', 'HTTPS', 'gRPC', 'TCP', 'AMQP', 'Kafka', 'JDBC', 'RESP', 'Other'] as const;
/** draft-backup.ts secretPatterns(=V12 차단 규칙)와 같아야 한다 (테스트로 확인) */
export const IMPORT_SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/,
  /\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|xox[bp]-[A-Za-z0-9-]{10,}|sb_secret_[A-Za-z0-9_-]{10,})/,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

export const MAX_LINES = 300;
export const MAX_NODES = 200;

export type Shape = 'box' | 'stadium' | 'cylinder' | 'circle';
export type Confidence = 'high' | 'medium' | 'low';
export type ImportNode = {
  mermaidId: string; label: string; shape: Shape;
  inferredType: string; confidence: Confidence;
  matchExistingComponentId?: string;   // Step 3에서 채운다
};
export type ImportEdge = { from: string; to: string; mode: 'sync' | 'async'; protocol?: string; label?: string };
export type ImportGroup = { id: string; label: string; members: string[] };
export type ImportWarning = { line: number; text: string; reason: string };
export type ImportResult = {
  direction: 'TB' | 'LR';
  nodes: ImportNode[]; edges: ImportEdge[]; groups: ImportGroup[]; warnings: ImportWarning[];
};
export type ImportError = { error: 'empty' | 'no_header' | 'too_many_lines' | 'too_many_nodes' | 'secret'; message: string; line?: number };

const ID_RE = /^[\p{L}\p{N}_][\p{L}\p{N}_]*/u;
// 노드 자리에서는 "Reports API"처럼 공백으로 이어진 단어도 이름 하나로 읽는다 (P2-8 예시).
// 표준 Mermaid는 허용하지 않지만 문서에서 흔히 쓰는 표기라 너그럽게 받는다. 공백은 하나로 줄인다
const NODE_ID_RE = /^[\p{L}\p{N}_]+(?:[ \t]+[\p{L}\p{N}_]+)*/u;
const ARROWS: { token: string; mode: 'sync' | 'async' }[] = [
  { token: '-.->', mode: 'async' }, { token: '-.-', mode: 'async' },
  { token: '-->', mode: 'sync' }, { token: '---', mode: 'sync' },
  { token: '==>', mode: 'sync' }, { token: '===', mode: 'sync' },
];
const SHAPES: { open: string; close: string; shape: Shape }[] = [
  { open: '((', close: '))', shape: 'circle' },
  { open: '([', close: '])', shape: 'stadium' },
  { open: '[(', close: ')]', shape: 'cylinder' },
  { open: '[', close: ']', shape: 'box' },
];
const IGNORED_KEYWORDS = /^(classDef|class|style|click|linkStyle)\b/;

function decode(text: string) {
  return text.replace(/#quot;/g, '"').replace(/#lt;/g, '<').replace(/#gt;/g, '>').replace(/#amp;/g, '&').trim();
}

class LineError extends Error {}

type Token = { id: string; label?: string; shape?: Shape };

/** 노드 하나를 읽는다. 지원하지 않는 모양이면 LineError */
function readNode(src: string, pos: number): { token: Token; pos: number } {
  const rest = src.slice(pos);
  const raw = rest.match(NODE_ID_RE)?.[0];
  if (!raw) throw new LineError('노드 ID를 읽을 수 없습니다');
  const id = raw.replace(/[ \t]+/g, ' ');
  let p = pos + raw.length;
  const after = src.slice(p);
  if (/^[{(>]/.test(after) && !after.startsWith('((') && !after.startsWith('([')) {
    throw new LineError('지원하지 않는 노드 모양입니다 (지원: [..] ([..]) [(..)] ((..)))');
  }
  for (const s of SHAPES) {
    if (!after.startsWith(s.open)) continue;
    p += s.open.length;
    let label: string;
    if (src[p] === '"') {
      const endQuote = src.indexOf('"', p + 1);
      if (endQuote < 0) throw new LineError('닫는 따옴표가 없습니다');
      label = src.slice(p + 1, endQuote);
      p = endQuote + 1;
      if (!src.startsWith(s.close, p)) throw new LineError(`닫는 기호 ${s.close}가 없습니다`);
    } else {
      const end = src.indexOf(s.close, p);
      if (end < 0) throw new LineError(`닫는 기호 ${s.close}가 없습니다`);
      label = src.slice(p, end);
      p = end;
    }
    p += s.close.length;
    return { token: { id, label: decode(label), shape: s.shape }, pos: p };
  }
  return { token: { id }, pos: p };
}

/** 연결 하나를 읽는다. 연결이 없으면 null */
function readArrow(src: string, pos: number): { mode: 'sync' | 'async'; label?: string; pos: number } | null {
  let p = pos;
  while (src[p] === ' ' || src[p] === '\t') p++;
  const rest = src.slice(p);
  if (/^(--|==|-\.)\s+\S/.test(rest) && !ARROWS.some((a) => rest.startsWith(a.token))) {
    throw new LineError('"-- 라벨 -->" 표기는 아직 지원하지 않습니다. "-->|라벨|"을 쓰세요');
  }
  const arrow = ARROWS.find((a) => rest.startsWith(a.token));
  if (!arrow) return null;
  p += arrow.token.length;
  // 화살표 뒤에 남는 '-', '>'(예: --->)는 길이 변형으로 보고 건너뛴다
  while (src[p] === '-' || src[p] === '>' || src[p] === '=') p++;
  let label: string | undefined;
  if (src[p] === '|') {
    const end = src.indexOf('|', p + 1);
    if (end < 0) throw new LineError('연결 라벨의 닫는 | 가 없습니다');
    label = decode(src.slice(p + 1, end)) || undefined;
    p = end + 1;
  }
  while (src[p] === ' ' || src[p] === '\t') p++;
  return { mode: arrow.mode, label, pos: p };
}

/** 한 문장: 노드 정의 또는 연결 체인. 전부 읽혀야 반영한다 */
function parseStatement(src: string) {
  if (src.includes('&')) throw new LineError('"&"로 여러 노드를 한 번에 잇는 표기는 아직 지원하지 않습니다');
  const tokens: Token[] = [];
  const links: { mode: 'sync' | 'async'; label?: string }[] = [];
  let { token, pos } = readNode(src, 0);
  tokens.push(token);
  for (;;) {
    while (src[pos] === ' ' || src[pos] === '\t') pos++;
    if (pos >= src.length) break;
    const arrow = readArrow(src, pos);
    if (!arrow) throw new LineError('읽을 수 없는 문장입니다');
    ({ token, pos } = readNode(src, arrow.pos));
    tokens.push(token);
    links.push({ mode: arrow.mode, label: arrow.label });
  }
  return { tokens, links };
}

// ── 타입 추론 (IMP-03) ─────────────────────────────────────────
const words = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

function containsPhrase(haystack: string[], needle: string[]) {
  if (!needle.length || needle.length > haystack.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((w, j) => haystack[i + j] === w)) return true;
  }
  return false;
}

/** 이름·모양으로 타입 후보와 확신도. 레지스트리 aliases + 타입 key·label을 단어 단위로 비교한다 */
export function inferType(label: string, shape: Shape, registry: TypeRegistry | null): { type: string; confidence: Confidence } {
  if (shape === 'cylinder') return { type: 'database', confidence: 'high' };
  const labelWords = words(label);
  let best: { type: string; length: number; exact: boolean } | null = null;
  for (const [type, def] of Object.entries(registry?.types ?? {})) {
    if (def.nodeKind !== 'component') continue;
    for (const term of [type, def.label, ...(def.aliases ?? [])]) {
      const termWords = words(term);
      if (!containsPhrase(labelWords, termWords)) continue;
      const exact = termWords.length === labelWords.length;
      if (!best || termWords.length > best.length || (termWords.length === best.length && exact && !best.exact)) {
        best = { type, length: termWords.length, exact };
      }
    }
  }
  if (!best) return { type: 'service', confidence: 'low' };
  return { type: best.type, confidence: best.exact ? 'high' : 'medium' };
}

/** 연결 라벨이 지원 프로토콜 이름이면 protocol로, 아니면 label로 (IMP-04) */
export function splitEdgeLabel(label: string | undefined): { protocol?: string; label?: string } {
  if (!label) return {};
  const protocol = IMPORT_PROTOCOLS.find((p) => p.toLowerCase() === label.trim().toLowerCase());
  return protocol ? { protocol } : { label };
}

// ── 파서 본체 ──────────────────────────────────────────────────
export function parseMermaidFlowchart(text: string, registry: TypeRegistry | null): ImportResult | ImportError {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!lines.some((l) => l.trim())) return { error: 'empty', message: '붙여 넣은 내용이 없습니다.' };
  if (lines.length > MAX_LINES) return { error: 'too_many_lines', message: `최대 ${MAX_LINES}줄까지 가져올 수 있습니다 (현재 ${lines.length}줄).` };
  const secretLine = lines.findIndex((l) => IMPORT_SECRET_PATTERNS.some((re) => re.test(l)));
  if (secretLine >= 0) return { error: 'secret', line: secretLine + 1, message: `${secretLine + 1}번째 줄에 키·토큰으로 보이는 값이 있어 가져올 수 없습니다.` };

  const warnings: ImportWarning[] = [];
  const nodes = new Map<string, ImportNode & { group?: string; labelled: boolean }>();
  const edges: ImportEdge[] = [];
  const groups = new Map<string, ImportGroup>();
  const stack: (string | null)[] = [];   // 열린 subgraph. null = 2단계 이상(무시)
  let direction: 'TB' | 'LR' | null = null;
  let autoGroup = 0;

  const currentGroup = () => [...stack].reverse().find((g) => g !== null) ?? null;
  const touch = (token: Token) => {
    let node = nodes.get(token.id);
    if (!node) {
      node = { mermaidId: token.id, label: token.id, shape: 'box', inferredType: 'service', confidence: 'low', labelled: false };
      nodes.set(token.id, node);
    }
    if (token.label !== undefined && !node.labelled) {
      node.label = token.label || token.id;
      node.shape = token.shape ?? 'box';
      node.labelled = true;
    }
    const group = currentGroup();
    if (group && !node.group) node.group = group;
  };

  lines.forEach((raw, index) => {
    const lineNo = index + 1;
    const line = raw.trim().replace(/;\s*$/, '');
    if (!line || line.startsWith('%%')) return;
    const warn = (reason: string) => warnings.push({ line: lineNo, text: raw.trim(), reason });

    if (!direction) {
      const header = line.match(/^(flowchart|graph)(?:\s+(TD|TB|LR|RL|BT))?\s*$/i);
      if (!header) { warn('flowchart 또는 graph 머리말이 먼저 와야 합니다'); return; }
      const dir = (header[2] ?? 'TB').toUpperCase();
      if (dir === 'RL' || dir === 'BT') warn(`방향 ${dir}는 아직 지원하지 않아 ${dir === 'RL' ? 'LR' : 'TB'}로 배치합니다`);
      direction = dir === 'LR' || dir === 'RL' ? 'LR' : 'TB';
      return;
    }
    if (/^subgraph\b/i.test(line)) {
      if (stack.length >= 1) {
        stack.push(null);
        warn('subgraph 2단계 중첩은 아직 지원하지 않아 바깥 그룹에 넣습니다');
        return;
      }
      const rest = line.replace(/^subgraph\s*/i, '');
      let id: string, label: string;
      const bracket = rest.match(/^([\p{L}\p{N}_]+)\s*\[\s*(?:"([^"]*)"|([^\]]*))\s*\]$/u);
      const quoted = rest.match(/^"([^"]*)"$/);
      if (bracket) { id = bracket[1]; label = decode(bracket[2] ?? bracket[3] ?? bracket[1]); }
      else if (quoted) { id = `sg${++autoGroup}`; label = decode(quoted[1]); }
      else if (ID_RE.test(rest) && rest.match(ID_RE)![0] === rest) { id = rest; label = rest; }
      else if (rest) { id = `sg${++autoGroup}`; label = decode(rest); }
      else { id = `sg${++autoGroup}`; label = 'Boundary'; }
      if (groups.has(id)) id = `${id}_${++autoGroup}`;
      groups.set(id, { id, label: label || 'Boundary', members: [] });
      stack.push(id);
      return;
    }
    if (/^end$/i.test(line)) {
      if (!stack.length) warn('짝이 없는 end입니다');
      else stack.pop();
      return;
    }
    if (/^direction\b/i.test(line)) { warn('subgraph 안의 direction은 무시합니다'); return; }
    if (IGNORED_KEYWORDS.test(line)) { warn('스타일·클릭 구문은 가져오지 않습니다'); return; }

    try {
      const { tokens, links } = parseStatement(line);
      if (tokens.some((t) => groups.has(t.id))) throw new LineError('subgraph를 노드처럼 잇는 표기는 아직 지원하지 않습니다');
      tokens.forEach(touch);
      links.forEach((link, i) => {
        const from = tokens[i].id, to = tokens[i + 1].id;
        if (from === to) { warn(`자기 자신으로 가는 연결(${from})은 건너뜁니다`); return; }
        edges.push({ from, to, mode: link.mode, ...splitEdgeLabel(link.label) });
      });
    } catch (error) {
      if (error instanceof LineError) warn(error.message);
      else throw error;
    }
  });

  if (!direction) return { error: 'no_header', message: '첫 문장이 "flowchart LR"이나 "graph TD" 같은 머리말이어야 합니다.' };
  if (stack.length) warnings.push({ line: lines.length, text: '', reason: `닫히지 않은 subgraph가 ${stack.length}개 있습니다` });
  if (nodes.size > MAX_NODES) return { error: 'too_many_nodes', message: `최대 ${MAX_NODES}개 노드까지 가져올 수 있습니다 (현재 ${nodes.size}개).` };

  const out: ImportNode[] = [];
  for (const node of nodes.values()) {
    const { type, confidence } = inferType(node.label, node.shape, registry);
    out.push({ mermaidId: node.mermaidId, label: node.label, shape: node.shape, inferredType: type, confidence });
    if (node.group) groups.get(node.group)?.members.push(node.mermaidId);
  }
  return { direction, nodes: out, edges, groups: [...groups.values()], warnings };
}

export function isImportError(value: ImportResult | ImportError): value is ImportError {
  return 'error' in value;
}
