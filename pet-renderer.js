'use strict';
const $ = id => document.getElementById(id);

const LINES = Companion.lines;
const say = Companion.createSpeaker();
let lastIdleSpeech = Date.now();
let clickCount = 0, lastClickAt = 0;
let sleepOverride = null;
let weatherState = null;
let lifeFrame = -1;
let weatherMood = 'normal';
let dragging = false;
let dragStart = null;
let dragReady = null;
let dragUpdate = null;
let dragFrame = null;
let dragSession = 0;
let finishingDrag = false;
let moved = false;
let sleeping = isNight();
let bubbleTimer = null;
let transientTimer = null;
let lastInteraction = Date.now();

function isNight() { const h = new Date().getHours(); return h >= 23 || h < 6; }
function pick(pool) { return typeof pool === 'function' ? pool() : pool[Math.floor(Math.random() * pool.length)]; }

function showBubble(text, duration = 4200) {
  clearTimeout(bubbleTimer);
  const bubble = $('petBubble');
  bubble.textContent = text;
  bubble.classList.add('show');
  bubbleTimer = setTimeout(() => bubble.classList.remove('show'), duration);
}

function setExpression(expression) {
  const src = `assets/mascot-v2/${expression}.png`;
  for (const el of [$('petBody'), $('petFace')]) if (el.getAttribute('src') !== src) el.src = src;
}

