// Express 앱 구성 (라우트·미들웨어·에러 핸들러).
// 서버 실행(listen)과 스케줄러 시작은 index.js가 담당한다 — 테스트에서 포트 없이 app을 불러오기 위해 분리.
const express = require('express');
const cors = require('cors');
const requestLog = require('./middleware/requestLog');

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
const myAiModulesRoutes    = require('./routes/my-ai/modules');
const myAiAssetsRoutes     = require('./routes/my-ai/assets');
const myAiBudgetRoutes     = require('./routes/my-ai/budget');
const myAiRealestateRoutes = require('./routes/my-ai/realestate');
const myAiKeywordsRoutes   = require('./routes/my-ai/keywords');
const myAiParentingRoutes  = require('./routes/my-ai/parenting');
const myAiReportsRoutes    = require('./routes/my-ai/reports');
const myAiRecordsRoutes    = require('./routes/my-ai/records');
const myAiSnapshotsRoutes  = require('./routes/my-ai/snapshots');
const myAiGoalsRoutes      = require('./routes/my-ai/goals');
const aaProjectsRoutes     = require('./routes/aa/projects');
const aaMetaRoutes         = require('./routes/aa/meta');

const app = express();

// 미들웨어
app.use(requestLog);
app.use(cors({
  origin: [
    'http://localhost:3000',
    process.env.FRONTEND_URL  // 배포 후 Vercel URL 추가
  ].filter(Boolean),
  credentials: true
}));
// AA Workbench 설계 저장 경로만 본문 2MB (모델 한도 1MB는 validator가 별도로 검사).
// 전역 파서보다 먼저 등록해야 한다 — body-parser는 이미 파싱된 요청을 건너뛴다.
app.use('/api/aa/projects/:projectId/architecture', express.json({ limit: '2mb' }));
app.use(express.json());   // 그 외 경로는 기본 100KB

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

// 라우트 — 나만의 AI
app.use('/api/my-ai/modules',    myAiModulesRoutes);
app.use('/api/my-ai/assets',     myAiAssetsRoutes);
app.use('/api/my-ai/budget',     myAiBudgetRoutes);
app.use('/api/my-ai/realestate', myAiRealestateRoutes);
app.use('/api/my-ai/keywords',   myAiKeywordsRoutes);
app.use('/api/my-ai/parenting',  myAiParentingRoutes);
app.use('/api/my-ai/reports',    myAiReportsRoutes);
app.use('/api/my-ai/records',    myAiRecordsRoutes);
app.use('/api/my-ai/snapshots',  myAiSnapshotsRoutes);
app.use('/api/my-ai/goals',      myAiGoalsRoutes);

// 라우트 — AA Workbench
app.use('/api/aa/projects', aaProjectsRoutes);
app.use('/api/aa/meta',     aaMetaRoutes);

// 에러 핸들러 — 본문 파서 오류는 500으로 덮지 않고 413/400으로 돌려준다.
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: '요청 본문이 너무 큽니다.', code: 'PAYLOAD_TOO_LARGE', details: { limit: err.limit } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '잘못된 JSON 형식입니다.', code: 'VALIDATION_FAILED' });
  }
  console.error(err.stack);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

module.exports = app;
