const express = require('express');
const { queryAll, queryOne } = require('../db/database');

const router = express.Router();

// GET /api/dashboard/summary — main KPIs
router.get('/summary', (req, res) => {
  const totalPlants = queryOne('SELECT COUNT(*) as count FROM plants').count;
  const onlinePlants = queryOne("SELECT COUNT(*) as count FROM plants WHERE status = 'online'").count;
  const totalDevices = queryOne('SELECT COUNT(*) as count FROM devices').count;
  const onlineDevices = queryOne("SELECT COUNT(*) as count FROM devices WHERE status = 'online'").count;
  const offlineDevices = queryOne("SELECT COUNT(*) as count FROM devices WHERE status = 'offline'").count;
  const warningDevices = queryOne("SELECT COUNT(*) as count FROM devices WHERE status = 'warning'").count;

  // Today's wire breaks
  const todayBreaks = queryOne("SELECT COUNT(*) as count FROM wire_breaks WHERE date(timestamp) = date('now')").count;
  const unresolvedBreaks = queryOne("SELECT COUNT(*) as count FROM wire_breaks WHERE resolved = 0").count;

  // Active alerts
  const activeAlerts = queryOne("SELECT COUNT(*) as count FROM alerts WHERE resolved = 0").count;
  const criticalAlerts = queryOne("SELECT COUNT(*) as count FROM alerts WHERE resolved = 0 AND severity = 'critical'").count;
  const unacknowledgedAlerts = queryOne("SELECT COUNT(*) as count FROM alerts WHERE acknowledged = 0 AND resolved = 0").count;

  // Latest energy data
  const latestEnergy = queryOne("SELECT * FROM energy_data ORDER BY timestamp DESC LIMIT 1");

  // Total energy today
  const todayEnergy = queryOne("SELECT SUM(energy_kwh) as total FROM energy_data WHERE date(timestamp) = date('now')");

  // Avg power factor today
  const avgPF = queryOne("SELECT AVG(power_factor) as avg_pf FROM energy_data WHERE date(timestamp) = date('now')");

  // Critical predictions
  const criticalPredictions = queryOne("SELECT COUNT(*) as count FROM predictions WHERE status = 'critical'").count;

  // Wire breaks trend (last 7 days)
  const breaksTrend = queryAll(`
    SELECT date(timestamp) as date, COUNT(*) as count, SUM(break_count) as total_breaks
    FROM wire_breaks
    WHERE timestamp >= datetime('now', '-7 days')
    GROUP BY date(timestamp)
    ORDER BY date
  `);

  res.json({
    plants: { total: totalPlants, online: onlinePlants },
    devices: { total: totalDevices, online: onlineDevices, offline: offlineDevices, warning: warningDevices },
    wire_breaks: { today: todayBreaks, unresolved: unresolvedBreaks, trend: breaksTrend },
    alerts: { active: activeAlerts, critical: criticalAlerts, unacknowledged: unacknowledgedAlerts },
    energy: {
      latest: latestEnergy,
      today_total_kwh: Math.round((todayEnergy?.total || 0) * 100) / 100,
      avg_power_factor: Math.round((avgPF?.avg_pf || 0) * 1000) / 1000,
    },
    predictions: { critical: criticalPredictions },
  });
});

// GET /api/dashboard/live — real-time data for all plants
router.get('/live', (req, res) => {
  const plants = queryAll('SELECT * FROM plants');
  const liveData = plants.map(plant => {
    const latestEnergy = queryOne("SELECT * FROM energy_data WHERE plant_id = ? ORDER BY timestamp DESC LIMIT 1", [plant.id]);
    const recentBreaks = queryOne("SELECT COUNT(*) as count FROM wire_breaks WHERE plant_id = ? AND timestamp >= datetime('now', '-1 hour')", [plant.id]).count;
    const activeAlerts = queryOne("SELECT COUNT(*) as count FROM alerts WHERE plant_id = ? AND resolved = 0", [plant.id]).count;
    const devices = queryAll("SELECT status, COUNT(*) as count FROM devices WHERE plant_id = ? GROUP BY status", [plant.id]);

    return {
      ...plant,
      energy: latestEnergy,
      recent_breaks: recentBreaks,
      active_alerts: activeAlerts,
      device_status: devices,
    };
  });

  res.json(liveData);
});

// GET /api/dashboard/wire-breaks — recent wire break events
router.get('/wire-breaks', (req, res) => {
  const { plant_id, days = 7, limit = 100 } = req.query;

  let query = `
    SELECT wb.*, d.name as device_name, p.name as plant_name
    FROM wire_breaks wb
    JOIN devices d ON wb.device_id = d.id
    JOIN plants p ON wb.plant_id = p.id
    WHERE wb.timestamp >= datetime('now', '-${parseInt(days)} days')
  `;
  const params = [];
  if (plant_id) {
    query += ' AND wb.plant_id = ?';
    params.push(plant_id);
  }
  query += ` ORDER BY wb.timestamp DESC LIMIT ?`;
  params.push(parseInt(limit));

  const breaks = queryAll(query, params);
  res.json(breaks);
});

module.exports = router;
