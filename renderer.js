'use strict';
const { pad, dateKey, parseDate, shiftMonth, monthDays, reminderKey, normalizeTodos, visibleTodos, parseQuickEntry } = window.CalendarCore;
const CourseCore = window.CourseCore;
const $ = id => document.getElementById(id);
const weekNames = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
let todos = [];
let courseState = { version: 1, termMonday: '', termWeeks: 20, courses: [] };
let courses = [];
let coursesReady = false;
let courseSaving = false;
let courseSavePromise = Promise.resolve(true);
let calendarView = 'month';
let weekAnchor = dateKey(new Date());
let eventFilter = 'all';
let editingCourseId = null;
let pendingCourseImport = null;
let currentMonth = shiftMonth(new Date(), 0);
let selected = dateKey(new Date());
let previousToday = selected;
let range = 'upcoming';
let hideDone = false;
let editingId = null;
let busy = false;
let loaded = false;
let toastTimer;
let toastAction;
let bubbleTimer;
let mascotMood = 'auto';
let soundOn = true;
let theme = 'tide';
let recentlyAddedId = null;
let celebratedFor = '';
let monthAnim = 0;
let onboarded = false;
let onboardingTimer = null;
let lastInteraction = Date.now();
let transientTimer = null;
let tickerIndex = 0;
let tickerPool = [];
let tickerTimer = null;

try {
  const preferences = JSON.parse(localStorage.getItem('calendar-preferences') || '{}');
  if (['day', 'upcoming', 'all'].includes(preferences.range)) range = preferences.range;
  hideDone = preferences.hideDone === true;
  if (['auto', 'happy', 'shy', 'sleep'].includes(preferences.mascotMood)) mascotMood = preferences.mascotMood;
  soundOn = preferences.sound !== false;
  if (['tide', 'ocean', 'sakura', 'stardust'].includes(preferences.theme)) theme = preferences.theme;
  if (typeof preferences.celebratedFor === 'string') celebratedFor = preferences.celebratedFor;
  onboarded = preferences.onboarded === true;
  if (['all', 'courses', 'todos'].includes(preferences.eventFilter)) eventFilter = preferences.eventFilter;
} catch { /* Preferences are optional. */ }

function savePreferences() {
  try { localStorage.setItem('calendar-preferences', JSON.stringify({ range, hideDone, mascotMood, sound: soundOn, theme, celebratedFor, onboarded, eventFilter })); } catch { /* Keep in-memory preferences. */ }
}

// ----- 音效：WebAudio 现场合成，无外部文件 -----
const AudioFx = (() => {
  let ctx = null;
  let enabled = true;
  const ensure = () => {
    if (!enabled) return null;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch { return null; }
  };
  const tone = (freq, dur, { type = 'sine', vol = .05, delay = 0, slide = 0 } = {}) => {
    const ac = ensure();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  };
  return {
    get enabled() { return enabled; },
    set enabled(value) { enabled = value; },
    click() { tone(720, .05, { type: 'triangle', vol: .03 }); },
    select() { tone(980, .04, { type: 'triangle', vol: .018 }); },
    add() { tone(523, .09, { vol: .045 }); tone(784, .12, { vol: .045, delay: .07 }); },
    complete() { tone(659, .1, { vol: .05 }); tone(880, .16, { vol: .05, delay: .08 }); },
    remove() { tone(392, .14, { type: 'triangle', vol: .04, slide: 210 }); },
    celebrate() { [523, 659, 784, 1047].forEach((f, i) => tone(f, .16, { vol: .05, delay: i * .09 })); tone(1319, .34, { vol: .035, delay: .38 }); },
    remind() { tone(880, .12, { vol: .045 }); tone(880, .12, { vol: .045, delay: .18 }); }
  };
})();

