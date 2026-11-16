const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ width:256, height:256, show:false, transparent:true, frame:false, webPreferences:{ offscreen:true } });
    const svg = fs.readFileSync(path.join(__dirname,'../assets/ookujira.svg'),'utf8');
    await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<style>html,body{margin:0;background:transparent}svg{width:256px;height:256px}</style>'+svg));
    const shot = await win.webContents.capturePage();
    const png = shot.resize({width:256,height:256}).toPNG();
    fs.writeFileSync(path.join(__dirname,'../assets/ookujira.png'),png);
    const sizes = [16,32,48,64,128,256];
    const blobs = sizes.map(size => nativeImage.createFromBuffer(png).resize({width:size,height:size}).toPNG());
    const header = Buffer.alloc(6+16*sizes.length); header.writeUInt16LE(1,2); header.writeUInt16LE(sizes.length,4);
    let offset = header.length;
    sizes.forEach((size,i) => { const pos=6+i*16; header[pos]=size%256; header[pos+1]=size%256; header.writeUInt16LE(1,pos+4); header.writeUInt16LE(32,pos+6); header.writeUInt32LE(blobs[i].length,pos+8); header.writeUInt32LE(offset,pos+12); offset+=blobs[i].length; });
    fs.writeFileSync(path.join(__dirname,'../assets/ookujira.ico'),Buffer.concat([header,...blobs]));
  } catch(error) { console.error(error); process.exitCode=1; }
  app.quit();
});
