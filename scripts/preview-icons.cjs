const {app,BrowserWindow}=require('electron');const path=require('path'),fs=require('fs');
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{const w=new BrowserWindow({width:1080,height:710,show:false});await w.loadFile(path.join(__dirname,'../public/icons.html'));await new Promise(r=>setTimeout(r,400));fs.mkdirSync(path.join(__dirname,'../shots'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../shots/icon-candidates.png'),(await w.capturePage()).toPNG());console.log('Icon sheet rendered');app.quit();});
