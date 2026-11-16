(function (root, factory) {
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  else root.CourseCore = core;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const pad = n => String(n).padStart(2, '0');
  const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
  const HEADER_ALIASES = {
    title: ['课程名称', '课程名', '课程', '教学内容', '科目', 'course name', 'course', 'subject', 'summary'],
    date: ['上课日期', '日期', '教学日期', 'date', 'start date'],
    weekday: ['星期', '周几', '星期几', '上课星期', '上课时间', 'weekday', 'day'],
    weeks: ['周次', '上课周次', '教学周', '教学周次', '开课周次', '起止周次', 'weeks', 'week'],
    startTime: ['开始时间', '课程开始时间', '起始时间', 'start time', 'start'],
    endTime: ['结束时间', '下课时间', '课程结束时间', 'end time', 'end'],
    period: ['节次', '上课节次', '课程节次', '起止节次', '课时', 'period', 'periods'],
    location: ['上课地点', '教室', '上课教室', '地点', '教学楼', '校区', '教学地点', 'location', 'room'],
    teacher: ['任课教师', '授课教师', '教师', '老师', 'teacher', 'instructor'],
    note: ['备注', '课程备注', '说明', 'note', 'description'],
    courseCode: ['课程号', '课程编号', '课程代码', '教学班号', '课程id', 'course code', 'course id'],
    reminderMinutes: ['提前提醒分钟', '提醒分钟', '提前提醒', 'reminder minutes']
  };

  function parseDate(value) {
    if (value instanceof Date && Number.isFinite(value.getTime())) return dateKey(value);
    if (typeof value === 'number' && Number.isFinite(value)) {
      const origin = new Date(1899, 11, 30);
      origin.setDate(origin.getDate() + Math.floor(value));
      return dateKey(origin);
    }
    if (typeof value !== 'string') return null;
    const text = value.trim();
    let match = text.match(/^(\d{4})[年./-](\d{1,2})[月./-](\d{1,2})日?(?=$|[ T])/);
    if (!match) {
      const dayFirst = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
      if (dayFirst) match = [dayFirst[0], dayFirst[3], dayFirst[2], dayFirst[1]];
    }
    if (!match) return null;
    const [, yRaw, mRaw, dRaw] = match;
    const y = Number(yRaw), m = Number(mRaw), d = Number(dRaw);
    const parsed = new Date(y, m - 1, d);
    return y >= 1900 && y <= 9999 && parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
  }

  function parseTime(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const text = String(value).trim();
    const match = text.match(/(?:^|\D)([01]?\d|2[0-3])\s*[:：点时]\s*([0-5]\d)?/);
    return match ? `${pad(Number(match[1]))}:${pad(Number(match[2] || 0))}` : null;
  }

  function parseTimeRange(value) {
    const match = String(value ?? '').match(/(?:^|\D)((?:[01]?\d|2[0-3])\s*[:：]\s*[0-5]\d)\s*(?:-|–|—|~|～|至|到)\s*((?:[01]?\d|2[0-3])\s*[:：]\s*[0-5]\d)/);
    return match ? { startTime: parseTime(match[1]), endTime: parseTime(match[2]) } : null;
  }

  function parseWeekday(value) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6) return value;
    const text = String(value ?? '').trim().toLocaleLowerCase();
    const singleChinese = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };
    if (singleChinese[text] != null) return singleChinese[text];
    const match = text.match(/(?:星期|周|礼拜)\s*([一二三四五六日天0-6])/);
    if (match) return /[日天0]/.test(match[1]) ? 0 : '一二三四五六'.indexOf(match[1]) + 1;
    if (/^[1-7]$/.test(text)) return Number(text) % 7;
    const english = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
    return english[text] ?? null;
  }

  function parseWeeks(value, maxWeeks = 30) {
    const raw = String(value ?? '');
    if (/每周|每星期|全学期|weekly/i.test(raw)) return Array.from({ length: maxWeeks }, (_, index) => index + 1);
    const text = raw.replace(/(?:第\s*)?\d{1,2}\s*(?:-|–|—|~|～|至|到)\s*\d{1,2}\s*节/g, '').replace(/(?:第\s*)?\d{1,2}\s*节/g, '').replace(/第/g, '').replace(/周次|教学周|周/g, '').trim();
    if (!text) return [];
    const odd = /单/.test(text), even = /双/.test(text);
    const weeks = new Set();
    const re = /(\d+)\s*(?:-|–|—|~|～|至|到)\s*(\d+)|(\d+)/g;
    let match;
    while ((match = re.exec(text))) {
      const from = Number(match[1] || match[3]);
      const to = Number(match[2] || match[3]);
      if (from < 1 || to < from || to > 60) continue;
      for (let week = from; week <= to; week++) {
        if (odd && week % 2 === 0 || even && week % 2 === 1) continue;
        weeks.add(week);
      }
    }
    return [...weeks].sort((a, b) => a - b).slice(0, maxWeeks);
  }

  function parsePeriods(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    const match = text.match(/(\d{1,2})\s*(?:-|–|—|~|～|至|到)\s*(\d{1,2})\s*(?:节|時|時段|periods?)?/i) || text.match(/(?:第)?\s*(\d{1,2})\s*(?:节|時|時段|period)/i);
    if (!match) return text.slice(0, 50);
    return match[2] ? `第 ${Number(match[1])}–${Number(match[2])} 节` : `第 ${Number(match[1])} 节`;
  }

  function parsePeriodTimes(value) {
    const result = {};
    for (const line of String(value ?? '').split(/\r?\n/)) {
      if (!line.trim()) continue;
      const match = line.trim().match(/^(\d{1,2})\s*(?:节)?\s*(?:=|：|:|，|,|\s)+\s*((?:[01]?\d|2[0-3]):[0-5]\d)\s*(?:-|–|—|~|～|至|到)\s*((?:[01]?\d|2[0-3]):[0-5]\d)$/);
      if (!match || Number(match[1]) < 1 || match[2] >= match[3]) throw new Error(`节次时间格式无法识别：“${line.trim()}”。请使用“1节 08:00-08:45”格式。`);
      result[Number(match[1])] = { startTime: match[2], endTime: match[3] };
    }
    return result;
  }

  function formatPeriodTimes(value) {
    return Object.entries(value || {}).sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([period, times]) => `${period}节 ${times.startTime}-${times.endTime}`).join('\n');
  }

  function resolvePeriodTimes(period, periodTimes) {
    const numbers = [...new Set(String(period ?? '').match(/\d{1,2}/g) || [])].map(Number).filter(n => n >= 1 && n <= 60).sort((a, b) => a - b);
    if (!numbers.length) return null;
    const first = periodTimes?.[numbers[0]], last = periodTimes?.[numbers[numbers.length - 1]];
    return first && last ? { startTime: first.startTime, endTime: last.endTime } : null;
  }

  function normalizeCourseData(value) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.courses) || value.courses.length > 20000) throw new Error('课程数据格式不正确');
    const termMonday = value.termMonday == null || value.termMonday === '' ? '' : parseDate(value.termMonday);
    if (value.termMonday && !termMonday) throw new Error('学期起始日期不正确');
    const termWeeks = Number.isInteger(value.termWeeks) && value.termWeeks >= 1 && value.termWeeks <= 60 ? value.termWeeks : 20;
    if (value.periodTimes != null && (typeof value.periodTimes !== 'object' || Array.isArray(value.periodTimes))) throw new Error('节次时间表格式不正确');
    const periodTimes = {};
    for (const [period, times] of Object.entries(value.periodTimes || {})) {
      const number = Number(period);
      if (!Number.isInteger(number) || number < 1 || number > 60 || !times || !TIME_RE.test(times.startTime) || !TIME_RE.test(times.endTime) || times.startTime >= times.endTime) throw new Error('节次时间表包含无效时间');
      periodTimes[number] = { startTime: times.startTime, endTime: times.endTime };
    }
    if (value.suppressed != null && !Array.isArray(value.suppressed)) throw new Error('课程例外记录格式不正确');
    const suppressed = [...new Set((value.suppressed || []).filter(id => typeof id === 'string' && id.length <= 180))].slice(0, 20000);
    const courses = [];
    const ids = new Set();
    for (const item of value.courses) {
      if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 180 || ids.has(item.id) ||
          typeof item.title !== 'string' || !item.title.trim() || item.title.length > 100 || !parseDate(item.date) ||
          (item.startTime && !TIME_RE.test(item.startTime)) || (item.endTime && !TIME_RE.test(item.endTime)) ||
          (item.endTime && !item.startTime) ||
          (item.startTime && item.endTime && item.startTime >= item.endTime) ||
          (item.location != null && (typeof item.location !== 'string' || item.location.length > 180)) ||
          (item.teacher != null && (typeof item.teacher !== 'string' || item.teacher.length > 100)) ||
          (item.note != null && (typeof item.note !== 'string' || item.note.length > 240)) ||
          !Number.isInteger(item.reminderMinutes ?? 20) || (item.reminderMinutes ?? 20) < 0 || (item.reminderMinutes ?? 20) > 180) {
        throw new Error('课程中包含无效内容');
      }
      ids.add(item.id);
      const course = {
        id: item.id,
        title: item.title.trim(),
        date: parseDate(item.date),
        startTime: item.startTime || '',
        endTime: item.endTime || '',
        period: typeof item.period === 'string' ? item.period.slice(0, 50) : '',
        location: typeof item.location === 'string' ? item.location.trim().slice(0, 180) : '',
        teacher: typeof item.teacher === 'string' ? item.teacher.trim().slice(0, 100) : '',
        note: typeof item.note === 'string' ? item.note.trim().slice(0, 240) : '',
        reminderMinutes: item.reminderMinutes ?? 20,
        sourceId: typeof item.sourceId === 'string' ? item.sourceId.slice(0, 140) : 'manual',
        sourceKey: typeof item.sourceKey === 'string' ? item.sourceKey.slice(0, 180) : '',
        manualOverride: item.manualOverride === true,
        createdAt: Number.isFinite(item.createdAt) ? item.createdAt : 0
      };
      if (item.sourceSnapshot && typeof item.sourceSnapshot === 'object') {
        const snapshot = item.sourceSnapshot;
        if (typeof snapshot.title === 'string' && snapshot.title.trim() && parseDate(snapshot.date) &&
            (!snapshot.startTime || TIME_RE.test(snapshot.startTime)) && (!snapshot.endTime || TIME_RE.test(snapshot.endTime)) &&
            (!snapshot.endTime || snapshot.startTime) && (!snapshot.startTime || !snapshot.endTime || snapshot.startTime < snapshot.endTime)) {
          course.sourceSnapshot = {
            title: snapshot.title.trim().slice(0, 100), date: parseDate(snapshot.date), startTime: snapshot.startTime || '', endTime: snapshot.endTime || '',
            period: typeof snapshot.period === 'string' ? snapshot.period.slice(0, 50) : '',
            location: typeof snapshot.location === 'string' ? snapshot.location.trim().slice(0, 180) : '',
            teacher: typeof snapshot.teacher === 'string' ? snapshot.teacher.trim().slice(0, 100) : '',
            note: typeof snapshot.note === 'string' ? snapshot.note.trim().slice(0, 240) : '',
            reminderMinutes: Number.isInteger(snapshot.reminderMinutes) && snapshot.reminderMinutes >= 0 && snapshot.reminderMinutes <= 180 ? snapshot.reminderMinutes : 20
          };
        }
      }
      if (typeof item.notifiedFor === 'string' && item.notifiedFor === `${course.date}T${course.startTime}-${course.reminderMinutes}`) course.notifiedFor = item.notifiedFor;
      courses.push(course);
    }
    return { version: 1, termMonday: termMonday || '', termWeeks, periodTimes, suppressed, courses };
  }

  function hash(text) {
    let value = 2166136261;
    for (let i = 0; i < text.length; i++) { value ^= text.charCodeAt(i); value = Math.imul(value, 16777619); }
    return (value >>> 0).toString(36);
  }

  const normalizeHeader = value => String(value ?? '').trim().toLocaleLowerCase().replace(/[\s　_\-()（）【】\[\]：:]/g, '');
  const aliases = Object.fromEntries(Object.entries(HEADER_ALIASES).map(([key, values]) => [key, values.map(normalizeHeader)]));

  function findHeaderRow(rows) {
    let best = { index: -1, score: 0 };
    for (let index = 0; index < Math.min(rows.length, 12); index++) {
      const cells = (rows[index] || []).map(normalizeHeader);
      const found = new Set();
      for (const [key, names] of Object.entries(aliases)) if (cells.some(cell => names.includes(cell))) found.add(key);
      const score = (found.has('title') ? 5 : 0) + [...found].length;
      if (score > best.score) best = { index, score, headers: rows[index], found };
    }
    if (best.found?.has('title')) return best;
    let fallback = null;
    for (let index = 0; index < Math.min(rows.length, 12); index++) {
      const headers = rows[index] || [];
      const width = headers.filter(value => String(value ?? '').trim()).length;
      if (width >= 3 && (!fallback || width > fallback.width)) fallback = { index, score: 0, headers, found: new Set(), width };
    }
    return fallback;
  }

  function guessMapping(headers) {
    const normalized = headers.map(normalizeHeader);
    const mapping = {};
    for (const [key, names] of Object.entries(aliases)) mapping[key] = normalized.findIndex(cell => names.includes(cell));
    return mapping;
  }

  function getCell(row, index) { return Number.isInteger(index) && index >= 0 ? row[index] : ''; }

  function detectScheduleMatrix(rows, headerIndex, titleColumn) {
    for (let index = headerIndex + 1; index < Math.min(rows.length, headerIndex + 5); index++) {
      const row = rows[index] || [];
      if (String(getCell(row, titleColumn) ?? '').trim()) continue;
      const dayColumns = [];
      row.forEach((value, column) => {
        const weekday = parseWeekday(value);
        if (weekday != null) dayColumns.push({ column, weekday });
      });
      if (dayColumns.length >= 3) return { headerRow: index, dataStart: index + 1, dayColumns };
    }
    return null;
  }

  function parseScheduleWeeks(value, termWeeks) {
    const text = String(value ?? '');
    const explicit = [...text.matchAll(/第\s*([\d\s、,，;；\-–—~～至到]+)\s*周/g)];
    let weeks = [];
    if (explicit.length) {
      weeks = explicit.flatMap(match => parseWeeks(match[1], termWeeks));
    } else {
      const range = text.match(/\d{1,2}\s*(?:-|–|—|~|～|至|到)\s*\d{1,2}\s*周/);
      const single = text.match(/(?:第\s*)?\d{1,2}\s*周/);
      if (range) weeks = parseWeeks(range[0], termWeeks);
      else if (single) weeks = parseWeeks(single[0], termWeeks);
      else if (/每周|每星期|全学期|weekly/i.test(text)) weeks = Array.from({ length: termWeeks }, (_, index) => index + 1);
    }
    const odd = /单周|单数周|奇数周|（单）|\(单\)/.test(text);
    const even = /双周|双数周|偶数周|（双）|\(双\)/.test(text);
    return [...new Set(weeks)].filter(week => week <= termWeeks && (!odd || week % 2 === 1) && (!even || week % 2 === 0)).sort((a, b) => a - b);
  }

  function parseScheduleCell(value, termWeeks) {
    const text = String(value ?? '').trim();
    if (!text) return [];
    return text.split(/[\r\n;；]+/).map(part => part.trim()).filter(Boolean).map(part => {
      const weeks = parseScheduleWeeks(part, termWeeks);
      if (!weeks.length) throw new Error('星期分栏中的课程没有可识别的周次');
      const periodMatch = part.match(/(?:每周\s*)?(?:第\s*)?\d{1,2}\s*(?:-|–|—|~|～|至|到)\s*\d{1,2}\s*节|(?:每周\s*)?(?:第\s*)?\d{1,2}\s*节/);
      const period = periodMatch ? parsePeriods(periodMatch[0]) : '';
      const timeRange = parseTimeRange(part);
      const location = part
        .replace(/第\s*[\d\s、,，;；\-–—~～至到]+\s*周/g, '')
        .replace(/\d{1,2}\s*(?:-|–|—|~|～|至|到)\s*\d{1,2}\s*周/g, '')
        .replace(/(?:每周\s*)?(?:第\s*)?\d{1,2}\s*(?:-|–|—|~|～|至|到)\s*\d{1,2}\s*节/g, '')
        .replace(/(?:每周\s*)?(?:第\s*)?\d{1,2}\s*节/g, '')
        .replace(/\d{1,2}[:：][0-5]\d\s*(?:-|–|—|~|～|至|到)\s*\d{1,2}[:：][0-5]\d/g, '')
        .replace(/(?:星期|周|礼拜)[一二三四五六日天]/g, '')
        .replace(/^[,，;；\s]+|[,，;；\s]+$/g, '')
        .replace(/\s*[,，;；]\s*/g, '，')
        .trim();
      return { weeks, period, timeRange, location };
    });
  }

  function readEventDate(value) {
    if (value instanceof Date) return parseDate(value);
    return parseDate(value);
  }

  function occurrenceDates(row, mapping, termMonday, termWeeks) {
    const date = readEventDate(getCell(row, mapping.date));
    if (date) return [date];
    const weekdayText = getCell(row, mapping.weekday);
    const weekText = getCell(row, mapping.weeks);
    const weekday = parseWeekday(weekdayText) ?? parseWeekday(weekText);
    const weeks = parseWeeks(weekText || weekdayText, termWeeks);
    if (weekday == null) throw new Error('缺少可识别的星期或上课日期');
    if (!weeks.length) throw new Error('缺少可识别的周次');
    return datesForWeekday(weekday, weeks, termMonday);
  }

  function datesForWeekday(weekday, weeks, termMonday) {
    const start = readEventDate(termMonday);
    if (weekday == null) throw new Error('缺少可识别的星期或上课日期');
    if (!weeks.length) throw new Error('缺少可识别的周次');
    if (!start) throw new Error('请先设置第一教学周周一的日期');
    const monday = new Date(`${start}T00:00:00`);
    if (monday.getDay() !== 1) throw new Error('学期起始日期必须是周一');
    return weeks.map(week => {
      const day = new Date(monday);
      day.setDate(day.getDate() + (week - 1) * 7 + (weekday + 6) % 7);
      return dateKey(day);
    });
  }

  function prepareImport(rows, mapping, termMonday, sourceId = '课表导入', termWeeks = 20, periodTimes = {}) {
    if (!Array.isArray(rows) || rows.length < 2) throw new Error('文件里没有可导入的课程行');
    const automaticHeader = findHeaderRow(rows);
    const requestedHeader = Number.isInteger(mapping?.headerRow) ? mapping.headerRow : null;
    const headerInfo = requestedHeader != null && rows[requestedHeader] ? { index: requestedHeader, headers: rows[requestedHeader] } : automaticHeader;
    if (!headerInfo) throw new Error('没有找到可用的表头行。请使用有表头的课表，或在教学系统里另存为表格格式。');
    const headers = headerInfo.headers.map(value => String(value ?? '').trim());
    const selected = { ...guessMapping(headers), ...mapping };
    delete selected.headerRow;
    if (!(selected.title >= 0)) throw new Error('请选择课程名称所在的列');
    const scheduleMatrix = detectScheduleMatrix(rows, headerInfo.index, selected.title);
    const prepared = [];
    const invalid = [];
    const dataStart = scheduleMatrix?.dataStart ?? headerInfo.index + 1;
    for (let index = dataStart; index < rows.length; index++) {
      const row = rows[index] || [];
      if (!row.some(value => String(value ?? '').trim())) continue;
      const title = String(getCell(row, selected.title) ?? '').trim();
      if (!title) continue;
      const rowSchedules = [];
      if (scheduleMatrix) {
        for (const { column, weekday } of scheduleMatrix.dayColumns) {
          const value = getCell(row, column);
          if (!String(value ?? '').trim()) continue;
          try {
            rowSchedules.push(...parseScheduleCell(value, termWeeks).map(schedule => ({ ...schedule, weekday })));
          } catch (error) {
            invalid.push({ row: index + 1, title: title.slice(0, 100), reason: `星期${WEEKDAY_NAMES[weekday]}：${error.message}` });
          }
        }
      } else {
        rowSchedules.push(null);
      }
      for (const schedule of rowSchedules) {
        try {
          const dates = schedule
            ? datesForWeekday(schedule.weekday, schedule.weeks, termMonday)
            : occurrenceDates(row, selected, termMonday, termWeeks);
          const startText = String(getCell(row, selected.startTime) ?? '').trim();
          const endText = String(getCell(row, selected.endTime) ?? '').trim();
          const timeRange = schedule?.timeRange || parseTimeRange(startText) || parseTimeRange(endText);
          let startTime = timeRange?.startTime || parseTime(startText);
          let endTime = timeRange?.endTime || parseTime(endText);
          const periodText = schedule?.period || String(getCell(row, selected.period) ?? '').trim();
          let period = schedule?.period || parsePeriods(periodText);
          if (!period) period = parsePeriods(`${periodText} ${getCell(row, selected.weekday)}`);
          if (!startTime && !endTime) {
            const mappedTime = resolvePeriodTimes(period, periodTimes);
            if (mappedTime) { startTime = mappedTime.startTime; endTime = mappedTime.endTime; }
          }
          if ((startText && !startTime) || (endText && !endTime)) throw new Error('时间列格式无法识别，请使用“09:00”格式');
          if (endTime && !startTime) throw new Error('填写结束时间时也要填写开始时间');
          if (startTime && endTime && startTime >= endTime) throw new Error('课程结束时间必须晚于开始时间');
          const location = schedule?.location || String(getCell(row, selected.location) ?? '').trim();
          const teacher = String(getCell(row, selected.teacher) ?? '').trim();
          const note = String(getCell(row, selected.note) ?? '').trim();
          const courseCode = String(getCell(row, selected.courseCode) ?? '').trim();
          const reminderRaw = Number(getCell(row, selected.reminderMinutes));
          const reminderMinutes = Number.isInteger(reminderRaw) && reminderRaw >= 0 && reminderRaw <= 180 ? reminderRaw : 20;
          const weekday = schedule?.weekday ?? parseWeekday(getCell(row, selected.weekday));
          const sessionKey = `${courseCode || `${title}|${teacher}`}|${weekday ?? ''}|${period || startTime || ''}`;
          for (const date of dates) {
            const sourceKey = sessionKey;
            prepared.push({
              id: `course_${hash(`${sourceId}|${sourceKey}|${date}`)}`,
              title, date, startTime: startTime || '', endTime: endTime || '', period,
              location, teacher, note, reminderMinutes,
              sourceId: `import:${sourceId}`.slice(0, 140),
              sourceKey: sourceKey.slice(0, 180), manualOverride: false,
              sourceSnapshot: { title, date, startTime: startTime || '', endTime: endTime || '', period, location, teacher, note, reminderMinutes }, createdAt: Date.now()
            });
          }
        } catch (error) {
          invalid.push({ row: index + 1, title: title.slice(0, 100), reason: error.message });
        }
      }
      if (prepared.length > 20000) throw new Error('课程数量超过单次导入上限，请按学期或院系分批导入');
    }
    const unique = new Map();
    for (const course of prepared) unique.set(course.id, course);
    return { courses: [...unique.values()], invalid, headerRow: headerInfo.index, headers, scheduleMatrix: scheduleMatrix ? { headerRow: scheduleMatrix.headerRow, dayColumns: scheduleMatrix.dayColumns } : null };
  }

  function occurrenceKey(course) { return `${course.id}|${course.date}|${course.startTime}`; }
  const samePayload = (a, b) => ['title', 'date', 'startTime', 'endTime', 'period', 'location', 'teacher', 'note', 'reminderMinutes']
    .every(key => (a[key] ?? '') === (b[key] ?? ''));

  function mergeCourses(existing, incoming, suppressed = []) {
    const result = new Map(existing.map(course => [course.id, course]));
    const summary = { added: 0, updated: 0, unchanged: 0 };
    for (const item of incoming) {
      if (suppressed.includes(item.id)) continue;
      const old = result.get(item.id);
      if (!old) { summary.added++; result.set(item.id, item); continue; }
      if (old.manualOverride) {
        summary.unchanged++;
        result.set(item.id, { ...old, sourceSnapshot: item.sourceSnapshot || old.sourceSnapshot });
        continue;
      }
      if (samePayload(old, item)) { summary.unchanged++; continue; }
      summary.updated++;
      const notifiedFor = old.notifiedFor && old.date === item.date && old.startTime === item.startTime && old.reminderMinutes === item.reminderMinutes ? old.notifiedFor : undefined;
      result.set(item.id, { ...old, ...item, ...(notifiedFor ? { notifiedFor } : {}) });
    }
    return { courses: [...result.values()], summary };
  }

  function compareCourseTime(a, b) {
    return a.date.localeCompare(b.date) || (a.startTime || '99:99').localeCompare(b.startTime || '99:99') || a.title.localeCompare(b.title, 'zh-CN');
  }

  function dueCourses(courses, now = new Date()) {
    const due = [];
    for (const course of courses) {
      if (!course.startTime) continue;
      const start = new Date(`${course.date}T${course.startTime}:00`);
      const untilStart = start - now;
      const key = `${course.date}T${course.startTime}-${course.reminderMinutes}`;
      if (untilStart <= course.reminderMinutes * 60000 && untilStart >= -5 * 60000 && course.notifiedFor !== key) due.push(course);
    }
    return due.sort(compareCourseTime);
  }

  function visibleCourses(courses, { start, end, query = '' } = {}) {
    const needle = String(query).trim().toLocaleLowerCase();
    return courses.filter(course => (!start || course.date >= start) && (!end || course.date < end) &&
      (!needle || `${course.title} ${course.teacher} ${course.location} ${course.note}`.toLocaleLowerCase().includes(needle)))
      .sort(compareCourseTime);
  }

  function weekRange(anchor) {
    const date = new Date(`${anchor}T00:00:00`);
    if (!Number.isFinite(date.getTime())) return null;
    const offset = (date.getDay() + 6) % 7;
    const monday = new Date(date);
    monday.setDate(monday.getDate() - offset);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    return { start: dateKey(monday), end: dateKey(sunday), days: Array.from({ length: 7 }, (_, index) => {
      const day = new Date(monday);
      day.setDate(day.getDate() + index);
      return dateKey(day);
    }) };
  }

  function nextCourse(courses, now = new Date()) {
    return courses.filter(course => course.startTime && new Date(`${course.date}T${course.startTime}:00`) >= now).sort(compareCourseTime)[0] || null;
  }

  return { pad, dateKey, parseDate, parseTime, parseTimeRange, parseWeekday, parseWeeks, parsePeriods, parsePeriodTimes, formatPeriodTimes, resolvePeriodTimes, normalizeCourseData, findHeaderRow, guessMapping, prepareImport, mergeCourses, occurrenceKey, dueCourses, visibleCourses, compareCourseTime, weekRange, nextCourse, WEEKDAY_NAMES };
});
