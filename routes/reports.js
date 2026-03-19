const express = require('express');
const { queryAll, queryOne } = require('../db/database');

const router = express.Router();

// GET /api/reports/daily — daily breakdown summary
router.get('/daily', (req, res) => {
  const { plant_id, days = 30 } = req.query;
  let plantFilter = '';
  const params = [];
  if (plant_id) { plantFilter = ' AND b.plant_id = ?'; params.push(plant_id); }

  const report = queryAll(`
    SELECT date(b.start_time) as date,
      COUNT(*) as total_breakdowns,
      SUM(CASE WHEN b.status IN ('resolved','closed') THEN 1 ELSE 0 END) as resolved,
      SUM(CASE WHEN b.status IN ('open','acknowledged','in_progress') THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN b.severity = 'critical' THEN 1 ELSE 0 END) as critical,
      SUM(CASE WHEN b.severity = 'high' THEN 1 ELSE 0 END) as high,
      SUM(CASE WHEN b.severity = 'medium' THEN 1 ELSE 0 END) as medium,
      SUM(CASE WHEN b.severity = 'low' THEN 1 ELSE 0 END) as low,
      ROUND(AVG(CASE WHEN b.duration_minutes > 0 THEN b.duration_minutes END), 1) as avg_mttr,
      ROUND(SUM(b.duration_minutes), 1) as total_downtime,
      ROUND(SUM(b.downtime_cost)) as total_cost,
      COUNT(DISTINCT b.machine_line) as machines_affected,
      SUM(CASE WHEN b.is_recurring = 1 THEN 1 ELSE 0 END) as recurring
    FROM breakdowns b
    WHERE b.start_time >= datetime('now', '-${parseInt(days)} days')${plantFilter}
    GROUP BY date(b.start_time)
    ORDER BY date DESC
  `, params);

  res.json(report);
});

// GET /api/reports/shift — shift-wise breakdown summary
router.get('/shift', (req, res) => {
  const { plant_id, days = 7 } = req.query;
  let plantFilter = '';
  const params = [];
  if (plant_id) { plantFilter = ' AND b.plant_id = ?'; params.push(plant_id); }

  const report = queryAll(`
    SELECT date(b.start_time) as date,
      b.shift,
      COUNT(*) as total_breakdowns,
      SUM(CASE WHEN b.status IN ('resolved','closed') THEN 1 ELSE 0 END) as resolved,
      SUM(CASE WHEN b.severity = 'critical' THEN 1 ELSE 0 END) as critical,
      ROUND(AVG(CASE WHEN b.duration_minutes > 0 THEN b.duration_minutes END), 1) as avg_mttr,
      ROUND(SUM(b.duration_minutes), 1) as total_downtime,
      ROUND(SUM(b.downtime_cost)) as total_cost
    FROM breakdowns b
    WHERE b.start_time >= datetime('now', '-${parseInt(days)} days')${plantFilter}
    GROUP BY date(b.start_time), b.shift
    ORDER BY date DESC, b.shift
  `, params);

  res.json(report);
});

// GET /api/reports/monthly — monthly aggregation
router.get('/monthly', (req, res) => {
  const { plant_id } = req.query;
  let plantFilter = '';
  const params = [];
  if (plant_id) { plantFilter = ' AND b.plant_id = ?'; params.push(plant_id); }

  const report = queryAll(`
    SELECT strftime('%Y-%m', b.start_time) as month,
      COUNT(*) as total_breakdowns,
      SUM(CASE WHEN b.status IN ('resolved','closed') THEN 1 ELSE 0 END) as resolved,
      SUM(CASE WHEN b.severity = 'critical' THEN 1 ELSE 0 END) as critical,
      ROUND(AVG(CASE WHEN b.duration_minutes > 0 THEN b.duration_minutes END), 1) as avg_mttr,
      ROUND(SUM(b.duration_minutes), 1) as total_downtime,
      ROUND(SUM(b.downtime_cost)) as total_cost,
      COUNT(DISTINCT b.machine_line) as machines_affected,
      COUNT(DISTINCT b.category) as categories
    FROM breakdowns b
    WHERE b.start_time >= datetime('now', '-12 months')${plantFilter}
    GROUP BY strftime('%Y-%m', b.start_time)
    ORDER BY month DESC
  `, params);

  res.json(report);
});

// GET /api/reports/machine — machine/line wise report
router.get('/machine', (req, res) => {
  const { plant_id, days = 30 } = req.query;
  let plantFilter = '';
  const params = [];
  if (plant_id) { plantFilter = ' AND b.plant_id = ?'; params.push(plant_id); }

  const report = queryAll(`
    SELECT b.machine_line,
      COUNT(*) as total_breakdowns,
      SUM(CASE WHEN b.severity = 'critical' THEN 1 ELSE 0 END) as critical,
      SUM(CASE WHEN b.severity = 'high' THEN 1 ELSE 0 END) as high,
      ROUND(AVG(CASE WHEN b.duration_minutes > 0 THEN b.duration_minutes END), 1) as avg_mttr,
      ROUND(SUM(b.duration_minutes), 1) as total_downtime,
      ROUND(SUM(b.downtime_cost)) as total_cost,
      SUM(CASE WHEN b.is_recurring = 1 THEN 1 ELSE 0 END) as recurring,
      GROUP_CONCAT(DISTINCT b.category) as categories
    FROM breakdowns b
    WHERE b.start_time >= datetime('now', '-${parseInt(days)} days')${plantFilter}
    GROUP BY b.machine_line
    ORDER BY total_breakdowns DESC
  `, params);

  res.json(report);
});

// GET /api/reports/export — CSV export for breakdowns
router.get('/export', (req, res) => {
  const { plant_id, days = 30, status } = req.query;
  let conditions = [`b.start_time >= datetime('now', '-${parseInt(days)} days')`];
  const params = [];
  if (plant_id) { conditions.push('b.plant_id = ?'); params.push(plant_id); }
  if (status) { conditions.push('b.status = ?'); params.push(status); }
  const where = conditions.join(' AND ');

  const rows = queryAll(`
    SELECT b.breakdown_code, p.name as plant, b.machine_line, b.department, b.area, b.category, b.type, b.severity, b.priority, b.status, b.reported_by, b.assigned_to, b.resolved_by, b.start_time, b.end_time, b.duration_minutes, b.root_cause, b.corrective_action, b.preventive_action, b.shift, b.is_recurring, b.downtime_cost
    FROM breakdowns b
    JOIN plants p ON b.plant_id = p.id
    WHERE ${where}
    ORDER BY b.start_time DESC
  `, params);

  // Build CSV
  if (rows.length === 0) return res.json({ csv: '', count: 0 });

  const headers = Object.keys(rows[0]);
  const csvLines = [headers.join(',')];
  rows.forEach(row => {
    csvLines.push(headers.map(h => {
      const v = row[h];
      if (v === null || v === undefined) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','));
  });

  res.json({ csv: csvLines.join('\n'), count: rows.length });
});

module.exports = router;
