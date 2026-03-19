const express = require('express');
const { queryAll, queryOne, runSql } = require('../db/database');

const router = express.Router();

// GET /api/notifications — list notifications
router.get('/', (req, res) => {
  const { limit = 50, unread_only } = req.query;
  let query = 'SELECT * FROM notifications';
  const params = [];
  if (unread_only === '1') { query += ' WHERE is_read = 0'; }
  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit));

  const notifications = queryAll(query, params);
  const unreadCount = queryOne('SELECT COUNT(*) as count FROM notifications WHERE is_read = 0')?.count || 0;

  res.json({ notifications, unread_count: unreadCount });
});

// PUT /api/notifications/:id/read
router.put('/:id/read', (req, res) => {
  runSql('UPDATE notifications SET is_read = 1 WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ success: true });
});

// PUT /api/notifications/read-all
router.put('/read-all', (req, res) => {
  runSql('UPDATE notifications SET is_read = 1 WHERE is_read = 0');
  res.json({ success: true });
});

module.exports = router;
