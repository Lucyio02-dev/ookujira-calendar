// Exercise the real main process, sandboxed preload, renderer and disk persistence.
// All user data is redirected to an isolated temporary directory.
const { app, BrowserWindow, Notification } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { dateKey } = require('../calendar-core');
const temp = process.env.WHALE_TEST_USER_DATA;
if (!temp) throw new Error('Run this test using npm run test:ui');
app.setPath('userData', temp);
app.commandLine.appendSwitch('disable-renderer-backgrounding');
Notification.isSupported = () => false;
const errors = [];
app.on('web-contents-created', (_event, contents) => {
  contents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
  contents.on('preload-error', (_event, _file, error) => errors.push(error.message));
  contents.on('render-process-gone', (_event, details) => errors.push(details.reason));
});
require('../main');

let win;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const js = code => win.webContents.executeJavaScript(code, true);
async function until(code, label) {
  for (let i = 0; i < 100; i++) {
    if (await js(code)) return;
    await pause(50);
  }
  throw new Error(`Timed out: ${label}`);
}
async function shot(name) {
  await pause(150);
  const folder = path.join(__dirname, '..', '.screenshots');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, name), (await win.webContents.capturePage()).toPNG());
}
async function create(title, date, time, note = '') {
  await js(`document.getElementById('btnAdd').click()`);
  await until(`document.getElementById('modal').open`, 'editor open');
  await js(`document.getElementById('editTitle').value=${JSON.stringify(title)};
    document.getElementById('editDate').value=${JSON.stringify(date)};
    document.getElementById('editTime').value=${JSON.stringify(time)};
    document.getElementById('editNote').value=${JSON.stringify(note)};
    document.getElementById('todoForm').requestSubmit()`);
  await until(`!document.getElementById('modal').open`, 'create saved');
}

