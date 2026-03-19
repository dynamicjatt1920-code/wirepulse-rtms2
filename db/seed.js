const { initDb, getDbSync, runSql, saveDb } = require('./database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  await initDb();
  const db = getDbSync();

  // Clear existing data
  db.exec(`
    DELETE FROM notifications;
    DELETE FROM breakdowns;
    DELETE FROM audit_log;
    DELETE FROM shift_reports;
    DELETE FROM predictions;
    DELETE FROM alerts;
    DELETE FROM energy_data;
    DELETE FROM sensor_readings;
    DELETE FROM wire_breaks;
    DELETE FROM devices;
    DELETE FROM plants;
    DELETE FROM users;
  `);

  // --- Plants ---
  const plants = [
    { id: 'plant-01', name: 'Wire Rod Division', location: 'Raipur, Chhattisgarh', latitude: 21.2514, longitude: 81.6296, capacity_mw: 120 },
    { id: 'plant-02', name: 'Drawing & Galvanizing Unit', location: 'Bhilai, Chhattisgarh', latitude: 21.2093, longitude: 81.3787, capacity_mw: 85 },
    { id: 'plant-03', name: 'Cable Manufacturing Plant', location: 'Korba, Chhattisgarh', latitude: 22.3595, longitude: 82.7501, capacity_mw: 200 },
  ];

  plants.forEach(p => runSql(`INSERT INTO plants (id, name, location, latitude, longitude, capacity_mw, status) VALUES (?, ?, ?, ?, ?, ?, 'online')`, [p.id, p.name, p.location, p.latitude, p.longitude, p.capacity_mw]));

  // --- Devices ---
  const deviceTypes = ['PLC', 'RTU', 'Energy Meter', 'Sensor Gateway', 'HMI Panel'];
  const protocols = ['Modbus-TCP', 'OPC-UA', 'DNP3', 'IEC 61850'];
  const devices = [];

  plants.forEach((plant, pi) => {
    for (let i = 1; i <= 8; i++) {
      const dev = {
        id: `${plant.id}-dev-${String(i).padStart(2, '0')}`,
        plant_id: plant.id,
        name: `${deviceTypes[(i - 1) % deviceTypes.length]}-${plant.name.split(' ')[0]}-${i}`,
        type: deviceTypes[(i - 1) % deviceTypes.length],
        protocol: protocols[(i - 1) % protocols.length],
        ip_address: `192.168.${pi + 1}.${100 + i}`,
        port: 502,
        status: i % 7 === 0 ? 'offline' : (i % 5 === 0 ? 'warning' : 'online'),
      };
      devices.push(dev);
    }
  });

  devices.forEach(d => runSql(`INSERT INTO devices (id, plant_id, name, type, protocol, ip_address, port, status, last_heartbeat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`, [d.id, d.plant_id, d.name, d.type, d.protocol, d.ip_address, d.port, d.status]));

  // --- Wire Breaks (historical data for last 30 days) ---
  const severities = ['low', 'medium', 'high', 'critical'];

  for (let day = 30; day >= 0; day--) {
    plants.forEach(plant => {
      const numBreaks = Math.floor(Math.random() * 5) + 1;
      for (let b = 0; b < numBreaks; b++) {
        const dev = devices.find(d => d.plant_id === plant.id && d.type === 'PLC') || devices.find(d => d.plant_id === plant.id);
        const hour = Math.floor(Math.random() * 24);
        const minute = Math.floor(Math.random() * 60);
        const ts = new Date();
        ts.setDate(ts.getDate() - day);
        ts.setHours(hour, minute, 0, 0);
        const resolved = day > 0 ? 1 : (Math.random() > 0.3 ? 1 : 0);
        const resolvedAt = resolved ? new Date(ts.getTime() + Math.random() * 3600000 * 4).toISOString() : null;

        runSql(
          `INSERT INTO wire_breaks (device_id, plant_id, wire_id, break_count, severity, timestamp, resolved, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [dev.id, plant.id, `WIRE-${String(Math.floor(Math.random() * 50) + 1).padStart(3, '0')}`, Math.floor(Math.random() * 3) + 1, severities[Math.floor(Math.random() * severities.length)], ts.toISOString(), resolved, resolvedAt]
        );
      }
    });
  }

  // --- Energy Data (hourly for last 7 days) ---
  for (let day = 7; day >= 0; day--) {
    for (let hour = 0; hour < 24; hour++) {
      plants.forEach(plant => {
        const ts = new Date();
        ts.setDate(ts.getDate() - day);
        ts.setHours(hour, 0, 0, 0);

        const baseLoad = plant.capacity_mw * 1000 * (0.5 + Math.random() * 0.35);
        const pf = 0.85 + Math.random() * 0.12;
        const activePower = baseLoad;
        const reactivePower = activePower * Math.tan(Math.acos(pf));
        const apparentPower = activePower / pf;

        runSql(
          `INSERT INTO energy_data (plant_id, active_power_kw, reactive_power_kvar, apparent_power_kva, power_factor, voltage_r, voltage_y, voltage_b, current_r, current_y, current_b, frequency, energy_kwh, max_demand_kw, thd_voltage, thd_current, temperature, humidity, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [plant.id, Math.round(activePower * 100) / 100, Math.round(reactivePower * 100) / 100, Math.round(apparentPower * 100) / 100, Math.round(pf * 1000) / 1000, 410 + Math.random() * 10, 410 + Math.random() * 10, 410 + Math.random() * 10, 150 + Math.random() * 80, 150 + Math.random() * 80, 150 + Math.random() * 80, 49.9 + Math.random() * 0.2, Math.round(activePower * 100) / 100, Math.round(activePower * (1 + Math.random() * 0.15) * 100) / 100, 1.5 + Math.random() * 3.5, 3 + Math.random() * 8, 30 + Math.random() * 15, 40 + Math.random() * 35, ts.toISOString()]
        );
      });
    }
  }

  // --- Alerts ---
  const alertTemplates = [
    { type: 'wire_break', severity: 'critical', title: 'Wire Break Detected', message: 'Wire break detected on production line', parameter: 'break_count' },
    { type: 'overvoltage', severity: 'high', title: 'Overvoltage Warning', message: 'Voltage exceeds safe operating limit', parameter: 'voltage', threshold: 440, actual: 452 },
    { type: 'undervoltage', severity: 'high', title: 'Undervoltage Alert', message: 'Voltage dropped below minimum threshold', parameter: 'voltage', threshold: 380, actual: 365 },
    { type: 'power_factor', severity: 'medium', title: 'Low Power Factor', message: 'Power factor below acceptable range', parameter: 'power_factor', threshold: 0.85, actual: 0.78 },
    { type: 'overload', severity: 'critical', title: 'Equipment Overload', message: 'Current exceeds rated capacity', parameter: 'current', threshold: 250, actual: 285 },
    { type: 'frequency', severity: 'high', title: 'Frequency Deviation', message: 'Grid frequency outside normal range', parameter: 'frequency', threshold: 50.05, actual: 50.12 },
    { type: 'temperature', severity: 'medium', title: 'High Temperature', message: 'Equipment temperature above threshold', parameter: 'temperature', threshold: 80, actual: 87 },
    { type: 'communication', severity: 'low', title: 'Communication Timeout', message: 'Device communication lost temporarily', parameter: 'heartbeat' },
    { type: 'thd', severity: 'medium', title: 'High Harmonic Distortion', message: 'THD exceeds acceptable level', parameter: 'thd_voltage', threshold: 5, actual: 7.2 },
    { type: 'demand', severity: 'high', title: 'Max Demand Exceeded', message: 'Maximum demand limit breached', parameter: 'max_demand', threshold: 95000, actual: 102000 },
  ];

  for (let day = 14; day >= 0; day--) {
    const numAlerts = Math.floor(Math.random() * 6) + 2;
    for (let a = 0; a < numAlerts; a++) {
      const template = alertTemplates[Math.floor(Math.random() * alertTemplates.length)];
      const plant = plants[Math.floor(Math.random() * plants.length)];
      const dev = devices.find(d => d.plant_id === plant.id);
      const ts = new Date();
      ts.setDate(ts.getDate() - day);
      ts.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));

      runSql(
        `INSERT INTO alerts (plant_id, device_id, type, severity, title, message, parameter, threshold_value, actual_value, acknowledged, resolved, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [plant.id, dev.id, template.type, template.severity, template.title, template.message, template.parameter, template.threshold || null, template.actual || null, day > 1 ? 1 : 0, day > 2 ? 1 : 0, ts.toISOString()]
      );
    }
  }

  // --- Predictions ---
  const components = [
    { name: 'Main Drive Motor', rec: 'Schedule bearing replacement during next maintenance window' },
    { name: 'Cooling Fan Assembly', rec: 'Inspect fan blades for wear and balance' },
    { name: 'Power Supply Unit', rec: 'Check capacitor health and replace if degraded' },
    { name: 'Wire Tensioner Mechanism', rec: 'Calibrate tension settings and inspect springs' },
    { name: 'PLC Communication Module', rec: 'Update firmware and check network connections' },
    { name: 'Circuit Breaker Panel', rec: 'Test trip mechanisms and clean contacts' },
    { name: 'Transformer Winding', rec: 'Perform DGA analysis and check insulation resistance' },
    { name: 'VFD Controller', rec: 'Check DC bus capacitors and cooling system' },
    { name: 'Cable Insulation', rec: 'Conduct insulation resistance test on feeder cables' },
    { name: 'Relay Protection Unit', rec: 'Verify relay settings and test trip times' },
  ];

  devices.forEach(dev => {
    const numPredictions = Math.floor(Math.random() * 3) + 1;
    for (let p = 0; p < numPredictions; p++) {
      const comp = components[Math.floor(Math.random() * components.length)];
      const failProb = Math.round((Math.random() * 0.85 + 0.05) * 100) / 100;
      const daysUntilFail = Math.floor(Math.random() * 90) + 5;
      const failDate = new Date();
      failDate.setDate(failDate.getDate() + daysUntilFail);

      runSql(
        `INSERT INTO predictions (device_id, plant_id, component, failure_probability, predicted_failure_date, recommendation, model_confidence, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [dev.id, dev.plant_id, comp.name, failProb, failDate.toISOString().split('T')[0], comp.rec, Math.round((0.7 + Math.random() * 0.28) * 100) / 100, failProb > 0.7 ? 'critical' : (failProb > 0.4 ? 'warning' : 'active')]
      );
    }
  });

  // --- Users ---
  const passwordHash = bcrypt.hashSync('admin123', 10);

  runSql(`INSERT INTO users (id, username, password_hash, full_name, role, email, plant_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), 'admin', passwordHash, 'System Administrator', 'admin', 'admin@wirepulse.io', null]);
  runSql(`INSERT INTO users (id, username, password_hash, full_name, role, email, plant_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), 'operator1', bcrypt.hashSync('operator123', 10), 'Rajesh Kumar', 'operator', 'rajesh@wirepulse.io', 'plant-01']);
  runSql(`INSERT INTO users (id, username, password_hash, full_name, role, email, plant_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), 'engineer1', bcrypt.hashSync('engineer123', 10), 'Priya Sharma', 'engineer', 'priya@wirepulse.io', 'plant-01']);
  runSql(`INSERT INTO users (id, username, password_hash, full_name, role, email, plant_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), 'manager1', bcrypt.hashSync('manager123', 10), 'Amit Singh', 'manager', 'amit@wirepulse.io', null]);

  // --- Shift Reports ---
  const shifts = ['Morning (6AM-2PM)', 'Afternoon (2PM-10PM)', 'Night (10PM-6AM)'];
  const operators = ['Rajesh Kumar', 'Sunil Verma', 'Deepak Yadav', 'Manoj Patel'];

  for (let day = 30; day >= 0; day--) {
    plants.forEach(plant => {
      shifts.forEach(shift => {
        const d = new Date();
        d.setDate(d.getDate() - day);
        runSql(
          `INSERT INTO shift_reports (plant_id, shift, operator_name, total_breaks, total_energy_kwh, avg_power_factor, max_demand_kw, alerts_count, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [plant.id, shift, operators[Math.floor(Math.random() * operators.length)], Math.floor(Math.random() * 8), Math.round((plant.capacity_mw * 1000 * (0.4 + Math.random() * 0.3) * 8) * 100) / 100, Math.round((0.85 + Math.random() * 0.12) * 1000) / 1000, Math.round(plant.capacity_mw * 1000 * (0.6 + Math.random() * 0.3) * 100) / 100, Math.floor(Math.random() * 5), d.toISOString().split('T')[0]]
        );
      });
    });
  }

  saveDb();

  // --- Breakdowns (RTMS Current Breakdowns) ---
  const breakdownCategories = ['Electrical', 'Mechanical', 'Instrument', 'Process', 'Utility'];
  const breakdownTypes = {
    Electrical: ['Wire Break', 'Motor Burnout', 'Drive Failure', 'VFD Trip', 'Earth Fault', 'Overload Trip', 'Insulation Failure', 'Capacitor Failure'],
    Mechanical: ['Die Wear', 'Capstan Bearing Failure', 'Drum Crack', 'Spooler Jam', 'Belt Snap', 'Gearbox Failure', 'Coupling Failure'],
    Instrument: ['Tension Sensor Fault', 'Speed Encoder Failure', 'Diameter Gauge Error', 'PLC Fault', 'Communication Error', 'HMI Malfunction'],
    Process: ['Wire Snap at Die', 'Surface Defect', 'Over Temperature', 'Tangling', 'Spool Over-run'],
    Utility: ['Coolant Failure', 'Compressed Air Drop', 'Lubrication Failure', 'Water Supply Failure', 'UPS Failure'],
  };
  const machineLines = ['Wire Drawing Machine-1', 'Wire Drawing Machine-2', 'Rod Breakdown Mill', 'Stranding Machine', 'Bunching Machine', 'Annealing Line', 'Galvanizing Bath', 'Extrusion Line', 'Spooling Machine', 'Pay-Off Stand', 'Take-Up Stand', 'Die Block Station'];
  const areas = ['Drawing Floor', 'Galvanizing Bay', 'Annealing Section', 'Spooling Area', 'Rod Mill', 'Control Room', 'Maintenance Bay'];
  const departments = ['Electrical', 'Mechanical', 'Instrumentation', 'Production', 'Utility', 'Maintenance'];
  const personnelNames = ['Rajesh Kumar', 'Sunil Verma', 'Deepak Yadav', 'Manoj Patel', 'Priya Sharma', 'Amit Singh', 'Ravi Tiwari', 'Vikram Chauhan', 'Sandeep Gupta', 'Arun Mishra'];
  const rootCauses = ['Wear and tear', 'Overloading', 'Poor maintenance', 'Material defect', 'Operator error', 'Environmental conditions', 'Power surge', 'Age of equipment', 'Improper installation', 'Contamination'];
  const correctiveActions = ['Replaced faulty component', 'Rewinding done', 'Realigned assembly', 'Cleaned and lubricated', 'Replaced bearings', 'Tightened connections', 'Recalibrated sensor', 'Firmware updated', 'Insulation repaired', 'Cooling system serviced'];
  const preventiveActions = ['Scheduled preventive maintenance', 'Added vibration monitoring', 'Installed surge protector', 'Updated maintenance SOP', 'Trained operators', 'Installed backup system', 'Added condition monitoring', 'Improved ventilation'];
  const shiftsArr = ['Morning (6AM-2PM)', 'Afternoon (2PM-10PM)', 'Night (10PM-6AM)'];
  const priorities = ['low', 'normal', 'high', 'urgent'];
  const statuses = ['open', 'acknowledged', 'in_progress', 'resolved', 'closed'];
  let bdCode = 1;

  for (let day = 45; day >= 0; day--) {
    const numBreakdowns = day === 0 ? Math.floor(Math.random() * 6) + 3 : Math.floor(Math.random() * 8) + 2;
    for (let b = 0; b < numBreakdowns; b++) {
      const plant = plants[Math.floor(Math.random() * plants.length)];
      const dev = devices.find(d => d.plant_id === plant.id) || devices[0];
      const category = breakdownCategories[Math.floor(Math.random() * breakdownCategories.length)];
      const typeArr = breakdownTypes[category];
      const bdType = typeArr[Math.floor(Math.random() * typeArr.length)];
      const severity = severities[Math.floor(Math.random() * severities.length)];
      const priority = priorities[Math.floor(Math.random() * priorities.length)];
      const machine = machineLines[Math.floor(Math.random() * machineLines.length)];
      const area = areas[Math.floor(Math.random() * areas.length)];
      const dept = departments[Math.floor(Math.random() * departments.length)];
      const reporter = personnelNames[Math.floor(Math.random() * personnelNames.length)];
      const assignee = personnelNames[Math.floor(Math.random() * personnelNames.length)];
      const resolver = personnelNames[Math.floor(Math.random() * personnelNames.length)];
      const shift = shiftsArr[Math.floor(Math.random() * shiftsArr.length)];

      const startTs = new Date();
      startTs.setDate(startTs.getDate() - day);
      startTs.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), 0, 0);

      let status;
      if (day === 0) {
        status = statuses[Math.floor(Math.random() * 3)]; // open, acknowledged, in_progress
      } else if (day <= 2) {
        status = statuses[Math.floor(Math.random() * 4)]; // up to resolved
      } else {
        status = Math.random() > 0.1 ? 'closed' : 'resolved';
      }

      const durationMin = status === 'closed' || status === 'resolved' ? Math.floor(Math.random() * 480) + 15 : 0;
      const endTime = (status === 'closed' || status === 'resolved') ? new Date(startTs.getTime() + durationMin * 60000).toISOString() : null;
      const ackAt = (status !== 'open') ? new Date(startTs.getTime() + Math.random() * 600000 + 60000).toISOString() : null;
      const assignedAt = (status === 'in_progress' || status === 'resolved' || status === 'closed') ? new Date(startTs.getTime() + Math.random() * 1200000 + 120000).toISOString() : null;
      const resStart = (status === 'in_progress' || status === 'resolved' || status === 'closed') ? new Date(startTs.getTime() + Math.random() * 1800000 + 300000).toISOString() : null;
      const rootCause = (status === 'resolved' || status === 'closed') ? rootCauses[Math.floor(Math.random() * rootCauses.length)] : null;
      const corrAction = (status === 'resolved' || status === 'closed') ? correctiveActions[Math.floor(Math.random() * correctiveActions.length)] : null;
      const prevAction = (status === 'closed') ? preventiveActions[Math.floor(Math.random() * preventiveActions.length)] : null;
      const isRecurring = Math.random() > 0.7 ? 1 : 0;
      const recCount = isRecurring ? Math.floor(Math.random() * 5) + 1 : 0;
      const downtimeCost = durationMin > 0 ? Math.round(durationMin * (50 + Math.random() * 200)) : 0;

      const code = `BD-${String(bdCode++).padStart(5, '0')}`;

      runSql(
        `INSERT INTO breakdowns (breakdown_code, plant_id, device_id, machine_line, department, area, category, type, description, severity, priority, status, reported_by, assigned_to, acknowledged_by, resolved_by, start_time, acknowledged_at, assigned_at, resolution_start, end_time, duration_minutes, root_cause, corrective_action, preventive_action, shift, is_recurring, recurrence_count, parts_replaced, downtime_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [code, plant.id, dev.id, machine, dept, area, category, bdType, `${bdType} on ${machine} in ${area}`, severity, priority, status, reporter, assignee, ackAt ? assignee : null, (status === 'resolved' || status === 'closed') ? resolver : null, startTs.toISOString(), ackAt, assignedAt, resStart, endTime, durationMin, rootCause, corrAction, prevAction, shift, isRecurring, recCount, null, downtimeCost]
      );
    }
  }

  // --- Notifications (recent) ---
  for (let i = 0; i < 25; i++) {
    const nTypes = ['breakdown', 'alert', 'prediction', 'system'];
    const nType = nTypes[Math.floor(Math.random() * nTypes.length)];
    const titles = {
      breakdown: ['New Breakdown Reported', 'Breakdown Resolved', 'Breakdown Escalated', 'Critical Breakdown Alert'],
      alert: ['Overvoltage Detected', 'Power Factor Low', 'Communication Lost', 'Temperature Warning'],
      prediction: ['Failure Predicted', 'Maintenance Due', 'Component Degradation', 'Risk Level Changed'],
      system: ['Shift Handover', 'Report Generated', 'Device Reconnected', 'Backup Completed'],
    };
    const severitiesN = { breakdown: 'critical', alert: 'high', prediction: 'medium', system: 'info' };
    const ts = new Date();
    ts.setMinutes(ts.getMinutes() - Math.floor(Math.random() * 1440));
    runSql(
      `INSERT INTO notifications (type, title, message, severity, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [nType, titles[nType][Math.floor(Math.random() * titles[nType].length)], `Notification generated for ${plants[Math.floor(Math.random() * plants.length)].name}`, severitiesN[nType], i > 10 ? 1 : 0, ts.toISOString()]
    );
  }

  saveDb();
  console.log('Database seeded successfully!');
  console.log(`  Plants: ${plants.length}`);
  console.log(`  Devices: ${devices.length}`);
  console.log(`  Users: 4`);
  console.log(`  Breakdowns: ${bdCode - 1}`);
  console.log(`  Notifications: 25`);
  console.log(`  Wire breaks, energy data, alerts, predictions, and shift reports generated.`);
}

seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });
