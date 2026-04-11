require('dotenv').config();
const express = require('express');
const cors = require('cors');

const chatRoutes = require('./routes/chat');
const conversationRoutes = require('./routes/conversations');
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const contentsRoutes = require('./routes/contents');
const documentsRoutes = require('./routes/documents');
const generateRoutes = require('./routes/generate');
const ideasRoutes = require('./routes/ideas');
const jobsRoutes = require('./routes/jobs');
const gitRoutes = require('./routes/git');
const deploymentsRoutes = require('./routes/deployments');
const activityRoutes = require('./routes/activity');
const promptsRoutes = require('./routes/prompts');
const templatesRoutes = require('./routes/templates');

const app = express();
const PORT = process.env.PORT || 4000;

// 미들웨어
app.use(cors({
  origin: [
    'http://localhost:3000',
    process.env.FRONTEND_URL  // 배포 후 Vercel URL 추가
  ].filter(Boolean),
  credentials: true
}));
app.use(express.json());

// 헬스체크
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 라우트 — 기존
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/tasks', taskRoutes);

// 라우트 — Content Ops
app.use('/api/contents', contentsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/generate', generateRoutes);
app.use('/api/ideas', ideasRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/git', gitRoutes);
app.use('/api/deployments', deploymentsRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/prompts', promptsRoutes);
app.use('/api/templates', templatesRoutes);

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`서버 실행 중: http://0.0.0.0:${PORT}`);
});
