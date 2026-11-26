const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Supabase Auth는 프론트엔드에서 직접 처리
// 이 라우트는 추후 확장용 (소셜 로그인, 토큰 갱신 등)

// GET /api/auth/me — 토큰을 검증한 뒤 현재 유저 정보 반환
router.get('/me', requireAuth, (req, res) => {
  const { id, email } = req.user;
  res.json({ id, email });
});

module.exports = router;