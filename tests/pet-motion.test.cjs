const test = require('node:test');
const assert = require('node:assert/strict');
const { dragPosition, createDragMotionTracker } = require('../pet-motion-core');
const area = { x:-1920,y:0,width:3840,height:1080 }, size = {width:210,height:336};
test('screen drag follows fixed anchor and never feeds current window location back', () => {
  const bounds={x:120,y:300}, anchor={x:225,y:460};
  for(let i=0;i<100;i++) {
    const next=dragPosition(bounds,anchor,{x:anchor.x+48,y:anchor.y-36},area,size);
    assert.deepEqual(next,{moved:true,x:168,y:264});
  }
  assert.deepEqual(dragPosition(bounds,anchor,anchor,area,size),{moved:false,x:120,y:300});
});
test('drag motion follows recent direction, stops, and rejects tiny reversals', () => {
  const track = createDragMotionTracker({x:0,y:0},0);
  assert.equal(track({x:12,y:1},20).behavior,'walk');
  assert.equal(track({x:12,y:1},210).behavior,'hold');
  assert.equal(track({x:8,y:1},230).direction,'right','four-pixel reversal ignored');
  assert.equal(track({x:2,y:1},250).direction,'left');
  assert.equal(track({x:2,y:-18},440).behavior,'lift');
  assert.equal(track({x:2,y:5},640).behavior,'lower');
  assert.deepEqual(track({x:2,y:5},840),{behavior:'hold',posture:'lower',direction:'left'});
});
test('direction changes have hysteresis and diagonals preserve the walking axis', () => {
  const track = createDragMotionTracker({x:0,y:0},0);
  assert.equal(track({x:12,y:0},10).direction,'right');
  assert.equal(track({x:0,y:0},50).direction,'right','no rapid back-and-forth pose change');
  assert.equal(track({x:0,y:0},180).direction,'left');
  assert.equal(track({x:-10,y:10},350).behavior,'walk');
});
test('negative monitor coordinates and fractional DIP coordinates stay bounded', () => {
  assert.deepEqual(dragPosition({x:-1800,y:100},{x:-1700,y:200},{x:-1651.5,y:163.5},area,size),{moved:true,x:-1751,y:64});
  const next=dragPosition({x:0,y:0},{x:0,y:0},{x:-9000,y:9000},area,size);
  assert.equal(next.x,-1980);assert.equal(next.y,754);
});
