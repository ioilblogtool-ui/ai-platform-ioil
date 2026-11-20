// GET /api/aa/meta/types — 컴포넌트 타입 레지스트리 (D-07: 백엔드 JSON 단일 원본)
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const registry = require('../../lib/aa/type-registry.json');

const router = express.Router();

router.get('/types', requireAuth, (req, res) => {
  res.set('Cache-Control', 'private, max-age=3600');
  res.json({ data: registry });
});

module.exports = router;
