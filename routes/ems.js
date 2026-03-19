const express = require('express');
const { queryAll, queryOne } = require('../db/database');

const router = express.Router();

// GET /api/ems/realtime — latest energy readings for all plants
router.get('/realtime', (req, res) => {
  const plants = queryAll('SELECT * FROM plants');

  const data = plants.map(plant => {
    const latest = queryOne("SELECT * FROM energy_data WHERE plant_id = ? ORDER BY timestamp DESC LIMIT 1", [plant.id]);
    return { plant, energy: latest };
  });

  res.json(data);
});

// GET /api/ems/history — energy history for a plant
router.get('/history', (req, res) => {
  const { plant_id, hours = 24 } = req.query;

  let query = `
    SELECT * FROM energy_data
    WHERE timestamp >= datetime('now', '-${parseInt(hours)} hours')
  `;
  const params = [];
  if (plant_id) {
    query += ' AND plant_id = ?';
    params.push(plant_id);
  }
  query += ' ORDER BY timestamp ASC';

  const data = queryAll(query, params);
  res.json(data);
});

// GET /api/ems/consumption — energy consumption summary
router.get('/consumption', (req, res) => {
  const { plant_id, period = 'daily' } = req.query;

  let groupBy;
  switch (period) {
    case 'hourly': groupBy = "strftime('%Y-%m-%d %H:00', timestamp)"; break;
    case 'weekly': groupBy = "strftime('%Y-W%W', timestamp)"; break;
    case 'monthly': groupBy = "strftime('%Y-%m', timestamp)"; break;
    default: groupBy = "date(timestamp)";
  }

  let query = `
    SELECT ${groupBy} as period,
      plant_id,
      AVG(active_power_kw) as avg_power,
      MAX(active_power_kw) as max_power,
      MIN(active_power_kw) as min_power,
      AVG(power_factor) as avg_pf,
      AVG(frequency) as avg_freq,
      MAX(max_demand_kw) as peak_demand,
      SUM(energy_kwh) as total_energy,
      AVG(thd_voltage) as avg_thd_v,
      AVG(thd_current) as avg_thd_i,
      AVG(temperature) as avg_temp
    FROM energy_data
    WHERE timestamp >= datetime('now', '-30 days')
  `;
  const params = [];
  if (plant_id) {
    query += ' AND plant_id = ?';
    params.push(plant_id);
  }
  query += ` GROUP BY ${groupBy}, plant_id ORDER BY period ASC`;

  const data = queryAll(query, params);
  res.json(data);
});

// GET /api/ems/shift-reports — shift report data
router.get('/shift-reports', (req, res) => {
  const { plant_id, days = 7 } = req.query;

  let query = `SELECT * FROM shift_reports WHERE date >= date('now', '-${parseInt(days)} days')`;
  const params = [];
  if (plant_id) {
    query += ' AND plant_id = ?';
    params.push(plant_id);
  }
  query += ' ORDER BY date DESC, shift ASC';

  const data = queryAll(query, params);
  res.json(data);
});

module.exports = router;