// ----- 全身动作：图集状态机 -----
const motion = { mode: 'idle', direction: 'right', frameTimer: null, actionTimers: [], resolveAction: null, initialized: false };
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => {
  if (!event.matches) return;
  lastInteraction = Date.now();
  setMotion(dragging ? 'drag' : (sleeping ? 'sleep' : 'idle'));
});
function clearMotionTimers() {
  if (motion.resolveAction) { motion.resolveAction(false); motion.resolveAction = null; }
  clearInterval(motion.frameTimer);
  motion.frameTimer = null;
  for (const timer of motion.actionTimers) clearTimeout(timer);
  motion.actionTimers = [];
}
function renderAtlasCell(atlasId, columns, rows, frame, frameWidth) {
  const atlas = $(atlasId), height = $('petSprite').clientHeight;
  const col = frame % columns, row = Math.floor(frame / columns);
  const inset = ($('petSprite').clientWidth - frameWidth) / 2;
  atlas.style.width = `${columns * frameWidth}px`;
  atlas.style.height = `${rows * height}px`;
  atlas.style.left = `${inset - col * frameWidth}px`;
  atlas.style.top = `${-row * height}px`;
  // Clip the selected cell on the atlas itself: the stage is wider than some cells.
  atlas.style.clipPath = `inset(${row * height}px ${(columns-col-1) * frameWidth}px ${(rows-row-1) * height}px ${col * frameWidth}px)`;
  atlas.dataset.frame = String(frame);
}
function atlasFrame(atlasId, columns, frame) {
  renderAtlasCell(atlasId, columns, 2, frame, columns === 4 ? $('petSprite').clientHeight : $('petSprite').clientHeight * (2 / 3));
}
function setMotion(mode) {
  clearMotionTimers();
  motion.mode = mode;
  motion.initialized = true;
  $('petFigure').dataset.motion = mode;
  $('petSprite').dataset.mode = mode;
  const directional = ['walk', 'walkSide', 'dragStand', 'turn', 'turnBack'].includes(mode);
  $('petFigure').classList.toggle('walking-left', directional && motion.direction === 'left');
  lifeFrame = -1;
  if (mode === 'sleep') {
    lifeFrame = 4; lifeAtlas(4); return;
  }
  if (mode === 'idle') {
    let frame = 0;
    atlasFrame('petIdleAtlas', 2, frame);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      motion.frameTimer = setInterval(() => {
        frame = (frame + 1) % 4;
        atlasFrame('petIdleAtlas', 2, frame);
      }, 1150);
    }
  } else if (mode === 'walk') {
    let frame = 0;
    atlasFrame('petWalkAtlas', 4, frame);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      motion.frameTimer = setInterval(() => {
        frame = (frame + 1) % 8;
        atlasFrame('petWalkAtlas', 4, frame);
      }, 140);
    }
  } else if (mode === 'walkSide') {
    let frame = 0;
    atlasFrame('petWalkSideAtlas', 4, frame);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      motion.frameTimer = setInterval(() => {
        frame = (frame + 1) % 8;
        atlasFrame('petWalkSideAtlas', 4, frame);
      }, 140);
    }
  } else if (mode === 'dragStand') {
    atlasFrame('petWalkSideAtlas', 4, 0);
  } else if (mode === 'dragLower') {
    atlasFrame('petDragAtlas', 2, 2);
  } else if (mode === 'drag') {
    // One held pose; swapping two substantially different drawings caused visible shaking.
    atlasFrame('petDragAtlas', 2, 1);
  }
}
// Schedule the next hold only after the current frame has actually been shown.
// Pre-scheduling every frame makes delayed renderer tasks rush through many poses at once.
function holdFrames(frames, render, minimum, done) {
  return new Promise(resolve => {
    motion.resolveAction = resolve;
    function step(index) {
      const [frame, duration] = frames[index];
      render(frame);
      motion.actionTimers = [setTimeout(() => {
        if (index + 1 < frames.length) step(index + 1);
        else {
          motion.resolveAction = null;
          motion.actionTimers = [];
          if (done) done();
          resolve(true);
        }
      }, Math.max(minimum, duration))];
    }
    step(0);
  });
}
function playSequence(mode, atlasId, frames, returnMode = 'idle', done = null) {
  setMotion(mode);
  return holdFrames(frames, frame => atlasFrame(atlasId, 2, frame), 260, () => {
    $('petFigure').classList.remove('woke');
    setMotion(returnMode);
    if (returnMode === 'idle' && !sleeping) setExpression('happy');
    if (done) done();
  });
}
function lifeAtlas(frame) {
  renderAtlasCell('petLifeAtlas', 4, 3, frame, $('petSprite').clientHeight);
  lifeFrame = frame;
}
function playLife(frames, done = null) {
  setMotion('life');
  return holdFrames(frames, lifeAtlas, 240, done);
}
function settleThen(action) {
  if (lifeFrame >= 0) {
    const exit = lifeFrame >= 2 && lifeFrame <= 5 ? [[5,250],[3,220],[2,300],[1,280],[0,180]] : lifeFrame === 7 ? [[6,320],[0,200]] : [[0,220]];
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setMotion('idle'); action(); return; }
    playLife(exit, () => { setMotion('idle'); action(); });
  } else action();
}
function turnToFrontThen(action) {
  if (lifeFrame >= 0) { settleThen(action); return; }
  if (!['walkSide', 'turn', 'turnBack'].includes(motion.mode)) { action(); return; }
  playSequence('turnBack', 'petTurnAtlas', [[3,170],[2,180],[1,170],[0,120]], 'idle', () => { if (!dragging && !sleeping) action(); });
}
function returnToRest() { setMotion(sleeping ? 'sleep' : 'idle'); }
function enterPillow() {
  settleThen(() => playLife([[0,180],[1,420],[2,360],[3,700],[4,1000]], () => setMotion('sleep')));
}
function chooseWeather() {
  if (!weatherState?.enabled || document.body.classList.contains('focusing') || sleeping || dragging || wandering || motion.mode !== 'idle') return;
  const kind = Companion.weatherKind(weatherState.data);
  if (kind === 'normal') return;
  weatherMood = kind;
  const frame = { rain:7, sun:8, hot:9, cold:10, snow:11 }[kind];
  const sequence = kind === 'rain' ? [[0,180],[6,400],[7,22000]] : [[0,180],[frame,22000]];
  playLife(sequence, () => settleThen(returnToRest));
  if (Date.now() - lastIdleSpeech >= 15 * 60000) { showBubble(say(kind)); lastIdleSpeech = Date.now(); }
}
function playGreeting(force = false) {
  if (sleeping || dragging || motion.mode === 'greeting' || motion.mode === 'wake' ||
      (!force && motion.mode !== 'idle' && motion.mode !== 'walkSide') ||
      document.body.classList.contains('focusing') ||
      matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  turnToFrontThen(() => playSequence('greeting', 'petGreetingAtlas', [[0, 150], [1, 190], [2, 220], [2, 700], [3, 300]]));
}
function playStretch() {
  if (!canStartIdleAction()) return;
  playSequence('stretch', 'petStretchAtlas', [[0, 150], [1, 220], [2, 900], [3, 400]]);
}
function playSit(force = false) {
  if (!force && !canStartIdleAction()) return;
  if (dragging || sleeping) return;
  turnToFrontThen(() => playLife([[0,180],[1,350],[2,400],[3,60000]], () => settleThen(returnToRest)));
}
function playHop() {
  if (sleeping || dragging || document.hidden ||
      document.body.classList.contains('focusing') ||
      matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  turnToFrontThen(() => playSequence('hop', 'petHopAtlas', [[0, 140], [1, 190], [2, 230], [3, 440]]));
}
function playWake() {
  if (!sleeping || dragging || document.hidden) return;
  playLife([[4,100],[5,2200],[4,400]], () => setMotion('sleep'));
}
function canStartIdleAction() {
  return !sleeping && !dragging && !wandering && !document.hidden && motion.mode === 'idle' &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches &&
    !document.body.classList.contains('focusing') && Date.now() - lastInteraction > 45000;
}

function applyTimeOfDay() {
  const next = sleepOverride === null ? isNight() : sleepOverride;
  const changed = next !== sleeping;
  sleeping = next;
  document.body.classList.toggle('sleeping', sleeping);
  if (dragging || (!changed && motion.initialized)) return;
  setExpression(sleeping ? 'sleep' : 'happy');
  if (sleeping) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) setMotion('sleep');
    else enterPillow();
  } else settleThen(() => setMotion('idle'));
}
function wiggle() {
  const figure = $('petFigure');
  figure.classList.remove('woke');
  void figure.offsetWidth;
  figure.classList.add('woke');
}

