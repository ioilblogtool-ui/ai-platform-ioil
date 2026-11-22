// Ask AI 번들 빌더 (Sprint 5 Step 1 · EXP-04~08·10·11 · 05 §7.6 · Q3·Q5·Q8·Q12).
// 순수 함수. 공통 정규화(normalize.js) 위에서 범위를 자르고 번들마다 별칭(C1…, G1…)을 새로 매긴다.
// 내부 ID·좌표·노트는 출력에 넣지 않는다. bundleId·읽은 시각은 헤더(ai-md 첫 줄 / ai-json의 두 필드)에만 넣고,
// contentHash는 그것을 뺀 본문으로 계산한다 (같은 입력이면 같은 해시).
const { normalizeModel } = require('./normalize');
const { toMermaidFlowchart } = require('./mermaid-export');

const TEMPLATES = Object.freeze({
  'design-review': '아래 아키텍처를 설계 리뷰해 주세요. 신뢰성·성능·확장성·보안·운영 관점에서 위험과 개선안을 우선순위와 함께 제시해 주세요.',
  'failure-scenarios': '아래 구성에서 일어날 수 있는 장애 시나리오를 점검해 주세요. 단일 장애점, 연쇄 장애, 타임아웃·재시도, 복구 절차를 중심으로 봐 주세요.',
  'adr-draft': '아래 설계와 질문을 바탕으로 ADR 초안을 써 주세요. Context / Options(장단점) / Decision / Consequences 형식으로 써 주세요.',
  'nfr-validation': '아래 비기능 요구사항을 검증할 방법을 제안해 주세요. 측정 지표, 환경, 부하 조건, 성공 기준을 포함해 주세요.',
  'cost-estimate': '아래 구성의 운영 비용을 대략 추정하고, 비용을 줄일 수 있는 지점을 알려 주세요.',
  explain: '아래 아키텍처를 처음 보는 사람에게 설명하듯 정리해 주세요. 요청 흐름과 각 구성 요소의 역할을 중심으로 설명해 주세요.',
  custom: '',
});
const QUESTION_MAX = 2000;
const ALIAS_NOTE = 'C1, G1 같은 별칭은 이 번들 안에서만 유효합니다. 답변에서 구성 요소를 가리킬 때 별칭과 이름을 함께 써 주세요.';
const KIND_LABEL = { fr: 'FR', nfr: 'NFR' };

function cell(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim() || '—';
}

function overviewSummary(readmeMd) {
  const lines = String(readmeMd ?? '').split(/\r?\n/).map((l) => l.trim());
  const text = lines.filter((l) => l && !l.startsWith('#')).slice(0, 3).join(' ');
  return text.length > 400 ? `${text.slice(0, 399)}…` : text;
}

/**
 * 범위를 정규화 결과의 ref 집합으로 바꾼다. 실패하면 { error }.
 * scope: { type:'project' } | { type:'view', viewId } | { type:'components', componentIds } | { type:'requirement', requirementId }
 */
function resolveScope(n, scope, requirements) {
  const all = new Set(n.components.map((c) => c.ref));
  const byRef = new Map(n.components.map((c) => [c.ref, c]));
  const type = scope?.type ?? 'project';
  if (type === 'project') return { refs: all, label: '프로젝트 전체', reqCodes: null };
  if (type === 'view') {
    if (scope.viewId !== 'view_logical') return { error: 'view' };
    return { refs: new Set(n.components.filter((c) => c.inLogical).map((c) => c.ref)), label: 'Logical View', reqCodes: null };
  }
  if (type === 'components') {
    const refOf = n.index.componentRefById;
    const picked = (Array.isArray(scope.componentIds) ? scope.componentIds : []).map((id) => refOf.get(id)).filter(Boolean);
    if (!picked.length || picked.length !== scope.componentIds.length) return { error: 'components' };
    const refs = new Set(picked);
    for (const r of n.relations) {                         // 선택 컴포넌트와 관계로 바로 이어진 이웃(양방향 한 단계)
      if (picked.includes(r.from)) refs.add(r.to);
      if (picked.includes(r.to)) refs.add(r.from);
    }
    const names = picked.map((ref) => byRef.get(ref).name);
    const label = names.length === 1 ? `${names[0]}와 이웃` : `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` 외 ${names.length - 3}개` : ''}와 이웃`;
    return { refs, label, reqCodes: null };
  }
  if (type === 'requirement') {
    const req = requirements.find((r) => String(r.id).toLowerCase() === String(scope.requirementId ?? '').toLowerCase());
    if (!req) return { error: 'requirement' };
    const refs = new Set(n.components.filter((c) => c.requirementCodes.includes(req.code)).map((c) => c.ref));
    for (const r of n.relations) {                          // 요구사항이 직접 연결된 관계의 양 끝
      if (r.requirementCodes.includes(req.code)) { refs.add(r.from); refs.add(r.to); }
    }
    return { refs, label: `요구사항 ${req.code}`, reqCodes: new Set([req.code]), requirementCode: req.code };
  }
  if (type === 'flow') return { error: 'flow' };
  return { error: 'scope' };
}

