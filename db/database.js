const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'ems_rtms.db');

let db = null;
let initPromise = null;

function getDbSync() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

async function initDb() {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }
    initTables();
    return db;
  })();

  return initPromise;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Auto-save every 10 seconds
let _saveInterval = null;
function startAutoSave() {
  if (_saveInterval) return;
  _saveInterval = setInterval(() => { try { saveDb(); } catch {} }, 10000);
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS plants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      status TEXT DEFAULT 'online',
      capacity_mw REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- PLC Devices
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      plant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      protocol TEXT DEFAULT 'Modbus-TCP',
      ip_address TEXT,
      port INTEGER DEFAULT 502,
      status TEXT DEFAULT 'online',
      last_heartbeat TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (plant_id) REFERENCES plants(id)
    );

    -- Wire Break Events
    CREATE TABLE IF NOT EXISTS wire_breaks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      plant_id TEXT NOT NULL,
      wire_id TEXT,
      break_count INTEGER DEFAULT 1,
      severity TEXT DEFAULT 'medium',
      timestamp TEXT DEFAULT (datetime('now')),
      resolved INTEGER DEFAULT 0,
      resolved_at TEXT,
      notes TEXT,
      FOREIGN KEY (device_id) REFERENCES devices(id),
      FOREIGN KEY (plant_id) REFERENCES plants(id)
    );

    -- Real-time Sensor Readings
    CREATE TABLE IF NOT EXISTS sensor_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      plant_id TEXT NOT NULL,
      parameter TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT,
      quality TEXT DEFAULT 'good',
      timestamp TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (device_id) REFERENCES devices(id)
    );

    -- EMS Energy Data
    CREATE TABLE IF NOT EXISTS energy_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plant_id TEXT NOT NULL,
      active_power_kw REAL DEFAULT 0,
      reactive_power_kvar REAL DEFAULT 0,
      apparent_power_kva REAL DEFAULT 0,
      power_factor REAL DEFAULT 0,
      voltage_r REAL DEFAULT 0,
      voltage_y REAL DEFAULT 0,
      voltage_b REAL DEFAULT 0,
      current_r REAL DEFAULT 0,
      current_y REAL DEFAULT 0,
      current_b REAL DEFAULT 0,
      frequency REAL DEFAULT 50,
      energy_kwh REAL DEFAULT 0,
      max_demand_kw REAL DEFAULT 0,
      thd_voltage REAL DEFAULT 0,
      thd_current REAL DEFAULT 0,
      temperature REAL DEFAULT 0,
      humidity REAL DEFAULT 0,
      timestamp TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (plant_id) REFERENCES plants(id)
    );

    -- Alerts
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plant_id TEXT NOT NULL,
      device_id TEXT,
      type TEXT NOT NULL,
      severity TEXT DEFAULT 'info',
      title TEXT NOT NULL,
      message TEXT,
      parameter TEXT,
      threshold_value REAL,
      actual_value REAL,
      acknowledged INTEGER DEFAULT 0,
      acknowledged_by TEXT,
      acknowledged_at TEXT,
      resolved INTEGER DEFAULT 0,
      resolved_at TEXT,
      timestamp TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (plant_id) REFERENCES plants(id)
    );

    -- Predictive Maintenance
    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      plant_id TEXT NOT NULL,
      component TEXT NOT NULL,
      failure_probability REAL DEFAULT 0,
      predicted_failure_date TEXT,
      recommendation TEXT,
      model_confidence REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (device_id) REFERENCES devices(id)
    );

    -- Users
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      role TEXT DEFAULT 'operator',
      email TEXT,
      plant_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Audit Log
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      action TEXT NOT NULL,
      resource TEXT,
      details TEXT,
      ip_address TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    -- Shift Reports
    CREATE TABLE IF NOT EXISTS shift_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plant_id TEXT NOT NULL,
      shift TEXT NOT NULL,
      operator_name TEXT,
      total_breaks INTEGER DEFAULT 0,
      total_energy_kwh REAL DEFAULT 0,
      avg_power_factor REAL DEFAULT 0,
      max_demand_kw REAL DEFAULT 0,
      alerts_count INTEGER DEFAULT 0,
      notes TEXT,
      date TEXT DEFAULT (date('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Breakdowns (RTMS Current Breakdowns Module)
    CREATE TABLE IF NOT EXISTS breakdowns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      breakdown_code TEXT UNIQUE,
      plant_id TEXT NOT NULL,
      device_id TEXT,
      machine_line TEXT NOT NULL,
      department TEXT DEFAULT 'Electrical',
      area TEXT,
      category TEXT DEFAULT 'Electrical',
      type TEXT NOT NULL,
      description TEXT,
      severity TEXT DEFAULT 'medium',
      priority TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'open',
      reported_by TEXT,
      assigned_to TEXT,
      acknowledged_by TEXT,
      resolved_by TEXT,
      start_time TEXT DEFAULT (datetime('now')),
      acknowledged_at TEXT,
      assigned_at TEXT,
      resolution_start TEXT,
      end_time TEXT,
      duration_minutes REAL DEFAULT 0,
      root_cause TEXT,
      corrective_action TEXT,
      preventive_action TEXT,
      shift TEXT,
      is_recurring INTEGER DEFAULT 0,
      recurrence_count INTEGER DEFAULT 0,
      parts_replaced TEXT,
      downtime_cost REAL DEFAULT 0,
      FOREIGN KEY (plant_id) REFERENCES plants(id),
      FOREIGN KEY (device_id) REFERENCES devices(id)
    );

    -- Notifications
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      severity TEXT DEFAULT 'info',
      reference_type TEXT,
      reference_id INTEGER,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

// Helper: run a query and return all rows as array of objects
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Helper: run a query and return first row as object
function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// Helper: run an exec statement (INSERT/UPDATE/DELETE)
function runSql(sql, params = []) {
  if (params.length) {
    const stmt = db.prepare(sql);
    stmt.run(params);
    stmt.free();
  } else {
    db.run(sql);
  }
}

module.exports = { initDb, getDbSync, saveDb, startAutoSave, queryAll, queryOne, runSql };