function transientHappy(ms = 3200) {
  if (!sleeping) { setExpression('happy'); return; }
  clearTimeout(transientTimer);
  setExpression('happy');
  transientTimer = setTimeout(() => { transientTimer = null; applyTimeOfDay(); }, ms);
}

// ----- 注视：她隔着屏幕看着你的光标（夜晚睡着时不看） -----
const gaze = { x: 0, y: 0, tx: 0, ty: 0 };
let ignoreActive = false;
let hoverSince = 0;
let approachArmed = true;
let approachCoolTimer = null;
function headCenter() {
  return { x: window.screenX + innerWidth / 2, y: window.screenY + 96 };
}
function overCharacter(point) {
  // 人物包围盒（不含气泡区）：窗口内的身体区域
  const local = { x: point.x - window.screenX, y: point.y - window.screenY };
  return local.x > 12 && local.x < innerWidth - 12 && local.y > 74 && local.y < innerHeight - 6;
}
async function pollCursor() {
  try {
    const point = await window.petApi.cursor();
    if (!point) return;
    const head = headCenter();
    const dx = point.x - head.x, dy = point.y - head.y;
    gaze.tx = Math.max(-1, Math.min(1, dx / 300));
    gaze.ty = Math.max(-1, Math.min(1, dy / 300));
    // 透明区域点击穿透，不挡住桌面
    if (!dragging) {
      const ignore = !overCharacter(point);
      if (ignore !== ignoreActive) { ignoreActive = ignore; window.petApi.setIgnore(ignore); }
    }
    // 你在旁边停留时，她会悄悄凑过来
    const free = !dragging && !wandering && !sleeping &&
                 motion.mode === 'idle' &&
                 !matchMedia('(prefers-reduced-motion: reduce)').matches &&
                 !document.body.classList.contains('focusing');
    const near = free && Math.hypot(point.x - (window.screenX + innerWidth / 2), point.y - (window.screenY + innerHeight / 2)) < 150;
    if (!near) { hoverSince = 0; return; }
    if (!hoverSince) hoverSince = Date.now();
    else if (approachArmed && Date.now() - hoverSince > 2200) {
      approachArmed = false;
      clearTimeout(approachCoolTimer);
      approachCoolTimer = setTimeout(() => { approachArmed = true; }, 32000);
      glideNear(point);
    }
  } catch { /* 轮询失败时保持当前视线。 */ }
}
function gazeFrame() {
  const tx = sleeping ? 0 : gaze.tx, ty = sleeping ? 0 : gaze.ty;
  if (Math.abs(gaze.x - tx) > .0004 || Math.abs(gaze.y - ty) > .0004) {
    gaze.x += (tx - gaze.x) * .09;
    gaze.y += (ty - gaze.y) * .09;
    document.documentElement.style.setProperty('--gx', gaze.x.toFixed(4));
    document.documentElement.style.setProperty('--gy', gaze.y.toFixed(4));
    document.documentElement.style.setProperty('--body-gaze-x', `${(gaze.x * 2).toFixed(2)}px`);
    document.documentElement.style.setProperty('--body-gaze-y', `${(gaze.y * 1.2).toFixed(2)}px`);
  }
  requestAnimationFrame(gazeFrame);
}
setInterval(pollCursor, 80);
gazeFrame();

