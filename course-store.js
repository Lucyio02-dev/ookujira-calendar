'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { normalizeCourseData, dueCourses } = require('./course-core');

class CourseStore {
  constructor(file) {
    this.file = file;
    this.state = null;
    this.queue = Promise.resolve();
    this.loading = null;
    this.recovered = false;
  }

  async load() {
    if (this.state) return structuredClone(this.state);
    if (!this.loading) this.loading = this.read().finally(() => { this.loading = null; });
    await this.loading;
    return structuredClone(this.state);
  }

  async read() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    try {
      this.state = normalizeCourseData(JSON.parse(await fs.readFile(this.file, 'utf8')));
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.state = normalizeCourseData({ version: 1, termMonday: '', courses: [] });
      } else {
        try {
          const recovered = normalizeCourseData(JSON.parse(await fs.readFile(`${this.file}.bak`, 'utf8')));
          await fs.copyFile(this.file, `${this.file}.corrupt-${Date.now()}`);
          this.state = recovered;
          this.recovered = true;
        } catch {
          throw new Error('无法读取课程数据，原文件已保留。请检查 courses.json 或备份文件。');
        }
      }
    }
    return structuredClone(this.state);
  }

  enqueue(operation) {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }

  async write(next) {
    const temp = `${this.file}.tmp`;
    await fs.writeFile(temp, JSON.stringify(next, null, 2), 'utf8');
    if (this.state) {
      await fs.writeFile(`${this.file}.bak.tmp`, JSON.stringify(this.state, null, 2), 'utf8');
      await fs.rename(`${this.file}.bak.tmp`, `${this.file}.bak`);
    }
    await fs.rename(temp, this.file);
    this.state = next;
    return structuredClone(next);
  }

  save(value) {
    const incoming = normalizeCourseData(value);
    return this.enqueue(async () => {
      const current = await this.load();
      const oldById = new Map(current.courses.map(course => [course.id, course]));
      const courses = incoming.courses.map(course => {
        const old = oldById.get(course.id);
        const key = `${course.date}T${course.startTime}-${course.reminderMinutes}`;
        if (old && old.notifiedFor === key && course.date === old.date && course.startTime === old.startTime && course.reminderMinutes === old.reminderMinutes) course.notifiedFor = old.notifiedFor;
        return course;
      });
      return this.write({ ...incoming, courses });
    });
  }

  remind(now, deliver) {
    return this.enqueue(async () => {
      await this.load();
      const due = dueCourses(this.state.courses, now);
      if (!due.length || !(await deliver(due))) return [];
      const keys = new Set(due.map(course => course.id));
      const courses = this.state.courses.map(course => keys.has(course.id)
        ? { ...course, notifiedFor: `${course.date}T${course.startTime}-${course.reminderMinutes}` }
        : course);
      await this.write({ ...this.state, courses });
      return due;
    });
  }
}

module.exports = { CourseStore };
