// README "배포 구성"·"배포 전략" 구역 (Sprint 7 Step 3 · Q6 · DEP-03 · RDM-03).
// 배치안(deployment View)마다 Mermaid 구성도 + 구현 대상 표, 그리고 배포 전략 Markdown.
// 노드 ID는 이 출력 안에서만 쓰는 순번(d1…, z1…)이라 내부 ID가 드러나지 않는다. 노트는 넣지 않는다(D-31).
const REGISTRY = require('./type-registry.json');

const label = (text) => String(text ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '#quot;').replace(/[<>]/g, (ch) => (ch === '<' ? '#lt;' : '#gt;')).trim() || ' ';
const cell = (value) => String(value ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim() || '—';

const deploymentViews = (model) => (model?.views ?? []).filter((v) => v.kind === 'deployment');

/** 배치안 하나 → Mermaid flowchart. 컨테이너(구역·플랫폼·VM)·group은 subgraph, 나머지는 노드, calls 엣지만 */
function deploymentMermaid(model, view) {
  const comps = model.components ?? {};
  const nodes = view.nodes.filter((n) => n.kind !== 'note' && (n.kind === 'group' || comps[n.componentId]));
  const isBox = (n) => n.kind === 'group' || REGISTRY.types[comps[n.componentId]?.type]?.container;
  const ref = new Map();
  let boxes = 0, leaves = 0;
  for (const n of nodes) ref.set(n.id, isBox(n) ? `z${++boxes}` : `d${++leaves}`);
  const children = new Map();
  for (const n of nodes) {
    const key = n.parentId && ref.has(n.parentId) ? n.parentId : null;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(n);
  }
  const text = (n) => {
    if (n.kind === 'group') return n.label || 'Boundary';
    const c = comps[n.componentId];
    const typeLabel = REGISTRY.types[c.type]?.label ?? c.type;
    if (c.type === 'dep.zone') return `${c.name} (zone${c.properties?.trust && c.properties.trust !== c.name ? ` · ${c.properties.trust}` : ''})`;
    return `${c.name} (${typeLabel})`;
  };
  const lines = ['flowchart LR'];
  const write = (n, depth) => {
    const pad = '  '.repeat(depth);
    if (isBox(n)) {
      lines.push(`${pad}subgraph ${ref.get(n.id)} ["${label(text(n))}"]`);
      for (const child of children.get(n.id) ?? []) write(child, depth + 1);
      lines.push(`${pad}end`);
    } else {
      const c = comps[n.componentId];
      lines.push(c.type === 'dep.managed_db' ? `${pad}${ref.get(n.id)}[("${label(text(n))}")]` : `${pad}${ref.get(n.id)}["${label(text(n))}"]`);
    }
  };
  for (const n of children.get(null) ?? []) write(n, 1);
  const nodeOf = new Map(nodes.filter((n) => n.componentId).map((n) => [n.componentId, n.id]));
  for (const e of view.edges) {
    const r = model.relations?.[e.relationId];
    if (!r || r.type !== 'calls') continue;
    const from = ref.get(nodeOf.get(r.from)), to = ref.get(nodeOf.get(r.to));
    if (!from || !to) continue;
    const arrow = r.mode === 'async' ? '-.->' : '-->';
    lines.push(r.protocol ? `  ${from} ${arrow}|${label(r.protocol).replace(/\|/g, '/')}| ${to}` : `  ${from} ${arrow} ${to}`);
  }
  return `${lines.join('\n')}\n`;
}

/** 배치안의 구현체 → 위치(가장 가까운 컨테이너 이름들) → 구현 대상(Logical 이름) */
function implementerRows(model, view) {
  const comps = model.components ?? {};
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const rows = [];
  for (const n of view.nodes) {
    const c = comps[n.componentId];
    if (!c || !REGISTRY.types[c.type]?.realizes) continue;
    const targets = Object.values(model.relations ?? {}).filter((r) => r.type === 'realizes' && r.from === c.id).map((r) => comps[r.to]?.name).filter(Boolean);
    const chain = [];
    let p = n.parentId ? byId.get(n.parentId) : undefined;
    const seen = new Set();
    while (p && !seen.has(p.id)) {
      seen.add(p.id);
      chain.unshift(p.kind === 'group' ? p.label || 'Boundary' : comps[p.componentId]?.name ?? '');
      p = p.parentId ? byId.get(p.parentId) : undefined;
    }
    const instances = typeof c.properties?.instances === 'number' ? ` ×${c.properties.instances}` : '';
    rows.push(`| ${cell(c.name + instances)} | ${cell(chain.filter(Boolean).join(' / '))} | ${cell(targets.join(', '))} |`);
  }
  return rows;
}

/** "## 배포 구성 (배치안)" 구역 줄들. 배치안이 없으면 빈 배열 */
function deploymentSectionLines(model) {
  const views = deploymentViews(model);
  if (!views.length) return [];
  const out = ['## 배포 구성 (배치안)', '', '같은 Logical 설계를 배치안마다 어디서 실행하는지 보여준다. 표의 "구현 대상"은 Logical 컴포넌트다.', ''];
  for (const v of views) {
    out.push(`### ${cell(v.variant)}`, '');
    out.push('```mermaid', deploymentMermaid(model, v).trimEnd(), '```', '');
    const rows = implementerRows(model, v);
    if (rows.length) out.push('| 구현체 | 위치 | 구현 대상 |', '|---|---|---|', ...rows, '');
    else out.push('_이 배치안에는 Logical 컴포넌트를 구현하는 실행 단위가 없습니다._', '');
  }
  return out;
}

/** "## 배포 전략" 구역 줄들. 전략의 제목 단계는 두 단계 내려 README 구조 안에 넣는다 */
function strategySectionLines(model) {
  const views = deploymentViews(model);
  if (!views.length) return [];
  const out = ['## 배포 전략', ''];
  for (const v of views) {
    out.push(`### ${cell(v.variant)}`, '');
    const md = String(v.strategyMd ?? '').trim();
    out.push(md ? md.replace(/^(#{1,4}) /gm, '##$1 ') : '_배포 전략이 비어 있습니다._', '');
  }
  return out;
}

module.exports = { deploymentMermaid, deploymentSectionLines, strategySectionLines, deploymentViews };
