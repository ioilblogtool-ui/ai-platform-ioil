// GET /api/aa/meta/types — 컴포넌트 타입 레지스트리 (D-07: 백엔드 JSON 단일 원본)
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
// 저장 검증(V6)과 같은 객체를 그대로 내보낸다 — 정의가 한 곳뿐임을 보장
const { REGISTRY: registry } = require('../../lib/aa/architecture-validator');

const router = express.Router();

router.get('/types', requireAuth, (req, res) => {
  res.set('Cache-Control', 'private, max-age=3600');
  res.json({ data: registry });
});

module.exports = router;
