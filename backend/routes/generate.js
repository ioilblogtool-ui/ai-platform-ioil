const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../lib/activity');

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── 프로젝트 컨텍스트 (bigyocalc.com / blog-tool 레포) ───────────────────────
const PROJECT_CONTEXT = `
## 프로젝트 스택 컨텍스트 (bigyocalc.com)
- **프레임워크**: Astro SSG (정적 사이트 생성)
- **배포**: Cloudflare Pages — main 브랜치 푸시 = 즉시 라이브
- **레포**: https://github.com/ioilblogtool-ui/blog-tool

### 계산기(calculator) 파일 구조 — 신규 추가 시 4개 파일 필요
\`\`\`
src/pages/tools/{slug}/index.astro   # 페이지 템플릿
src/data/tools.ts                    # 메타데이터 레지스트리 (항목 추가)
src/scripts/{slug}.js                # 클라이언트 계산 로직
src/styles/{slug}.scss               # 페이지 전용 스타일
\`\`\`

### 레이아웃 쉘 3종 (계산기용)
- \`SimpleToolShell\` — 입력 → 결과 단순 구조
- \`CompareToolShell\` — 두 항목 비교 구조
- \`TimelineToolShell\` — 시간축 기반 추이 구조

### 리포트(report) 파일 구조
\`\`\`
src/pages/reports/{slug}/index.astro  # 페이지
src/data/reports.ts                   # 메타데이터 레지스트리
\`\`\`

### 배포 체크리스트
- \`npm run build\` 성공 확인 후 커밋
- main 머지 → Cloudflare Pages 자동 배포
`.trim();

// ─── 공통 유틸 ─────────────────────────────────────────────────────────────────

/** job 레코드 생성 후 즉시 반환 (상태: queued) */
async function createJob({ content_item_id, user_id, job_type, model = 'claude', userPrompt }) {
  const { data: job, error } = await supabase
    .from('generation_jobs')
    .insert({ content_item_id, user_id, job_type, model, status: 'queued', prompt: userPrompt })
    .select()
    .single();
  if (error) throw error;
  return job;
}

/**
 * 백그라운드에서 Claude 호출 후 결과 처리.
 * setImmediate로 현재 이벤트 루프 tick 이후에 실행 (HTTP 응답 전송 완료 후).
 *
 * @param {object} job          - 생성된 job 레코드
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {function} onDone     - async (result, tokens_used) => void — 문서 저장 로직
 */
function runInBackground(job, systemPrompt, userPrompt, onDone) {
  setImmediate(async () => {
    try {
      // running 상태로 전환
      await supabase
        .from('generation_jobs')
        .update({ status: 'running' })
        .eq('id', job.id);

      // Claude 호출
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 16384,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const result = response.content[0].text;
      const tokens_used = response.usage.input_tokens + response.usage.output_tokens;

      // 문서 저장 (각 라우트별 로직)
      await onDone(result, tokens_used);

      // job 완료
      await supabase
        .from('generation_jobs')
        .update({ status: 'done', result, tokens_used })
        .eq('id', job.id);

    } catch (err) {
      console.error(`[generate] job ${job.id} failed:`, err.message);
      await supabase
        .from('generation_jobs')
        .update({ status: 'failed', error_message: err.message })
        .eq('id', job.id);

      await logActivity({
        content_item_id: job.content_item_id,
        user_id: job.user_id,
        event_type: 'job_failed',
        description: `${job.job_type} 생성 실패`,
        metadata: { job_id: job.id, error: err.message },
      });
    }
  });
}

