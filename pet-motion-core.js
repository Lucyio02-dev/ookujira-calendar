'use strict';

// Both cursor and window coordinates are Electron DIP screen coordinates.
function dragPosition(bounds, anchor, cursor, area, size) {
  const dx = cursor.x - anchor.x, dy = cursor.y - anchor.y;
  return {
    moved: Math.abs(dx) + Math.abs(dy) >= 6,
    x: Math.round(Math.min(Math.max(bounds.x + dx, area.x - 60), area.x + area.width - size.width + 60)),
    y: Math.round(Math.min(Math.max(bounds.y + dy, area.y - 10), area.y + area.height - size.height + 10))
  };
}
// Accumulate real screen displacement so tiny cursor noise cannot flip the pose.
function createDragMotionTracker(initial, startTime = Date.now()) {
  let sample = { ...initial }, lastMove = startTime, lastChange = startTime - 160;
  let behavior = 'hold', posture = 'lift', direction = 'right';
  return function track(point, now = Date.now()) {
    const dx = point.x - sample.x, dy = point.y - sample.y;
    if (Math.hypot(dx, dy) >= 3) {
      const horizontal = Math.abs(dx) > Math.abs(dy) * 1.2 || (Math.abs(dx) >= Math.abs(dy) / 1.2 && posture === 'walk');
      const next = horizontal ? 'walk' : dy < 0 ? 'lift' : 'lower';
      const nextDirection = horizontal ? (dx < 0 ? 'left' : 'right') : direction;
      const reversal = next === 'walk' && posture === 'walk' && nextDirection !== direction;
      if ((!reversal || Math.abs(dx) >= 6) && (next === behavior && nextDirection === direction || now - lastChange >= 160)) {
        if (next !== behavior || nextDirection !== direction) lastChange = now;
        behavior = posture = next; direction = nextDirection;
        sample = { ...point }; lastMove = now;
      }
    }
    if (now - lastMove >= 180) behavior = 'hold';
    return { behavior, posture, direction };
  };
}
module.exports = { dragPosition, createDragMotionTracker };