// ----- 拖拽 / 点击 / 右键 -----
function showDragPose() {
  if (moved) return;
  moved = true;
  $('petStage').classList.add('dragging');
  $('petFigure').classList.remove('woke', 'recovering');
  setMotion('drag');
  showBubble(say('drag'), 2400);
}
function updateDragPose(state) {
  showDragPose();
  const side = state.behavior === 'walk' || state.behavior === 'hold' && state.posture === 'walk';
  const next = state.behavior === 'walk' ? 'walkSide' : side ? 'dragStand' : state.posture === 'lower' ? 'dragLower' : 'drag';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mode = reduced && next === 'walkSide' ? 'dragStand' : next;
  motion.direction = state.direction;
  if (motion.mode !== mode) setMotion(mode);
  else $('petFigure').classList.toggle('walking-left', side && motion.direction === 'left');
}
async function dragTick(session) {
  if (!dragging || session !== dragSession) return;
  try {
    const started = await dragReady;
    if (!started || !dragging || session !== dragSession) return;
    dragUpdate = window.petApi.updateDrag();
    const active = await dragUpdate;
    if (dragging && session === dragSession && active?.moved) updateDragPose(active);
  } catch { await finishPointerDrag(true); return; }
  finally { dragUpdate = null; }
  if (dragging && session === dragSession) dragFrame = requestAnimationFrame(() => dragTick(session));
}
$('petStage').addEventListener('pointerdown', event => {
  if (event.button !== 0 || dragging || finishingDrag) return;
  dragging = true; moved = false; ignoreActive = false;
  lastInteraction = Date.now();
  dragStart = { x:event.clientX, y:event.clientY, pointerId:event.pointerId };
  $('petStage').setPointerCapture(event.pointerId);
  dragReady = window.petApi.startDrag();
  dragTick(++dragSession);
});
async function finishPointerDrag(cancelled = false) {
  if (!dragging) return;
  dragging = false; finishingDrag = true;
  cancelAnimationFrame(dragFrame);
  try {
    await dragReady;
    if (dragUpdate) await dragUpdate;
    const didMove = await window.petApi.finishDrag();
    if (didMove && !moved) showDragPose();
    const stage = $('petStage');
    if (stage.hasPointerCapture(dragStart.pointerId)) stage.releasePointerCapture(dragStart.pointerId);
    stage.classList.remove('dragging');
    if (moved) {
      const returnMode = sleeping ? 'sleep' : 'idle';
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) setMotion(returnMode);
      else if (['walkSide', 'dragStand'].includes(motion.mode)) playSequence('turnBack', 'petTurnAtlas', [[3,260],[2,260],[1,260],[0,300]], returnMode);
      else playSequence('drop', 'petDragAtlas', [[3,440],[0,520]], returnMode);
      return;
    }
    if (cancelled) return;
    lastInteraction = Date.now();
    wiggle(); transientHappy();
    const now = Date.now(); clickCount = now-lastClickAt < 3000 ? clickCount+1 : 1; lastClickAt = now;
    const region = dragStart.y < 145 ? 'head' : dragStart.x > 155 ? 'tail' : 'clicked';
    showBubble(say(sleeping ? 'wake' : clickCount >= 3 ? 'repeated' : region));
    if (sleeping) playWake(); else playGreeting(true);
  } finally { finishingDrag = false; }
}
window.addEventListener('pointerup', () => { finishPointerDrag().catch(console.error); });
$('petStage').addEventListener('lostpointercapture', () => { finishPointerDrag(true).catch(console.error); });
window.addEventListener('pointercancel', () => { finishPointerDrag(true).catch(console.error); });
window.addEventListener('blur', () => { finishPointerDrag(true).catch(console.error); });
$('petStage').addEventListener('contextmenu', event => {
  event.preventDefault();
  window.petApi.menu();
});
// 双击她：跳回日历窗口
$('petStage').addEventListener('dblclick', () => window.petApi.openCalendar());
window.addEventListener('keydown', () => { lastInteraction = Date.now(); });

