(function (root, factory) {
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  else root.CalendarCore = core;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const pad = n => String(n).padStart(2, '0');
  const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  function parseDate(date, time = '00:00') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
    const [y, m, d] = date.split('-').map(Number);
    const [h, min] = time.split(':').map(Number);
    if (y < 1900 || y > 9999 || h > 23 || min > 59) return null;
    const result = new Date(y, m - 1, d, h, min);
    return result.getFullYear() === y && result.getMonth() === m - 1 && result.getDate() === d && result.getHours() === h && result.getMinutes() === min ? result : null;
  }

  function shiftMonth(date, delta) {
    return new Date(date.getFullYear(), date.getMonth() + delta, 1);
  }

  function monthDays(date) {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    return Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay() + i));
  }

  const reminderKey = todo => `${todo.date}T${todo.time}`;

  function normalizeTodos(value) {
    if (!Array.isArray(value) || value.length > 10000) throw new Error('待办数据格式不正确');
    const ids = new Set();
    return value.map(item => {
      if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 100 || ids.has(item.id) ||
          typeof item.title !== 'string' || !item.title.trim() || item.title.length > 50 ||
          typeof item.date !== 'string' || typeof item.time !== 'string' || !parseDate(item.date, item.time) ||
          (item.note != null && (typeof item.note !== 'string' || item.note.length > 200))) {
        throw new Error('待办数据包含无效内容');
      }
      ids.add(item.id);
      const todo = { id: item.id, title: item.title.trim(), date: item.date, time: item.time,
        note: item.note || '', done: item.done === true, createdAt: Number.isFinite(item.createdAt) ? item.createdAt : 0 };
      if (Number.isFinite(item.completedAt)) todo.completedAt = item.completedAt;
      if (typeof item.notifiedFor === 'string' && item.notifiedFor === reminderKey(todo)) todo.notifiedFor = item.notifiedFor;
      return todo;
    });
  }

  function dueTodos(todos, now = new Date()) {
    return todos.filter(todo => {
      const target = parseDate(todo.date, todo.time);
      const age = target ? now - target : -1;
      return !todo.done && age >= 0 && age <= 86400000 && todo.notifiedFor !== reminderKey(todo);
    });
  }

  function visibleTodos(todos, { selected, range = 'upcoming', hideDone = false, query = '' }) {
    const end = parseDate(selected);
    if (!end) return [];
    end.setDate(end.getDate() + (range === 'day' ? 1 : 4));
    const endKey = dateKey(end);
    const needle = query.trim().toLocaleLowerCase();
    return todos.filter(todo => (range === 'all' || (todo.date >= selected && todo.date < endKey)) &&
      (!hideDone || !todo.done) && (!needle || `${todo.title} ${todo.note}`.toLocaleLowerCase().includes(needle)))
      .sort((a, b) => a.date.localeCompare(b.date) || Number(a.done) - Number(b.done) || a.time.localeCompare(b.time) || a.createdAt - b.createdAt);
  }

  // ----- 快速输入：从标题里识别日期与时间（「明天晚上8点 开会」→ 明天 20:00） -----
  const CN_DIGITS = '零一二三四五六七八九';
  const QUALIFIERS = '凌晨|清早|清晨|早晨|早上|上午|中午|午后|下午|傍晚|晚上|夜里|夜晚|深夜|半夜';
  const QUALIFIER_DEFAULT_HOUR = { 凌晨: 1, 清早: 8, 清晨: 8, 早晨: 8, 早上: 9, 上午: 9, 中午: 12, 午后: 15, 下午: 15, 傍晚: 18, 晚上: 20, 夜里: 20, 夜晚: 20, 深夜: 23, 半夜: 23 };
  const DAY_WORD_OFFSET = { 今天: 0, 今日: 0, 今晚: 0, 明天: 1, 明日: 1, 明晚: 1, 明早: 1, 后天: 2, 大后天: 3 };
  const DAY_WORD_QUALIFIER = { 今晚: '晚上', 明晚: '晚上', 明早: '早上' };

  function cnToInt(raw) {
    if (!raw) return NaN;
    raw = raw.replace(/两/g, '二');
    if (/^\d{1,3}$/.test(raw)) return Number(raw);
    const value = CN_DIGITS.indexOf(raw);
    if (value >= 0) return value;
    const match = raw.match(/^([零一二三四五六七八九]?)十([零一二三四五六七八九]?)$/);
    if (!match) return NaN;
    return (match[1] ? CN_DIGITS.indexOf(match[1]) : 1) * 10 + (match[2] ? CN_DIGITS.indexOf(match[2]) : 0);
  }

  function resolveHour(hour, qualifier) {
    if (qualifier === '凌晨' || qualifier === '清早' || qualifier === '清晨' || qualifier === '早晨' || qualifier === '早上' || qualifier === '上午') {
      if (hour === 12) return 0;                       // 上午12点 → 00:00
      return hour;
    }
    if (qualifier === '中午') return hour < 11 ? hour + 12 : hour;
    if (qualifier === '午后' || qualifier === '下午' || qualifier === '傍晚' || qualifier === '晚上' || qualifier === '夜里' || qualifier === '夜晚') {
      return hour <= 12 ? hour + 12 : hour;            // 晚上12点 → 24:00，由调用方收敛为 23:59
    }
    if (qualifier === '深夜' || qualifier === '半夜') return hour < 6 ? hour : hour + 12;
    return hour;
  }

  function parseQuickEntry(text, baseKey) {
    const base = parseDate(baseKey) || parseDate(dateKey(new Date()));
    if (!base || typeof text !== 'string' || !text.trim()) return null;
    if (/每\s*[周星礼]/.test(text)) return null; // 周期性日程暂不支持，避免误解
    let rest = text.replace(/\s+/g, ' ');
    let date = null, time = null, defaultQualifier = null;

    const take = regex => {
      const match = rest.match(regex);
      if (!match) return null;
      rest = rest.slice(0, match.index) + ' ' + rest.slice(match.index + match[0].length);
      return match;
    };

    // X月X日 / X月X号（今年或明年；今年里已经过去的自动顺延到明年）
    const mdPattern = /(今年|明年)?\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/;
    const md = rest.match(mdPattern);
    if (md) {
      let year = base.getFullYear() + (md[1] === '明年' ? 1 : 0);
      let candidate = parseDate(`${year}-${pad(Number(md[2]))}-${pad(Number(md[3]))}`);
      if (candidate && candidate < base && md[1] !== '今年') {
        year += 1;
        candidate = parseDate(`${year}-${pad(Number(md[2]))}-${pad(Number(md[3]))}`);
      }
      if (candidate) { date = dateKey(candidate); take(mdPattern); }
    }

    // 周/星期/礼拜（支持 下、下下 前缀）
    const week = take(/(下下|下)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天])/);
    if (week) {
      const target = week[2] === '日' || week[2] === '天' ? 0 : '一二三四五六'.indexOf(week[2]) + 1;
      if (week[1]) {
        const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate() - ((base.getDay() + 6) % 7) + (week[1] === '下下' ? 14 : 7));
        date = dateKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + (target + 6) % 7));
      } else {
        date = dateKey(new Date(base.getFullYear(), base.getMonth(), base.getDate() + (target - base.getDay() + 7) % 7));
      }
    }

    const dayWord = take(/大后天|后天|明天|明日|明晚|明早|今天|今日|今晚/);
    if (dayWord) {
      date = dateKey(new Date(base.getFullYear(), base.getMonth(), base.getDate() + DAY_WORD_OFFSET[dayWord[0]]));
      defaultQualifier = DAY_WORD_QUALIFIER[dayWord[0]] || defaultQualifier;
    }

    const timeMatch = take(new RegExp(`((?:${QUALIFIERS}))?\\s*((\\d{1,2}|[零一二两三四五六七八九]+)\\s*[点时]\\s*(半|整)?\\s*((\\d{1,2}|[零一二两三四五六七八九]+)\\s*分?)?|([01]?\\d|2[0-3])\\s*[:：]\\s*([0-5]\\d))`));
    const qualifierAlone = timeMatch ? null : take(new RegExp(`(?:${QUALIFIERS})`));
    const qualifier = (timeMatch && timeMatch[1]) || (qualifierAlone && qualifierAlone[0]) || defaultQualifier;

    if (timeMatch) {
      let hour;
      let minute = 0;
      if (timeMatch[7] != null) { hour = Number(timeMatch[7]); minute = Number(timeMatch[8]); }
      else {
        hour = cnToInt(timeMatch[3]);
        if (timeMatch[4] === '半') minute = 30;
        else if (timeMatch[5]) minute = cnToInt(timeMatch[5]);
        if (Number.isNaN(minute)) minute = 0;
      }
      if (Number.isFinite(hour) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        hour = resolveHour(hour, qualifier);
        if (hour > 23) { hour = 23; minute = 59; }
        time = `${pad(hour)}:${pad(minute)}`;
      }
    } else if (qualifier && QUALIFIER_DEFAULT_HOUR[qualifier]) {
      time = `${pad(QUALIFIER_DEFAULT_HOUR[qualifier])}:00`;
    }

    if (!date && !time) return null;
    const title = rest.replace(/^[\s的，,。、]+/, '').replace(/[\s的，,。、]+$/, '').replace(/\s+/g, ' ').trim();
    if (!title) return null;
    return { title, date: date || baseKey, time: time || null }; // time 为 null 表示沿用编辑框现有时间
  }

  return { pad, dateKey, parseDate, shiftMonth, monthDays, reminderKey, normalizeTodos, dueTodos, visibleTodos, parseQuickEntry };
});
