const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../calendar-core');

const todo = (id, overrides = {}) => ({ id, title: '论文实验', date: '2026-10-30', time: '09:00', done: false, note: '', createdAt: 1, ...overrides });

test('month navigation never skips February or short months from the 31st', () => {
  assert.equal(core.dateKey(core.shiftMonth(new Date(2026, 0, 31), 1)), '2026-02-01');
  assert.equal(core.dateKey(core.shiftMonth(new Date(2026, 2, 31), -1)), '2026-02-01');
  assert.equal(core.dateKey(core.shiftMonth(new Date(2026, 11, 31), 1)), '2027-01-01');
});

test('calendar has six complete weeks, including leap years', () => {
  for (const date of [new Date(2024, 1, 1), new Date(2026, 1, 1), new Date(2026, 4, 1)]) {
    const days = core.monthDays(date);
    assert.equal(days.length, 42);
    assert.equal(days[0].getDay(), 0);
    assert.equal(days[41].getDay(), 6);
    assert.equal(new Set(days.map(core.dateKey)).size, 42);
  }
});

test('invalid dates and times cannot silently roll over', () => {
  for (const [date, time] of [['2026-02-29', '09:00'], ['2026-04-31', '09:00'], ['2026-10-30', '24:00'], ['2026-10-30', '09:60'], ['2026-13-01', '09:00'], ['0001-01-01', '00:00']]) {
    assert.equal(core.parseDate(date, time), null);
  }
  assert.ok(core.parseDate('2024-02-29', '23:59'));
});

test('reminders catch up after sleep but exclude old, completed, future and notified tasks', () => {
  const items = [todo('due'), todo('future', { time: '10:01' }), todo('done', { done: true }),
    todo('old', { date: '2026-10-28' }), todo('sent', { notifiedFor: '2026-10-30T09:00' })];
  assert.deepEqual(core.dueTodos(items, new Date(2026, 9, 30, 10)).map(t => t.id), ['due']);
  assert.deepEqual(core.dueTodos([todo('rescheduled', { time: '09:30', notifiedFor: '2026-10-30T09:00' })], new Date(2026, 9, 30, 10)).map(t => t.id), ['rescheduled']);
});

test('four-day agenda crosses months and combines search with completion filters', () => {
  const items = [todo('start'), todo('next', { date: '2026-11-02', note: '遥感分割' }), todo('outside', { date: '2026-11-03' }), todo('done', { done: true })];
  const options = { selected: '2026-10-30', range: 'upcoming', hideDone: true };
  assert.deepEqual(core.visibleTodos(items, options).map(t => t.id), ['start', 'next']);
  assert.deepEqual(core.visibleTodos(items, { ...options, query: '遥感' }).map(t => t.id), ['next']);
  assert.equal(core.visibleTodos(items, { ...options, range: 'all' }).length, 3);
  assert.equal(core.visibleTodos(items, { ...options, range: 'day' }).length, 1);
});

test('legacy data is compatible, duplicates and malformed payloads are rejected', () => {
  assert.equal(core.normalizeTodos([todo('legacy')])[0].title, '论文实验');
  for (const value of [{}, [todo('a'), todo('a')], [todo('bad', { title: ' ' })], [todo('bad', { note: 123 })]]) {
    assert.throws(() => core.normalizeTodos(value));
  }
});

test('completion timestamps survive a save round-trip and stay optional', () => {
  const withStamp = core.normalizeTodos([todo('a', { done: true, completedAt: 1730000000000 })])[0];
  assert.equal(withStamp.completedAt, 1730000000000);
  assert.equal('completedAt' in core.normalizeTodos([todo('b')])[0], false);
});

test('quick entry recognizes dates and times in natural Chinese titles', () => {
  const base = '2026-11-05'; // 周四
  const q = (text, key = base) => core.parseQuickEntry(text, key);
  assert.deepEqual(q('明天晚上8点 和导师开会'), { title: '和导师开会', date: '2026-11-06', time: '20:00' });
  assert.deepEqual(q('明早9点半 复盘'), { title: '复盘', date: '2026-11-06', time: '09:30' });
  assert.deepEqual(q('后天 中午交周报'), { title: '交周报', date: '2026-11-07', time: '12:00' });
  assert.deepEqual(q('晚上10:30 站会'), { title: '站会', date: base, time: '22:30' });
  assert.deepEqual(q('周日下午3点半 提交论文'), { title: '提交论文', date: '2026-11-08', time: '15:30' });
  assert.deepEqual(q('下周一 09:00 例会'), { title: '例会', date: '2026-11-09', time: '09:00' });
  assert.deepEqual(q('12月1日 生日提醒'), { title: '生日提醒', date: '2026-12-01', time: null });
  assert.deepEqual(q('晚上 写周记'), { title: '写周记', date: base, time: '20:00' });
  assert.deepEqual(q('九点半 晨会'), { title: '晨会', date: base, time: '09:30' });
  assert.equal(q('每周五 例会'), null);
  assert.equal(q('复习第三章'), null);
  assert.equal(q('   '), null);
  // 标题只剩时间词时拒绝，避免保存空标题
  assert.equal(q('明天晚上8点'), null);
});
