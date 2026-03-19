const express = require('express');
const { queryAll, queryOne } = require('../db/database');
const aiEngine = require('../services/aiEngine');

const router = express.Router();

// GET /api/predictive/overview — prediction summary
router.get('/overview', (req, res) => {
  const predictions = queryAll(`
    SELECT pr.*, d.name as device_name, p.name as plant_name
    FROM predictions pr
    JOIN devices d ON pr.device_id = d.id
    JOIN plants p ON pr.plant_id = p.id
    ORDER BY pr.failure_probability DESC
  `);

  const stats = {
    total: predictions.length,
    critical: predictions.filter(p => p.status === 'critical').length,
    warning: predictions.filter(p => p.status === 'warning').length,
    active: predictions.filter(p => p.status === 'active').length,
    avg_confidence: predictions.length > 0
      ? Math.round(predictions.reduce((sum, p) => sum + p.model_confidence, 0) / predictions.length * 100) / 100
      : 0,
  };

  // Upcoming failures (next 30 days, sorted by date)
  const upcoming = predictions
    .filter(p => {
      const daysUntil = Math.ceil((new Date(p.predicted_failure_date) - new Date()) / (86400000));
      return daysUntil > 0 && daysUntil <= 30;
    })
    .sort((a, b) => new Date(a.predicted_failure_date) - new Date(b.predicted_failure_date));

  res.json({ predictions, stats, upcoming });
});

// GET /api/predictive/device/:deviceId — AI analysis for a device
router.get('/device/:deviceId', (req, res) => {
  const { deviceId } = req.params;

  const device = queryOne(`
    SELECT d.*, p.name as plant_name FROM devices d
    JOIN plants p ON d.plant_id = p.id
    WHERE d.id = ?
  `, [deviceId]);

  if (!device) return res.status(404).json({ error: 'Device not found' });

  // Get energy history for the device's plant
  const energyHistory = queryAll(`
    SELECT * FROM energy_data WHERE plant_id = ? ORDER BY timestamp DESC LIMIT 168
  `, [device.plant_id]);

  const healthAnalysis = aiEngine.analyzeDeviceHealth(energyHistory);

  const predictions = queryAll(`
    SELECT * FROM predictions WHERE device_id = ? ORDER BY failure_probability DESC
  `, [deviceId]);

  res.json({ device, health: healthAnalysis, predictions });
});

// GET /api/predictive/forecast — energy load forecast
router.get('/forecast', (req, res) => {
  const { plant_id, hours = 24 } = req.query;

  let query = "SELECT * FROM energy_data WHERE timestamp >= datetime('now', '-7 days')";
  const params = [];
  if (plant_id) { query += ' AND plant_id = ?'; params.push(plant_id); }
  query += ' ORDER BY timestamp ASC';

  const history = queryAll(query, params);
  const forecast = aiEngine.generateForecast(history, parseInt(hours));

  res.json({ history_points: history.length, forecast });
});

// GET /api/predictive/health-matrix — health matrix for all devices
router.get('/health-matrix', (req, res) => {
  const devices = queryAll(`
    SELECT d.*, p.name as plant_name FROM devices d
    JOIN plants p ON d.plant_id = p.id
  `);

  const matrix = devices.map(device => {
    const energyHistory = queryAll(`
      SELECT * FROM energy_data WHERE plant_id = ? ORDER BY timestamp DESC LIMIT 48
    `, [device.plant_id]);

    const health = aiEngine.analyzeDeviceHealth(energyHistory);

    const topPrediction = queryOne(`
      SELECT * FROM predictions WHERE device_id = ? ORDER BY failure_probability DESC LIMIT 1
    `, [device.id]);

    return {
      device_id: device.id,
      device_name: device.name,
      device_type: device.type,
      plant_name: device.plant_name,
      status: device.status,
      health_score: health.health_score,
      risk_level: health.risk_level,
      anomaly_count: health.anomalies.length,
      top_prediction: topPrediction || null,
    };
  });

  // Sort by health score ascending (worst first)
  matrix.sort((a, b) => a.health_score - b.health_score);

  res.json(matrix);
});

module.exports = router;