// ----- 专注模式：番茄钟倒计时环 -----
const FocusTimer = (() => {
  const CIRCUMFERENCE = 2 * Math.PI * 54;
  let total = 25 * 60;
  let left = total;
  let timer = null;
  let running = false;
  const fmt = seconds => `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
  function render() {
    $('focusTime').textContent = fmt(left);
    $('focusRing').style.strokeDashoffset = (CIRCUMFERENCE * (1 - left / total)).toFixed(1);
    $('focusStatus').textContent = running ? '专注中，这片海很安静…' : left === total ? '选一段时长，随时启航' : left === 0 ? '一段海路完成啦' : '暂停了，喘口气也好';
    document.querySelectorAll('[data-focus-min]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.focusMin) * 60 === total)));
    $('focusToggle').textContent = running ? '暂停' : left === total ? '开始专注' : left === 0 ? '再来一段' : '继续';
  }
  function finish() {
    AudioFx.celebrate();
    showBubble('专注完成！去歇口气吧～', 6000);
    bounceMascot();
    spawnBubbles();
    try { window.api.notifyFocusDone(`专注 ${total / 60} 分钟完成，休息一下吧。`); } catch { /* 通知不可用时静默。 */ }
  }
  function tick() {
    left--;
    if (left <= 0) { left = 0; pause(); render(); finish(); return; }
    render();
  }
  function start() {
    if (running || left <= 0) return;
    running = true;
    timer = setInterval(tick, 1000);
    AudioFx.click();
    showBubble(pickLine('focusStart'));
    try { window.api.setFocusMode(true); } catch { /* 桌宠未开启时忽略。 */ }
    render();
  }
  function pause() {
    const wasRunning = running;
    running = false;
    clearInterval(timer);
    timer = null;
    if (wasRunning) { try { window.api.setFocusMode(false); } catch { /* 桌宠未开启时忽略。 */ } }
    render();
  }
  function reset(minutes = null) {
    pause();
    if (minutes) total = minutes * 60;
    left = total;
    render();
  }
  return { start, pause, reset, render, isRunning: () => running };
})();

// ----- 台词库 -----
const LINES = Companion.lines;
const pickLine = Companion.createSpeaker();
let lastIdleSpeech = Date.now();
function showBubble(text, duration = 4000) {
  clearTimeout(bubbleTimer); $('mascotBubble').textContent = text; $('mascotBubble').classList.add('show');
  bubbleTimer = setTimeout(() => $('mascotBubble').classList.remove('show'), duration);
}
function bounceMascot() {
  const img = $('mascotImg');
  img.classList.remove('bounce');
  void img.offsetWidth;
  img.classList.add('bounce');
}
function currentExpression() {
  const hour = new Date().getHours();
  return mascotMood === 'auto' ? (hour >= 23 || hour < 6 ? 'sleep' : 'happy') : mascotMood;
}
function setExpressionImages(expression) {
  const src = `assets/mascot-v2/${expression}.png`;
  for (const el of [$('mascotImg'), $('companionPortrait'), $('fullBodyImg')]) {
    if (el.getAttribute('src') !== src) el.src = src;
  }
}
function transientMood(expression, ms = 2600) {
  if (mascotMood !== 'auto' || currentExpression() === expression) return;
  clearTimeout(transientTimer);
  setExpressionImages(expression);
  transientTimer = setTimeout(() => { transientTimer = null; updateMascot(); }, ms);
}
function react(kind, { mood = null, bubble = true, bounce = false } = {}) {
  lastInteraction = Date.now();
  if (bubble) showBubble(pickLine(kind));
  if (bounce) bounceMascot();
  if (mood) transientMood(mood);
}

async function initialize() {
  bindEvents();
  renderCalendar();
  renderOverview();
  updateMascot();
  syncSound();
  applyTheme();
  startDecorations();
  startTicker();
  ['happy', 'shy', 'sleep'].forEach(name => { const img = new Image(); img.src = `assets/mascot-v2/${name}.png`; }); // 预热表情，切换零等待
  try {
    const data = await window.api.loadTodos();
    todos = normalizeTodos(data.todos);
    loaded = true;
    $('todoList').classList.add('animate-in');
    renderAll();
    setTimeout(() => $('todoList').classList.remove('animate-in'), 1400);
    if (data.recovered) showToast('已从备份恢复日程，损坏的原文件已保留。', null, 12000);
  } catch (error) {
    $('btnAdd').disabled = true;
    $('todoList').replaceChildren();
    const message = document.createElement('div');
    message.className = 'empty-state load-error';
    const title = document.createElement('strong');
    title.textContent = '日程暂时无法读取';
    const detail = document.createElement('p');
    detail.textContent = '数据文件已保留，请检查文件权限或备份后重试。';
    const retry = document.createElement('button');
    retry.className = 'secondary-btn';
    retry.textContent = '重新加载';
    retry.onclick = () => location.reload();
    message.append(title, detail, retry);
    $('todoList').append(message);
    console.error(error);
  } finally { $('todoList').setAttribute('aria-busy', 'false'); }
  try {
    courseState = CourseCore.normalizeCourseData(await window.api.loadCourses());
    courses = courseState.courses;
    coursesReady = true;
    $('courseTermMonday').value = courseState.termMonday;
    $('courseTermWeeks').value = String(courseState.termWeeks);
    renderAll();
  } catch (error) {
    coursesReady = false;
    console.error('课程数据读取失败:', error);
    showToast('课表数据暂时无法读取，原课程文件已保留。');
  }
  try {
    const state = await window.api.windowState();
    setPinned(state.pinned);
    if (!state.notifications) $('reminderStatus').textContent = '系统通知不可用 · 请留意日程';
  } catch { showToast('窗口状态读取失败，请稍后重试。'); }
  try {
    const pet = await window.api.petState();
    setPet(pet.enabled === true);
  } catch { /* 桌宠状态读取失败时保持默认。 */ }
  window.api.onPetChanged(enabled => setPet(enabled));
  window.api.onReminded(ids => {
    todos = todos.map(todo => ids.includes(todo.id) ? { ...todo, notifiedFor: reminderKey(todo) } : todo);
    AudioFx.remind();
    react('remind', { mood: 'happy', bounce: true });
    renderTodos();
  });
  window.api.onCoursesReminded(ids => {
    courses = courses.map(course => ids.includes(course.id) ? { ...course, notifiedFor: `${course.date}T${course.startTime}-${course.reminderMinutes}` } : course);
    AudioFx.remind();
    react('remind', { mood: 'happy', bounce: true });
    renderAll();
  });
  window.api.onCourseOpenDate(date => {
    if (!CourseCore.parseDate(date)) return;
    selected = date;
    weekAnchor = date;
    calendarView = 'week';
    currentMonth = shiftMonth(parseDate(date), 0);
    renderAll();
  });
  setInterval(() => {
    const today = dateKey(new Date());
    if (today !== previousToday) {
      if (selected === previousToday) { selected = today; currentMonth = shiftMonth(new Date(), 0); }
      previousToday = today;
    }
    renderOverview();
    renderCalendar();
    renderWeekAgenda();
    if (loaded) renderTodos();
    updateMascot();
  }, 60000);
  setInterval(() => { // 轻声的闲聊：仅窗口可见且长时间没有互动时
    if (document.hidden || busy || !loaded) return;
    if (Date.now() - lastInteraction < 90000 || Date.now() - lastIdleSpeech < 15 * 60000 || FocusTimer.isRunning()) return;
    lastIdleSpeech = Date.now(); showBubble(pickLine('idle'));
  }, 25000);
  setTimeout(() => {
    if (onboarded) { if (!document.hidden) showBubble(pickLine('greet'), 4200); return; }
    startOnboarding();
  }, 1400);
}

// ----- 首次启动：おおくじら的气泡教学，任意操作即跳过 -----
function startOnboarding() {
  const steps = [
    '我是おおくじら，叫我大鲸鱼就好。',
    '标题里写「明天晚上8点 开会」，日期时间我帮你认。',
    '右下角是我～也能召唤我到桌面上陪你哦。'
  ];
  let index = 0;
  const next = () => {
    if (index >= steps.length) {
      onboarded = true;
      savePreferences();
      return;
    }
    showBubble(steps[index], 3800);
    index++;
    onboardingTimer = setTimeout(next, 4400);
  };
  next();
  document.addEventListener('pointerdown', () => {
    clearTimeout(onboardingTimer);
    if (!onboarded) { onboarded = true; savePreferences(); }
  }, { once: true });
}

function startDecorations() {
  const stars = $('stars');
  if (stars && !stars.childElementCount) {
    for (let i = 0; i < 26; i++) {
      const star = document.createElement('i');
      star.style.left = `${(Math.random() * 96 + 2).toFixed(1)}%`;
      star.style.top = `${(Math.random() * 52 + 2).toFixed(1)}%`;
      star.style.animationDelay = `${(Math.random() * 6).toFixed(1)}s`;
      star.style.animationDuration = `${(2.6 + Math.random() * 3).toFixed(1)}s`;
      stars.append(star);
    }
  }
  const bubbles = $('bgBubbles');
  if (bubbles && !bubbles.childElementCount) {
    for (let i = 0; i < 7; i++) {
      const bubble = document.createElement('i');
      const size = 4 + Math.random() * 8;
      bubble.style.left = `${(Math.random() * 92 + 4).toFixed(1)}%`;
      bubble.style.width = `${size.toFixed(1)}px`;
      bubble.style.height = `${size.toFixed(1)}px`;
      bubble.style.animationDuration = `${(9 + Math.random() * 10).toFixed(1)}s`;
      bubble.style.animationDelay = `${(Math.random() * 12).toFixed(1)}s`;
      bubbles.append(bubble);
    }
  }
}

function bindEvents() {
  $('prevMonth').onclick = () => navigateMonth(-1);
  $('nextMonth').onclick = () => navigateMonth(1);
  $('goToday').onclick = goToday;
  $('toggleWeekView').onclick = () => {
    calendarView = calendarView === 'month' ? 'week' : 'month';
    if (calendarView === 'week') weekAnchor = selected;
    AudioFx.click(); renderCalendar(); renderWeekAgenda();
  };
  $('btnCourses').onclick = openCourses;
  $('btnCoursesClose').onclick = () => $('coursesDialog').close();
  $('coursesDialog').addEventListener('click', event => { if (event.target === $('coursesDialog')) $('coursesDialog').close(); });
  $('courseTermMonday').addEventListener('change', saveCourseSettings);
  $('courseTermWeeks').addEventListener('change', saveCourseSettings);
  $('coursePeriodTimes').addEventListener('change', saveCourseSettings);
  for (const id of ['courseImportMonday', 'courseImportWeeks', 'courseImportPeriodTimes']) $(id).addEventListener('change', async () => {
    if (await syncCourseSettingsFromImport()) previewCourseImport();
  });
  $('btnImportCourses').onclick = importCourseFile;
  $('btnNewCourse').onclick = () => openCourseEditor();
  $('btnCourseImportClose').onclick = closeCourseImport;
  $('btnCancelCourseImport').onclick = closeCourseImport;
  $('courseImportDialog').addEventListener('click', event => { if (event.target === $('courseImportDialog')) closeCourseImport(); });
  $('courseImportDialog').addEventListener('close', () => {
    if (!pendingCourseImport) return;
    pendingCourseImport = null;
    if (!$('coursesDialog').open) openCourses();
  });
  $('btnConfirmCourseImport').onclick = confirmCourseImport;
  $('courseImportMappings').addEventListener('change', event => {
    if (event.target.matches('[data-header-row]') && pendingCourseImport) renderCourseImportMappings(pendingCourseImport.rows, Number(event.target.value));
    previewCourseImport();
  });
  $('btnCourseEditorClose').onclick = closeCourseEditor;
  $('btnCancelCourseEditor').onclick = closeCourseEditor;
  $('courseEditorDialog').addEventListener('click', event => { if (event.target === $('courseEditorDialog')) closeCourseEditor(); });
  $('courseForm').addEventListener('submit', saveCourse);
  $('btnDeleteCourse').onclick = () => removeCourse(editingCourseId);
  $('btnRestoreCourseSource').onclick = restoreCourseSource;
  $('btnMinimize').onclick = () => window.api.minimize();
  $('btnClose').onclick = () => window.api.close();
  $('btnTop').onclick = async () => {
    try {
      const pinned = await window.api.toggleTop();
      setPinned(pinned);
      react(pinned ? 'pin' : 'unpin', { bounce: true });
    } catch { showToast('置顶失败，请重试。'); }
  };
  $('btnAdd').onclick = () => openModal();
  $('btnCancel').onclick = closeModal;
  $('btnCancelBottom').onclick = closeModal;
  $('modal').addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  $('modal').addEventListener('close', () => { editingId = null; hideQuickChip(); });
  $('modal').addEventListener('click', event => { if (event.target === $('modal')) closeModal(); });
  $('todoForm').addEventListener('submit', saveTodo);
  $('btnDelete').onclick = () => removeTodo(editingId, true);
  $('editTitle').oninput = () => { previewQuickEntry(); lastInteraction = Date.now(); };
  $('editDate').oninput = updateScheduleHint;
  $('editTime').oninput = updateScheduleHint;
  $('searchInput').oninput = renderTodos;
  $('eventFilter').value = eventFilter;
  $('eventFilter').onchange = () => { eventFilter = $('eventFilter').value; savePreferences(); renderTodos(); };
  document.querySelectorAll('[data-range]').forEach(button => {
    button.onclick = () => { range = button.dataset.range; AudioFx.click(); savePreferences(); renderTodos(); };
  });
  $('hideDone').onclick = () => { hideDone = !hideDone; AudioFx.click(); savePreferences(); renderTodos(); };
  // 拖拽改期：待办卡片 → 日历格子
  let dragOverCell = null;
  $('calGrid').addEventListener('dragover', event => {
    const cell = event.target.closest('[data-date]');
    if (!cell || cell.disabled) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dragOverCell && dragOverCell !== cell) dragOverCell.classList.remove('drag-over');
    dragOverCell = cell;
    cell.classList.add('drag-over');
    const tip = $('dragTip');
    if (!tip.hidden) {
      const day = parseDate(cell.dataset.date);
      if (day) tip.textContent = `移到 ${day.getMonth() + 1}月${day.getDate()}日`;
      moveDragTip(event.clientX, event.clientY);
    }
  });
  $('calGrid').addEventListener('dragleave', event => {
    const cell = event.target.closest('[data-date]');
    if (!cell) return;
    cell.classList.remove('drag-over');
    if (dragOverCell === cell) dragOverCell = null;
  });
  $('calGrid').addEventListener('drop', async event => {
    const cell = event.target.closest('[data-date]');
    if (dragOverCell) { dragOverCell.classList.remove('drag-over'); dragOverCell = null; }
    $('dragTip').hidden = true;
    if (!cell || cell.disabled || busy) return;
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    const todo = todos.find(item => item.id === id);
    if (!todo || todo.date === cell.dataset.date) return;
    const nextDate = cell.dataset.date;
    if (await commit(todos.map(item => item.id === id ? { ...item, date: nextDate, notifiedFor: undefined } : item))) {
      selected = nextDate;
      currentMonth = shiftMonth(parseDate(nextDate), 0);
      AudioFx.add();
      react('reschedule', { mood: 'happy' });
      showToast(`已把「${shortTitle(todo.title)}」移到 ${Number(nextDate.slice(5, 7))}月${Number(nextDate.slice(8))}日`);
      renderAll();
    }
  });
  $('calGrid').addEventListener('click', event => {
    const cell = event.target.closest('[data-date]');
    if (cell) { selectDate(cell.dataset.date); AudioFx.select(); }
  });
  // 悬停浮层：预览当天的日程
  $('calGrid').addEventListener('mouseover', event => {
    const cell = event.target.closest('[data-date]');
    if (cell) showCalTip(cell); else hideCalTip();
  });
  $('calGrid').addEventListener('mouseleave', hideCalTip);
  $('calGrid').addEventListener('dblclick', event => {
    const cell = event.target.closest('[data-date]');
    if (cell) { selectDate(cell.dataset.date); openModal(); }
  });
  $('calGrid').addEventListener('keydown', event => {
    const cell = event.target.closest('[data-date]');
    if (!cell) return;
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key in offsets) {
      event.preventDefault();
      const day = parseDate(cell.dataset.date);
      day.setDate(day.getDate() + offsets[event.key]);
      if (day.getFullYear() < 1900 || day.getFullYear() > 9999) return;
      selected = dateKey(day);
      if (day.getMonth() !== currentMonth.getMonth() || day.getFullYear() !== currentMonth.getFullYear()) currentMonth = shiftMonth(day, 0);
      renderCalendar(); renderTodos();
      $('calGrid').querySelector(`[data-date="${selected}"]`)?.focus();
    }
  });
  document.addEventListener('keydown', event => {
    lastInteraction = Date.now();
    if (event.key === 'Escape') {
      if ($('fullBody').open || $('focusDialog').open || $('statsDialog').open || $('themeDialog').open) return; // dialog 自身会处理 Esc
      if (!$('modal').open && !$('companionPanel').hidden) {
        event.preventDefault(); setCompanionOpen(false); return;
      }
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !$('modal').open) {
      event.preventDefault(); $('searchInput').focus();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n' && !$('modal').open) {
      event.preventDefault(); openModal();
    }
    if (event.altKey && event.key.toLowerCase() === 't' && !$('modal').open) { event.preventDefault(); goToday(); }
    if (event.altKey && event.key.toLowerCase() === 'f' && !$('modal').open && !$('focusDialog').open) { event.preventDefault(); openFocus(); }
    if (event.key === 'Escape' && !$('modal').open && !$('fullBody').open && document.activeElement === $('searchInput')) {
      $('searchInput').value = ''; renderTodos(); $('searchInput').blur();
    }
  });
  document.addEventListener('input', () => { lastInteraction = Date.now(); }, true);
  $('toastAction').onclick = async () => {
    if (busy) return;
    const action = toastAction;
    if (action) { dismissToast(); await action(); }
  };
  $('toastDismiss').onclick = dismissToast;
  $('mascot').onclick = () => setCompanionOpen($('companionPanel').hidden);
  $('closeCompanion').onclick = () => setCompanionOpen(false);
  document.querySelectorAll('[data-mood]').forEach(button => {
    button.onclick = () => { mascotMood = button.dataset.mood; AudioFx.click(); savePreferences(); updateMascot(); };
  });
  $('btnSound').onclick = () => {
    soundOn = !soundOn;
    AudioFx.enabled = soundOn;
    savePreferences(); syncSound();
    if (soundOn) AudioFx.click();
    react(soundOn ? 'soundOn' : 'soundOff');
  };
  $('btnPet').onclick = async () => {
    try {
      const state = await window.api.togglePet();
      setPet(state.enabled);
      if (state.enabled) react('petOn', { bounce: true });
    } catch { showToast('桌宠开启失败，请重试。'); }
  };
  $('companionPortraitBox').addEventListener('click', event => {
    if (event.target.closest('.portrait-full-btn')) return;
    openFullBody();
  });
  $('btnFullBody').onclick = event => { event.stopPropagation(); openFullBody(); };
  $('btnFullBodyClose').onclick = () => $('fullBody').close();
  $('fullBody').addEventListener('click', event => { if (event.target === $('fullBody')) $('fullBody').close(); });
  $('btnFocus').onclick = openFocus;
  $('todayProgressBox').onclick = openStats;
  $('btnStatsClose').onclick = () => $('statsDialog').close();
  $('statsDialog').addEventListener('click', event => { if (event.target === $('statsDialog')) $('statsDialog').close(); });
  $('btnTheme').onclick = openTheme;
  $('btnExport').onclick = exportBackup;
  $('btnImport').onclick = importBackup;
  $('btnThemeClose').onclick = () => $('themeDialog').close();
  $('themeDialog').addEventListener('click', event => { if (event.target === $('themeDialog')) $('themeDialog').close(); });
  document.querySelectorAll('#themeDialog [data-theme]').forEach(button => {
    button.onclick = () => { theme = button.dataset.theme; savePreferences(); applyTheme(); AudioFx.click(); };
  });
  $('btnFocusClose').onclick = () => $('focusDialog').close();
  $('focusDialog').addEventListener('click', event => { if (event.target === $('focusDialog')) $('focusDialog').close(); });
  $('focusToggle').onclick = () => { FocusTimer.isRunning() ? FocusTimer.pause() : FocusTimer.start(); };
  $('focusReset').onclick = () => FocusTimer.reset();
  document.querySelectorAll('[data-focus-min]').forEach(button => {
    button.onclick = () => { FocusTimer.reset(Number(button.dataset.focusMin)); AudioFx.click(); };
  });
  FocusTimer.render();
}

function openFocus() {
  if ($('focusDialog').open) return;
  FocusTimer.render();
  $('focusDialog').showModal();
  AudioFx.select();
}

function openStats() {
  if ($('statsDialog').open) return;
  buildStats();
  $('statsDialog').showModal();
  AudioFx.select();
}

function openTheme() {
  if ($('themeDialog').open) return;
  applyTheme();
  $('themeDialog').showModal();
  AudioFx.select();
}

function openCourses() {
  if ($('coursesDialog').open) return;
  renderCourseManager();
  $('courseTermMonday').value = courseState.termMonday;
  $('courseTermWeeks').value = String(courseState.termWeeks);
  $('coursePeriodTimes').value = CourseCore.formatPeriodTimes(courseState.periodTimes);
  $('coursesDialog').showModal();
  AudioFx.select();
}

function renderCourseManager() {
  const list = $('courseManagerList');
  list.replaceChildren();
  if (!courses.length) {
    const empty = document.createElement('div');
    empty.className = 'course-manager-empty';
    empty.textContent = '还没有课程。导入课表文件，或先手动添加一次课程。';
    list.append(empty);
    return;
  }
  const groups = new Map();
  for (const course of courses) {
    const key = course.sourceKey ? `${course.sourceId}|${course.sourceKey}` : course.id;
    const group = groups.get(key) || { representative: course, count: 0, nextDate: '' };
    group.count++;
    if (course.date >= dateKey(new Date()) && (!group.representative || group.representative.date < dateKey(new Date()) || course.date < group.representative.date)) group.representative = course;
    if (course.date >= dateKey(new Date()) && (!group.nextDate || course.date < group.nextDate)) group.nextDate = course.date;
    groups.set(key, group);
  }
  const ordered = [...groups.values()].sort((a, b) => CourseCore.compareCourseTime(a.representative, b.representative));
  for (const group of ordered.slice(0, 180)) {
    const course = group.representative;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'course-manager-row';
    const copy = document.createElement('span'); copy.className = 'course-manager-row-copy';
    const title = document.createElement('strong'); title.textContent = course.title;
    const details = document.createElement('span');
    const date = group.nextDate || course.date;
    details.textContent = `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日${course.startTime ? ` · ${course.startTime}` : ''}${course.location ? ` · ${course.location}` : ''}`;
    const count = document.createElement('span'); count.className = 'course-manager-count'; count.textContent = group.count > 1 ? `${group.count} 次` : '编辑';
    copy.append(title, details); button.append(copy, count);
    button.onclick = () => openCourseEditor(course.id);
    list.append(button);
  }
  if (groups.size > 180) {
    const more = document.createElement('p'); more.className = 'form-hint'; more.textContent = `还有 ${groups.size - 180} 门课程，请通过搜索日程查找。`;
    list.append(more);
  }
}

async function persistCourseState(nextState) {
  if (!coursesReady) return false;
  if (courseSaving) await courseSavePromise;
  courseSaving = true;
  courseSavePromise = (async () => {
    try {
      const normalized = CourseCore.normalizeCourseData(nextState);
      courseState = CourseCore.normalizeCourseData(await window.api.saveCourses(normalized));
      courses = courseState.courses;
      renderAll();
      if ($('coursesDialog').open) renderCourseManager();
      return true;
    } catch (error) {
      console.error('课程保存失败:', error);
      showToast('课程没有保存，请检查文件权限后重试。', null, 8000);
      return false;
    } finally { courseSaving = false; }
  })();
  return courseSavePromise;
}

async function saveCourseSettings() {
  if (courseSaving) await courseSavePromise;
  const date = $('courseTermMonday').value;
  const weeks = Number($('courseTermWeeks').value);
  const parsed = date ? CourseCore.parseDate(date) : '';
  if (date && (!parsed || parseDate(parsed).getDay() !== 1)) {
    $('courseTermMonday').value = courseState.termMonday;
    $('courseImportMonday').value = courseState.termMonday;
    showToast('第一教学周日期请选周一。');
    return false;
  }
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 60) {
    $('courseTermWeeks').value = String(courseState.termWeeks);
    $('courseImportWeeks').value = String(courseState.termWeeks);
    showToast('学期周数请设为 1 到 60 之间的整数。');
    return false;
  }
  let periodTimes;
  try { periodTimes = CourseCore.parsePeriodTimes($('coursePeriodTimes').value); }
  catch (error) {
    $('coursePeriodTimes').value = CourseCore.formatPeriodTimes(courseState.periodTimes);
    $('courseImportPeriodTimes').value = $('coursePeriodTimes').value;
    showToast(error.message || '请检查节次时间格式。', null, 7000);
    return false;
  }
  if (parsed === courseState.termMonday && weeks === courseState.termWeeks && JSON.stringify(periodTimes) === JSON.stringify(courseState.periodTimes)) return true;
  const saved = await persistCourseState({ ...courseState, termMonday: parsed || '', termWeeks: weeks, periodTimes, courses });
  $('courseImportMonday').value = courseState.termMonday;
  $('courseImportWeeks').value = String(courseState.termWeeks);
  $('courseImportPeriodTimes').value = CourseCore.formatPeriodTimes(courseState.periodTimes);
  return saved;
}

async function syncCourseSettingsFromImport() {
  $('courseTermMonday').value = $('courseImportMonday').value;
  $('courseTermWeeks').value = $('courseImportWeeks').value;
  $('coursePeriodTimes').value = $('courseImportPeriodTimes').value;
  const saved = await saveCourseSettings();
  $('courseImportMonday').value = courseState.termMonday;
  $('courseImportWeeks').value = String(courseState.termWeeks);
  $('courseImportPeriodTimes').value = CourseCore.formatPeriodTimes(courseState.periodTimes);
  return saved;
}

function openCourseEditor(id = null, date = selected) {
  const course = id ? courses.find(item => item.id === id) : null;
  if (id && !course || $('courseEditorDialog').open) return;
  editingCourseId = id;
  $('courseForm').reset();
  $('courseFormError').textContent = '';
  $('courseEditorTitle').textContent = course ? '编辑课程' : '添加课程';
  $('btnDeleteCourse').hidden = !course;
  $('btnRestoreCourseSource').hidden = !course?.manualOverride || !course?.sourceSnapshot;
  $('courseEditTitle').value = course?.title || '';
  $('courseEditDate').value = course?.date || date;
  $('courseEditStart').value = course?.startTime || '';
  $('courseEditEnd').value = course?.endTime || '';
  $('courseEditPeriod').value = course?.period || '';
  $('courseEditLocation').value = course?.location || '';
  $('courseEditTeacher').value = course?.teacher || '';
  $('courseEditNote').value = course?.note || '';
  $('courseEditReminder').value = String(course?.reminderMinutes ?? 20);
  $('courseEditorDialog').showModal();
  $('courseEditTitle').focus();
}

function closeCourseEditor() {
  if (courseSaving) return;
  if ($('courseEditorDialog').open) $('courseEditorDialog').close();
  editingCourseId = null;
}

async function saveCourse(event) {
  event.preventDefault();
  const title = $('courseEditTitle').value.trim();
  const date = CourseCore.parseDate($('courseEditDate').value);
  const startTime = $('courseEditStart').value;
  const endTime = $('courseEditEnd').value;
  const reminderMinutes = Number($('courseEditReminder').value);
  if (!title || !date) { $('courseFormError').textContent = '请填写课程名称和有效日期。'; return; }
  if (endTime && !startTime || startTime && (!CourseCore.parseTime(startTime) || endTime && (!CourseCore.parseTime(endTime) || startTime >= endTime))) {
    $('courseFormError').textContent = '有结束时间时，请填写有效的开始时间，并确认结束时间更晚。'; return;
  }
  const old = courses.find(item => item.id === editingCourseId);
  const editableFields = ['title', 'date', 'startTime', 'endTime', 'period', 'location', 'teacher', 'note', 'reminderMinutes'];
  const changed = old && editableFields.some(key => (old[key] ?? '') !== ({ title, date, startTime, endTime, period: $('courseEditPeriod').value.trim(), location: $('courseEditLocation').value.trim(), teacher: $('courseEditTeacher').value.trim(), note: $('courseEditNote').value.trim(), reminderMinutes }[key] ?? ''));
  const item = {
    ...(old || { id: crypto.randomUUID(), sourceId: 'manual', sourceKey: '', createdAt: Date.now() }),
    title, date, startTime, endTime, period: $('courseEditPeriod').value.trim(),
    location: $('courseEditLocation').value.trim(), teacher: $('courseEditTeacher').value.trim(),
    note: $('courseEditNote').value.trim(), reminderMinutes,
    manualOverride: Boolean(old?.manualOverride || changed && old?.sourceId?.startsWith('import:'))
  };
  if (old && (old.date !== item.date || old.startTime !== item.startTime || old.reminderMinutes !== item.reminderMinutes)) delete item.notifiedFor;
  const next = old ? courses.map(course => course.id === old.id ? item : course) : [...courses, item];
  if (!await persistCourseState({ ...courseState, courses: next })) return;
  selected = item.date; weekAnchor = item.date; currentMonth = shiftMonth(parseDate(item.date), 0);
  closeCourseEditor();
  if ($('coursesDialog').open) renderCourseManager();
  showToast(old ? '这次课程已更新。' : '已添加课程。');
}

async function removeCourse(id) {
  const old = courses.find(item => item.id === id);
  if (!old) return;
  const wasImported = old.sourceId.startsWith('import:');
  const suppressed = wasImported ? [...new Set([...courseState.suppressed, id])] : courseState.suppressed;
  if (!await persistCourseState({ ...courseState, suppressed, courses: courses.filter(item => item.id !== id) })) return;
  closeCourseEditor();
  showToast('本次课程已删除。', async () => {
    const restoreSuppressed = courseState.suppressed.filter(key => key !== old.id);
    if (await persistCourseState({ ...courseState, suppressed: restoreSuppressed, courses: [...courses, old] })) showToast('课程已恢复。');
  }, 10000);
}

async function restoreCourseSource() {
  const current = courses.find(item => item.id === editingCourseId);
  if (!current?.sourceSnapshot) return;
  const restored = { ...current, ...current.sourceSnapshot, manualOverride: false };
  delete restored.notifiedFor;
  if (await persistCourseState({ ...courseState, courses: courses.map(item => item.id === current.id ? restored : item) })) {
    $('courseEditTitle').value = restored.title;
    $('courseEditDate').value = restored.date;
    $('courseEditStart').value = restored.startTime;
    $('courseEditEnd').value = restored.endTime;
    $('courseEditPeriod').value = restored.period;
    $('courseEditLocation').value = restored.location;
    $('courseEditTeacher').value = restored.teacher;
    $('courseEditNote').value = restored.note;
    $('courseEditReminder').value = String(restored.reminderMinutes);
    $('btnRestoreCourseSource').hidden = true;
    showToast('已恢复导入课表中的课程信息。');
  }
}

const IMPORT_FIELDS = [
  ['title', '课程名称', true], ['date', '具体日期', false], ['weekday', '星期', false], ['weeks', '周次', false],
  ['startTime', '开始时间', false], ['endTime', '结束时间', false], ['period', '节次', false], ['location', '地点', false],
  ['teacher', '教师', false], ['note', '备注', false], ['courseCode', '课程编号', false]
];

async function importCourseFile() {
  try {
    const result = await window.api.importCourseFile();
    if (!result.ok) {
      if (!result.canceled) showToast(`读取课表失败：${result.error || '未知原因'}`, null, 8000);
      return;
    }
    if (!CourseCore.findHeaderRow(result.rows)) { showToast('没有找到课表表头，请确认文件里包含课程名称列。', null, 8000); return; }
    pendingCourseImport = { ...result, initialInvalid: result.invalid || [] };
    $('courseImportFile').textContent = `${result.filename}${result.sheet ? ` · 工作表：${result.sheet}` : ''}`;
    $('courseImportMonday').value = courseState.termMonday;
    $('courseImportWeeks').value = String(courseState.termWeeks);
    $('courseImportPeriodTimes').value = CourseCore.formatPeriodTimes(courseState.periodTimes);
    renderCourseImportMappings(result.rows);
    previewCourseImport();
    $('coursesDialog').close();
    $('courseImportDialog').showModal();
  } catch (error) { showToast(`读取课表失败：${error.message || '请重试。'}`, null, 8000); }
}

function renderCourseImportMappings(rows, requestedHeaderRow = null) {
  const header = CourseCore.findHeaderRow(rows);
  const headerIndex = Number.isInteger(requestedHeaderRow) && rows[requestedHeaderRow] ? requestedHeaderRow : header?.index;
  if (headerIndex == null) throw new Error('没有找到课表表头');
  const headersForRow = rows[headerIndex] || [];
  const headers = headersForRow.map((value, index) => String(value || '').trim() || `第 ${index + 1} 列`);
  const guesses = CourseCore.guessMapping(headers);
  const box = $('courseImportMappings');
  box.replaceChildren();
  const headerLabel = document.createElement('label');
  const headerName = document.createElement('span'); headerName.textContent = '表头所在行';
  const headerSelect = document.createElement('select'); headerSelect.dataset.headerRow = 'true'; headerSelect.setAttribute('aria-label', '选择表头所在行');
  for (let index = 0; index < Math.min(rows.length, 12); index++) {
    const option = document.createElement('option'); option.value = String(index);
    const sample = (rows[index] || []).filter(value => String(value ?? '').trim()).slice(0, 4).map(value => String(value).trim()).join(' · ');
    option.textContent = `第 ${index + 1} 行${sample ? `：${sample.slice(0, 40)}` : ''}`;
    headerSelect.append(option);
  }
  headerSelect.value = String(headerIndex);
  headerLabel.append(headerName, headerSelect); box.append(headerLabel);
  for (const [field, labelText, required] of IMPORT_FIELDS) {
    const label = document.createElement('label');
    const text = document.createElement('span'); text.textContent = `${labelText}${required ? ' · 必填' : ''}`;
    const select = document.createElement('select'); select.dataset.field = field; select.setAttribute('aria-label', labelText);
    const omit = document.createElement('option'); omit.value = '-1'; omit.textContent = '不映射'; select.append(omit);
    headers.forEach((headerText, index) => {
      const option = document.createElement('option'); option.value = String(index); option.textContent = headerText.slice(0, 50); select.append(option);
    });
    select.value = String(guesses[field] ?? -1);
    label.append(text, select); box.append(label);
  }
}

function readCourseMapping() {
  const mapping = {};
  $('courseImportMappings').querySelectorAll('select').forEach(select => {
    if (select.dataset.headerRow) mapping.headerRow = Number(select.value);
    else mapping[select.dataset.field] = Number(select.value);
  });
  return mapping;
}

function previewCourseImport() {
  if (!pendingCourseImport) return;
  const preview = $('courseImportPreview'); preview.replaceChildren();
  $('btnConfirmCourseImport').disabled = true;
  try {
    const parsed = CourseCore.prepareImport(pendingCourseImport.rows, readCourseMapping(), $('courseImportMonday').value,
      pendingCourseImport.filename, Number($('courseImportWeeks').value), courseState.periodTimes);
    const merged = CourseCore.mergeCourses(courses, parsed.courses, courseState.suppressed);
    const existingById = new Map(courses.map(course => [course.id, course]));
    const suppressedIds = new Set(courseState.suppressed);
    const invalid = [...pendingCourseImport.initialInvalid, ...parsed.invalid];
    const withoutClockTime = parsed.courses.filter(course => !course.startTime).length;
    const withoutEndTime = parsed.courses.filter(course => course.startTime && !course.endTime).length;
    $('courseImportSummary').replaceChildren();
    const summary = document.createElement('span');
    summary.textContent = `识别到 ${parsed.courses.length} 次课：新增 ${merged.summary.added}，更新 ${merged.summary.updated}，不变 ${merged.summary.unchanged}。`;
    const skipped = document.createElement('span');
    skipped.textContent = invalid.length ? `有 ${invalid.length} 行无法识别，确认后会跳过。` : '没有发现格式错误。';
    $('courseImportSummary').append(summary, document.createElement('br'), skipped);
    if (parsed.scheduleMatrix) {
      const days = parsed.scheduleMatrix.dayColumns.map(({ weekday }) => `星期${CourseCore.WEEKDAY_NAMES[weekday]}`).join('、');
      const matrixHint = document.createElement('span');
      matrixHint.textContent = `已自动识别星期分栏（${days}），并从各单元格解析周次、节次和地点。`;
      $('courseImportSummary').append(document.createElement('br'), matrixHint);
    }
    if (withoutClockTime) {
      const timeHint = document.createElement('div');
      timeHint.textContent = `${withoutClockTime} 次课只有节次或没有时钟时间；课程仍会显示，但无法按时钟提醒。可先设置节次时间，或稍后逐节补充。`;
      $('courseImportSummary').append(document.createElement('br'), timeHint);
    }
    if (withoutEndTime) {
      const endHint = document.createElement('div');
      endHint.textContent = `${withoutEndTime} 次课有开始时间但没有结束时间；日历会按课程开始时间提醒。`;
      $('courseImportSummary').append(document.createElement('br'), endHint);
    }
    for (const course of parsed.courses.slice(0, 8)) {
      const row = document.createElement('div'); row.className = 'course-preview-row';
      const primary = document.createElement('span');
      primary.textContent = `${course.date} ${course.startTime || course.period || ''}  ${course.title}${course.location ? ` · ${course.location}` : ''}`;
      const old = existingById.get(course.id);
      const same = old && ['title', 'date', 'startTime', 'endTime', 'period', 'location', 'teacher', 'note', 'reminderMinutes'].every(key => (old[key] ?? '') === (course[key] ?? ''));
      const label = document.createElement('span');
      label.textContent = suppressedIds.has(course.id) ? '已取消' : old?.manualOverride ? '保留手动调整' : !old ? '新增' : same ? '已存在' : '更新';
      row.append(primary, label); preview.append(row);
    }
    for (const issue of invalid.slice(0, 5)) {
      const row = document.createElement('div'); row.className = 'course-preview-row invalid';
      const detail = document.createElement('span'); detail.textContent = `第 ${issue.row} 行 · ${issue.title || '未命名课程'}：${issue.reason}`;
      const label = document.createElement('span'); label.textContent = '跳过'; row.append(detail, label); preview.append(row);
    }
    pendingCourseImport.prepared = parsed.courses;
    pendingCourseImport.invalid = invalid;
    $('btnConfirmCourseImport').disabled = !parsed.courses.length;
  } catch (error) {
    $('courseImportSummary').textContent = error.message || '无法识别此课表，请调整列映射。';
    $('courseImportPreview').replaceChildren();
    pendingCourseImport.prepared = [];
  }
}

function closeCourseImport() {
  if ($('courseImportDialog').open) $('courseImportDialog').close();
  pendingCourseImport = null;
  if (!$('coursesDialog').open) openCourses();
}

async function confirmCourseImport() {
  if (!await syncCourseSettingsFromImport()) return;
  previewCourseImport();
  if (!pendingCourseImport?.prepared?.length) return;
  const current = pendingCourseImport;
  const merged = CourseCore.mergeCourses(courses, current.prepared, courseState.suppressed);
  if (!await persistCourseState({ ...courseState, courses: merged.courses })) return;
  const invalidCount = current.invalid?.length || 0;
  const file = current.filename;
  $('courseImportDialog').close(); pendingCourseImport = null;
  showToast(`已导入 ${current.prepared.length} 次课${invalidCount ? `，跳过 ${invalidCount} 行未识别内容` : ''}。`, null, 7000);
  if (current.prepared.length) {
    selected = current.prepared[0].date; weekAnchor = selected; currentMonth = shiftMonth(parseDate(selected), 0);
    renderAll();
  }
  if ($('coursesDialog').open) renderCourseManager();
  console.info(`课表导入完成：${file}`);
}

async function exportBackup() {
  try {
    const result = await window.api.exportTodos();
    if (result.ok) { AudioFx.add(); showToast(`已导出 ${result.count} 件待办到 ${result.filePath}`, null, 6000); react('save'); }
    else if (!result.canceled) showToast(`导出失败：${result.error || '未知原因'}`, null, 8000);
  } catch { showToast('导出失败，请重试。'); }
}

let importArmed = false;
let importArmTimer = null;

async function importBackup() {
  try {
    const result = await window.api.importTodos();
    if (!result.ok) {
      if (!result.canceled) showToast(`读取备份失败：${result.error || '未知原因'}`, null, 8000);
      return;
    }
    let imported;
    try { imported = normalizeTodos(JSON.parse(result.content)); }
    catch { showToast('这份备份的格式无法识别，没有做任何改动。', null, 8000); return; }
    if (!imported.length) { showToast('这份备份是空的，没有做任何改动。'); return; }
    if (busy) return;
    if (todos.length && !importArmed) {
      // 二次点击确认：导入会覆盖现有日程
      importArmed = true;
      $('btnImport').classList.add('armed');
      $('btnImport').lastChild.textContent = '再点确认替换';
      showToast(`将导入 ${imported.length} 件待办并替换当前的 ${todos.length} 件，再点一次确认。`, null, 5200);
      clearTimeout(importArmTimer);
      importArmTimer = setTimeout(() => { importArmed = false; $('btnImport').classList.remove('armed'); $('btnImport').lastChild.textContent = '导入备份'; }, 5200);
      return;
    }
    importArmed = false;
    clearTimeout(importArmTimer);
    $('btnImport').classList.remove('armed');
    $('btnImport').lastChild.textContent = '导入备份';
    if (await commit(imported)) {
      AudioFx.add();
      react('save', { mood: 'happy' });
      showToast(`已从备份导入 ${imported.length} 件待办。`);
      goToday();
    }
  } catch { showToast('导入失败，请重试。'); }
}

function applyTheme() {
  const root = document.documentElement;
  if (theme === 'tide') root.removeAttribute('data-theme');
  else root.dataset.theme = theme;
  document.querySelectorAll('#themeDialog [data-theme]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.theme === theme)));
  try { window.api.setTheme(theme); } catch { /* 桌宠未开启时忽略。 */ }
}

function buildStats() {
  const counts = new Array(7).fill(0);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const key = dateKey(day);
    days.push({ key, label: i === 0 ? '今' : weekNames[day.getDay()].slice(2), number: day.getDate(), count: 0 });
  }
  const dayIndex = new Map(days.map((day, index) => [day.key, index]));
  for (const todo of todos) {
    if (!todo.done || !todo.completedAt) continue;
    const index = dayIndex.get(dateKey(new Date(todo.completedAt)));
    if (index != null) counts[index]++;
  }
  days.forEach((day, index) => { day.count = counts[index]; });
  const max = Math.max(...counts, 1);
  const bars = $('statsBars');
  bars.replaceChildren();
  days.forEach((day, index) => {
    const bar = document.createElement('div');
    bar.className = `stats-bar${index === 6 ? ' today' : ''}${day.count ? '' : ' zero'}`;
    const number = document.createElement('b');
    number.textContent = String(day.count);
    const stick = document.createElement('i');
    stick.style.height = `${(day.count / max * 76 + 5).toFixed(0)}px`;
    stick.style.animationDelay = `${(index * 45).toFixed(0)}ms`;
    const label = document.createElement('span');
    label.textContent = day.label;
    bar.title = `${Number(day.key.slice(5, 7))}月${Number(day.key.slice(8))}日 · 完成 ${day.count} 件`;
    bar.append(number, stick, label);
    bars.append(bar);
  });
  const week = counts.reduce((sum, value) => sum + value, 0);
  const streak = streakDays();
  $('statsSummary').textContent = `本周完成 ${week} 件${streak >= 2 ? ` · 已连续完成 ${streak} 天` : ''}`;
}

function syncSound() {
  const button = $('btnSound');
  button.querySelector('use').setAttribute('href', soundOn ? '#i-sound' : '#i-mute');
  button.setAttribute('aria-pressed', String(soundOn));
  button.title = soundOn ? '音效开关' : '音效已关闭';
  AudioFx.enabled = soundOn;
}

function setPet(enabled) {
  const button = $('btnPet');
  button.setAttribute('aria-pressed', String(enabled));
  button.title = enabled ? '收回桌宠おおくじら' : '召唤おおくじら到桌面';
  button.setAttribute('aria-label', button.title);
}

function openFullBody() {
  if ($('fullBody').open) return;
  $('fullBodyImg').src = `assets/mascot-v2/${currentExpression()}.png`;
  $('fullBody').showModal();
  react('fullBody', { mood: 'shy', bubble: false });
  showBubble(pickLine('fullBody'), 3000);
}

function setCompanionOpen(open) {
  $('companionPanel').hidden = !open;
  $('calendarSection').hidden = open;
  $('mascot').setAttribute('aria-expanded', String(open));
  $('mascot').setAttribute('aria-label', open ? '收起おおくじら，返回月历' : '展开おおくじら');
  $('mascot').title = open ? '收起おおくじら，返回月历' : '点头像，展开おおくじら';
  $('companionHint').textContent = open ? '慢慢来，也很快' : '点头像，来见见我';
  updateMascot();
  if (open) { react('greet', { bounce: true }); $('closeCompanion').focus(); }
  else $('mascot').focus();
}

function setPinned(pinned) {
  $('btnTop').setAttribute('aria-pressed', String(pinned));
  $('btnTop').title = pinned ? '取消窗口置顶' : '窗口置顶';
  $('btnTop').setAttribute('aria-label', $('btnTop').title);
}

function navigateMonth(delta) {
  if (calendarView === 'week') {
    const anchor = parseDate(weekAnchor);
    anchor.setDate(anchor.getDate() + delta * 7);
    weekAnchor = dateKey(anchor);
    selected = weekAnchor;
    currentMonth = shiftMonth(anchor, 0);
    renderAll();
    return;
  }
  const next = shiftMonth(currentMonth, delta);
  if (next.getFullYear() < 1900 || next.getFullYear() > 9999) return;
  currentMonth = next;
  monthAnim = delta;
  renderCalendar();
}

function goToday() {
  if (!$('companionPanel').hidden) setCompanionOpen(false);
  selected = dateKey(new Date()); weekAnchor = selected; currentMonth = shiftMonth(new Date(), 0); renderAll();
}

function selectDate(date) {
  selected = date;
  if (calendarView === 'week') weekAnchor = date;
  updateCalendarSelection();
  if (loaded) renderTodos();
  if (date !== dateKey(new Date())) react('select', { bubble: false });
}

function renderAll() { renderOverview(); renderCalendar(); renderWeekAgenda(); renderTodos(); }

function coursesOnDate(date) { return courses.filter(course => course.date === date).sort(CourseCore.compareCourseTime); }

function nextVisibleCourse(now = new Date()) {
  return courses.filter(course => {
    if (course.date < dateKey(now)) return false;
    if (course.date !== dateKey(now) || !course.startTime) return true;
    const start = new Date(`${course.date}T${course.startTime}:00`);
    if (start >= now) return true;
    if (!course.endTime) return false;
    return new Date(`${course.date}T${course.endTime}:00`) > now;
  }).sort(CourseCore.compareCourseTime)[0] || null;
}

function todayTodos() { return todos.filter(todo => todo.date === dateKey(new Date())); }

function nextUpTodo() {
  const now = new Date();
  let best = null;
  for (const todo of todos) {
    if (todo.done) continue;
    const target = parseDate(todo.date, todo.time);
    if (!target || target < now) continue;
    if (!best || target < parseDate(best.date, best.time)) best = todo;
  }
  return best;
}

function streakDays() {
  const days = new Set(todos.filter(todo => todo.done && todo.completedAt).map(todo => dateKey(new Date(todo.completedAt))));
  let count = 0;
  const cursor = new Date();
  if (!days.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dateKey(cursor))) { count++; cursor.setDate(cursor.getDate() - 1); }
  return count;
}

function weekDoneCount() {
  const now = Date.now();
  return todos.filter(todo => todo.done && todo.completedAt && now - todo.completedAt < 7 * 86400000).length;
}

function renderOverview() {
  const now = new Date();
  const h = now.getHours();
  document.body.dataset.daypart = h < 5 ? 'night' : h < 10 ? 'dawn' : h < 17 ? 'day' : h < 21 ? 'dusk' : 'night';
  $('todayDay').textContent = pad(now.getDate());
  $('todayMonth').textContent = `${now.getFullYear()}年${now.getMonth() + 1}月 · ${weekNames[now.getDay()]}`;
  $('greeting').textContent = h < 6 ? '夜深了，也记得休息。' : h < 12 ? '早上好，开启从容的一天。' : h < 18 ? '下午好，按自己的节奏来。' : '晚上好，今天也辛苦啦。';
  const todayTodosList = todayTodos();
  const done = todayTodosList.filter(todo => todo.done).length;
  $('todayCount').textContent = todayTodosList.length ? `今日完成 ${done} / ${todayTodosList.length}` : '今天，自由安排';
  $('todayProgress').max = todayTodosList.length || 1;
  $('todayProgress').value = done;
  const remaining = todayTodosList.length - done;
  const todayCourses = coursesOnDate(dateKey(now));
  $('todayCount').textContent = todayTodosList.length ? `今日完成 ${done} / ${todayTodosList.length}` : todayCourses.length ? `今日有 ${todayCourses.length} 节课` : '今天，自由安排';
  $('companionAgenda').textContent = todayTodosList.length ? remaining ? `今天还有 ${remaining} 件小事，一件件来。` : '今天的待办都完成啦，辛苦了。' : todayCourses.length ? `今天有 ${todayCourses.length} 节课，按节奏来。` : '今天，自由安排。';
  renderNextCourse(now);
  refreshTicker();
}

function renderNextCourse(now = new Date()) {
  const course = nextVisibleCourse(now);
  if (!course) {
    $('nextCourseWhen').textContent = courses.length ? '接下来没有课' : '课表还没导入';
    $('nextCourseTitle').textContent = courses.length ? '接下来安排了自由时间' : '导入课表后，这里显示下一节课';
    $('nextCourseDetails').textContent = courses.length ? '课程信息会按实际日期显示' : '也可以先手动添加一节课';
    return;
  }
  const target = course.startTime ? new Date(`${course.date}T${course.startTime}:00`) : null;
  const end = course.endTime ? new Date(`${course.date}T${course.endTime}:00`) : null;
  const ongoing = target && target <= now && end && end > now;
  const minutes = target ? Math.max(0, Math.floor((target - now) / 60000)) : null;
  const dateLabel = course.date === dateKey(now) ? '今天' : course.date === CourseCore.dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)) ? '明天' : `${Number(course.date.slice(5, 7))}月${Number(course.date.slice(8))}日`;
  const countdown = ongoing ? '正在上课' : minutes == null ? '时间待确认' : minutes < 1 ? '马上开始' : minutes < 60 ? `还有 ${minutes} 分钟` : `还有 ${Math.floor(minutes / 60)} 小时${minutes % 60 ? `${minutes % 60} 分钟` : ''}`;
  $('nextCourseWhen').textContent = `${dateLabel} · ${countdown}`;
  $('nextCourseTitle').textContent = course.title;
  $('nextCourseDetails').textContent = [course.startTime ? `${course.startTime}${course.endTime ? `–${course.endTime}` : ''}` : '', course.period, course.location, course.teacher].filter(Boolean).join(' · ') || '点击打开课表查看详情';
}

// ----- 状态播报条：问候 / 下一件倒计时 / 连续打卡 / 本周完成，单行轮播 -----
function refreshTicker() {
  const pool = [$('greeting').textContent];
  const next = nextUpTodo();
  if (next) {
    const target = parseDate(next.date, next.time);
    const diff = target - new Date();
    const minutes = Math.floor(diff / 60000);
    const when = minutes >= 60 ? `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分` : ''}` : minutes >= 1 ? `${minutes}分钟` : '马上';
    pool.push(`⏳ 距「${shortTitle(next.title)}」${next.date === dateKey(new Date()) ? '还有 ' + when : `${Number(next.date.slice(5, 7))}月${Number(next.date.slice(8))}日 · ${when}`}`);
  }
  const streak = streakDays();
  if (streak >= 2) pool.push(`🔥 已连续完成 ${streak} 天`);
  const week = weekDoneCount();
  if (week > 0) pool.push(`🌊 本周已完成 ${week} 件`);
  tickerPool = pool;
  if (tickerIndex >= pool.length) tickerIndex = 0;
  applyTicker();
}
function shortTitle(title) { return title.length > 9 ? `${title.slice(0, 9)}…` : title; }
function applyTicker() {
  const el = $('greeting');
  const text = tickerPool[tickerIndex % Math.max(tickerPool.length, 1)] || '';
  if (el.textContent !== text) {
    el.classList.remove('ticker-swap');
    void el.offsetWidth;
    el.textContent = text;
    el.classList.add('ticker-swap');
  }
}
function startTicker() {
  clearInterval(tickerTimer);
  tickerTimer = setInterval(() => {
    if (tickerPool.length > 1) { tickerIndex = (tickerIndex + 1) % tickerPool.length; applyTicker(); }
    refreshTicker();
  }, 6000);
}

