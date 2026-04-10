const express = require('express');
const router = express.Router();

// Supabase Auth는 프론트엔드에서 직접 처리
// 이 라우트는 추후 확장용 (소셜 로그인, 토큰 갱신 등)

// GET /api/auth/me — 현재 유저 정보
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: '토큰이 없습니다.' });
  }
  res.json({ message: 'auth route 정상 작동' });
});

module.exports = router;