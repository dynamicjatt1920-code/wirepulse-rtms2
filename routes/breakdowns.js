const express = require('express');
const { queryAll, queryOne, runSql } = require('../db/database');

const router = express.Router();

// GET /api/breakdowns — list with filters, search, pagination
router.get('/', (req, res) => {
  const { status, severity, category, department, plant_id, machine_line, shift, priority, search, days = 30, limit = 500 } = req.query;

  let conditions = [`b.start_time >= datetime('now', '-${parseInt(days)} days')`];
  let params = [];

  if (status) { conditions.push('b.status = ?'); params.push(status); }
  if (severity) { conditions.push('b.severity = ?'); params.push(severity); }
  if (category) { conditions.push('b.category = ?'); params.push(category); }
  if (department) { conditions.push('b.department = ?'); params.push(department); }
  if (plant_id) { conditions.push('b.plant_id = ?'); params.push(plant_id); }
  if (machine_line) { conditions.push('b.machine_line = ?'); params.push(machine_line); }
  if (shift) { conditions.push('b.shift = ?'); params.push(shift); }
  if (priority) { conditions.push('b.priority = ?'); params.push(priority); }
  if (search) { conditions.push("(b.breakdown_code LIKE ? OR b.description LIKE ? OR b.machine_line LIKE ? OR b.type LIKE ?)"); params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const breakdowns = queryAll(`
    SELECT b.*, p.name as plant_name, d.name as device_name
    FROM breakdowns b
    JOIN plants p ON b.plant_id = p.id
    LEFT JOIN devices d ON b.device_id = d.id
    ${where}
    ORDER BY b.start_time DESC
    LIMIT ?
  `, [...params, parseInt(limit)]);

  res.json(breakdowns);
});

// GET /api/breakdowns/current — active breakdowns only (open, acknowledged, in_progress)
router.get('/current', (req, res) => {
  const breakdowns = queryAll(`
    SELECT b.*, p.name as plant_name, d.name as device_name
    FROM breakdowns b
    JOIN plants p ON b.plant_id = p.id
    LEFT JOIN devices d ON b.device_id = d.id
    WHERE b.status IN ('open', 'acknowledged', 'in_progress')
    ORDER BY
      CASE b.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
      CASE b.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END,
      b.start_time ASC
  `);
  res.json(breakdowns);
});

// GET /api/breakdowns/stats — MTTR, MTBF, uptime, summary stats
router.get('/stats', (req, res) => {
  const { plant_id, days = 30 } = req.query;
  let plantFilter = '';
  const params = [];
  if (plant_id) { plantFilter = ' AND b.plant_id = ?'; params.push(plant_id); }

  // Total counts by status
  const total = queryOne(`SELECT COUNT(*) as count FROM breakdowns b WHERE b.start_time >= datetime('now', '-${parseInt(days)} days')${plantFilter}`, params)?.count || 0;
  const open = queryOne(`SELECT COUNT(*) as count FROM breakdowns b WHERE b.status = 'open' AND b.start_time >= datetime('now', '-${parseInt(days)} days')${plantFilter}`, params)?.count || 0;
  const acknowledged = queryOne(`SELECT COUNT(*) as count FROM breakdowns b WHERE b.status = 'acknowledged' AND b.start_time >= datetime('now', '-${parseInt(days)} days')${plantFilter}`, params)?.count || 0;
  const inProgress = queryOne(`SELECT COUNT(*) as count FROM breakdowns b WHERE b.status = 'in_progress' AND b.start_time >= datetime('now', '-${parseInt(days)} days')${plantFilter}`, params)?.count || 0;
  const resolved = queryOne(`SELECT COUNT(*) as count FROM breakdowns b WHERE b.status IN ('resolved','closed') AND b.start_time >= datetime('now', '-${parseInt(days)} days')${plantFilter}`, params)?.count || 0;

  // MTTR (Mean Time To Repair) in minutes
  const mttrResult = queryOne(`SELECT AVG(b.duration_minutes) as avg_mttr, MIN(b.duration_minutes) as min_mttr, MAX(b.duration_minutes) as max_mttr FROM breakdowns b WHERE b.status IN ('resolved','closed') AND b.duration_minutes > 0 AND b.start_time >= datetime('now', '-${parseInt(days)} days')${plantFilter}`, params);
  const mttr = Math.round((mttrResult?.avg_mttr || 0) * 10) / 10;

  // MTBF (Mean Time Between Failures) — avg gap between consecutive breakdowns
  const breakdownTimes = queryAll(`SELECT b.start_time FROM breakdowns b WHERE b.start_time >= datetime('now', '-${parseInt(days)} days')${plantFilter} ORDER BY b.start_time ASC`, params);
  let mtbf = 0;
  if (breakdownTimes.length > 1) {
    let totalGap = 0;
    for (let i = 1; i < breakdownTimes.length; i++) {
      totalGap += (new Date(breakdownTimes[i].start_time) - new Date(breakdownTimes[i - 1].start_time)) / 60000;
    }
    mtbf = Math.round((totalGap / (breakdownTimes.length - 1)) * 10) / 10;
  }

  // By category
  const byCategory = queryAll(`SELECT b.category, COUNT(*) as count FROM breakdowns b WHERE b.start_time >= datetime('now', '-${parseInt(days)} days')${plantFilter} GROUP BY b.category ORDER BY count DESC`, params);

  // By severity
  const bySeverity = queryAll(`SELECT b.severity, COUNT(*) as count FROM breakdowns b WHERE b.start_time >= datetime('now', '-${parseInt(days)} days')${plantFilter} GROUP BY b.severity`, params);

  // By department
  const byDepartment = queryAll(`SELECT b.department, COUNT(*) as count FROM breakdowns b WHERE b.start_time >= datetime('now', '-${parseInt(days)} days')${plantFilter} GROUP BY b.department ORDER BY count DESC`, params);

  // By machine/line
  const byMachine = queryAll(`SELECT b.machine_line, COUNT(*) as count, AVG(b.duration_minutes) as avg_duration FROM breakdowns b WHERE b.start_time >= datetime('now', '-${parseInt(days)} days')${plantFilter} GROUP BY b.machine_line ORDER BY count DESC LIMIT 10`, params);

  // By plant
  const byPlant = queryAll(`SELECT p.name as plant_name, COUNT(*) as count FROM breakdowns b JOIN plants p ON b.plant_id = p.id WHERE b.start_time >= datetime('now', '-${parseInt(days)} days')${plantFilter} GROUP BY b.plant_id ORDER BY count DESC`, params);

  // Daily trend
  const dailyTrend = queryAll(`SELECT date(b.start_time) as date, COUNT(*) as count, SUM(CASE WHEN b.status IN ('resolved','closed') THEN 1 ELSE 0 END) as resolved_count, AVG(CASE WHEN b.duration_minutes > 0 THEN b.duration_minutes END) as avg_duration FROM breakdowns b WHERE b.start_time >= datetime('now', '-${parseInt(days)} days')${plantFilter} GROUP BY date(b.start_time) ORDER BY date`, params);

  // By type (Pareto)
  const byType = queryAll(`SELECT b.type, b.category, COUNT(*) as count FROM breakdowns b WHERE b.start_time >= datetime('now', '-${parseInt(days)} days')${plantFilter} GROUP BY b.type ORDER BY count DESC LIMIT 15`, params);

  // By shift
  const byShift = queryAll(`SELECT b.shift, COUNT(*) as count, AVG(b.duration_minutes) as avg_duration FROM breakdowns b WHERE b.start_time >= datetime('now', '-${parseInt(days)} days')${plantFilter} GROUP BY b.shift ORDER BY count DESC`, params);

  // Recurring breakdowns
  const recurringCount = queryOne(`SELECT COUNT(*) as count FROM breakdowns b WHERE b.is_recurring = 1 AND b.start_time >= datetime('now', '-${parseInt(days)} days')${plantFilter}`, params)?.count || 0;

  // Total downtime cost
  const totalCost = queryOne(`SELECT SUM(b.downtime_cost) as total FROM breakdowns b WHERE b.start_time >= datetime('now', '-${parseInt(days)} days')${plantFilter}`, params)?.total || 0;

  // Uptime % (assuming 24h * days available, subtract total breakdown minutes)
  const totalMinutes = parseInt(days) * 24 * 60;
  const totalDowntime = queryOne(`SELECT SUM(b.duration_minutes) as total FROM breakdowns b WHERE b.status IN ('resolved','closed') AND b.start_time >= datetime('now', '-${parseInt(days)} days')${plantFilter}`, params)?.total || 0;
  const uptimePercent = totalMinutes > 0 ? Math.round((1 - totalDowntime / totalMinutes) * 10000) / 100 : 100;

  res.json({
    summary: { total, open, acknowledged, in_progress: inProgress, resolved },
    mttr, mtbf, uptime_percent: uptimePercent,
    min_mttr: Math.round((mttrResult?.min_mttr || 0) * 10) / 10,
    max_mttr: Math.round((mttrResult?.max_mttr || 0) * 10) / 10,
    recurring_count: recurringCount,
    total_downtime_cost: Math.round(totalCost),
    by_category: byCategory,
    by_severity: bySeverity,
    by_department: byDepartment,
    by_machine: byMachine,
    by_plant: byPlant,
    by_type: byType,
    by_shift: byShift,
    daily_trend: dailyTrend,
  });
});

// GET /api/breakdowns/:id — single breakdown detail
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const breakdown = queryOne(`
    SELECT b.*, p.name as plant_name, d.name as device_name
    FROM breakdowns b
    JOIN plants p ON b.plant_id = p.id
    LEFT JOIN devices d ON b.device_id = d.id
    WHERE b.id = ?
  `, [parseInt(id)]);

  if (!breakdown) return res.status(404).json({ error: 'Breakdown not found' });
  res.json(breakdown);
});