function renderCalendar() {
  const focusDate = document.activeElement?.dataset?.date;
  hideCalTip();
  $('calTitleMonth').textContent = `${currentMonth.getMonth() + 1}月`;
  $('calTitleYear').textContent = `${currentMonth.getFullYear()}年`;
  $('monthWeekdays').hidden = calendarView !== 'month';
  $('calGrid').hidden = calendarView !== 'month';
  $('weekAgenda').hidden = calendarView !== 'week';
  $('toggleWeekView').setAttribute('aria-pressed', String(calendarView === 'week'));
  $('toggleWeekView').textContent = calendarView === 'week' ? '月历' : '周课表';
  $('toggleWeekView').title = calendarView === 'week' ? '返回月历' : '查看本周课程';
  const activeDates = new Set(todos.filter(todo => !todo.done).map(todo => todo.date));
  const courseCounts = {};
  for (const course of courses) courseCounts[course.date] = (courseCounts[course.date] || 0) + 1;
  const courseDates = new Set(Object.keys(courseCounts));
  const counts = {};
  const doneCounts = {};
  for (const todo of todos) {
    if (!todo.done) counts[todo.date] = (counts[todo.date] || 0) + 1;
    else doneCounts[todo.date] = (doneCounts[todo.date] || 0) + 1;
  }
  const today = dateKey(new Date());
  const fragment = document.createDocumentFragment();
  for (const date of monthDays(currentMonth)) {
    const key = dateKey(date);
    const cell = document.createElement('button');
    cell.className = 'cal-cell';
    cell.dataset.date = key;
    cell.textContent = date.getDate();
    cell.classList.toggle('other-month', date.getMonth() !== currentMonth.getMonth());
    cell.classList.toggle('weekend', [0, 6].includes(date.getDay()));
    cell.classList.toggle('today', key === today);
    cell.classList.toggle('has-course', courseDates.has(key));
    cell.classList.toggle('has-todo', activeDates.has(key));
    cell.classList.toggle('has-many', (counts[key] || 0) > 1);
    cell.classList.toggle('all-done', !(counts[key] || 0) && (doneCounts[key] || 0) > 0);
    if ((counts[key] || 0) > 1) {
      const badge = document.createElement('i');
      badge.className = 'cell-badge';
      badge.textContent = String(counts[key]);
      cell.append(badge);
    }
    cell.disabled = date.getFullYear() < 1900 || date.getFullYear() > 9999;
    if (key === today) cell.setAttribute('aria-current', 'date');
    const count = counts[key] || 0;
    const dateLabel = `${date.getMonth() + 1}月${date.getDate()}日 ${weekNames[date.getDay()]}`;
    const courseCount = courseCounts[key] || 0;
    cell.title = `${dateLabel}${key === today ? ' · 今天' : ''}${courseCount ? ` · ${courseCount} 节课` : ''}${count ? ` · ${count} 件未完成待办` : ''}`;
    cell.setAttribute('aria-label', `${key} ${weekNames[date.getDay()]}${key === today ? '，今天' : ''}${courseCount ? `，${courseCount} 节课` : ''}${count ? `，${count} 件未完成待办` : ''}`);
    fragment.append(cell);
  }
  $('calGrid').replaceChildren(fragment);
  if (monthAnim) {
    const grid = $('calGrid');
    grid.classList.remove('month-anim-left', 'month-anim-right');
    void grid.offsetWidth;
    grid.classList.add(monthAnim < 0 ? 'month-anim-left' : 'month-anim-right');
    monthAnim = 0;
  }
  updateCalendarSelection();
  if (focusDate) $('calGrid').querySelector(`[data-date="${focusDate}"]`)?.focus();
}

