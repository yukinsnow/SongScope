const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');const path=require('node:path');
app.disableHardwareAcceleration();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{try{
 const w=new BrowserWindow({width:1280,height:900,useContentSize:true,show:true,webPreferences:{backgroundThrottling:false}});
 if(process.env.TEST_URL)await w.loadURL(process.env.TEST_URL);else await w.loadFile(path.resolve(__dirname,'../dist/index.html'));
 w.webContents.debugger.attach('1.3');
 const run=s=>w.webContents.executeJavaScript(s).catch(e=>{console.error('Renderer operation failed:',s);throw e});
 await run("document.querySelector('.demoOpen').click()");await pause(500);for(let n=0;n<150&&!(await run("!!document.querySelector('.toolbar')"));n++)await pause(100);assert(await run("!!document.querySelector('.toolbar')"),'demo loaded');
 const key=async k=>{await run(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'${k}',bubbles:true}))`);await pause(120)};
 const box=()=>run("(()=>{const p=document.querySelector('.resizablePanel'),h=p.querySelector('.panelResizeHandle').getBoundingClientRect();return {height:p.getBoundingClientRect().height,x:Math.round(h.x+h.width/2),y:Math.round(h.y+h.height/2),workspace:document.querySelector('.workspace').getBoundingClientRect().height}})()");
 for(const mode of ['F3','F2']){
  await key(mode); if(mode==='F2'){await run("document.querySelector('.clip:not(.audioClip)').click()");await pause(80)}
  w.focus();w.webContents.focus();await pause(120);const before=await box();
  const mouse=(type,y,buttons)=>w.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,x:before.x,y,button:type==='mouseMoved'?'none':'left',buttons,clickCount:type==='mouseMoved'?0:1});
  await mouse('mouseMoved',before.y,0);await mouse('mousePressed',before.y,1);await pause(80);
  await mouse('mouseMoved',before.y-130,1);await pause(80);await mouse('mouseReleased',before.y-130,0);await pause(120);
  const bigger=await box();assert(bigger.height>before.height+60,mode+' grows with mouse');assert(bigger.workspace>=79,mode+' preserves arrangement');
  await run("document.querySelector('.panelResizeHandle').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))");await pause(80);assert((await box()).workspace>=79,'max clamped');require('node:fs').writeFileSync(path.resolve(__dirname,'../logs/resized-'+mode+'.png'),(await w.capturePage()).toPNG());
  await run("document.querySelector('.panelResizeHandle').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))");await pause(80);assert((await box()).height<=181,'min clamped');
  await key(mode);await key(mode);assert((await box()).height<=181,'size remembered after reopen');
  console.log(mode+' mouse, bounds, keyboard, reopen passed');
 }
 await w.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled',{enabled:true});
 const start=await box();const touch=(type,y)=>w.webContents.debugger.sendCommand('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x:start.x,y,id:1}]});
 await touch('touchStart',start.y);await touch('touchMove',start.y-140);await touch('touchEnd',start.y-140);await pause(100);assert((await box()).height>start.height+80,'touch grows panel');
 w.setContentSize(390,600);await pause(200);assert((await box()).workspace>=79,'small viewport clamp');
 console.log('Touch and small viewport passed');app.quit();
}catch(e){console.error(e);app.exit(1)}});
