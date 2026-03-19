const express = require('express');
const { queryAll, queryOne } = require('../db/database');

const router = express.Router();

// GET /api/plants — list all plants
router.get('/', (req, res) => {
  const plants = queryAll(`
    SELECT p.*,
      (SELECT COUNT(*) FROM devices d WHERE d.plant_id = p.id) as total_devices,
      (SELECT COUNT(*) FROM devices d WHERE d.plant_id = p.id AND d.status = 'online') as online_devices,
      (SELECT COUNT(*) FROM wire_breaks wb WHERE wb.plant_id = p.id AND date(wb.timestamp) = date('now')) as today_breaks,
      (SELECT COUNT(*) FROM alerts a WHERE a.plant_id = p.id AND a.resolved = 0) as active_alerts
    FROM plants p
    ORDER BY p.name
  `);

  res.json(plants);
});

// GET /api/plants/:id — plant details with devices
router.get('/:id', (req, res) => {
  const { id } = req.params;

  const plant = queryOne('SELECT * FROM plants WHERE id = ?', [id]);
  if (!plant) return res.status(404).json({ error: 'Plant not found' });

  const devices = queryAll(`
    SELECT d.*,
      (SELECT COUNT(*) FROM wire_breaks wb WHERE wb.device_id = d.id AND wb.resolved = 0) as unresolved_breaks,
      (SELECT COUNT(*) FROM alerts a WHERE a.device_id = d.id AND a.resolved = 0) as active_alerts
    FROM devices d WHERE d.plant_id = ?
    ORDER BY d.name
  `, [id]);

  const latestEnergy = queryOne("SELECT * FROM energy_data WHERE plant_id = ? ORDER BY timestamp DESC LIMIT 1", [id]);

  const recentAlerts = queryAll(`
    SELECT a.*, d.name as device_name
    FROM alerts a
    LEFT JOIN devices d ON a.device_id = d.id
    WHERE a.plant_id = ? AND a.resolved = 0
    ORDER BY a.timestamp DESC LIMIT 10
  `, [id]);

  res.json({ plant, devices, energy: latestEnergy, alerts: recentAlerts });
});

module.exports = router;
