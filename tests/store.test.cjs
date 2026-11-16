const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { TodoStore } = require('../todo-store');
const todo = { id: 'a', title: '论文实验', date: '2026-10-30', time: '09:00', done: false, note: '', createdAt: 1 };

async function fixture(t) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'whale-store-test-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  return path.join(folder, 'nested', 'todos.json');
}

test('serialized saves leave a complete JSON file and the previous valid backup', async t => {
  const file = await fixture(t);
  const store = new TodoStore(file);
  assert.deepEqual(await store.load(), []);
  await Promise.all([store.save([todo]), store.save([{ ...todo, title: '完成实验' }])]);
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8'))[0].title, '完成实验');
  assert.equal(JSON.parse(await fs.readFile(`${file}.bak`, 'utf8'))[0].title, '论文实验');
});

test('simultaneous initial loads share one read and cannot overwrite a later save', async t => {
  const file = await fixture(t); const store = new TodoStore(file);
  let reads = 0;
  const read = store.read.bind(store);
  store.read = async () => { reads++; return read(); };
  await Promise.all([store.load(), store.load(), store.save([todo])]);
  assert.equal(reads, 1);
  assert.equal((await store.load())[0].title, '论文实验');
});

test('damaged file recovers from backup and preserves the original', async t => {
  const file = await fixture(t);
  const store = new TodoStore(file);
  await store.save([todo]); await store.save([{ ...todo, title: '更新实验' }]);
  await fs.writeFile(file, '{damaged');
  const recovered = new TodoStore(file);
  assert.equal((await recovered.load())[0].title, '论文实验');
  assert.equal(recovered.recovered, true);
  assert.ok((await fs.readdir(path.dirname(file))).some(name => name.includes('.corrupt-')));
  await recovered.save([todo]);
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).length, 1);
});

test('unrecoverable data is never replaced with an empty list', async t => {
  const file = await fixture(t);
  await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, '{damaged');
  const store = new TodoStore(file);
  await assert.rejects(store.load(), /原文件已保留/);
  await assert.rejects(store.save([]), /原文件已保留/);
  assert.equal(await fs.readFile(file, 'utf8'), '{damaged');
});

test('notification receipts survive restart and concurrent stale renderer saves', async t => {
  const file = await fixture(t);
  const store = new TodoStore(file);
  await store.save([todo]);
  let deliveries = 0;
  const deliver = async () => { deliveries++; return true; };
  await Promise.all([store.remind(new Date(2026, 9, 30, 10), deliver), store.save([todo])]);
  const restarted = new TodoStore(file);
  assert.equal((await restarted.load())[0].notifiedFor, '2026-10-30T09:00');
  await restarted.remind(new Date(2026, 9, 30, 10), deliver);
  assert.equal(deliveries, 1);
  await restarted.save([{ ...todo, time: '09:30' }]);
  await restarted.remind(new Date(2026, 9, 30, 10), deliver);
  assert.equal(deliveries, 2);
});

test('unavailable notifications are not marked as delivered', async t => {
  const file = await fixture(t); const store = new TodoStore(file);
  await store.save([todo]);
  assert.deepEqual(await store.remind(new Date(2026, 9, 30, 10), async () => false), []);
  assert.equal((await store.load())[0].notifiedFor, undefined);
});

test('a failed disk write leaves memory unchanged and the queue can retry', async t => {
  const file = await fixture(t); const store = new TodoStore(file);
  await store.save([todo]);
  await fs.mkdir(`${file}.tmp`);
  await assert.rejects(store.save([{ ...todo, title: '尚未保存' }]));
  assert.equal((await store.load())[0].title, '论文实验');
  await fs.rmdir(`${file}.tmp`);
  await store.save([{ ...todo, title: '重试成功' }]);
  assert.equal((await store.load())[0].title, '重试成功');
});