// ----- 提醒联动 -----
window.petApi.onReminded(titles => {
  lastInteraction = Date.now();
  wiggle();
  transientHappy(4200);
  if (sleeping) playWake();
  else playGreeting(true);
  showBubble(titles.length > 1 ? `${titles.length} 件事到时间了，先看一眼日历。` : `到时间了：「${titles[0]}」。这件先处理。`, 6000);
});
// 主人完成了待办，她也跟着欢呼
window.petApi.onAction(kind => {
  if (kind !== 'complete' || sleeping || document.hidden) return;
  lastInteraction = Date.now();
  wiggle();
  playHop();
  showBubble(say('complete'), 3200);
});

// ----- 作息与闲聊 -----
setTimeout(applyTimeOfDay, 0);
setInterval(applyTimeOfDay, 60000);
setTimeout(() => showBubble(say('greet'), 4600), 900);
setInterval(() => {
  if (document.hidden || sleeping || document.body.classList.contains('focusing') || Date.now() - lastInteraction < 90000 || Date.now() - lastIdleSpeech < 15 * 60000) return;
  lastIdleSpeech = Date.now(); showBubble(say('idle'));
}, 40000);

// ----- 专注陪伴：主人专注时她安静下沉 -----
window.petApi.onTheme(name => {
  const root = document.documentElement;
  if (!name || name === 'tide') root.removeAttribute('data-theme');
  else root.dataset.theme = name;
});
window.petApi.onFocus(active => {
  document.body.classList.toggle('focusing', active === true);
  if (active === true) {
    if (sleeping) setMotion('sleep');
    else settleThen(() => setMotion('idle'));
    showBubble(say('focusStart'), 5200);
  }
});

