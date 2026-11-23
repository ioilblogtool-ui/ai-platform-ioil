// 샘플 프로젝트 생성 + 요구사항 시드 (Sprint 5 Step 5 · Q10 · Sprint 4 Q4 설계).
// 1) 요구사항 UUID를 미리 정해 모델에 연결 → 2) aa_create_project(프로젝트 + Draft) →
// 3) aa_next_code로 코드 확보 → 4) 요구사항 한 번에 insert.
// 3·4가 실패하면 이번 요청에서 만든 프로젝트만(id + 소유자) 지운다. 지우지도 못하면 이름을
// '[샘플 생성 실패] …'로 바꿔 사용자가 직접 지울 수 있게 하고(최선), projectId를 로그에 남긴 뒤 실패로 응답한다.
// db는 주입한다 — DB 테스트에서 시드·삭제 실패를 흉내 낼 수 있게.
const { randomUUID } = require('node:crypto');

const FAILED_PREFIX = '[샘플 생성 실패] ';

class SampleSeedError extends Error {
  constructor(projectId, cause, compensated) {
    super(compensated ? '샘플 요구사항을 만들지 못해 프로젝트를 만들지 않았습니다.' : '샘플 요구사항을 만들지 못했고 정리도 실패했습니다.');
    this.name = 'SampleSeedError';
    this.projectId = projectId;
    this.compensated = compensated;
    this.cause = cause;
  }
}

async function createSampleProject(db, { userId, name, description, readmeMd, sample }, { log = console } = {}) {
  const links = Object.fromEntries(sample.requirements.map((r) => [r.key, randomUUID()]));
  const { data: project, error } = await db.rpc('aa_create_project', {
    p_user: userId, p_name: name, p_description: description, p_readme_md: readmeMd, p_model: sample.model(links),
  });
  if (error) throw error;

  try {
    const rows = [];
    for (const [i, r] of sample.requirements.entries()) {
      const { data: code, error: codeError } = await db.rpc('aa_next_code', { p_project: project.id, p_prefix: r.kind.toUpperCase() });
      if (codeError) throw codeError;
      rows.push({
        id: links[r.key], project_id: project.id, user_id: userId, code, kind: r.kind, category: r.category,
        title: r.title, description: r.description, target: r.target, metric: r.metric, priority: r.priority, sort_order: i,
        // Sprint 8 (REQ-06): 여러 행 insert는 빠진 키를 NULL로 채운다(measurement는 NOT NULL) → 모든 행에 넣는다
        measurement: r.measurement ?? {},
      });
    }
    const { error: insertError } = await db.from('aa_requirements').insert(rows);
    if (insertError) throw insertError;
    return { project, requirements: rows.length };
  } catch (cause) {
    const compensated = await removeProject(db, project.id, userId);
    if (!compensated) {
      log.error('[aa] sample seed failed and cleanup failed', { projectId: project.id, cause: String(cause?.message ?? cause) });
      await db.from('aa_projects').update({ name: (FAILED_PREFIX + project.name).slice(0, 120) })
        .eq('id', project.id).eq('user_id', userId)
        .then(() => {}, () => {});   // 이름 바꾸기도 최선 — 실패해도 응답은 같은 500
    } else {
      log.error('[aa] sample seed failed, project removed', { projectId: project.id, cause: String(cause?.message ?? cause) });
    }
    throw new SampleSeedError(project.id, cause, compensated);
  }
}

/** 이번 요청에서 만든 프로젝트만: id와 소유자가 둘 다 맞아야 지운다. 실제로 1행 지워졌을 때만 true */
async function removeProject(db, projectId, userId) {
  try {
    const { data, error } = await db.from('aa_projects').delete().eq('id', projectId).eq('user_id', userId).select('id');
    return !error && Array.isArray(data) && data.length === 1;
  } catch {
    return false;
  }
}

module.exports = { createSampleProject, SampleSeedError, FAILED_PREFIX };