/**
 * @returns {{ content: string, hashBody: string, filenameStem: string, scopeLabel: string,
 *             counts: { components: number, relations: number }, omitted: { components: number } } | { error: string }}
 */
function buildAskAi({ project, model, revision, requirements = [], format, scope, template = 'design-review', question = '', bundleId, readAt }) {
  if (!Object.hasOwn(TEMPLATES, template)) return { error: 'template' };
  const q = String(question ?? '').trim();
  if (q.length > QUESTION_MAX) return { error: 'question' };
  if (template === 'custom' && !q) return { error: 'question' };

  const n = normalizeModel(model, { requirements, withIndex: true });
  const resolved = resolveScope(n, scope, requirements);
  if (resolved.error) return { error: `scope_${resolved.error}` };

  // 범위 안 컴포넌트·관계·그룹, 번들 별칭
  const comps = n.components.filter((c) => resolved.refs.has(c.ref));
  const alias = new Map(comps.map((c, i) => [c.ref, `C${i + 1}`]));
  const rels = n.relations.filter((r) => alias.has(r.from) && alias.has(r.to));
  const usedGroups = new Set(comps.map((c) => c.groupRef).filter(Boolean));
  // 그룹은 쓰이는 그룹과 그 상위 그룹까지
  for (const g of [...usedGroups]) {
    let parent = n.groups.find((x) => x.ref === g)?.parent;
    while (parent && !usedGroups.has(parent)) { usedGroups.add(parent); parent = n.groups.find((x) => x.ref === parent)?.parent; }
  }
  const groups = n.groups.filter((g) => usedGroups.has(g.ref));
  const galias = new Map(groups.map((g, i) => [g.ref, `G${i + 1}`]));

  const reqCodesInScope = resolved.reqCodes ?? new Set([...comps.flatMap((c) => c.requirementCodes), ...rels.flatMap((r) => r.requirementCodes)]);
  const allReqs = [...n.requirements.nfr, ...n.requirements.fr];
  const reqs = scope?.type === 'project' || scope?.type === 'view' || !scope
    ? allReqs
    : allReqs.filter((r) => reqCodesInScope.has(r.code));
  const omitted = { components: n.components.length - comps.length };
  const basisText = `Draft rev ${revision}`;
  const templateText = TEMPLATES[template];

  const outComponents = comps.map((c) => ({
    alias: alias.get(c.ref), name: c.name, type: c.typeLabel, technology: c.technology,
    group: c.groupRef ? galias.get(c.groupRef) ?? null : null,
    settings: [...c.properties, ...c.custom].map((p) => `${p.label}: ${p.value}`),
    requirements: c.requirementCodes, summary: c.summary,
  }));
  const outRelations = rels.map((r) => ({
    from: alias.get(r.from), to: alias.get(r.to), protocol: r.protocol, mode: r.mode, label: r.label, requirements: r.requirementCodes,
  }));
  const outGroups = groups.map((g) => ({ alias: galias.get(g.ref), label: g.label, parent: g.parent ? galias.get(g.parent) ?? null : null }));

  if (format === 'ai-json') {
    const stable = {
      schema: 'aa-ask-ai/1',
      aliasNote: ALIAS_NOTE,
      basis: { source: 'draft', revision },
      scope: { label: resolved.label },
      template, question: q || null, instruction: templateText || null,
      project: { name: project.name, summary: overviewSummary(project.readmeMd) || null },
      requirements: reqs.map((r) => ({ code: r.code, kind: KIND_LABEL[r.kind] ?? r.kind, title: r.title, target: r.target, metric: r.metric })),
      components: outComponents, relations: outRelations, groups: outGroups, omitted,
    };
    const full = { bundleId, readAt, ...stable };
    return {
      content: `${JSON.stringify(full, null, 2)}\n`,
      hashBody: JSON.stringify(stable),
      scopeLabel: resolved.label, omitted,
      counts: { components: comps.length, relations: rels.length },
    };
  }

  // ai-md
  const lines = [];
  lines.push(`<!-- AA Workbench export · bundle ${bundleId} · ${String(project.name).replace(/--+/g, '-')} · ${basisText} · 읽은 시각 ${readAt} -->`);
  const body = [];
  body.push(`> ${ALIAS_NOTE}`, `> 기준: ${basisText} (발행 버전 없음) · 범위: ${resolved.label}`, '');
  body.push('# 질문', '');
  if (templateText) body.push(templateText, '');
  if (q) body.push(q, '');
  body.push('# 프로젝트', '', `${project.name}${overviewSummary(project.readmeMd) ? ` — ${overviewSummary(project.readmeMd)}` : ''}`, '');
  body.push('# 요구사항', '');
  if (reqs.length) {
    body.push('| 코드 | 종류 | 제목 | 목표 | 측정 |', '|---|---|---|---|---|');
    for (const r of reqs) body.push(`| ${cell(r.code)} | ${cell(KIND_LABEL[r.kind])} | ${cell(r.title)} | ${cell(r.target)} | ${cell(r.metric)} |`);
  } else {
    body.push('_범위 안에 연결된 요구사항이 없습니다._');
  }
  body.push('', '# 컴포넌트', '');
  if (outComponents.length) {
    body.push('| 별칭 | 이름 | 타입 | 기술 | 그룹 | 주요 설정 | 요구사항 |', '|---|---|---|---|---|---|---|');
    for (const c of outComponents) {
      body.push(`| ${c.alias} | ${cell(c.name)} | ${cell(c.type)} | ${cell(c.technology)} | ${cell(c.group ? `${c.group} ${outGroups.find((g) => g.alias === c.group)?.label ?? ''}` : null)} | ${cell(c.settings.join(', '))} | ${cell(c.requirements.join(', '))} |`);
    }
  } else {
    body.push(resolved.requirementCode ? `_${resolved.requirementCode}에 연결된 컴포넌트가 없습니다._` : '_범위 안에 컴포넌트가 없습니다._');
  }
  body.push('', '# 관계', '');
  if (outRelations.length) {
    for (const r of outRelations) {
      const parts = [r.protocol, r.mode === 'async' ? '비동기' : r.mode === 'sync' ? '동기' : null, r.label].filter(Boolean);
      body.push(`- ${r.from} → ${r.to}${parts.length ? ` · ${parts.join(' · ')}` : ''}${r.requirements.length ? ` (${r.requirements.join(', ')})` : ''}`);
    }
  } else {
    body.push('_범위 안에 관계가 없습니다._');
  }
  if (comps.some((c) => c.inLogical)) {
    // 구성도: 별칭 + 이름 라벨, 범위 안 그룹만
    const view = {
      components: comps.map((c) => ({ ...c, name: `${alias.get(c.ref)} ${c.name}` })),
      relations: rels,
      groups: groups.map((g) => ({ ...g, label: `${galias.get(g.ref)} ${g.label}`, parent: usedGroups.has(g.parent) ? g.parent : null })),
    };
    body.push('', '# 구성도', '', '```mermaid', toMermaidFlowchart(view).trimEnd(), '```');
  }
  if (omitted.components) body.push('', '# 생략', '', `- 범위 밖 컴포넌트 ${omitted.components}개는 넣지 않았습니다.`);
  const bodyText = `${body.join('\n').trimEnd()}\n`;
  return {
    content: `${lines.join('\n')}\n${bodyText}`,
    hashBody: bodyText,
    scopeLabel: resolved.label, omitted,
    counts: { components: comps.length, relations: rels.length },
  };
}

module.exports = { buildAskAi, TEMPLATES, QUESTION_MAX, ALIAS_NOTE };