// ----- 闲置游走 + 凑近：共用平滑滑行 -----
let wandering = false;
async function glideTo(bounds, targetX, targetY, steps = 26, stepMs = 55) {
  if (dragging || finishingDrag) return;
  wandering = true;
  const interactionAtStart = lastInteraction;
  const sideWalk = Math.abs(targetX - bounds.x) >= 28;
  motion.direction = targetX < bounds.x ? 'left' : 'right';
  const interrupted = () => dragging || document.hidden || lastInteraction !== interactionAtStart ||
    document.body.classList.contains('focusing');
  try {
    if (sideWalk) {
      const completed = await playSequence('turn', 'petTurnAtlas', [[0,120],[1,170],[2,180],[3,170]], 'walkSide');
      if (!completed) return;
      if (interrupted()) return;
    } else setMotion('walk');
    for (let i = 1; i <= steps; i++) {
      if (interrupted()) break;
      const t = i / steps;
      const eased = t * t * (3 - 2 * t);
      window.petApi.moveTo(
        bounds.x + Math.round((targetX - bounds.x) * eased),
        bounds.y + Math.round((targetY - bounds.y) * eased)
      );
      await new Promise(resolve => setTimeout(resolve, stepMs));
    }
    if (sideWalk && !interrupted() && motion.mode === 'walkSide') {
      await playSequence('turnBack', 'petTurnAtlas', [[3,170],[2,180],[1,170],[0,120]], 'idle');
    }
  } finally {
    wandering = false;
    if (!dragging && ['walk', 'walkSide', 'turn'].includes(motion.mode)) setMotion(sleeping ? 'sleep' : 'idle');
  }
}
function glideNear(point) {
  (async () => {
    const bounds = await window.petApi.beginDrag();
    if (!bounds || dragging) return;
    const targetX = point.x - innerWidth / 2 + Math.round(Math.random() * 60 - 30);
    const targetY = point.y - 210 + Math.round(Math.random() * 30 - 15);
    showBubble(say('clicked'), 3200);
    await glideTo(bounds, targetX, targetY, 22, 60);
    if (!dragging && !sleeping) playGreeting();
  })();
}
async function openingWalkAndWave() {
  if (document.hidden || dragging || wandering || sleeping || motion.mode !== 'idle' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.body.classList.contains('focusing') || Date.now() - lastInteraction < 5000) return;
  const bounds = await window.petApi.beginDrag();
  if (!bounds) return;
  await glideTo(bounds, bounds.x + 78, bounds.y - 8, 24, 50);
  if (!dragging && !sleeping && !document.hidden && motion.mode === 'idle') playGreeting();
}
function scheduleWander() {
  setTimeout(async () => {
    const idle = !document.hidden && !dragging && !wandering && !sleeping &&
                 motion.mode === 'idle' &&
                 !matchMedia('(prefers-reduced-motion: reduce)').matches &&
                 !document.body.classList.contains('focusing') &&
                 Date.now() - lastInteraction > 9000;
    if (idle && Math.random() < .65) {
      const bounds = await window.petApi.beginDrag();
      if (bounds) {
        const distanceX = Math.round(Math.random() * 180 - 90);
        const distanceY = Math.round(Math.random() * 70 - 34);
        const distance = Math.hypot(distanceX, distanceY);
        const steps = Math.max(18, Math.min(34, Math.ceil(distance / 4)));
        await glideTo(bounds, bounds.x + distanceX, bounds.y + distanceY, steps, 52);
        if (!sleeping && Math.random() < .34) playGreeting();
      }
    }
    scheduleWander();
  }, 9000 + Math.random() * 12000);
}
// 首次见面用一小段“走近—停步—回身挥手”展示全身动作。
setTimeout(openingWalkAndWave, 6500);
scheduleWander();
function scheduleAmbientAction() {
  setTimeout(() => {
    if (canStartIdleAction()) {
      const roll = Math.random();
      if (roll < .35) chooseWeather();
      else if (roll < .6) playStretch();
      else if (roll < .95) playSit();
      else playHop();
    }
    scheduleAmbientAction();
  }, 45000 + Math.random() * 40000);
}
scheduleAmbientAction();

window.petApi.onWeather(state => {
  weatherState = state;
  const kind = state.enabled ? Companion.weatherKind(state.data) : 'normal';
  document.body.dataset.weather = kind;
  if (lifeFrame >= 6 && kind !== weatherMood && !dragging && !sleeping) settleThen(returnToRest);
});
window.petApi.weather().then(state => { weatherState = state; document.body.dataset.weather = state.enabled ? Companion.weatherKind(state.data) : 'normal'; }).catch(() => {});
setInterval(() => {
  if (weatherState && Companion.weatherKind(weatherState.data) === 'normal' && lifeFrame >= 6 && !sleeping && !dragging) settleThen(returnToRest);
  if (motion.mode === 'idle' && Date.now() - lastInteraction > 45000) chooseWeather();
}, 30000);
window.petApi.onCommand(kind => {
  if (dragging) return;
  lastInteraction = Date.now();
  if (kind === 'sit') { sleepOverride = false; sleeping = false; document.body.classList.remove('sleeping'); playSit(true); showBubble(say('sit')); }
  if (kind === 'pillow') { sleepOverride = true; sleeping = true; document.body.classList.add('sleeping'); enterPillow(); showBubble(say('pillow')); }
  if (kind === 'wake') { sleepOverride = false; sleeping = false; document.body.classList.remove('sleeping'); settleThen(returnToRest); showBubble(say('clicked')); }
  if (kind === 'pat') { wiggle(); if (sleeping) playWake(); else playGreeting(true); showBubble(say(sleeping ? 'wake' : 'head')); }
  if (kind === 'auto') { sleepOverride = null; applyTimeOfDay(); }
});