// POST /api/breakdowns — create new breakdown
router.post('/', (req, res) => {
  const { plant_id, device_id, machine_line, department, area, category, type, description, severity, priority, reported_by, shift } = req.body;

  if (!plant_id || !machine_line || !type) {
    return res.status(400).json({ error: 'plant_id, machine_line, and type are required' });
  }

  // Generate breakdown code
  const lastCode = queryOne("SELECT breakdown_code FROM breakdowns ORDER BY id DESC LIMIT 1");
  let nextNum = 1;
  if (lastCode?.breakdown_code) {
    const match = lastCode.breakdown_code.match(/BD-(\d+)/);
    if (match) nextNum = parseInt(match[1]) + 1;
  }
  const code = `BD-${String(nextNum).padStart(5, '0')}`;

  runSql(
    `INSERT INTO breakdowns (breakdown_code, plant_id, device_id, machine_line, department, area, category, type, description, severity, priority, status, reported_by, shift) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
    [code, plant_id, device_id || null, machine_line, department || 'Electrical', area || null, category || 'Electrical', type, description || null, severity || 'medium', priority || 'normal', reported_by || 'System', shift || null]
  );

  res.json({ success: true, breakdown_code: code });
});

// PUT /api/breakdowns/:id/acknowledge
router.put('/:id/acknowledge', (req, res) => {
  const { id } = req.params;
  const { acknowledged_by } = req.body;
  runSql("UPDATE breakdowns SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = datetime('now') WHERE id = ? AND status = 'open'", [acknowledged_by || 'System', parseInt(id)]);
  res.json({ success: true });
});

// PUT /api/breakdowns/:id/assign
router.put('/:id/assign', (req, res) => {
  const { id } = req.params;
  const { assigned_to } = req.body;
  runSql("UPDATE breakdowns SET status = 'in_progress', assigned_to = ?, assigned_at = datetime('now'), resolution_start = datetime('now') WHERE id = ? AND status IN ('open','acknowledged')", [assigned_to || 'Unassigned', parseInt(id)]);
  res.json({ success: true });
});

// PUT /api/breakdowns/:id/resolve
router.put('/:id/resolve', (req, res) => {
  const { id } = req.params;
  const { resolved_by, root_cause, corrective_action, preventive_action, parts_replaced } = req.body;

  // Calculate duration
  const bd = queryOne("SELECT start_time FROM breakdowns WHERE id = ?", [parseInt(id)]);
  const duration = bd ? Math.round((Date.now() - new Date(bd.start_time).getTime()) / 60000) : 0;
  const cost = Math.round(duration * (50 + Math.random() * 150));

  runSql("UPDATE breakdowns SET status = 'resolved', resolved_by = ?, end_time = datetime('now'), duration_minutes = ?, root_cause = ?, corrective_action = ?, preventive_action = ?, parts_replaced = ?, downtime_cost = ? WHERE id = ? AND status IN ('open','acknowledged','in_progress')",
    [resolved_by || 'System', duration, root_cause || null, corrective_action || null, preventive_action || null, parts_replaced || null, cost, parseInt(id)]);
  res.json({ success: true, duration_minutes: duration });
});

// PUT /api/breakdowns/:id/close
router.put('/:id/close', (req, res) => {
  const { id } = req.params;
  runSql("UPDATE breakdowns SET status = 'closed' WHERE id = ? AND status = 'resolved'", [parseInt(id)]);
  res.json({ success: true });
});

module.exports = router;
