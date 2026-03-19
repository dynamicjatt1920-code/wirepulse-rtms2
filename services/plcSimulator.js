/**
 * PLC Simulator Service
 * Generates realistic SCADA data for wire breaks, energy readings, and sensor values.
 * In production, replace this with actual OPC-UA / Modbus-TCP connections.
 */

class PLCSimulator {
  constructor() {
    this.breakCounters = {};
    this.running = false;
  }

  generateSensorReading(deviceId, plantId) {
    return {
      device_id: deviceId,
      plant_id: plantId,
      readings: {
        voltage_r: 410 + Math.random() * 12,
        voltage_y: 410 + Math.random() * 12,
        voltage_b: 410 + Math.random() * 12,
        current_r: 140 + Math.random() * 90,
        current_y: 140 + Math.random() * 90,
        current_b: 140 + Math.random() * 90,
        frequency: 49.92 + Math.random() * 0.16,
        power_factor: 0.84 + Math.random() * 0.14,
        active_power_kw: 50000 + Math.random() * 70000,
        reactive_power_kvar: 15000 + Math.random() * 25000,
        temperature: 32 + Math.random() * 18,
        humidity: 40 + Math.random() * 35,
        thd_voltage: 1.0 + Math.random() * 4.5,
        thd_current: 2.0 + Math.random() * 9.0,
      },
      timestamp: new Date().toISOString(),
    };
  }

  generateEnergySnapshot(plantId, capacityMw) {
    const baseLoad = capacityMw * 1000 * (0.5 + Math.random() * 0.35);
    const pf = 0.85 + Math.random() * 0.12;
    const activePower = baseLoad;
    const reactivePower = activePower * Math.tan(Math.acos(pf));
    const apparentPower = activePower / pf;

    return {
      plant_id: plantId,
      active_power_kw: Math.round(activePower * 100) / 100,
      reactive_power_kvar: Math.round(reactivePower * 100) / 100,
      apparent_power_kva: Math.round(apparentPower * 100) / 100,
      power_factor: Math.round(pf * 1000) / 1000,
      voltage_r: 410 + Math.random() * 10,
      voltage_y: 410 + Math.random() * 10,
      voltage_b: 410 + Math.random() * 10,
      current_r: 150 + Math.random() * 80,
      current_y: 150 + Math.random() * 80,
      current_b: 150 + Math.random() * 80,
      frequency: 49.9 + Math.random() * 0.2,
      energy_kwh: Math.round(activePower * 100) / 100,
      max_demand_kw: Math.round(activePower * (1 + Math.random() * 0.15) * 100) / 100,
      thd_voltage: 1.5 + Math.random() * 3.5,
      thd_current: 3 + Math.random() * 8,
      temperature: 30 + Math.random() * 15,
      humidity: 40 + Math.random() * 35,
      timestamp: new Date().toISOString(),
    };
  }

  simulateWireBreak(plantId) {
    if (Math.random() > 0.92) {
      const wireId = `WIRE-${String(Math.floor(Math.random() * 50) + 1).padStart(3, '0')}`;
      const severities = ['low', 'medium', 'high', 'critical'];
      return {
        plant_id: plantId,
        wire_id: wireId,
        break_count: Math.floor(Math.random() * 3) + 1,
        severity: severities[Math.floor(Math.random() * severities.length)],
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  }
}

module.exports = new PLCSimulator();
