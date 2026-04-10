const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// POST /api/chat
// 메시지 전송 + Claude 응답 + DB 저장
router.post('/', requireAuth, async (req, res) => {
  const { conversation_id, message, project_id } = req.body;
  const userId = req.user.id;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: '메시지를 입력해주세요.' });
  }

  try {
    // 1. 대화 ID가 없으면 새 대화 생성
    let convId = conversation_id;
    let systemPrompt = '당신은 1인 기업 운영을 돕는 AI 어시스턴트입니다. 한국어로 간결하고 실용적으로 답변하세요.';

    if (!convId) {
      // 프로젝트의 시스템 프롬프트 가져오기
      if (project_id) {
        const { data: project } = await supabase
          .from('projects')
          .select('system_prompt')
          .eq('id', project_id)
          .single();
        if (project?.system_prompt) systemPrompt = project.system_prompt;
      }

      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          project_id: project_id || null,
          user_id: userId,
          title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
        })
        .select()
        .single();

      if (convError) throw convError;
      convId = newConv.id;
    } else {
      // 기존 대화의 프로젝트 시스템 프롬프트 가져오기
      const { data: conv } = await supabase
        .from('conversations')
        .select('project:projects(system_prompt)')
        .eq('id', convId)
        .single();
      if (conv?.project?.system_prompt) systemPrompt = conv.project.system_prompt;
    }

    // 2. 이전 메시지 히스토리 가져오기 (최근 20개)
    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(20);

    // 3. 유저 메시지 DB 저장
    await supabase.from('messages').insert({
      conversation_id: convId,
      role: 'user',
      content: message,
    });

    // 4. Claude API 호출
    const claudeMessages = [
      ...(history || []),
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
      .order('created_at', { ascending: true })
      .limit(20);

    const messages = [...(history || []), { role: 'user', content: message }];

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
