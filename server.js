const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const { initDb, queryAll, runSql, startAutoSave } = require('./db/database');
const plcSimulator = require('./services/plcSimulator');
const { authMiddleware } = require('./middleware/auth');

// Routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const alertsRoutes = require('./routes/alerts');
const emsRoutes = require('./routes/ems');
const analyticsRoutes = require('./routes/analytics');
const plantsRoutes = require('./routes/plants');
const predictiveRoutes = require('./routes/predictive');
const breakdownsRoutes = require('./routes/breakdowns');
const reportsRoutes = require('./routes/reports');
const notificationsRoutes = require('./routes/notifications');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend build in production
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/ems', emsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/plants', plantsRoutes);
app.use('/api/predictive', predictiveRoutes);
app.use('/api/breakdowns', breakdownsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/notifications', notificationsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket Server for real-time data
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
}

// Real-time data simulation — pushes new data every 3 seconds
function startRealtimeSimulation() {
  const plants = queryAll('SELECT * FROM plants');
  const devices = queryAll('SELECT * FROM devices');

  setInterval(() => {
    plants.forEach(plant => {
      const snapshot = plcSimulator.generateEnergySnapshot(plant.id, plant.capacity_mw);

      // Store in DB
      runSql(`
        INSERT INTO energy_data (plant_id, active_power_kw, reactive_power_kvar, apparent_power_kva, power_factor, voltage_r, voltage_y, voltage_b, current_r, current_y, current_b, frequency, energy_kwh, max_demand_kw, thd_voltage, thd_current, temperature, humidity, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        snapshot.plant_id, snapshot.active_power_kw, snapshot.reactive_power_kvar,
        snapshot.apparent_power_kva, snapshot.power_factor,
        snapshot.voltage_r, snapshot.voltage_y, snapshot.voltage_b,
        snapshot.current_r, snapshot.current_y, snapshot.current_b,
        snapshot.frequency, snapshot.energy_kwh, snapshot.max_demand_kw,
        snapshot.thd_voltage, snapshot.thd_current, snapshot.temperature, snapshot.humidity,
        snapshot.timestamp
      ]);

      // Broadcast to WebSocket clients
      broadcast({ type: 'energy_update', data: { plant_id: plant.id, plant_name: plant.name, ...snapshot } });

      // Simulate wire breaks
      const wireBreak = plcSimulator.simulateWireBreak(plant.id);
      if (wireBreak) {
        const dev = devices.find(d => d.plant_id === plant.id && d.type === 'PLC') || devices.find(d => d.plant_id === plant.id);
        runSql(`
          INSERT INTO wire_breaks (device_id, plant_id, wire_id, break_count, severity, timestamp)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [dev.id, wireBreak.plant_id, wireBreak.wire_id, wireBreak.break_count, wireBreak.severity, wireBreak.timestamp]);

        // Create alert for wire break
        runSql(`
          INSERT INTO alerts (plant_id, device_id, type, severity, title, message, timestamp)
          VALUES (?, ?, 'wire_break', ?, 'Wire Break Detected', ?, ?)
        `, [plant.id, dev.id, wireBreak.severity, `Wire ${wireBreak.wire_id} break detected - Count: ${wireBreak.break_count}`, wireBreak.timestamp]);

        broadcast({
          type: 'wire_break',
          data: { ...wireBreak, device_id: dev.id, device_name: dev.name, plant_name: plant.name },
        });

        broadcast({
          type: 'alert',
          data: {
            plant_id: plant.id, plant_name: plant.name,
            severity: wireBreak.severity,
            title: 'Wire Break Detected',
            message: `Wire ${wireBreak.wire_id} break on ${dev.name}`,
            timestamp: wireBreak.timestamp,
          },
        });
      }
    });
  }, 3000);
}

// Initialize database and start
(async () => {
  await initDb();
  startAutoSave();
  console.log('Database initialized.');

  server.listen(PORT, () => {
    console.log(`EMS RTMS Server running on http://localhost:${PORT}`);
    console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
    startRealtimeSimulation();
    console.log('Real-time PLC simulation started (3s interval).');
  });
})();
