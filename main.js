const { app, BrowserWindow, ipcMain, screen, Notification, powerMonitor, Menu, Tray, nativeImage, dialog, globalShortcut } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { TodoStore } = require('./todo-store');
const { CourseStore } = require('./course-store');
const { parseCourseFile } = require('./course-import');

let mainWindow;
let petWindow;
let petDrag = null;
const { dragPosition, createDragMotionTracker } = require('./pet-motion-core');
let tray;
let reminderTimer;
const userDataPath = app.getPath('userData');
const store = new TodoStore(path.join(userDataPath, 'todos.json'));
const courseStore = new CourseStore(path.join(userDataPath, 'courses.json'));
const settingsFile = path.join(userDataPath, 'window-state.json');
const petStateFile = path.join(userDataPath, 'pet-state.json');
const { WeatherService } = require('./weather-service');
const weather = new WeatherService(path.join(userDataPath, 'weather-state.json'));
let weatherTimer;
function broadcastWeather(state) { for (const win of [mainWindow, petWindow]) if (win && !win.isDestroyed()) win.webContents.send('weather:changed', state); return state; }
const PET_SIZE = { width: 210, height: 336 };

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();
else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  ipcMain.handle('weather:get', async () => broadcastWeather(await weather.refresh()));
  ipcMain.handle('weather:refresh', async () => broadcastWeather(await weather.refresh(true)));
  ipcMain.handle('weather:search', (_event, name) => weather.search(name));
  ipcMain.handle('weather:configure', async (_event, config) => broadcastWeather(await weather.configure(config)));
  ipcMain.handle('todos:load', async () => ({ todos: await store.load(), recovered: store.recovered }));
  ipcMain.handle('todos:save', async (_event, todos) => store.save(todos));
  ipcMain.handle('courses:load', async () => courseStore.load());
  ipcMain.handle('courses:save', async (_event, state) => courseStore.save(state));
  ipcMain.handle('courses:import-file', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false, canceled: true };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择教学系统导出的课表',
      filters: [{ name: '课表文件', extensions: ['xlsx', 'xls', 'csv', 'tsv', 'ics', 'ical'] }, { name: '所有文件', extensions: ['*'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths?.length) return { ok: false, canceled: true };
    try {
      const file = result.filePaths[0];
      const stat = await fs.promises.stat(file);
      if (stat.size > 20 * 1024 * 1024) throw new Error('课表文件超过 20 MB，请先按学期拆分。');
      const parsed = await parseCourseFile(await fs.promises.readFile(file), path.extname(file));
      return { ok: true, filename: path.basename(file), rows: parsed.rows, sheet: parsed.sheet || '', invalid: parsed.invalid || [] };
    } catch (error) {
      console.error('读取课表失败:', error.message);
      return { ok: false, error: error.message };
    }
  });
  ipcMain.handle('todos:export', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false, canceled: true };
    const stamp = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出待办备份',
      defaultPath: path.join(app.getPath('documents'), `Ookujira 日历备份-${stamp}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    try {
      const todos = await store.load();
      await fs.promises.writeFile(result.filePath, JSON.stringify(todos, null, 2), 'utf8');
      return { ok: true, count: todos.length, filePath: result.filePath };
    } catch (error) { console.error('导出待办失败:', error.message); return { ok: false, error: error.message }; }
  });
  ipcMain.handle('todos:import', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false, canceled: true };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '导入待办备份',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths?.length) return { ok: false, canceled: true };
    try {
      const content = await fs.promises.readFile(result.filePaths[0], 'utf8');
      return { ok: true, content };
    } catch (error) { console.error('读取备份失败:', error.message); return { ok: false, error: error.message }; }
  });
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:close', () => {
    // 关闭 = 收进托盘继续提醒；真正退出走托盘菜单。
    const firstTime = !tray;
    ensureTray();
    mainWindow?.hide();
    if (firstTime && Notification.isSupported()) {
      const notification = new Notification({ title: 'Ookujira 日历', icon: path.join(__dirname, 'assets', 'ookujira.ico'), body: '我到托盘待命了，到点的提醒照常有效。右键托盘图标可以退出。' });
      notification.on('click', showMainWindow);
      notification.show();
    }
  });
  ipcMain.handle('window:toggle-top', () => {
    const pinned = !mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(pinned);
    return pinned;
  });
  ipcMain.handle('window:state', () => ({ pinned: mainWindow.isAlwaysOnTop(), notifications: Notification.isSupported() }));
  // ----- 桌宠窗口 -----
  ipcMain.handle('pet:toggle', () => {
    const enabled = !(petWindow && !petWindow.isDestroyed());
    if (enabled) createPetWindow(); else closePetWindow();
    persistPetState(enabled);
    broadcastPet(enabled);
    return { enabled };
  });
  ipcMain.handle('pet:state', () => ({ enabled: !!(petWindow && !petWindow.isDestroyed()) }));
  ipcMain.handle('pet:cursor', () => screen.getCursorScreenPoint());
  ipcMain.handle('pet:begin-drag', () => petWindow && !petWindow.isDestroyed() ? petWindow.getBounds() : null);
  ipcMain.handle('pet:drag-start', event => {
    if (!petWindow || petWindow.isDestroyed() || event.sender !== petWindow.webContents) return false;
    const bounds = petWindow.getBounds();
    petDrag = { bounds, anchor: screen.getCursorScreenPoint(), moved: false, track: createDragMotionTracker(bounds) };
    petWindow.setIgnoreMouseEvents(false);
    return true;
  });
  ipcMain.handle('pet:drag-update', event => {
    if (!petWindow || petWindow.isDestroyed() || event.sender !== petWindow.webContents) return false;
    return updatePetDrag(true);
  });
  ipcMain.handle('pet:drag-finish', event => {
    if (!petWindow || petWindow.isDestroyed() || event.sender !== petWindow.webContents) return false;
    const moved = updatePetDrag();
    petDrag = null;
    if (moved) { const { x, y } = petWindow.getBounds(); persistPetState(true, x, y); }
    return moved;
  });
  ipcMain.on('pet:set-ignore', (_event, ignore) => {
    if (!petDrag && petWindow && !petWindow.isDestroyed() && typeof ignore === 'boolean') petWindow.setIgnoreMouseEvents(ignore, { forward: true });
  });
  ipcMain.on('pet:move-to', (_event, point) => {
    if (petDrag || !petWindow || petWindow.isDestroyed() || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const bounds = unionOfWorkAreas();
    const x = Math.round(Math.min(Math.max(point.x, bounds.x - 60), bounds.x + bounds.width - PET_SIZE.width + 60));
    const y = Math.round(Math.min(Math.max(point.y, bounds.y - 10), bounds.y + bounds.height - PET_SIZE.height + 10));
    petWindow.setPosition(x, y);
  });
  ipcMain.on('pet:end-drag', () => {
    if (petWindow && !petWindow.isDestroyed()) {
      const { x, y } = petWindow.getBounds();
      persistPetState(true, x, y);
    }
  });
  ipcMain.on('pet:menu', () => {
    if (!petWindow || petWindow.isDestroyed()) return;
    Menu.buildFromTemplate([
      ...[['sit', '坐一会儿'], ['pillow', '递抱枕 · 睡一会儿'], ['wake', '起来陪我'], ['pat', '摸摸头'], ['auto', '恢复自动作息']].map(([kind, label]) => ({ label, click: () => petWindow?.webContents.send('pet:command', kind) })),
      { type: 'separator' },
      { label: '藏回海里', click: () => { closePetWindow(); persistPetState(false); broadcastPet(false); } },
      { type: 'separator' },
      { label: '回到日历窗口', click: () => { if (mainWindow && !mainWindow.isDestroyed()) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } } }
    ]).popup({ window: petWindow });
  });
  ipcMain.on('pet:close', () => { closePetWindow(); persistPetState(false); broadcastPet(false); });
  ipcMain.on('theme:changed', (_event, name) => {
    if (typeof name !== 'string' || !['tide', 'ocean', 'sakura', 'stardust'].includes(name)) return;
    persistPetState(undefined, undefined, name); // 记住主题，桌宠下次启动同步
    if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('pet:theme', name);
  });
  ipcMain.on('pet:focus', (_event, active) => {
    if (petWindow && !petWindow.isDestroyed() && typeof active === 'boolean') petWindow.webContents.send('pet:focus', active);
  });
  ipcMain.on('pet:action', (_event, kind) => {
    if (petWindow && !petWindow.isDestroyed() && (kind === 'complete')) petWindow.webContents.send('pet:action', kind);
  });
  ipcMain.on('pet:open-calendar', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  ipcMain.on('focus:done', (_event, label) => {
    if (!Notification.isSupported() || typeof label !== 'string') return;
    const notification = new Notification({ title: 'おおくじら · 专注完成', body: label.slice(0, 120) });
    notification.on('click', () => {
      if (mainWindow?.isMinimized()) mainWindow.restore();
      mainWindow?.show();
      mainWindow?.focus();
    });
    notification.show();
  });
  app.whenReady().then(() => {
    app.setAppUserModelId('desktop-calendar-reminder');
    createWindow();
    weatherTimer = setInterval(async () => broadcastWeather(await weather.refresh()), 20 * 60000);
    if (loadPetState().enabled === true) createPetWindow();
    reminderTimer = setInterval(checkReminders, 15000);
    powerMonitor.on('resume', () => { checkReminders(); weather.refresh().then(broadcastWeather); });
    try {
      // 全局快捷键：任何界面一键呼出 / 收起主窗口
      globalShortcut.register('CommandOrControl+Alt+C', () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (mainWindow.isVisible() && !mainWindow.isMinimized()) mainWindow.hide();
        else showMainWindow();
      });
    } catch (error) { console.error('全局快捷键注册失败:', error.message); }
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  app.on('before-quit', () => {
    clearInterval(reminderTimer);
    clearInterval(weatherTimer);
    globalShortcut.unregisterAll();
    if (tray) { tray.destroy(); tray = null; }
    if (petWindow && !petWindow.isDestroyed()) {
      const { x, y } = petWindow.getBounds();
      persistPetState(true, x, y); // 下次启动自动召回桌宠
      petWindow.destroy();
      petWindow = null;
    }
  });
}

function createWindow() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch { /* Default bounds on first launch. */ }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.min(area.width, Math.max(340, Number(saved.width) || 400));
  const height = Math.min(area.height, Math.max(480, Number(saved.height) || 720));
  const visible = Number.isFinite(saved.x) && Number.isFinite(saved.y) && screen.getAllDisplays().some(display => {
    const a = display.workArea;
    return saved.x >= a.x && saved.y >= a.y && saved.x + width <= a.x + a.width && saved.y + height <= a.y + a.height;
  });
  mainWindow = new BrowserWindow({
    width, height, minWidth: 340, minHeight: 480,
    x: visible ? saved.x : area.x + Math.max(0, area.width - width - 20),
    y: visible ? saved.y : area.y + Math.max(0, Math.min(40, area.height - height)),
    frame: false, transparent: true, resizable: true, alwaysOnTop: saved.pinned === true,
    hasShadow: true, backgroundColor: '#00000000', show: false, title: 'Ookujira 日历', icon: path.join(__dirname, 'assets', 'ookujira.ico'),

    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.js') }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    // 渲染进程意外崩溃时自愈：先隐藏旧窗体再重载，避免白屏常驻。
    console.error('渲染进程退出:', details.reason);
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try { mainWindow.webContents.reload(); } catch { /* 保留窗口，等待用户手动重开。 */ }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => { mainWindow.show(); checkReminders(); });
  mainWindow.on('close', () => {
    try {
      fs.mkdirSync(userDataPath, { recursive: true });
      fs.writeFileSync(`${settingsFile}.tmp`, JSON.stringify({ ...mainWindow.getNormalBounds(), pinned: mainWindow.isAlwaysOnTop() }));
      fs.renameSync(`${settingsFile}.tmp`, settingsFile);
    } catch (error) { console.error('窗口位置保存失败:', error.message); }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function ensureTray() {
  if (tray) return;
  try {
    const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'ookujira.png')).resize({ width: 16, height: 16 });
    tray = new Tray(icon);
    tray.setToolTip('Ookujira 日历 · 提醒运行中');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '打开Ookujira 日历', click: showMainWindow },
      {
        label: '召唤 / 收回桌宠', click: () => {
          const enabled = !(petWindow && !petWindow.isDestroyed());
          if (enabled) createPetWindow(); else closePetWindow();
          persistPetState(enabled);
          broadcastPet(enabled);
        }
      },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ]));
    tray.on('double-click', showMainWindow);
  } catch (error) { console.error('托盘创建失败:', error.message); }
}

function loadPetState() {
  try {
    const state = JSON.parse(fs.readFileSync(petStateFile, 'utf8'));
    return state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  } catch { return {}; }
}

function persistPetState(enabled, x, y, theme) {
  try {
    const previous = loadPetState();
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(`${petStateFile}.tmp`, JSON.stringify({
      enabled: typeof enabled === 'boolean' ? enabled : previous.enabled,
      x: Number.isFinite(x) ? x : previous.x,
      y: Number.isFinite(y) ? y : previous.y,
      theme: typeof theme === 'string' ? theme : previous.theme
    }));
    fs.renameSync(`${petStateFile}.tmp`, petStateFile);
  } catch (error) { console.error('桌宠状态保存失败:', error.message); }
}

function broadcastPet(enabled) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('pet:changed', enabled);
}

function unionOfWorkAreas() {
  const areas = screen.getAllDisplays().map(display => display.workArea);
  const left = Math.min(...areas.map(a => a.x));
  const top = Math.min(...areas.map(a => a.y));
  const right = Math.max(...areas.map(a => a.x + a.width));
  const bottom = Math.max(...areas.map(a => a.y + a.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function createPetWindow() {
  if (petWindow && !petWindow.isDestroyed()) { petWindow.show(); return; }
  const state = loadPetState();
  const area = screen.getPrimaryDisplay().workArea;
  const x = Number.isFinite(state.x) ? state.x : area.x + area.width - PET_SIZE.width - 24;
  const y = Number.isFinite(state.y) ? state.y : area.y + area.height - PET_SIZE.height - 6;
  petWindow = new BrowserWindow({
    width: PET_SIZE.width, height: PET_SIZE.height, x, y,
    frame: false, transparent: true, resizable: false, movable: true,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false,
    backgroundColor: '#00000000', show: false, title: 'おおくじら', icon: path.join(__dirname, 'assets', 'ookujira.ico'),

    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'pet-preload.js') }
  });
  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  petWindow.webContents.on('will-navigate', event => event.preventDefault());
  petWindow.webContents.on('render-process-gone', () => {
    if (petWindow && !petWindow.isDestroyed()) { try { petWindow.webContents.reload(); } catch { /* 忽略。 */ } }
  });
  petWindow.loadFile(path.join(__dirname, 'pet.html'));
  petWindow.webContents.on('did-finish-load', () => {
    if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('pet:theme', loadPetState().theme || 'tide');
  });
  petWindow.once('ready-to-show', () => petWindow.show());
  petWindow.on('closed', () => { petDrag = null; petWindow = null; });
}

function updatePetDrag(withMotion = false) {
  if (!petDrag || !petWindow || petWindow.isDestroyed()) return false;
  const next = dragPosition(petDrag.bounds, petDrag.anchor, screen.getCursorScreenPoint(), unionOfWorkAreas(), PET_SIZE);
  petDrag.moved ||= next.moved;
  if (petDrag.moved) {
    const [x, y] = petWindow.getPosition();
    if (x !== next.x || y !== next.y) petWindow.setPosition(next.x, next.y);
  }
  return withMotion ? { moved: petDrag.moved, ...petDrag.track(petWindow.getBounds()) } : petDrag.moved;
}

function closePetWindow() {
  if (petWindow && !petWindow.isDestroyed()) petWindow.destroy();
  petWindow = null;
}

async function checkReminders() {
  try {
    const due = await store.remind(new Date(), async items => {
      if (!Notification.isSupported()) return false;
      const title = items.length === 1 ? 'おおくじら · 到时间啦' : `おおくじら · ${items.length} 件待办提醒`;
      const body = items.slice(0, 3).map(todo => `${todo.time}  ${todo.title}`).join('\n') + (items.length > 3 ? '\n打开日历查看全部' : '');
      const notification = new Notification({ title, body });
      notification.on('click', () => {
        if (mainWindow?.isMinimized()) mainWindow.restore();
        mainWindow?.show();
        mainWindow?.focus();
      });
      notification.show();
      return true;
    });
    if (due.length && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('todos:reminded', due.map(todo => todo.id));
    if (due.length && petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('pet:reminded', due.slice(0, 3).map(todo => todo.title));
  } catch (error) { console.error('提醒检查失败:', error.message); }
  await checkCourseReminders();
}

async function checkCourseReminders() {
  try {
    const due = await courseStore.remind(new Date(), async courses => {
      if (!Notification.isSupported()) return false;
      const first = courses[0];
      const title = courses.length === 1 ? `おおくじら · ${first.reminderMinutes ? `还有 ${first.reminderMinutes} 分钟上课` : '课程开始啦'}` : `おおくじら · ${courses.length} 节课即将开始`;
      const body = courses.slice(0, 3).map(course => `${Number(course.date.slice(5, 7))}月${Number(course.date.slice(8))}日 ${course.startTime || course.period || '时间待确认'}  ${course.title}${course.location ? ` · ${course.location}` : ''}`).join('\n') + (courses.length > 3 ? '\n打开课表查看其余课程' : '');
      const notification = new Notification({ title, body });
      notification.on('click', () => {
        if (mainWindow?.isMinimized()) mainWindow.restore();
        mainWindow?.show();
        mainWindow?.focus();
        if (courses.length && !mainWindow?.isDestroyed()) mainWindow.webContents.send('courses:open-date', courses[0].date);
      });
      notification.show();
      return true;
    });
    if (due.length && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('courses:reminded', due.map(course => course.id));
    if (due.length && petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('pet:reminded', due.slice(0, 3).map(course => course.title));
  } catch (error) { console.error('课程提醒失败:', error.message); }
}