function renderWeekAgenda() {
  const range = CourseCore.weekRange(weekAnchor);
  if (!range) return;
  const start = parseDate(range.start), end = parseDate(range.end);
  $('calTitleMonth').textContent = `${start.getMonth() + 1}月${start.getDate()}日–${end.getMonth() + 1}月${end.getDate()}日`;
  $('calTitleYear').textContent = `${start.getFullYear()}年 · 本周`;
  const grid = $('weekAgenda');
  grid.replaceChildren();
  const today = dateKey(new Date());
  for (const key of range.days) {
    const day = parseDate(key);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `week-day-card${key === today ? ' today' : ''}${key === selected ? ' selected' : ''}`;
    card.setAttribute('aria-pressed', String(key === selected));
    card.dataset.date = key;
    const heading = document.createElement('span'); heading.className = 'week-day-heading';
    const dayName = document.createElement('b'); dayName.textContent = `${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][day.getDay()]} · ${day.getMonth() + 1}/${day.getDate()}`;
    heading.append(dayName);
    const dayCourses = coursesOnDate(key);
    const count = document.createElement('span'); count.textContent = dayCourses.length ? `${dayCourses.length} 节` : '';
    heading.append(count); card.append(heading);
    if (!dayCourses.length) {
      const free = document.createElement('span'); free.className = 'week-day-free'; free.textContent = '暂无课程'; card.append(free);
    } else {
      for (const course of dayCourses.slice(0, 3)) {
        const row = document.createElement('span'); row.className = 'week-day-course';
        const time = document.createElement('time'); time.textContent = course.startTime || course.period || '待定';
        const title = document.createElement('span'); title.textContent = course.title;
        row.append(time, title); card.append(row);
      }
      if (dayCourses.length > 3) {
        const more = document.createElement('span'); more.className = 'week-day-more'; more.textContent = `还有 ${dayCourses.length - 3} 节`;
        card.append(more);
      }
    }
    card.onclick = () => { selected = key; renderWeekAgenda(); renderTodos(); };
    card.ondblclick = () => { if (dayCourses[0]) openCourseEditor(dayCourses[0].id); else openCourseEditor(null, key); };
    grid.append(card);
  }
}

