const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const HISTORY_LIMIT = 20;

// 최신순으로 가져온 히스토리를 시간순으로 돌리고, Claude 요청이 user 메시지로 시작하도록 앞쪽 assistant 메시지를 버린다
function toChronologicalHistory(history) {
  const ordered = [...(history || [])].reverse();
  while (ordered.length && ordered[0].role !== 'user') ordered.shift();
  return ordered;
}

// 로그인한 사용자 소유의 대화만 반환 (없거나 남의 것이면 null)
async function findOwnedConversation(conversationId, userId) {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, project:projects(system_prompt)')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .eq('project.user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// POST /api/chat
// 메시지 전송 + Claude 응답 + DB 저장
router.post('/', requireAuth, async (req, res) => {
  const { conversation_id, message, project_id } = req.body;
  const userId = req.user.id;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: '메시지를 입력해주세요.' });
  }
  // conversations.project_id는 NOT NULL이다 (supabase/schema.sql). 새 대화는 프로젝트가 있어야 만들 수 있다
  if (!conversation_id && !project_id) {
    return res.status(400).json({ error: '프로젝트를 선택한 뒤 대화를 시작해주세요.', code: 'PROJECT_REQUIRED' });
  }

  try {
    // 1. 대화 ID가 없으면 새 대화 생성
    let convId = conversation_id;
    let systemPrompt = '당신은 1인 기업 운영을 돕는 AI 어시스턴트입니다. 한국어로 간결하고 실용적으로 답변하세요.';

    if (!convId) {
      // 프로젝트의 시스템 프롬프트 가져오기
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('system_prompt')
        .eq('id', project_id)
        .eq('user_id', userId)
        .maybeSingle();
      if (projectError) throw projectError;
      if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
      if (project.system_prompt) systemPrompt = project.system_prompt;

      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          project_id,
          user_id: userId,
          title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
        })
        .select()
        .single();

      if (convError) throw convError;
      convId = newConv.id;
    } else {
      // 기존 대화: 본인 소유인지 확인 후 프로젝트 시스템 프롬프트 사용
      const conv = await findOwnedConversation(convId, userId);
      if (!conv) return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
      if (conv.project?.system_prompt) systemPrompt = conv.project.system_prompt;
    }

    // 2. 이전 메시지 히스토리 가져오기 (최근 20개)
    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT);

    // 3. 유저 메시지 DB 저장
    await supabase.from('messages').insert({
      conversation_id: convId,
      role: 'user',
      content: message,
    });

    // 4. Claude API 호출
    const claudeMessages = [
      ...toChronologicalHistory(history),
      { role: 'user', content: message }
    ];

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: claudeMessages,
    });

    const assistantMessage = response.content[0].text;
    const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

    // 5. Claude 응답 DB 저장
    await supabase.from('messages').insert({
      conversation_id: convId,
      role: 'assistant',
      content: assistantMessage,
      tokens_used: tokensUsed,
    });

    // 6. 응답 반환
    res.json({
      conversation_id: convId,
      message: assistantMessage,
      tokens_used: tokensUsed,
    });

  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message || '응답 생성 중 오류가 발생했습니다.' });
  }
});

// POST /api/chat/stream — 스트리밍 응답
router.post('/stream', requireAuth, async (req, res) => {
  const { conversation_id, message } = req.body;
  const userId = req.user.id;

  if (!conversation_id) {
    return res.status(400).json({ error: 'conversation_id가 필요합니다.' });
  }
  if (!message || !message.trim()) {
    return res.status(400).json({ error: '메시지를 입력해주세요.' });
  }

  // 스트림을 열기 전에 대화 소유권 확인
  try {
    const conv = await findOwnedConversation(conversation_id, userId);
    if (!conv) return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
  } catch (err) {
    console.error('Chat stream ownership check error:', err);
    return res.status(500).json({ error: '대화 확인 중 오류가 발생했습니다.' });
  }

  // SSE 헤더 설정
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // 이전 히스토리
    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT);

    const messages = [...toChronologicalHistory(history), { role: 'user', content: message }];

    let fullResponse = '';

    // 스트리밍 Claude 호출
    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        const text = chunk.delta.text;
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    // 완료 후 DB 저장
    await supabase.from('messages').insert([
      { conversation_id, role: 'user', content: message },
      { conversation_id, role: 'assistant', content: fullResponse },
    ]);

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

module.exports = router;
