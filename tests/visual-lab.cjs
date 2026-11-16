// 视觉实验室：批量生成美术审查用截图（不作为断言测试）。
const { app, BrowserWindow, Notification } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const temp = process.env.WHALE_TEST_USER_DATA;
if (!temp) throw new Error('Run this script using npm run shots');
app.setPath('userData', temp);
app.commandLine.appendSwitch('disable-renderer-backgrounding');
Notification.isSupported = () => false;
app.on('web-contents-created', (_event, contents) => {
  contents.on('render-process-gone', (_e, details) => console.error('render gone:', details.reason));
});
require('../main');

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const js = (code, win) => win.webContents.executeJavaScript(code, true);
async function shot(name, win) {
  await pause(260);
  const folder = path.join(__dirname, '..', '.screenshots');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, name), (await win.webContents.capturePage()).toPNG());
  console.log('shot:', name);
}

app.whenReady().then(async () => {
  try {
    const win = BrowserWindow.getAllWindows()[0];
    win.setSize(400, 720);
    for (let i = 0; i < 100; i++) {
      if (await js(`document.getElementById('todoList')?.getAttribute('aria-busy') === 'false'`, win)) break;
      await pause(50);
    }
    await js(`document.getElementById('btnAdd').click()`, win);
    await js(`document.getElementById('editTitle').value = ''; document.getElementById('btnCancel').click()`, win);
    // 塞入演示数据
    await js(`(() => {
      const { dateKey } = window.CalendarCore;
      const now = new Date();
      const tmr = new Date(now); tmr.setDate(tmr.getDate() + 1);
      const day = n => { const d = new Date(now); d.setDate(d.getDate() - n); return d; };
      const demo = [
        { title: '去健身房，练一个好状态', date: dateKey(now), time: '18:30', note: '别忘了带水和毛巾' },
        { title: '整理本周研究进展', date: dateKey(now), time: '20:00', note: '记录结果，也记下新的问题' },
        { title: '和导师讨论下一步实验', date: dateKey(tmr), time: '10:00', note: '带上对比结果和三条核心问题' },
        { title: '晨跑 3 公里', date: dateKey(day(4)), time: '08:00', done: true, completedAt: day(4).setHours(9, 12) },
        { title: '写完周报', date: dateKey(day(1)), time: '09:00', done: true, completedAt: day(1).setHours(10, 26) },
        { title: '图书馆还书', date: dateKey(day(1)), time: '14:00', done: true, completedAt: day(1).setHours(15, 5) },
        { title: '背 20 个单词', date: dateKey(now), time: '07:30', done: true, completedAt: now.setHours(8, 1) }
      ];
      return window.api.saveTodos(demo.map((t, i) => ({ id: 'demo-' + i, ...t, createdAt: Date.now() + i })));
    })()`, win);
    win.webContents.reload();
    for (let i = 0; i < 100; i++) {
      if (await js(`document.getElementById('todoList')?.getAttribute('aria-busy') === 'false' && document.querySelectorAll('.todo-item').length >= 3`, win)) break;
      await pause(50);
    }
    await pause(1000); // 等错落入场动画完成
    await shot('lab-main.png', win);
    // 月历悬停浮层（悬停今天格，预览当日待办）
    await js(`document.querySelector('.cal-cell.today').dispatchEvent(new MouseEvent('mouseover', {bubbles: true}))`, win);
    await pause(260);
    await shot('lab-cal-tip.png', win);
    await js(`document.getElementById('calGrid').dispatchEvent(new MouseEvent('mouseleave'))`, win);

    // 展开陪伴面板 + 强制微笑 + 注视左 / 右
    await js(`document.getElementById('mascot').click(); document.querySelector('[data-mood="happy"]').click()`, win);
    await pause(400);
    await shot('lab-companion-center.png', win);
    await js(`document.documentElement.style.setProperty('--gx', '-0.85'); document.documentElement.style.setProperty('--gy', '0.25')`, win);
    await shot('lab-companion-gaze-left.png', win);
    await js(`document.documentElement.style.setProperty('--gx', '0.85'); document.documentElement.style.setProperty('--gy', '-0.3')`, win);
    await shot('lab-companion-gaze-right.png', win);

    // 害羞表情 + 全身立绘
    await js(`document.querySelector('[data-mood="shy"]').click()`, win);
    await pause(400);
    await shot('lab-companion-shy.png', win);
    await js(`document.getElementById('btnFullBody').click()`, win);
    await pause(300);
    await shot('lab-fullbody.png', win);
    await js(`document.getElementById('btnFullBodyClose').click()`, win);

    // 返回月历，打开快速添加识别
    await js(`document.getElementById('closeCompanion').click()`, win);
    await js(`document.getElementById('btnAdd').click()`, win);
    await js(`document.getElementById('editTitle').value = '明天晚上8点 和导师开会'; document.getElementById('editTitle').dispatchEvent(new Event('input'))`, win);
    await pause(200);
    await shot('lab-quick-add.png', win);
    await js(`document.getElementById('btnCancel').click()`, win);
    // 主题外观：暮樱 / 星芒
    await js(`document.getElementById('btnTheme').click()`, win);
    await pause(250);
    await shot('lab-theme-dialog.png', win);
    await js(`document.querySelector('#themeDialog [data-theme="sakura"]').click()`, win);
    await pause(200);
    await js(`document.getElementById('btnThemeClose').click()`, win);
    await pause(250);
    await shot('lab-theme-sakura.png', win);
    await js(`document.getElementById('btnTheme').click(); document.querySelector('#themeDialog [data-theme="stardust"]').click(); document.getElementById('btnThemeClose').click()`, win);
    await pause(250);
    await shot('lab-theme-stardust.png', win);
    await js(`document.getElementById('btnTheme').click(); document.querySelector('#themeDialog [data-theme="tide"]').click(); document.getElementById('btnThemeClose').click()`, win);
    await pause(200);
    await js(`document.getElementById('btnFocus').click()`, win);
    await pause(300);
    await shot('lab-focus.png', win);
    await js(`document.getElementById('btnFocusClose').click()`, win);
    await js(`document.getElementById('todayProgressBox').click()`, win);
    await pause(400);
    await shot('lab-stats.png', win);
    await js(`document.getElementById('btnStatsClose').click()`, win);

    // 桌宠（白天状态 + 注视）
    await js(`window.api.togglePet()`, win);
    await pause(900);
    const pet = BrowserWindow.getAllWindows().find(w => w !== win);
    if (pet) {
      await js(`document.body.classList.remove('sleeping'); document.getElementById('petBody').src = 'assets/mascot-v2/happy.png'; document.getElementById('petFace').src = 'assets/mascot-v2/happy.png'; document.documentElement.style.setProperty('--gx', '-0.7')`, pet);
      await shot('lab-pet-awake.png', pet);
    }
    console.log('LAB DONE');
    app.exit(0);
  } catch (error) {
    console.error(error.stack || error);
    app.exit(1);
  }
});