// ----- 拖拽改期浮标 -----
function moveDragTip(x, y) {
  const tip = $('dragTip');
  tip.style.left = `${Math.min(Math.round(x) + 12, innerWidth - 150)}px`;
  tip.style.top = `${Math.max(Math.round(y) - 30, 6)}px`;
}

// ----- 月历悬停浮层：这一天有什么 -----
function hideCalTip() {
  const tip = $('calTip');
  tip.classList.remove('show');
  tip.hidden = true;
}

function showCalTip(cell) {
  const tip = $('calTip');
  const date = cell.dataset.date;
  const day = parseDate(date);
  if (!day) return;
  tip.replaceChildren();
  const head = document.createElement('div');
  head.className = 'cal-tip-head';
  head.textContent = `${day.getMonth() + 1}月${day.getDate()}日 ${weekNames[day.getDay()]}${date === dateKey(new Date()) ? ' · 今天' : ''}`;
  tip.append(head);
  const items = [
    ...todos.filter(todo => todo.date === date).map(todo => ({ ...todo, kind: 'todo', sortTime: todo.time })),
    ...coursesOnDate(date).map(course => ({ ...course, kind: 'course', done: false, sortTime: course.startTime || '99:99' }))
  ].sort((a, b) => Number(a.done) - Number(b.done) || a.sortTime.localeCompare(b.sortTime) || Number(a.kind !== 'course') - Number(b.kind !== 'course'));
  if (!items.length) {
    const free = document.createElement('div');
    free.className = 'cal-tip-free';
    free.textContent = '这一天，自由安排';
    tip.append(free);
  } else {
    for (const todo of items.slice(0, 3)) {
      const row = document.createElement('div');
      row.className = `cal-tip-row${todo.done ? ' done' : ''}${todo.kind === 'course' ? ' course' : ''}`;
      const time = document.createElement('span');
      time.className = 'cal-tip-time';
      time.textContent = todo.kind === 'course' ? todo.startTime || todo.period || '待定' : todo.time;
      const title = document.createElement('span');
      title.className = 'cal-tip-title';
      title.textContent = `${todo.kind === 'course' ? '课程 · ' : ''}${todo.title}${todo.kind === 'course' && todo.location ? ` · ${todo.location}` : ''}`;
      row.append(time, title);
      tip.append(row);
    }
    if (items.length > 3) {
      const more = document.createElement('div');
      more.className = 'cal-tip-more';
      more.textContent = `还有 ${items.length - 3} 件…`;
      tip.append(more);
    }
  }
  tip.hidden = false;
  const rect = cell.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  let x = rect.left + rect.width / 2 - tipRect.width / 2;
  x = Math.max(8, Math.min(x, innerWidth - tipRect.width - 8));
  let y = rect.top - tipRect.height - 8;
  if (y < 8) y = rect.bottom + 8;
  tip.style.left = `${Math.round(x)}px`;
  tip.style.top = `${Math.round(y)}px`;
  tip.classList.add('show');
}

