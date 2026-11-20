// Logical View → Mermaid flowchart (EXP-01, Sprint 4 Step 1). 입력은 normalize.js 결과.
// Logical에 그려진 컴포넌트와 그 사이 관계만 넣는다. 그룹은 subgraph(중첩 유지).
// 노드 ID는 정규화 순번(c1…)이라 내부 ID가 드러나지 않는다.

// Mermaid 라벨 안에서 문제가 되는 문자를 엔티티·대체 문자로 바꾼다
function label(text) {
  return String(text ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/"/g, '#quot;')
    .replace(/[<>]/g, (ch) => (ch === '<' ? '#lt;' : '#gt;'))
    .trim() || ' ';
}

function edgeLabel(text) {
  return label(text).replace(/\|/g, '/');
}

function nodeLine(c) {
  const text = label(c.name);
  return c.type === 'database' ? `${c.ref}[("${text}")]` : `${c.ref}["${text}"]`;
}

/**
 * @param {ReturnType<import('./normalize').normalizeModel>} normalized
 * @param {{ direction?: 'LR' | 'TD' }} [options]
 */
function toMermaidFlowchart(normalized, options = {}) {
  const components = normalized.components.filter((c) => c.inLogical);
  const refs = new Set(components.map((c) => c.ref));
  const lines = [`flowchart ${options.direction ?? 'LR'}`];

  const childrenOf = new Map();
  for (const g of normalized.groups) {
    const key = g.parent ?? null;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key).push(g);
  }
  const membersOf = (groupRef) => components.filter((c) => (c.groupRef ?? null) === groupRef);

  const writeGroup = (g, depth) => {
    const pad = '  '.repeat(depth);
    lines.push(`${pad}subgraph ${g.ref} ["${label(g.label)}"]`);
    for (const child of childrenOf.get(g.ref) ?? []) writeGroup(child, depth + 1);
    for (const c of membersOf(g.ref)) lines.push(`${pad}  ${nodeLine(c)}`);
    lines.push(`${pad}end`);
  };
  for (const g of childrenOf.get(null) ?? []) writeGroup(g, 1);
  for (const c of membersOf(null)) lines.push(`  ${nodeLine(c)}`);

  for (const r of normalized.relations) {
    if (!refs.has(r.from) || !refs.has(r.to)) continue;
    const arrow = r.mode === 'async' ? '-.->' : '-->';
    const text = r.protocol || r.label;
    lines.push(text ? `  ${r.from} ${arrow}|${edgeLabel(text)}| ${r.to}` : `  ${r.from} ${arrow} ${r.to}`);
  }
  return `${lines.join('\n')}\n`;
}

module.exports = { toMermaidFlowchart };