// ─── POST /api/generate/ideas ──────────────────────────────────────────────────
// 아이디어 확장 — 빠른 편이라 동기 유지
router.post('/ideas', requireAuth, async (req, res) => {
  const { content_item_id } = req.body;
  if (!content_item_id) return res.status(400).json({ error: 'content_item_id가 필요합니다.' });

  const { data: item } = await supabase
    .from('content_items')
    .select('*')
    .eq('id', content_item_id)
    .eq('user_id', req.user.id)
    .single();
  if (!item) return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다.' });

  const systemPrompt = `당신은 콘텐츠 전략가입니다. 주어진 아이디어를 바탕으로 웹 콘텐츠 기획안을 작성합니다.
결과는 반드시 아래 JSON 형식으로만 응답하세요. 설명 텍스트 없이 JSON만 출력하세요.
{
  "result_summary": "콘텐츠 아이디어 요약 (2-3문장)",
  "suggested_titles": ["제목1", "제목2", "제목3"],
  "suggested_outline": ["섹션1", "섹션2", "섹션3", "섹션4", "섹션5"],
  "seo_keywords": ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5"],
  "strengths": "이 아이디어의 강점",
  "weaknesses": "이 아이디어의 약점 또는 주의사항",
  "score": 85
}`;

  const userPrompt = `콘텐츠 타입: ${item.content_type}
카테고리: ${item.category}
SEO 키워드: ${item.seo_keyword || '미지정'}
아이디어 원문:
${item.raw_idea || item.title}`;

  try {
    const job = await createJob({
      content_item_id, user_id: req.user.id, job_type: 'idea_expand', userPrompt,
    });

    // 아이디어는 JSON 파싱이 필요해 동기 처리 유지 (짧은 응답)
    await supabase.from('generation_jobs').update({ status: 'running' }).eq('id', job.id);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const result = response.content[0].text;
    const tokens_used = response.usage.input_tokens + response.usage.output_tokens;

    let parsed = {};
    try { parsed = JSON.parse(result); } catch { parsed = { result_summary: result }; }

    const { data: idea } = await supabase
      .from('content_ideas')
      .insert({ content_item_id, model: 'claude', generation_job_id: job.id, ...parsed })
      .select()
      .single();

    await supabase.from('generation_jobs').update({ status: 'done', result, tokens_used }).eq('id', job.id);

    await logActivity({
      content_item_id, user_id: req.user.id, event_type: 'idea_generated',
      description: 'Claude로 아이디어 생성',
      metadata: { idea_id: idea.id, tokens_used },
    });

    res.json({ idea, tokens_used });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/generate/plan ───────────────────────────────────────────────────
router.post('/plan', requireAuth, async (req, res) => {
  const { content_item_id, template_content } = req.body;
  if (!content_item_id) return res.status(400).json({ error: 'content_item_id가 필요합니다.' });

  const { data: item } = await supabase
    .from('content_items')
    .select('*, content_ideas(result_summary, suggested_outline, seo_keywords, is_selected)')
    .eq('id', content_item_id)
    .eq('user_id', req.user.id)
    .single();
  if (!item) return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다.' });

  const selectedIdea = item.content_ideas?.find(i => i.is_selected) || item.content_ideas?.[0];

  const systemPrompt = `당신은 1인 디지털 콘텐츠 사업자를 위한 프로덕트 매니저입니다.
주어진 콘텐츠 정보를 바탕으로 상세한 기획 문서(plan)를 Markdown 형식으로 작성합니다.
기획 문서는 개발자가 실제 구현에 참고할 수 있는 수준으로 구체적이어야 합니다.

${PROJECT_CONTEXT}
${template_content ? '\n\n다음 템플릿 구조를 참고하세요:\n' + template_content : ''}`;

  const userPrompt = `콘텐츠 기본 정보:
- 제목: ${item.title}
- 타입: ${item.content_type}
- 카테고리: ${item.category}
- SEO 키워드: ${item.seo_keyword || '미지정'}
- 아이디어 원문: ${item.raw_idea || '없음'}

${selectedIdea ? `채택된 아이디어 요약:\n${selectedIdea.result_summary}

제안 아웃라인:
${Array.isArray(selectedIdea.suggested_outline) ? selectedIdea.suggested_outline.join('\n') : ''}` : ''}

위 정보를 바탕으로 완성도 높은 콘텐츠 기획 문서를 Markdown으로 작성해주세요.
목차, 목적, 타겟 사용자, 핵심 기능, UI 구성, 데이터 요구사항을 포함하세요.`;

  try {
    const job = await createJob({
      content_item_id, user_id: req.user.id, job_type: 'plan_gen', userPrompt,
    });

    // 즉시 job_id 반환
    res.json({ job_id: job.id, status: 'queued' });

    // 백그라운드에서 Claude 호출 + 문서 저장
    runInBackground(
      { ...job, content_item_id, user_id: req.user.id },
      systemPrompt,
      userPrompt,
      async (result, tokens_used) => {
        const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '');
        const slug = item.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 40);
        const file_path = `docs/plan/${yyyymm}/${slug}-v1-plan.md`;

        const { data: doc } = await supabase
          .from('documents')
          .insert({
            content_item_id, user_id: req.user.id,
            doc_type: 'plan', version: 'v1', file_path, content: result, generated_by: 'claude',
          })
          .select()
          .single();

        await logActivity({
          content_item_id, user_id: req.user.id,
          event_type: 'document_generated',
          description: 'plan 문서 생성 완료',
          metadata: { doc_id: doc.id, job_id: job.id, tokens_used },
        });
      }
    );

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/generate/design ─────────────────────────────────────────────────
router.post('/design', requireAuth, async (req, res) => {
  const { content_item_id, plan_doc_id } = req.body;
  if (!content_item_id) return res.status(400).json({ error: 'content_item_id가 필요합니다.' });

  const { data: item } = await supabase
    .from('content_items')
    .select('title, content_type, category')
    .eq('id', content_item_id)
    .eq('user_id', req.user.id)
    .single();
  if (!item) return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다.' });

  const planQuery = supabase
    .from('documents')
    .select('content, file_path')
    .eq('content_item_id', content_item_id)
    .eq('doc_type', 'plan')
    .order('updated_at', { ascending: false })
    .limit(1);
  if (plan_doc_id) planQuery.eq('id', plan_doc_id);
  const { data: planDocs } = await planQuery;
  const planContent = planDocs?.[0]?.content || '';

  const systemPrompt = `당신은 UI/UX 설계 전문가입니다.
기획 문서를 바탕으로 화면 설계서(design)를 Markdown 형식으로 작성합니다.
화면 목록, 컴포넌트 구조, 데이터 모델, 상태 흐름을 포함하세요.
계산기라면 3종 레이아웃 쉘(SimpleToolShell / CompareToolShell / TimelineToolShell) 중 적합한 것을 명시하세요.

${PROJECT_CONTEXT}`;

  const userPrompt = `콘텐츠: ${item.title} (${item.content_type} / ${item.category})

기획 문서:
${planContent || '(기획 문서 없음 — 제목과 타입을 바탕으로 설계해주세요)'}

위 기획을 바탕으로 상세 화면 설계서를 Markdown으로 작성해주세요.`;

  try {
    const job = await createJob({
      content_item_id, user_id: req.user.id, job_type: 'design_gen', userPrompt,
    });

    res.json({ job_id: job.id, status: 'queued' });

    runInBackground(
      { ...job, content_item_id, user_id: req.user.id },
      systemPrompt,
      userPrompt,
      async (result, tokens_used) => {
        const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '');
        const slug = item.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 40);
        const file_path = `docs/design/${yyyymm}/${slug}-v1-design.md`;

        const { data: doc } = await supabase
          .from('documents')
          .insert({
            content_item_id, user_id: req.user.id,
            doc_type: 'design', version: 'v1', file_path, content: result, generated_by: 'claude',
          })
          .select()
          .single();

        await logActivity({
          content_item_id, user_id: req.user.id,
          event_type: 'document_generated',
          description: 'design 문서 생성 완료',
          metadata: { doc_id: doc.id, job_id: job.id, tokens_used },
        });
      }
    );

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/generate/dev-request ────────────────────────────────────────────
router.post('/dev-request', requireAuth, async (req, res) => {
  const { content_item_id, design_doc_id, target_model = 'claude', prompt_style = 'implement' } = req.body;
  if (!content_item_id) return res.status(400).json({ error: 'content_item_id가 필요합니다.' });

  const { data: item } = await supabase
    .from('content_items')
    .select('title, content_type, category, target_repo, target_path')
    .eq('id', content_item_id)
    .eq('user_id', req.user.id)
    .single();
  if (!item) return res.status(404).json({ error: '콘텐츠를 찾을 수 없습니다.' });

  const designQuery = supabase
    .from('documents')
    .select('content, file_path')
    .eq('content_item_id', content_item_id)
    .eq('doc_type', 'design')
    .order('updated_at', { ascending: false })
    .limit(1);
  if (design_doc_id) designQuery.eq('id', design_doc_id);
  const { data: designDocs } = await designQuery;
  const designContent = designDocs?.[0]?.content || '';

  const styleDesc = { implement: '신규 구현', modify: '기능 수정', refactor: '리팩토링' }[prompt_style] || '구현';

  const systemPrompt = `당신은 시니어 개발 리드입니다.
설계 문서를 바탕으로 ${target_model === 'claude' ? 'Claude Code' : target_model}에게 전달할 개발 요청 문서를 Markdown으로 작성합니다.
목표, 참고 문서, 구현 요구사항, 수정 대상 파일, 완료 기준을 포함하세요.
${target_model === 'claude' ? 'Claude Code가 바로 실행할 수 있는 명확한 지시 형식으로 작성하세요.' : ''}

${PROJECT_CONTEXT}

개발 요청서 작성 시 반드시 포함할 항목:
- 신규 계산기라면 생성할 4개 파일 경로 명시 (astro / tools.ts 등록 / js / scss)
- 리포트라면 astro + reports.ts 등록 명시
- 적합한 레이아웃 쉘 선택 이유
- \`npm run build\` 성공 확인 후 main 머지 지시`;

  const userPrompt = `작업 유형: ${styleDesc}
대상 모델: ${target_model}
콘텐츠: ${item.title} (${item.content_type} / ${item.category})
레포: ${item.target_repo || '미지정'}
경로: ${item.target_path || '미지정'}

설계 문서:
${designContent || '(설계 문서 없음 — 콘텐츠 정보를 바탕으로 개발 요청서를 작성해주세요)'}

위 설계를 바탕으로 개발 요청 문서를 작성해주세요.`;

  try {
    const job = await createJob({
      content_item_id, user_id: req.user.id, job_type: 'dev_request_gen', userPrompt,
    });

    res.json({ job_id: job.id, status: 'queued' });

    runInBackground(
      { ...job, content_item_id, user_id: req.user.id },
      systemPrompt,
      userPrompt,
      async (result, tokens_used) => {
        const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '');
        const slug = item.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 40);
        const file_path = `docs/dev-request/${yyyymm}/${slug}-v1-dev-request.md`;

        const { data: doc } = await supabase
          .from('documents')
          .insert({
            content_item_id, user_id: req.user.id,
            doc_type: 'dev_request', version: 'v1', file_path, content: result, generated_by: 'claude',
          })
          .select()
          .single();

        await logActivity({
          content_item_id, user_id: req.user.id,
          event_type: 'document_generated',
          description: 'dev_request 문서 생성 완료',
          metadata: { doc_id: doc.id, job_id: job.id, tokens_used, target_model },
        });
      }
    );

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
