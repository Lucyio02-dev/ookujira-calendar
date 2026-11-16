'use strict';
window.addEventListener('DOMContentLoaded', () => {
  const el = id => document.getElementById(id);
  let state;
  const labels = { normal: '多云 / 阴', rain: '雨', snow: '雪', sun: '晴', hot: '炎热', cold: '寒冷' };
  function render(next) {
    state = next;
    const data = state.data;
    const kind = Companion.weatherKind(data);
    const detail = data ? `${state.city} · ${Math.round(data.temperature)}°C · ${labels[kind]} · ${new Date(data.observedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 更新${state.stale ? '（已过期）' : ''}` : `${state.city} · 暂无天气数据`;
    el('weatherOpen').textContent = state.enabled ? `${detail}${state.error ? ' · 连接失败' : ''}` : '天气联动已关闭 · 点击设置';
    el('weatherDetail').textContent = detail;
    el('weatherEnabled').checked = state.enabled;
    el('weatherMessage').textContent = state.error || '';
    document.getElementById('companionPanel').dataset.weather = state.enabled ? kind : 'normal';
  }
  el('weatherOpen').onclick = () => el('weatherDialog').showModal();
  el('weatherClose').onclick = () => el('weatherDialog').close();
  el('weatherEnabled').onchange = async event => {
    try { render(await window.api.configureWeather({ enabled: event.target.checked })); }
    catch (error) { el('weatherMessage').textContent = error.message; if (state) el('weatherEnabled').checked = state.enabled; }
  };
  el('weatherRefresh').onclick = async () => {
    el('weatherRefresh').disabled = true;
    try { render(await window.api.refreshWeather()); }
    catch (error) { el('weatherMessage').textContent = error.message; }
    finally { el('weatherRefresh').disabled = false; }
  };
  el('weatherSearchForm').onsubmit = async event => {
    event.preventDefault();
    const button = event.target.querySelector('button'); button.disabled = true;
    el('weatherMessage').textContent = '正在查找城市…'; el('weatherResults').replaceChildren();
    try {
      const places = await window.api.searchCities(el('weatherCity').value);
      el('weatherMessage').textContent = places.length ? '选择城市：' : '没有找到，请尝试拼音或英文城市名。';
      for (const place of places) {
        const choice = document.createElement('button'); choice.className = 'secondary-btn'; choice.textContent = place.city;
        choice.onclick = async () => {
          choice.disabled = true;
          try { render(await window.api.configureWeather({ ...place, enabled: el('weatherEnabled').checked })); el('weatherResults').replaceChildren(); }
          catch (error) { el('weatherMessage').textContent = error.message; choice.disabled = false; }
        };
        el('weatherResults').append(choice);
      }
    } catch (error) { el('weatherMessage').textContent = error.message; }
    finally { button.disabled = false; }
  };
  window.api.onWeather(render);
  window.api.weather().then(render).catch(() => { el('weatherOpen').textContent = '天气暂不可用 · 点击设置重试'; });
});
