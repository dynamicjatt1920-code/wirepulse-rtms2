const express = require('express');
const { queryAll, queryOne, runSql } = require('../db/database');

const router = express.Router();

// GET /api/alerts — list alerts with filters
router.get('/', (req, res) => {
  const { severity, type, resolved, plant_id, limit = 200 } = req.query;

  let conditions = [];
  let params = [];

  if (severity) { conditions.push('a.severity = ?'); params.push(severity); }
  if (type) { conditions.push('a.type = ?'); params.push(type); }
  if (resolved !== undefined) { conditions.push('a.resolved = ?'); params.push(parseInt(resolved)); }
  if (plant_id) { conditions.push('a.plant_id = ?'); params.push(plant_id); }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const alerts = queryAll(`
    SELECT a.*, p.name as plant_name, d.name as device_name
    FROM alerts a
    JOIN plants p ON a.plant_id = p.id
    LEFT JOIN devices d ON a.device_id = d.id
    ${where}
    ORDER BY a.timestamp DESC
    LIMIT ?
  `, [...params, parseInt(limit)]);

  // Stats
  const stats = {
    total: queryOne('SELECT COUNT(*) as count FROM alerts').count,
    active: queryOne("SELECT COUNT(*) as count FROM alerts WHERE resolved = 0").count,
    critical: queryOne("SELECT COUNT(*) as count FROM alerts WHERE severity = 'critical' AND resolved = 0").count,
    high: queryOne("SELECT COUNT(*) as count FROM alerts WHERE severity = 'high' AND resolved = 0").count,
    medium: queryOne("SELECT COUNT(*) as count FROM alerts WHERE severity = 'medium' AND resolved = 0").count,
    low: queryOne("SELECT COUNT(*) as count FROM alerts WHERE severity = 'low' AND resolved = 0").count,
    unacknowledged: queryOne("SELECT COUNT(*) as count FROM alerts WHERE acknowledged = 0 AND resolved = 0").count,
  };

  res.json({ alerts, stats });
});

// POST /api/alerts/:id/acknowledge
router.post('/:id/acknowledge', (req, res) => {
  const { id } = req.params;
  const user = req.user?.full_name || 'System';

  runSql("UPDATE alerts SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = datetime('now') WHERE id = ?", [user, parseInt(id)]);
  res.json({ success: true });
});

// POST /api/alerts/:id/resolve
router.post('/:id/resolve', (req, res) => {
  const { id } = req.params;

  runSql("UPDATE alerts SET resolved = 1, resolved_at = datetime('now'), acknowledged = 1 WHERE id = ?", [parseInt(id)]);
  res.json({ success: true });
});

module.exports = router;
