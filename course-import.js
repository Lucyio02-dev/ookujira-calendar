'use strict';

const { dateKey, findHeaderRow } = require('./course-core');

const ICS_HEADERS = ['课程名称', '日期', '开始时间', '结束时间', '上课地点', '教师', '备注', '课程号'];

function unfoldIcs(text) {
  return String(text).replace(/\r\n[ \t]|\n[ \t]/g, '').split(/\r?\n/);
}

function parseIcsDate(value) {
  const match = String(value || '').match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?Z?)?$/);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (!match[4]) {
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? { date: dateKey(date), time: '' } : null;
  }
  const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6] || 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  let date = new Date(year, month - 1, day, hour, minute);
  if (String(value).endsWith('Z')) date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return { date: dateKey(date), time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` };
}

function parseProperty(line) {
  const split = line.indexOf(':');
  if (split < 0) return null;
  const pieces = line.slice(0, split).split(';');
  return { name: pieces[0].toUpperCase(), params: pieces.slice(1), value: line.slice(split + 1) };
}

function decodeIcsText(value) {
  return value.replace(/\\[nN]/g, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
}

function parseRRule(value, startDate, defaultWeekday, maxWeeks = 32) {
  const fields = Object.fromEntries(String(value || '').split(';').map(part => part.split('=')));
  if (fields.FREQ !== 'WEEKLY') return { dates: [startDate], supported: false };
  const interval = Math.min(6, Math.max(1, Number(fields.INTERVAL) || 1));
  const byDay = String(fields.BYDAY || '').split(',').map(day => ({ SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }[day.slice(-2)])).filter(day => day != null);
  if (!byDay.length) byDay.push(defaultWeekday);
  const start = new Date(`${startDate}T00:00:00`);
  const anchorMonday = new Date(start);
  anchorMonday.setDate(anchorMonday.getDate() - (anchorMonday.getDay() + 6) % 7);
  const until = fields.UNTIL ? parseIcsDate(fields.UNTIL)?.date : null;
  const limit = until || (() => { const date = new Date(start); date.setDate(date.getDate() + maxWeeks * 7); return dateKey(date); })();
  const maxOccurrences = Math.min(500, Math.max(1, Number(fields.COUNT) || 500));
  const result = [];
  for (let candidate = new Date(start); dateKey(candidate) <= limit && result.length < maxOccurrences && result.length < maxWeeks * byDay.length; candidate.setDate(candidate.getDate() + 1)) {
    const week = Math.floor((candidate - anchorMonday) / 604800000);
    if (week % interval === 0 && byDay.includes(candidate.getDay())) result.push(dateKey(candidate));
  }
  return { dates: result.length ? result : [startDate], supported: true };
}

function parseIcs(text) {
  const rows = [ICS_HEADERS];
  const invalid = [];
  let event = null;
  let count = 0;
  for (const line of unfoldIcs(text)) {
    if (line === 'BEGIN:VEVENT') { event = {}; continue; }
    if (line === 'END:VEVENT') {
      if (!event) continue;
      if (event.status === 'CANCELLED') { event = null; continue; }
      const start = event.start?.parsed;
      const title = decodeIcsText(event.summary || '');
      if (!start || !title) { invalid.push({ row: count + 1, title, reason: '缺少课程名称或有效开始时间' }); event = null; count++; continue; }
      const end = event.end?.parsed;
      const weekday = new Date(`${start.date}T00:00:00`).getDay();
      const recurrence = event.rrule ? parseRRule(event.rrule, start.date, weekday) : { dates: [start.date], supported: true };
      if (!recurrence.supported) invalid.push({ row: count + 1, title, reason: '当前暂不支持此重复规则，已按单次课程导入' });
      const excluded = new Set((event.exdates || []).flatMap(value => value.split(',').map(parseIcsDate).filter(Boolean).map(item => item.date)));
      for (const date of recurrence.dates) {
        if (excluded.has(date)) continue;
        rows.push([title, date, start.time, end?.time || '', decodeIcsText(event.location || ''), decodeIcsText(event.teacher || ''), decodeIcsText(event.description || ''), event.uid || `${title}|${start.date}`]);
        count++;
      }
      event = null;
      continue;
    }
    if (!event) continue;
    const property = parseProperty(line);
    if (!property) continue;
    if (property.name === 'DTSTART' || property.name === 'DTEND') {
      event[property.name === 'DTSTART' ? 'start' : 'end'] = { parsed: parseIcsDate(property.value), params: property.params };
    } else if (property.name === 'SUMMARY') event.summary = property.value;
    else if (property.name === 'LOCATION') event.location = property.value;
    else if (property.name === 'DESCRIPTION') event.description = property.value;
    else if (property.name === 'UID') event.uid = property.value;
    else if (property.name === 'STATUS') event.status = property.value.toUpperCase();
    else if (property.name === 'RRULE') event.rrule = property.value;
    else if (property.name === 'EXDATE') (event.exdates ||= []).push(property.value);
    else if (/^(?:X-TEACHER|X-WR-TEACHER)$/.test(property.name)) event.teacher = property.value;
  }
  if (rows.length < 2) throw new Error('没有识别到有效的课程事件');
  const header = findHeaderRow(rows);
  if (!header) throw new Error('无法识别这份日历文件的课程字段');
  return { rows, invalid };
}

async function parseCourseFile(buffer, extension) {
  const ext = String(extension).toLocaleLowerCase();
  if (ext === '.ics' || ext === '.ical') return parseIcs(buffer.toString('utf8'));
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, codepage: 936, dense: false });
  let best = null;
  for (const name of workbook.SheetNames.slice(0, 16)) {
    const worksheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false, blankrows: false });
    const header = findHeaderRow(rows);
    if (header && (!best || header.score > best.score)) best = { rows, score: header.score, sheet: name };
  }
  if (!best) throw new Error('没有找到带课程名称表头的工作表');
  if (best.rows.length > 25001) throw new Error('课表行数过多，请按学期分开导入');
  return { rows: best.rows, sheet: best.sheet, invalid: [] };
}

module.exports = { parseCourseFile, parseIcs };
