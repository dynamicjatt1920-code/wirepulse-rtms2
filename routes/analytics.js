const express = require('express');
const { queryAll, queryOne } = require('../db/database');

const router = express.Router();

// GET /api/analytics/wire-breaks — wire break analytics
router.get('/wire-breaks', (req, res) => {
  const { plant_id, days = 30 } = req.query;

  // Daily trend
  let trendQuery = `
    SELECT date(timestamp) as date, COUNT(*) as events, SUM(break_count) as total_breaks,
      SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical,
      SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) as high,
      SUM(CASE WHEN severity = 'medium' THEN 1 ELSE 0 END) as medium,
      SUM(CASE WHEN severity = 'low' THEN 1 ELSE 0 END) as low
    FROM wire_breaks
    WHERE timestamp >= datetime('now', '-${parseInt(days)} days')
  `;
  const params = [];
  if (plant_id) { trendQuery += ' AND plant_id = ?'; params.push(plant_id); }
  trendQuery += ' GROUP BY date(timestamp) ORDER BY date';

  const trend = queryAll(trendQuery, params);

  // By severity
  let sevQuery = `SELECT severity, COUNT(*) as count FROM wire_breaks WHERE timestamp >= datetime('now', '-${parseInt(days)} days')`;
  const sevParams = [];
  if (plant_id) { sevQuery += ' AND plant_id = ?'; sevParams.push(plant_id); }
  sevQuery += ' GROUP BY severity';
  const bySeverity = queryAll(sevQuery, sevParams);

  // By plant
  const byPlant = queryAll(`
    SELECT p.name as plant_name, COUNT(*) as count
    FROM wire_breaks wb
    JOIN plants p ON wb.plant_id = p.id
    WHERE wb.timestamp >= datetime('now', '-${parseInt(days)} days')
    GROUP BY wb.plant_id
    ORDER BY count DESC
  `);

  // Top affected wires
  let wireQuery = `SELECT wire_id, COUNT(*) as count, SUM(break_count) as total_breaks FROM wire_breaks WHERE timestamp >= datetime('now', '-${parseInt(days)} days')`;
  const wireParams = [];
  if (plant_id) { wireQuery += ' AND plant_id = ?'; wireParams.push(plant_id); }
  wireQuery += ' GROUP BY wire_id ORDER BY count DESC LIMIT 10';
  const topWires = queryAll(wireQuery, wireParams);

  // MTTR (Mean Time To Resolve)
  const mttrData = queryOne(`
    SELECT AVG((julianday(resolved_at) - julianday(timestamp)) * 24) as avg_hours
    FROM wire_breaks
    WHERE resolved = 1 AND resolved_at IS NOT NULL
    AND timestamp >= datetime('now', '-${parseInt(days)} days')
  `);

  res.json({
    trend,
    by_severity: bySeverity,
    by_plant: byPlant,
    top_wires: topWires,
    mttr_hours: Math.round((mttrData?.avg_hours || 0) * 100) / 100,
  });
});

// GET /api/analytics/energy — energy analytics
router.get('/energy', (req, res) => {
  const { plant_id, days = 7 } = req.query;

  let query = `
    SELECT date(timestamp) as date, plant_id,
      AVG(active_power_kw) as avg_power,
      MAX(active_power_kw) as max_power,
      AVG(power_factor) as avg_pf,
      SUM(energy_kwh) as total_energy,
      MAX(max_demand_kw) as peak_demand,
      AVG(thd_voltage) as avg_thd_v,
      AVG(temperature) as avg_temp
    FROM energy_data
    WHERE timestamp >= datetime('now', '-${parseInt(days)} days')
  `;
  const params = [];
  if (plant_id) { query += ' AND plant_id = ?'; params.push(plant_id); }
  query += ' GROUP BY date(timestamp), plant_id ORDER BY date';

  const data = queryAll(query, params);
  res.json(data);
});

// GET /api/analytics/devices — device performance analytics
router.get('/devices', (req, res) => {
  const devices = queryAll(`
    SELECT d.*,
      p.name as plant_name,
      (SELECT COUNT(*) FROM wire_breaks wb WHERE wb.device_id = d.id) as total_breaks,
      (SELECT COUNT(*) FROM alerts a WHERE a.device_id = d.id AND a.resolved = 0) as active_alerts
    FROM devices d
    JOIN plants p ON d.plant_id = p.id
    ORDER BY active_alerts DESC, total_breaks DESC
  `);

  res.json(devices);
});

module.exports = router;
