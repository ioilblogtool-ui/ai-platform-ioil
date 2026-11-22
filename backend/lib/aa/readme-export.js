// README.md 내보내기 본문 (Sprint 4 Step 5 · RDM-02~05 · 05 "readme-md 규칙" Sprint 4 단계 적용 · Q1·Q2).
// 순수 함수: 입력(프로젝트·Draft·요구사항·구역)이 같으면 본문(body)이 같다. 생성 시각은 꼬리말(footer)에만 넣는다.
// 컴포넌트는 별칭 없이 이름으로 쓴다. 내부 ID·좌표·노트는 넣지 않는다 (normalize.js).
const { normalizeModel } = require('./normalize');
const { basisText, basisFileTag } = require('./export-basis');
const { toMermaidFlowchart } = require('./mermaid-export');

const DEFAULT_SECTIONS = Object.freeze({ overview: true, logicalDiagram: true, nfr: true });
const SECTION_KEYS = Object.keys(DEFAULT_SECTIONS);

/** 요청의 sections → 세 키만 남긴 boolean 객체 (그 밖의 키는 무시, 없는 키는 기본 켬) */
function normalizeSections(input) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return Object.fromEntries(SECTION_KEYS.map((k) => [k, src[k] === undefined ? DEFAULT_SECTIONS[k] : src[k] === true]));
}

// Markdown 표 칸: 줄바꿈·파이프가 표를 깨지 않게 한다
function cell(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim() || '—';
}

function slugify(name) {
  const slug = String(name ?? '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'project';
}

const CATEGORY_LABEL = {
  availability: '가용성', performance: '성능', scalability: '확장성', security: '보안',
  operability: '운영성', cost: '비용', other: '기타',
};

/**
 * @param {{ project: { name: string, readmeMd?: string }, model: object, revision: number,
 *           requirements?: object[], sections?: object }} input
 * @returns {{ body: string, filename: string, sections: Record<string, boolean> }}
 */
function buildReadme({ project, model, revision, basis, requirements = [], sections }) {
  const b = basis ?? { source: 'draft', revision };   // Sprint 6: 버전 기준이면 { source: 'version', label, publishedAt }
  const on = normalizeSections(sections);
  const n = normalizeModel(model, { requirements });
  const out = [];

  // ① 제목·기준 (시각은 넣지 않는다 — 꼬리말에만)
  out.push(`# ${String(project.name).replace(/\r?\n/g, ' ')}`, '');
  out.push(`> 기준: ${basisText(b)}. AA Workbench에서 내보낸 문서입니다.`, '');

  // ② 프로젝트 개요 (선택)
  if (on.overview) {
    out.push('## 프로젝트 개요', '');
    const overview = String(project.readmeMd ?? '').trim();
    // 개요의 제목 단계를 한 단계 내려 README 구조 안에 넣는다
    out.push(overview ? overview.replace(/^(#{1,5}) /gm, '#$1 ') : '_개요가 비어 있습니다._', '');
  }

  // ③ 아키텍처 요약 (고정)
  out.push('## 아키텍처 요약', '');
  out.push(`- 컴포넌트 ${n.components.length}개 · 관계 ${n.relations.length}개 · 그룹 ${n.groups.length}개`);
  out.push(`- 기술 스택: ${n.techStack.length ? n.techStack.join(', ') : '—'}`, '');
  if (n.components.length) {
    out.push('| 컴포넌트 | 타입 | 기술 | 그룹 | 주요 설정 | 요구사항 | 설명 |', '|---|---|---|---|---|---|---|');
    for (const c of n.components) {
      const settings = [...c.properties, ...c.custom].map((p) => `${p.label}: ${p.value}`).join(', ');
      out.push(`| ${cell(c.name)} | ${cell(c.typeLabel)} | ${cell(c.technology)} | ${cell(c.group)} | ${cell(settings)} | ${cell(c.requirementCodes.join(', '))} | ${cell(c.summary)} |`);
    }
    out.push('');
  } else {
    out.push('_아직 컴포넌트가 없습니다._', '');
  }
  if (n.relations.length) {
    out.push('| 호출하는 쪽 | 호출받는 쪽 | 프로토콜 | 방식 | 설명 |', '|---|---|---|---|---|');
    for (const r of n.relations) {
      out.push(`| ${cell(r.fromName)} | ${cell(r.toName)} | ${cell(r.protocol)} | ${cell(r.mode === 'async' ? '비동기' : r.mode === 'sync' ? '동기' : null)} | ${cell(r.label)} |`);
    }
    out.push('');
  }

  // ④ Logical 구성도 (선택)
  if (on.logicalDiagram) {
    out.push('## 구성도 (Logical)', '');
    if (n.components.some((c) => c.inLogical)) out.push('```mermaid', toMermaidFlowchart(n).trimEnd(), '```', '');
    else out.push('_Logical View에 그려진 컴포넌트가 없습니다._', '');
  }

  // ⑦ 설계 근거 — 이번 단계는 NFR 목표·측정 방법만 (ADR은 Phase 3)
  if (on.nfr) {
    out.push('## 비기능 요구사항 (NFR)', '');
    if (n.requirements.nfr.length) {
      out.push('| 코드 | 제목 | 분류 | 목표 | 측정 방법 |', '|---|---|---|---|---|');
      for (const r of n.requirements.nfr) {
        out.push(`| ${cell(r.code)} | ${cell(r.title)} | ${cell(CATEGORY_LABEL[r.category] ?? r.category)} | ${cell(r.target)} | ${cell(r.metric)} |`);
      }
      out.push('');
    } else {
      out.push('_등록된 NFR이 없습니다._', '');
    }
  }

  return {
    body: `${out.join('\n').trimEnd()}\n`,
    filename: `README_${slugify(project.name)}_${basisFileTag(b)}.md`,
    sections: on,
  };
}

/** 생성 시각 꼬리말. 출력 해시(contentHash)에는 포함하지 않는다 */
function readmeFooter(date = new Date()) {
  return `\n---\n_AA Workbench에서 생성 · ${date.toISOString()}_\n`;
}

module.exports = { buildReadme, readmeFooter, normalizeSections, slugify, DEFAULT_SECTIONS };
