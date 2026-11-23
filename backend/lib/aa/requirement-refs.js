const { UUID_RE } = require('./errors');

function lists(model) {
  // Sprint 8: 흐름의 requirementIds도 같은 규칙(V9 정리·삭제 보호)
  return ['components', 'relations', 'flows'].flatMap((group) =>
    Object.entries(model?.[group] ?? {}).flatMap(([id, item]) =>
      Array.isArray(item?.requirementIds) ? [{ group, id, item }] : [],
    ),
  );
}

function references(model, id) {
  const result = { componentIds: [], relationIds: [], flowIds: [] };
  for (const entry of lists(model)) {
    if (entry.item.requirementIds.some((value) => typeof value === 'string' && value.toLowerCase() === id)) {
      result[{ components: 'componentIds', relations: 'relationIds', flows: 'flowIds' }[entry.group]].push(entry.id);
    }
  }
  return result;
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
  for (const { group, id, item } of entries) {
    const removed = new Set(item.requirementIds.filter((value) => isUuid(value) && !existing.has(value.toLowerCase())));
    if (!removed.size) continue;
    if (cleaned === model) cleaned = { ...model };
    if (cleaned[group] === model[group]) cleaned[group] = { ...model[group] };
    cleaned[group][id] = { ...item, requirementIds: item.requirementIds.filter((value) => !removed.has(value)) };
    warnings.push({
      code: 'V9', path: `${group}.${id}.requirementIds`, removedIds: [...removed],
      message: '현재 프로젝트에서 찾을 수 없는 요구사항 참조를 제외했습니다.',
    });
  }
  return { model: cleaned, warnings };
}

module.exports = { isUuid, reconcile, references };
