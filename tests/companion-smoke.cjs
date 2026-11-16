const {app, BrowserWindow, Notification}=require('electron');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path'), assert=require('node:assert/strict');
const temp=process.env.WHALE_TEST_USER_DATA;
if (!temp) throw new Error('Run through npm run test:companion');
app.setPath('userData',temp); Notification.isSupported=()=>false;
const {WeatherService}=require('../weather-service');
WeatherService.prototype.refresh=async function(){return this.snapshot();};
WeatherService.prototype.search=async()=>[{city:'北京 · 中国',latitude:39.9,longitude:116.4}];
require('../main');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const js=(win,code)=>win.webContents.executeJavaScript(code,true);
const shot=async(win,name)=>{await pause(200);fs.writeFileSync(path.join(__dirname,'../.screenshots/'+name+'.png'),(await win.webContents.capturePage()).toPNG());};
app.whenReady().then(async()=>{
 try {
  const main=BrowserWindow.getAllWindows()[0]; await pause(1800);
  await js(main,`document.getElementById('weatherOpen').click()`);
  assert.equal(await js(main,`document.getElementById('weatherDialog').open`),true);
  await js(main,`document.getElementById('weatherCity').value='北京';document.getElementById('weatherSearchForm').requestSubmit()`); await pause(100);
  await js(main,`document.querySelector('#weatherResults button').click()`);await pause(100);
  assert.match(await js(main,`document.getElementById('weatherDetail').textContent`),/北京/);
  await shot(main,'ookujira-weather-settings');
  await js(main,`document.getElementById('weatherDialog').close();window.api.togglePet()`);await pause(1000);
  const pet=BrowserWindow.getAllWindows().find(w=>w!==main);
  pet.webContents.send('pet:command','wake');await pause(1500);
  pet.webContents.send('pet:command','sit');await pause(1600);
  assert.equal(await js(pet,'lifeFrame'),3);await shot(pet,'ookujira-sit');
  pet.webContents.send('pet:command','pillow');await pause(4400);
  assert.equal(await js(pet,'motion.mode'),'sleep');await shot(pet,'ookujira-pillow');
  pet.webContents.send('pet:command','wake');await pause(1500);
  const data={enabled:true,data:{code:61,temperature:18,isDay:true,observedAt:Date.now()}};
  pet.webContents.send('weather:changed',data);await pause(100);
  await js(pet,'chooseWeather()');await pause(900);
  assert.equal(await js(pet,'lifeFrame'),7);await shot(pet,'ookujira-rain');
  pet.webContents.send('weather:changed',{...data,enabled:false});await pause(800);
  assert.equal(await js(pet,'motion.mode'),'idle');
  pet.webContents.send('pet:focus',true);await pause(100);
  pet.webContents.send('weather:changed',data);await pause(100);await js(pet,'chooseWeather()');
  assert.equal(await js(pet,'motion.mode'),'idle');
  await shot(main,'ookujira-calendar');
  console.log('PASS: city search/select, persistent sit, pillow sleep, wake transition, umbrella, disabled weather, focus suppression.');
 }catch(error){console.error(error);process.exitCode=1;}
 finally { app.exit(process.exitCode||0); }
});