function updateCalendarSelection() {
  let found = false;
  $('calGrid').querySelectorAll('.cal-cell').forEach(cell => {
    const isSelected = cell.dataset.date === selected;
    cell.classList.toggle('selected', isSelected);
    cell.setAttribute('aria-pressed', String(isSelected));
    cell.tabIndex = isSelected ? 0 : -1;
    if (isSelected) found = true;
  });
  if (!found) $('calGrid').querySelector('.cal-cell:not(.other-month):not(:disabled)').tabIndex = 0;
}

function renderTodos() {
  if (!loaded) return;
  const query = $('searchInput').value;
  const todoItems = eventFilter === 'courses' ? [] : visibleTodos(todos, { selected, range, hideDone, query });
  let start = selected, courseEndKey;
  if (range !== 'all') {
    const endDate = parseDate(selected);
    endDate.setDate(endDate.getDate() + (range === 'day' ? 1 : 4));
    courseEndKey = dateKey(endDate);
  }
  const courseItems = eventFilter === 'todos' ? [] : CourseCore.visibleCourses(courses, { start: range === 'all' ? undefined : start, end: courseEndKey, query })
    .map(course => ({ ...course, kind: 'course' }));
  const items = [...todoItems.map(todo => ({ ...todo, kind: 'todo' })), ...courseItems]
    .sort((a, b) => a.date.localeCompare(b.date) ||
      (a.kind === 'course' ? a.startTime || '99:99' : a.time).localeCompare(b.kind === 'course' ? b.startTime || '99:99' : b.time) ||
      Number(a.kind !== 'course') - Number(b.kind !== 'course'));
  $('todoCount').textContent = items.length;
  const end = parseDate(selected); end.setDate(end.getDate() + 3);
  const short = key => `${Number(key.slice(5, 7))}月${Number(key.slice(8))}日`;
  $('rangeCaption').textContent = range === 'all' ? '所有日期的日程' : range === 'day' ? `${short(selected)} · ${weekNames[parseDate(selected).getDay()]}` : `${short(selected)} — ${short(dateKey(end))}`;
  document.querySelectorAll('[data-range]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.range === range)));
  $('hideDone').setAttribute('aria-pressed', String(hideDone));
  $('eventFilter').value = eventFilter;
  const fragment = document.createDocumentFragment();
  let previousDate;
  let index = 0;
  for (const todo of items) {
    if (previousDate !== todo.date) {
      const label = document.createElement('div');
      label.className = 'todo-date-label';
      const today = dateKey(new Date());
      label.textContent = todo.date === today ? `今天 · ${short(todo.date)}` : `${short(todo.date)} · ${weekNames[parseDate(todo.date).getDay()]}`;
      if (todo.date === today) label.classList.add('is-today');
      fragment.append(label); previousDate = todo.date;
    }
    const row = todo.kind === 'course' ? createCourseItem(todo) : createTodoItem(todo);
    if ($('todoList').classList.contains('animate-in')) row.style.setProperty('--i', index);
    if (todo.id === recentlyAddedId) { row.classList.add('pop-in'); recentlyAddedId = null; }
    fragment.append(row);
    index++;
  }
  if (!items.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state';
    const icon = document.createElement('span'); icon.className = 'empty-icon';
    const face = document.createElement('img');
    face.className = 'empty-mascot';
    face.src = 'assets/mascot-v2/happy.png';
    face.alt = '';
    face.draggable = false;
    icon.append(face);
    const title = document.createElement('strong');
    const description = document.createElement('p');
    const filtered = $('searchInput').value.trim() || hideDone || eventFilter !== 'all';
    title.textContent = filtered ? '没有符合条件的日程' : '留白，也是好安排';
    description.textContent = filtered ? '试试其他关键词，或调整筛选条件。' : '点「新增」，记下下一件重要的小事。';
    empty.append(icon, title, description); fragment.append(empty);
  }
  const scrollTop = $('todoList').scrollTop;
  $('todoList').replaceChildren(fragment);
  $('todoList').scrollTop = scrollTop;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', `#i-${name}`); svg.append(use); return svg;
}

function createTodoItem(todo) {
  const overdue = !todo.done && parseDate(todo.date, todo.time) < new Date();
  const row = document.createElement('div'); row.className = `todo-item${todo.done ? ' done' : ''}${overdue ? ' overdue' : ''}`; row.dataset.id = todo.id;
  // 拖拽到月历格子即可改期
  if (!todo.done) {
    row.draggable = true;
    row.addEventListener('dragstart', event => {
      event.dataTransfer.setData('text/plain', todo.id);
      event.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
      const tip = $('dragTip');
      tip.textContent = '拖到月历上的某一天';
      tip.hidden = false;
      moveDragTip(event.clientX, event.clientY);
    });
    row.addEventListener('dragend', () => { row.classList.remove('dragging'); $('dragTip').hidden = true; });
  }

  const check = document.createElement('button'); check.className = 'todo-check';
  check.setAttribute('aria-label', `${todo.done ? '标记未完成' : '完成'}：${todo.title}`); check.setAttribute('aria-pressed', String(todo.done));
  check.append(icon('check')); check.disabled = busy;
  check.onclick = () => toggleDone(todo);
  const edit = document.createElement('button'); edit.className = 'todo-edit'; edit.title = `编辑：${todo.title}`;
  const main = document.createElement('span'); main.className = 'todo-main';
  const title = document.createElement('span'); title.className = 'todo-text'; title.textContent = todo.title;
  main.append(title);
  if (todo.note) { const note = document.createElement('span'); note.className = 'todo-note'; note.textContent = todo.note; main.append(note); }
  const time = document.createElement('span'); time.className = 'todo-time'; time.textContent = todo.time;
  if (overdue) { const status = document.createElement('span'); status.className = 'overdue-label'; status.textContent = '已逾期'; time.append(status); }
  edit.append(main, time); edit.onclick = () => openModal(todo.id); edit.disabled = busy;
  const remove = document.createElement('button'); remove.className = 'todo-delete icon-btn'; remove.setAttribute('aria-label', `删除：${todo.title}`); remove.append(icon('trash')); remove.disabled = busy;
  remove.onclick = () => removeTodo(todo.id);
  row.append(check, edit, remove); return row;
}

function createCourseItem(course) {
  const row = document.createElement('div'); row.className = 'todo-item course-item'; row.dataset.courseId = course.id;
  const badge = document.createElement('span'); badge.className = 'course-badge'; badge.textContent = '课';
  const edit = document.createElement('button'); edit.className = 'todo-edit'; edit.title = `编辑课程：${course.title}`;
  const main = document.createElement('span'); main.className = 'todo-main';
  const title = document.createElement('span'); title.className = 'todo-text'; title.textContent = course.title;
  const meta = document.createElement('span'); meta.className = 'course-meta';
  meta.textContent = [course.period, course.location, course.teacher].filter(Boolean).join(' · ') || '课程';
  main.append(title, meta);
  const time = document.createElement('span'); time.className = 'todo-time';
  time.textContent = course.startTime ? `${course.startTime}${course.endTime ? `–${course.endTime}` : ''}` : course.period || '时间待定';
  edit.append(main, time); edit.onclick = () => openCourseEditor(course.id);
  const remove = document.createElement('button'); remove.className = 'todo-delete icon-btn';
  remove.setAttribute('aria-label', `删除本次课程：${course.title}`); remove.title = '取消本次课程'; remove.append(icon('trash'));
  remove.onclick = () => removeCourse(course.id);
  row.append(badge, edit, remove); return row;
}

async function toggleDone(todo) {
  const wasDone = todo.done;
  const ok = await commit(todos.map(item => item.id === todo.id
    ? { ...item, done: !item.done, completedAt: !item.done ? Date.now() : undefined }
    : item));
  if (!ok) return;
  if (!wasDone) {
    AudioFx.complete();
    react('complete', { mood: 'happy', bounce: true });
    try { window.api.petAction('complete'); } catch { /* 桌宠未开启时忽略。 */ }
    maybeCelebrate();
  }
}

function maybeCelebrate() {
  const today = dateKey(new Date());
  const list = todayTodos();
  if (!list.length || list.some(todo => !todo.done)) return;
  if (celebratedFor === today) return;
  celebratedFor = today;
  savePreferences();
  AudioFx.celebrate();
  showBubble(pickLine('celebrate'), 6000);
  bounceMascot();
  spawnBubbles();
}

function spawnBubbles() {
  const layer = $('fxLayer');
  for (let i = 0; i < 14; i++) {
    const bubble = document.createElement('i');
    bubble.className = 'fx-bubble';
    const size = 6 + Math.random() * 14;
    bubble.style.right = `${18 + Math.random() * 90}px`;
    bubble.style.width = `${size.toFixed(1)}px`;
    bubble.style.height = `${size.toFixed(1)}px`;
    bubble.style.setProperty('--wobble', `${(Math.random() * 70 - 35).toFixed(0)}px`);
    bubble.style.animationDelay = `${(Math.random() * .8).toFixed(2)}s`;
    bubble.style.animationDuration = `${(1.2 + Math.random() * .9).toFixed(2)}s`;
    bubble.addEventListener('animationend', () => bubble.remove());
    layer.append(bubble);
  }
}

async function commit(next) {
  if (busy || !loaded) return false;
  busy = true; setBusy(true);
  try {
    const saved = await window.api.saveTodos(next);
    todos = normalizeTodos(saved);
    return true;
  } catch (error) {
    console.error(error);
    if ($('modal').open) $('formError').textContent = '保存失败，请检查磁盘空间和文件权限后重试。';
    else showToast('保存失败，改动尚未保存，请重试。', null, 8000);
    return false;
  } finally { busy = false; setBusy(false); renderAll(); }
}

function setBusy(value) {
  ['btnSave', 'btnDelete', 'btnCancel', 'btnCancelBottom', 'btnAdd'].forEach(id => { $(id).disabled = value; });
  $('todoForm').setAttribute('aria-busy', String(value));
  $('btnSave').textContent = value ? '正在保存…' : '保存待办';
  $('todoList').querySelectorAll('button').forEach(button => { button.disabled = value; });
}

function openModal(id = null) {
  if (!loaded || busy || $('modal').open) return;
  const todo = id ? todos.find(item => item.id === id) : null;
  if (id && !todo) return;
  editingId = id;
  $('todoForm').reset(); $('formError').textContent = '';
  $('modalTitle').textContent = todo ? '编辑待办' : '新增待办';
  $('btnDelete').hidden = !todo;
  const next = new Date(Date.now() + 30 * 60000);
  const defaultTime = `${pad(next.getHours())}:${pad(next.getMinutes())}`;
  $('editTitle').value = todo?.title || '';
  $('editDate').value = todo?.date || (selected === dateKey(new Date()) ? dateKey(next) : selected);
  $('editTime').value = todo?.time || defaultTime;
  $('editNote').value = todo?.note || '';
  updateScheduleHint(); hideQuickChip();
  $('modal').showModal(); $('editTitle').focus();
  react('curious', { bubble: !todo });
}

function closeModal() { if (!busy) $('modal').close(); }

function hideQuickChip() { $('quickChip').hidden = true; $('quickChip').textContent = ''; }

function previewQuickEntry() {
  const chip = $('quickChip');
  if (editingId != null) { hideQuickChip(); return; } // 编辑已有事项时不改写标题语义
  const parsed = parseQuickEntry($('editTitle').value, $('editDate').value);
  if (!parsed) { hideQuickChip(); return; }
  const short = key => `${Number(key.slice(5, 7))}月${Number(key.slice(8))}日`;
  const date = parsed.date === dateKey(new Date()) ? '今天' : parsed.date === dateKey(new Date(Date.now() + 86400000)) ? '明天' : short(parsed.date);
  chip.textContent = parsed.time ? `✦ 已识别：${date} ${parsed.time}` : `✦ 已识别：${date} · 沿用当前时间`;
  chip.hidden = false;
}

function updateScheduleHint() {
  const target = parseDate($('editDate').value, $('editTime').value);
  $('scheduleHint').textContent = target && target < new Date() ? '这是过去的时间，保存后将显示为逾期待办。' : '保持应用开启或最小化，到时间就会提醒你。';
}

async function saveTodo(event) {
  event.preventDefault();
  const rawTitle = $('editTitle').value.trim();
  if (!rawTitle) { $('formError').textContent = '给这件事起个名字吧。'; $('editTitle').focus(); return; }
  let title = rawTitle, date = $('editDate').value, time = $('editTime').value, note = $('editNote').value.trim();
  if (editingId == null) {
    const parsed = parseQuickEntry(rawTitle, date);
    if (parsed) {
      title = parsed.title;
      date = parsed.date;
      if (parsed.time) time = parsed.time;
    }
  }
  if (!parseDate(date, time)) { $('formError').textContent = '请选择有效的日期和时间。'; return; }
  const old = todos.find(todo => todo.id === editingId);
  const item = { ...(old || { id: crypto.randomUUID(), done: false, createdAt: Date.now() }), title, date, time, note };
  if (old && reminderKey(old) !== reminderKey(item)) delete item.notifiedFor;
  const next = old ? todos.map(todo => todo.id === old.id ? item : todo) : [...todos, item];
  if (await commit(next)) {
    selected = date; currentMonth = shiftMonth(parseDate(date), 0);
    // Ensure a newly saved item is visible even when filters previously excluded it.
    $('searchInput').value = '';
    if (item.done) hideDone = false;
    if (!old) { recentlyAddedId = item.id; AudioFx.add(); react('save', { mood: 'happy' }); }
    savePreferences(); closeModal(); renderAll(); showToast(old ? '待办已更新' : '已记下这件事，到时提醒你。');
  }
}

async function removeTodo(id, fromModal = false) {
  const todo = todos.find(item => item.id === id);
  if (!todo || busy) return;
  if (await commit(todos.filter(item => item.id !== id))) {
    if (fromModal) closeModal();
    AudioFx.remove();
    react('delete', { mood: 'shy' });
    showToast('待办已删除', async () => {
      if (!todos.some(item => item.id === todo.id) && await commit([...todos, todo])) showToast('待办已恢复');
    }, 10000);
  }
}

function showToast(message, action = null, duration = 5000) {
  clearTimeout(toastTimer); toastAction = action;
  $('toastText').textContent = message; $('toastAction').hidden = !action; $('toast').hidden = false;
  toastTimer = setTimeout(dismissToast, duration);
}
function dismissToast() { clearTimeout(toastTimer); $('toast').hidden = true; toastAction = null; }

function updateMascot() {
  clearTimeout(transientTimer);
  transientTimer = null;
  const expression = currentExpression();
  setExpressionImages(expression);
  $('mascot').classList.toggle('sleep', expression === 'sleep');
  $('companionPanel').dataset.expression = expression;
  const expressions = {
    happy: { name: '微笑', status: '在这里陪你', quote: '你忙你的。\n这边有我。' },
    shy: { name: '害羞', status: '被你发现啦', quote: '看我干嘛。\n……头发乱了吗？' },
    sleep: { name: '困倦', status: '轻轻休息一下', quote: '枕头已经就位。\n没急事先别叫我。' }
  };
  $('companionPortrait').alt = `蓝色渐变长发、身着蓝白裙装的おおくじら，${expressions[expression].name}表情`;
  $('companionPresence').textContent = expressions[expression].status;
  $('companionQuote').textContent = expressions[expression].quote;
  document.querySelectorAll('[data-mood]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mood === mascotMood)));
}

initialize();
