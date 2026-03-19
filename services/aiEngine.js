/**
 * AI Engine Service
 * Performs predictive maintenance analysis, anomaly detection, and trend forecasting.
 * Uses statistical methods for simulation — in production, integrate with ML models.
 */

class AIEngine {
  analyzeDeviceHealth(deviceReadings) {
    const scores = {};

    if (deviceReadings.length === 0) {
      return { health_score: 100, risk_level: 'low', anomalies: [], trends: {} };
    }

    // Calculate moving averages and detect anomalies
    const parameters = ['active_power_kw', 'voltage_r', 'current_r', 'power_factor', 'temperature', 'thd_voltage'];
    const anomalies = [];
    const trends = {};

    parameters.forEach(param => {
      const values = deviceReadings
        .filter(r => r[param] !== undefined && r[param] !== null)
        .map(r => r[param]);

      if (values.length < 2) return;

      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);

      // Detect outliers (values > 2 std devs from mean)
      const latest = values[values.length - 1];
      if (Math.abs(latest - mean) > 2 * stdDev && stdDev > 0) {
        anomalies.push({
          parameter: param,
          value: latest,
          expected_range: [Math.round((mean - 2 * stdDev) * 100) / 100, Math.round((mean + 2 * stdDev) * 100) / 100],
          deviation: Math.round(((latest - mean) / stdDev) * 100) / 100,
          severity: Math.abs(latest - mean) > 3 * stdDev ? 'critical' : 'warning',
        });
      }

      // Trend analysis (simple linear regression)
      const n = values.length;
      const xSum = (n * (n - 1)) / 2;
      const xSqSum = (n * (n - 1) * (2 * n - 1)) / 6;
      const ySum = values.reduce((a, b) => a + b, 0);
      const xySum = values.reduce((sum, v, i) => sum + i * v, 0);
      const slope = (n * xySum - xSum * ySum) / (n * xSqSum - xSum * xSum);

      trends[param] = {
        direction: slope > 0.01 ? 'increasing' : (slope < -0.01 ? 'decreasing' : 'stable'),
        slope: Math.round(slope * 10000) / 10000,
        current: Math.round(latest * 100) / 100,
        average: Math.round(mean * 100) / 100,
      };

      scores[param] = Math.max(0, 100 - anomalies.filter(a => a.parameter === param).length * 25);
    });

    const avgScore = Object.values(scores).length > 0
      ? Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length)
      : 85;

    const healthScore = Math.max(0, Math.min(100, avgScore - anomalies.length * 5));

    return {
      health_score: healthScore,
      risk_level: healthScore >= 80 ? 'low' : (healthScore >= 50 ? 'medium' : 'high'),
      anomalies,
      trends,
      parameter_scores: scores,
    };
  }

  predictFailure(deviceHistory, component) {
    // Simulated failure prediction based on historical patterns
    const baseProb = Math.random() * 0.3;
    const ageFactor = Math.min(0.4, deviceHistory.length * 0.002);
    const anomalyFactor = deviceHistory.filter(d => d.quality === 'bad').length * 0.05;

    const probability = Math.min(0.95, baseProb + ageFactor + anomalyFactor);
    const daysToFailure = Math.max(1, Math.floor((1 - probability) * 120));
    const failureDate = new Date();
    failureDate.setDate(failureDate.getDate() + daysToFailure);

    return {
      component,
      failure_probability: Math.round(probability * 100) / 100,
      predicted_failure_date: failureDate.toISOString().split('T')[0],
      days_remaining: daysToFailure,
      confidence: Math.round((0.7 + Math.random() * 0.28) * 100) / 100,
      contributing_factors: this._getContributingFactors(probability),
    };
  }

  generateForecast(energyData, hoursAhead = 24) {
    if (energyData.length < 2) return [];

    const values = energyData.map(e => e.active_power_kw);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const lastValue = values[values.length - 1];

    const forecast = [];
    for (let h = 1; h <= hoursAhead; h++) {
      const hourOfDay = (new Date().getHours() + h) % 24;
      // Simulate load curve: lower at night, peak during day
      const loadFactor = hourOfDay >= 6 && hourOfDay <= 22
        ? 0.7 + 0.3 * Math.sin((hourOfDay - 6) * Math.PI / 16)
        : 0.4 + Math.random() * 0.15;

      const predicted = mean * loadFactor * (0.95 + Math.random() * 0.1);
      const ts = new Date();
      ts.setHours(ts.getHours() + h, 0, 0, 0);

      forecast.push({
        timestamp: ts.toISOString(),
        predicted_power_kw: Math.round(predicted * 100) / 100,
        lower_bound: Math.round(predicted * 0.9 * 100) / 100,
        upper_bound: Math.round(predicted * 1.1 * 100) / 100,
        confidence: 0.85 - h * 0.01,
      });
    }

    return forecast;
  }

  _getContributingFactors(probability) {
    const factors = [
      'High operating temperature detected',
      'Increased vibration levels',
      'Degraded insulation resistance',
      'Frequent load fluctuations',
      'Extended continuous operation',
      'Harmonic distortion above threshold',
      'Bearing wear pattern detected',
      'Cooling efficiency reduced',
    ];
    const count = probability > 0.7 ? 4 : (probability > 0.4 ? 2 : 1);
    const shuffled = factors.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }
}

module.exports = new AIEngine();
