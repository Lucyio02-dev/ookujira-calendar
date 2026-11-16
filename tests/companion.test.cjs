const {test} = require('node:test');
const assert = require('node:assert/strict');
const { createSpeaker, lines, weatherKind } = require('../companion-core');
const { WeatherService } = require('../weather-service');
test('speech does not repeat until each event pool is exhausted', () => {
  const say = createSpeaker(() => 0);
  assert.equal(new Set(Array.from({length:lines.clicked.length}, () => say('clicked'))).size, lines.clicked.length);
});
test('weather handles night, snow, freezing rain and stale data', () => {
  const data = { observedAt:Date.now(),code:0,temperature:20,isDay:false };
  assert.equal(weatherKind(data),'normal');
  assert.equal(weatherKind({...data,isDay:true}),'sun');
  assert.equal(weatherKind({...data,code:71}),'snow');
  assert.equal(weatherKind({...data,code:66}),'rain');
  assert.equal(weatherKind({...data,code:61,observedAt:Date.now()-91*60000}),'normal');
});
test('weather caches requests, keeps data offline and clears data after city changes', async () => {
  let calls=0, fail=false;
  const service = new WeatherService('nonexistent-test-settings',async () => {
    calls++; if(fail) throw new Error('offline');
    return {current:{time:new Date().toISOString().slice(0,16),temperature_2m:18,weather_code:61,is_day:1}};
  });
  service.persist=()=>{};
  await service.refresh(); await service.refresh(); assert.equal(calls,1);
  fail=true; const offline=await service.refresh(true); assert.equal(offline.data.code,61); assert.equal(offline.error,'offline');
  const changed=await service.configure({enabled:true,city:'北京',latitude:39.9,longitude:116.4}); assert.equal(changed.data,null);
  await service.configure({enabled:false}); const before=calls; await service.refresh(true); assert.equal(calls,before);
});
