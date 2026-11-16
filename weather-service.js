'use strict';
const fs = require('node:fs');
const https = require('node:https');
function requestJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Ookujira-Calendar/1.0' } }, res => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error('天气服务暂时不可用')); return; }
      let body = '';
      res.on('data', chunk => { body += chunk; if (body.length > 1024 * 1024) req.destroy(new Error('响应过大')); });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('天气数据格式异常')); } });
      res.on('error', reject);
    });
    req.setTimeout(10000, () => req.destroy(new Error('天气连接超时，稍后重试')));
    req.on('error', reject);
  });
}
class WeatherService {
  constructor(file, fetch = requestJson) {
    this.file = file; this.fetch = fetch; this.pending = null; this.error = ''; this.lastAttempt = 0;
    this.state = { enabled: true, city: '武汉', latitude: 30.5928, longitude: 114.3055, data: null };
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (typeof saved.city === 'string' && Number.isFinite(saved.latitude) && Number.isFinite(saved.longitude)) this.state = { ...this.state, ...saved };
    } catch { /* 首次运行使用武汉。 */ }
  }
  snapshot() { return { ...this.state, error: this.error, source: 'Open-Meteo', stale: !this.state.data || Date.now() - this.state.data.observedAt > 90 * 60000 }; }
  persist() {
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.state));
    fs.renameSync(this.file + '.tmp', this.file);
  }
  async search(name) {
    if (typeof name !== 'string' || name.trim().length < 2 || name.length > 80) throw new Error('请输入至少两个字的城市名称');
    const result = await this.fetch('https://geocoding-api.open-meteo.com/v1/search?count=8&language=zh&format=json&name=' + encodeURIComponent(name.trim()));
    return (result.results || []).map(p => ({ city: [p.name, p.admin1, p.country].filter(Boolean).join(' · '), latitude: p.latitude, longitude: p.longitude }));
  }
  async configure(config) {
    if (!config || typeof config.enabled !== 'boolean') throw new Error('天气设置无效');
    if (config.city !== undefined) {
      if (typeof config.city !== 'string' || config.city.length > 160 || !Number.isFinite(config.latitude) || Math.abs(config.latitude) > 90 || !Number.isFinite(config.longitude) || Math.abs(config.longitude) > 180) throw new Error('城市坐标无效');
      this.state = { ...this.state, city: config.city, latitude: config.latitude, longitude: config.longitude, data: null };
    }
    this.state.enabled = config.enabled;
    this.persist(); this.lastAttempt = 0;
    return this.refresh(true);
  }
  async refresh(force = false) {
    if (!this.state.enabled) return this.snapshot();
    if (this.pending) { await this.pending; if (force) return this.refresh(true); return this.snapshot(); }
    if (!force && Date.now() - this.lastAttempt < 20 * 60000) return this.snapshot();
    this.lastAttempt = Date.now();
    const location = { latitude: this.state.latitude, longitude: this.state.longitude };
    this.pending = (async () => {
      try {
        const result = await this.fetch(`https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,weather_code,is_day&timezone=GMT`);
        const c = result.current;
        const observedAt = Date.parse(c?.time + 'Z');
        if (!Number.isFinite(c?.temperature_2m) || !Number.isFinite(c?.weather_code) || !Number.isFinite(observedAt)) throw new Error('天气数据不完整');
        if (location.latitude !== this.state.latitude || location.longitude !== this.state.longitude) return;
        this.state.data = { temperature: c.temperature_2m, code: c.weather_code, isDay: c.is_day === 1, observedAt, fetchedAt: Date.now() };
        this.error = ''; this.persist();
      } catch (error) { this.error = error.message; }
    })();
    try { await this.pending; } finally { this.pending = null; }
    return this.snapshot();
  }
}
module.exports = { WeatherService };
