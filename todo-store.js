const fs = require('node:fs/promises');
const path = require('node:path');
const { normalizeTodos, reminderKey, dueTodos } = require('./calendar-core');

class TodoStore {
  constructor(file) {
    this.file = file;
    this.todos = null;
    this.queue = Promise.resolve();
    this.loading = null;
    this.recovered = false;
  }

  async load() {
    if (this.todos) return structuredClone(this.todos);
    if (!this.loading) this.loading = this.read().finally(() => { this.loading = null; });
    await this.loading;
    return structuredClone(this.todos);
  }

  async read() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    try {
      this.todos = normalizeTodos(JSON.parse(await fs.readFile(this.file, 'utf8')));
    } catch (error) {
      if (error.code === 'ENOENT') this.todos = [];
      else {
        try {
          const recovered = normalizeTodos(JSON.parse(await fs.readFile(`${this.file}.bak`, 'utf8')));
          await fs.copyFile(this.file, `${this.file}.corrupt-${Date.now()}`);
          this.todos = recovered;
          this.recovered = true;
        } catch {
          throw new Error('无法读取待办数据，原文件已保留。请检查 todos.json 或备份文件。');
        }
      }
    }
    return structuredClone(this.todos);
  }

  enqueue(operation) {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }

  async write(next) {
    const temp = `${this.file}.tmp`;
    await fs.writeFile(temp, JSON.stringify(next, null, 2), 'utf8');
    if (this.todos) {
      await fs.writeFile(`${this.file}.bak.tmp`, JSON.stringify(this.todos, null, 2), 'utf8');
      await fs.rename(`${this.file}.bak.tmp`, `${this.file}.bak`);
    }
    await fs.rename(temp, this.file);
    this.todos = next;
    return structuredClone(next);
  }

  save(value) {
    const incoming = normalizeTodos(value);
    return this.enqueue(async () => {
      await this.load();
      // Preserve a receipt when a reminder fired while the editor was open.
      const current = new Map(this.todos.map(todo => [todo.id, todo]));
      const next = incoming.map(todo => {
        const old = current.get(todo.id);
        if (old && old.notifiedFor === reminderKey(todo)) todo.notifiedFor = old.notifiedFor;
        return todo;
      });
      return this.write(next);
    });
  }

  remind(now, deliver) {
    return this.enqueue(async () => {
      await this.load();
      const due = dueTodos(this.todos, now);
      if (!due.length || !(await deliver(due))) return [];
      const ids = new Set(due.map(todo => todo.id));
      await this.write(this.todos.map(todo => ids.has(todo.id) ? { ...todo, notifiedFor: reminderKey(todo) } : todo));
      return due;
    });
  }
}

module.exports = { TodoStore };
