// Render the editable SVG once; derive platform assets from its raster output.
const {app,BrowserWindow}=require('electron');
const path=require('path'),fs=require('fs');
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 const w=new BrowserWindow({width:512,height:512,useContentSize:true,transparent:true,backgroundColor:"#00000000",show:false,webPreferences:{offscreen:true}});
 await w.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html style="margin:0;background:transparent"><body style="margin:0">'+fs.readFileSync(path.join(__dirname,'../public/icon.svg'),'utf8')+'</body></html>'));
 await new Promise(r=>setTimeout(r,500));
 fs.writeFileSync(path.join(__dirname,'../build/icon.png'),(await w.capturePage()).toPNG());app.quit();
});