app.whenReady().then(async () => {
  try {
    win = BrowserWindow.getAllWindows()[0];
    assert.ok(win, 'production window created');
    await until(`document.getElementById('todoList')?.getAttribute('aria-busy') === 'false'`, 'initial load');
    await until(`document.getElementById('mascotImg').complete && document.getElementById('mascotImg').naturalWidth > 0`, 'new mascot loaded');
    assert.equal(await js(`document.querySelectorAll('.cal-cell').length`), 42);
    assert.equal(await js(`typeof require`), 'undefined', 'renderer has no Node access');
    await shot('optimized-empty.png');

    const today = dateKey(new Date());
    const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = dateKey(tomorrowDate);
    await create('论文精读与实验复现', today, '09:30', '整理遥感影像分割的实验思路');
    await create('去健身房，练一个好状态', today, '18:30', '别忘了带水和毛巾');
    await create('整理本周研究进展', today, '20:00', '记录结果，也记下新的问题');
    await create('和导师讨论下一步实验', tomorrow, '10:00', '带上对比结果和三条核心问题');
    await js(`document.getElementById('goToday').click()`);
    assert.equal(await js(`document.querySelectorAll('.todo-item').length`), 4);
    const firstId = await js(`document.querySelector('.todo-item').dataset.id`);
    await js(`document.querySelector('.todo-check').click()`);
    await until(`document.querySelectorAll('.todo-item.done').length === 1`, 'completion saved');
    await js(`document.getElementById('hideDone').click()`);
    assert.equal(await js(`document.querySelectorAll('.todo-item').length`), 3);
    await js(`document.getElementById('hideDone').click(); document.querySelector('[data-range="day"]').click()`);
    assert.equal(await js(`document.querySelectorAll('.todo-item').length`), 3);
    await js(`document.querySelector('[data-range="upcoming"]').click();
      document.getElementById('searchInput').value='三条核心'; document.getElementById('searchInput').dispatchEvent(new Event('input'))`);
    assert.equal(await js(`document.querySelectorAll('.todo-item').length`), 1);
    await js(`document.getElementById('searchInput').value=''; document.getElementById('searchInput').dispatchEvent(new Event('input'))`);

    await js(`document.querySelector('.todo-delete').click()`);
    await until(`document.querySelectorAll('.todo-item').length === 3`, 'deletion saved');
    await js(`document.getElementById('toastAction').click()`);
    await until(`document.querySelectorAll('.todo-item').length === 4`, 'undo restored');
    assert.ok(await js(`!!document.querySelector('[data-id="${firstId}"]')`));

    await js(`document.getElementById('btnTop').click()`);
    await until(`document.getElementById('btnTop').getAttribute('aria-pressed') === 'true'`, 'pin enabled');
    assert.equal(win.isAlwaysOnTop(), true);
    await js(`document.getElementById('btnTop').click()`);
    await until(`document.getElementById('btnTop').getAttribute('aria-pressed') === 'false'`, 'pin disabled');

    // Calendar hover preview and theme switching.
    await js(`document.querySelector('.cal-cell.today').dispatchEvent(new MouseEvent('mouseover', {bubbles: true}))`);
    assert.equal(await js(`document.getElementById('calTip').classList.contains('show')`), true, 'hover preview shows');
    assert.ok(await js(`document.getElementById('calTip').textContent.includes('去健身房')`), 'preview lists the day todos');
    await js(`document.getElementById('calGrid').dispatchEvent(new MouseEvent('mouseleave', {bubbles: false}))`);
    await js(`document.getElementById('btnTheme').click()`);
    await until(`document.getElementById('themeDialog').open`, 'theme dialog opens');
    await js(`document.querySelector('#themeDialog [data-theme="ocean"]').click()`);
    assert.equal(await js(`document.documentElement.dataset.theme`), 'ocean', 'theme applied');
    await js(`document.getElementById('btnThemeClose').click()`);
    await until(`!document.getElementById('themeDialog').open`, 'theme dialog closes');

    // An I/O failure must keep the editor open, preserve its text, and allow retry.
    assert.deepEqual(errors, [], 'no errors before fault injection');
    await js(`document.querySelector('.todo-edit').click(); document.getElementById('editTitle').value='保存失败后仍能重试'`);
    fs.mkdirSync(path.join(temp, 'todos.json.tmp'));
    await js(`document.getElementById('todoForm').requestSubmit()`);
    await until(`document.getElementById('formError').textContent.includes('保存失败')`, 'save error shown');
    assert.equal(await js(`document.getElementById('modal').open`), true);
    assert.equal(await js(`document.getElementById('editTitle').value`), '保存失败后仍能重试');
    fs.rmdirSync(path.join(temp, 'todos.json.tmp'));
    errors.length = 0; // The intentionally induced disk error is expected.
    await js(`document.getElementById('editTitle').value='去健身房，练一个好状态'; document.getElementById('todoForm').requestSubmit()`);
    await until(`!document.getElementById('modal').open`, 'retry saved');

    // Confirm user strings stay text rather than becoming executable markup.
    await create('<img src=x onerror=alert(1)>', today, '23:00', '<b>纯文本备注</b>');
    assert.equal(await js(`document.querySelectorAll('.todo-list img, .todo-list b').length`), 0);
    await js(`Array.from(document.querySelectorAll('.todo-item')).find(row => row.querySelector('.todo-text').textContent === '<img src=x onerror=alert(1)>').querySelector('.todo-delete').click()`);
    await until(`document.querySelectorAll('.todo-item').length === 4`, 'test item removed');

    // Calendar click and double click continue to work on the same DOM node.
    await js(`document.getElementById('goToday').click();
      document.querySelector('.cal-cell.selected').click();
      document.querySelector('.cal-cell.selected').dispatchEvent(new MouseEvent('dblclick', {bubbles:true}))`);
    assert.equal(await js(`document.getElementById('modal').open`), true);
    await shot('optimized-editor.png');
    await js(`document.getElementById('btnCancel').click(); document.getElementById('toastDismiss').click()`);
    await shot('optimized-populated.png');

    // Dragging an unfinished card onto another day reschedules it.
    const dragId = await js(`document.querySelector('.todo-item:not(.done)').dataset.id`);
    const dateBefore = JSON.parse(fs.readFileSync(path.join(temp, 'todos.json'), 'utf8')).find(todo => todo.id === dragId).date;
    await js(`(() => {
      const row = document.querySelector('.todo-item:not(.done)');
      const target = Array.from(document.querySelectorAll('.cal-cell:not(.other-month):not(.today):not(:disabled)'))[0];
      const dt = new DataTransfer();
      row.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt, cancelable: true }));
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt, cancelable: true }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt, cancelable: true }));
      row.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
      return target.dataset.date;
    })()`);
    await until(`document.getElementById('toast').hidden === false`, 'reschedule toast');
    const savedTodos = JSON.parse(fs.readFileSync(path.join(temp, 'todos.json'), 'utf8'));
    const dateAfter = savedTodos.find(todo => todo.id === dragId).date;
    assert.notEqual(dateAfter, dateBefore, 'rescheduled to the dropped day');
    await js(`document.getElementById('toastDismiss').click()`);

    // The companion replaces the calendar instead of covering the scrollable agenda.
    const closedListHeight = await js(`document.getElementById('todoList').getBoundingClientRect().height`);
    await js(`document.getElementById('mascot').click()`);
    assert.equal(await js(`document.getElementById('companionPanel').hidden`), false);
    assert.equal(await js(`document.getElementById('calendarSection').hidden`), true);
    assert.equal(await js(`document.getElementById('mascot').getAttribute('aria-expanded')`), 'true');
    assert.equal(await js(`document.activeElement.id`), 'closeCompanion');
    const openedListHeight = await js(`document.getElementById('todoList').getBoundingClientRect().height`);
    assert.ok(Math.abs(openedListHeight - closedListHeight) < 15, 'expanded portrait preserves agenda space');
    for (const mood of ['happy', 'shy', 'sleep']) {
      await js(`document.querySelector('[data-mood="${mood}"]').click()`);
      await until(`document.getElementById('companionPortrait').complete && document.getElementById('companionPortrait').naturalWidth === 1024 && document.getElementById('companionPortrait').getAttribute('src') === 'assets/mascot-v2/${mood}.png'`, `${mood} portrait loaded`);
      assert.equal(await js(`document.getElementById('mascotImg').getAttribute('src')`), `assets/mascot-v2/${mood}.png`);
      await shot(`mascot-v2-${mood}.png`);
    }
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true}))`);
    assert.equal(await js(`document.getElementById('companionPanel').hidden`), true);
    assert.equal(await js(`document.activeElement.id`), 'mascot');
    await js(`document.getElementById('mascot').click(); document.getElementById('goToday').click()`);
    assert.equal(await js(`document.getElementById('companionPanel').hidden`), true, 'today returns to calendar');

    for (const [width, height] of [[340, 480], [380, 600], [600, 800]]) {
      win.setSize(width, height); await pause(150);
      const layout = await js(`(() => {
        const list=document.getElementById('todoList').getBoundingClientRect();
        const footer=document.querySelector('.companion-footer').getBoundingClientRect();
        const search=document.querySelector('.search-box').getBoundingClientRect();
        const mascot=document.getElementById('mascot').getBoundingClientRect();
        return { listHeight:list.height, listBottom:list.bottom, footerTop:footer.top, footerBottom:footer.bottom, mascotTop:mascot.top, width:innerWidth, height:innerHeight, searchWidth:search.width, overflow:document.documentElement.scrollWidth>innerWidth };
      })()`);
      assert.ok(layout.listHeight >= 65, `${width}x${height} leaves a usable scrollable agenda: ${JSON.stringify(layout)}`);
      assert.ok(layout.listBottom <= layout.footerTop + 1, 'companion never covers list');
      assert.ok(layout.mascotTop >= layout.listBottom, 'mascot stays inside footer');
      assert.ok(layout.footerBottom <= layout.height, 'footer stays in viewport');
      assert.equal(layout.overflow, false);
      await js(`document.getElementById('mascot').click()`);
      const portraitLayout = await js(`(() => {
        const panel=document.getElementById('companionPanel').getBoundingClientRect();
        const todo=document.querySelector('.todo-section').getBoundingClientRect();
        const list=document.getElementById('todoList').getBoundingClientRect();
        const footer=document.querySelector('.companion-footer').getBoundingClientRect();
        const moods=document.querySelector('.expression-controls').getBoundingClientRect();
        return { panelBottom:panel.bottom, agendaTop:todo.top, listHeight:list.height, listBottom:list.bottom, footerTop:footer.top, moodsBottom:moods.bottom, panelRight:panel.right, viewportWidth:innerWidth };
      })()`);
      assert.ok(portraitLayout.panelBottom <= portraitLayout.agendaTop + 1, 'expanded panel never overlays agenda');
      assert.ok(portraitLayout.listHeight >= 65, `expanded panel leaves usable agenda at ${width}x${height}: ${JSON.stringify(portraitLayout)}`);
      assert.ok(portraitLayout.moodsBottom <= portraitLayout.panelBottom, 'expression controls fit');
      assert.ok(portraitLayout.panelRight <= portraitLayout.viewportWidth, 'expanded panel fits width');
      if (width === 340) await shot('mascot-v2-compact.png');
      await js(`document.getElementById('closeCompanion').click()`);
      if (width === 340) {
        await shot('optimized-compact.png');
        await js(`document.getElementById('btnAdd').click()`);
        const bounds = await js(`(() => { const b=document.getElementById('modal').getBoundingClientRect(); return {top:b.top,bottom:b.bottom,height:innerHeight} })()`);
        assert.ok(bounds.top >= 0 && bounds.bottom <= bounds.height, 'editor fits minimum window');
        await js(`document.getElementById('btnCancel').click()`);
      }
    }
    win.setSize(400, 720);
    await js(`document.querySelector('[data-range="all"]').click(); document.getElementById('hideDone').click()`);
    win.webContents.reload();
    await until(`document.getElementById('todoList')?.getAttribute('aria-busy') === 'false'`, 'reload data');
    assert.equal(await js(`document.querySelector('[data-range="all"]').getAttribute('aria-pressed')`), 'true');
    assert.equal(await js(`document.getElementById('hideDone').getAttribute('aria-pressed')`), 'true');
    assert.equal(await js(`document.documentElement.dataset.theme`), 'ocean', 'theme persists across reload');
    assert.equal(await js(`document.querySelector('[data-mood="sleep"]').getAttribute('aria-pressed')`), 'true', 'explicit expression persists');
    await js(`document.getElementById('mascot').click(); document.querySelector('[data-mood="auto"]').click()`);
    const expectedAutomaticMood = new Date().getHours() >= 23 || new Date().getHours() < 6 ? 'sleep' : 'happy';
    assert.equal(await js(`document.getElementById('companionPanel').dataset.expression`), expectedAutomaticMood);
    await js(`document.getElementById('closeCompanion').click()`);
    const saved = JSON.parse(fs.readFileSync(path.join(temp, 'todos.json'), 'utf8'));
    assert.equal(saved.length, 4);
    assert.equal(saved.filter(todo => todo.done).length, 1);
    assert.deepEqual(errors, [], 'no renderer, CSP, preload or process errors');
    console.log('PASS: real Electron CRUD, completion, filters, search, pinning, undo, save retry, text escaping, calendar double click, persistence, companion expansion, three expressions, automatic mood, keyboard focus and responsive layout.');
    console.log('Screenshots: .screenshots/optimized-{empty,populated,editor,compact}.png');
    app.exit(0);
  } catch (error) {
    console.error(error.stack || error); console.error('Renderer errors:', errors);
    app.exit(1);
  }
});
