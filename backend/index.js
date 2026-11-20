require('dotenv').config();
const app = require('./app');
const { startScheduler } = require('./lib/scheduler');

const PORT = process.env.PORT || 4000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`서버 실행 중: http://0.0.0.0:${PORT}`);
  startScheduler();
});
