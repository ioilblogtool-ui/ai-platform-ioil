const { UUID_RE } = require('./errors');

/**
 * 모델이 요구사항을 참조하는 모든 자리. V9 정리(reconcile)·삭제 보호(references)·발행 스냅샷이 같은 목록을 쓴다.
 * Sprint 8: 흐름. Sprint 11: 배치안 구조화 전략의 진행·중단 기준(views[].strategy.gates[]).
 * @returns {{ group: 'components'|'relations'|'flows'|'gates', id: string, item: { requirementIds: string[] }, viewIndex?: number, gateIndex?: number }[]}
 */
function lists(model) {
  const entries = ['components', 'relations', 'flows'].flatMap((group) =>
    Object.entries(model?.[group] ?? {}).flatMap(([id, item]) =>
      Array.isArray(item?.requirementIds) ? [{ group, id, item }] : [],
    ),
  );
  (Array.isArray(model?.views) ? model.views : []).forEach((view, viewIndex) => {
    const gates = view?.strategy?.gates;
    if (!Array.isArray(gates)) return;
    gates.forEach((gate, gateIndex) => {
      if (Array.isArray(gate?.requirementIds)) entries.push({ group: 'gates', id: `${view.id}.gates[${gateIndex}]`, item: gate, viewIndex, gateIndex });
    });
  });
  return entries;
}

const RESULT_KEY = { components: 'componentIds', relations: 'relationIds', flows: 'flowIds', gates: 'strategyGates' };

/** 삭제 보호(409 IN_USE) 상세: 이 요구사항을 쓰는 자리 */
function references(model, id) {
  const result = { componentIds: [], relationIds: [], flowIds: [], strategyGates: [] };
  for (const entry of lists(model)) {
    if (entry.item.requirementIds.some((value) => typeof value === 'string' && value.toLowerCase() === id)) {
      result[RESULT_KEY[entry.group]].push(entry.id);
    }
  }
  return result;
}

const inUse = (details) => Object.values(details).some((list) => list.length > 0);

/** 발행 스냅샷이 모으는 요구사항 id (형식 검사 없이 모델 그대로) */
function referencedRequirementIds(model) {
  const ids = new Set();
  for (const { item } of lists(model)) for (const id of item.requirementIds) ids.add(id);
  return ids;
}

const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);

async function reconcile(db, projectId, userId, model) {
  const entries = lists(model);
  const ids = [...new Set(entries.flatMap(({ item }) => item.requirementIds).filter(isUuid).map((id) => id.toLowerCase()))];
  const existing = new Set();
  // Bound the PostgREST URL and result size for large Drafts.
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await db.from('aa_requirements').select('id')
      .eq('project_id', projectId).eq('user_id', userId).in('id', ids.slice(offset, offset + 100));
    if (error) throw error;
    data.forEach(({ id }) => existing.add(id));
  }

  const warnings = [];
  let cleaned = model;
  for (const entry of entries) {
    const { group, id, item } = entry;
    const removed = new Set(item.requirementIds.filter((value) => isUuid(value) && !existing.has(value.toLowerCase())));
    if (!removed.size) continue;
    if (cleaned === model) cleaned = { ...model };
    const kept = { ...item, requirementIds: item.requirementIds.filter((value) => !removed.has(value)) };
    if (group === 'gates') {
      // views[i].strategy.gates[j]만 새 객체로 바꾼다 (입력 모델은 그대로)
      if (cleaned.views === model.views) cleaned.views = [...model.views];
      const view = cleaned.views[entry.viewIndex];
      const gates = [...view.strategy.gates];
      gates[entry.gateIndex] = kept;
      cleaned.views[entry.viewIndex] = { ...view, strategy: { ...view.strategy, gates } };
    } else {
      if (cleaned[group] === model[group]) cleaned[group] = { ...model[group] };
      cleaned[group][id] = kept;
    }
    warnings.push({
      code: 'V9', path: group === 'gates' ? `views[${entry.viewIndex}].strategy.gates[${entry.gateIndex}].requirementIds` : `${group}.${id}.requirementIds`,
      removedIds: [...removed],
      message: '현재 프로젝트에서 찾을 수 없는 요구사항 참조를 제외했습니다.',
    });
  }
  return { model: cleaned, warnings };
}

module.exports = { isUuid, inUse, lists, reconcile, references, referencedRequirementIds };
