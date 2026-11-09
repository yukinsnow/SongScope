const {app,BrowserWindow}=require('electron');const fs=require('fs'),path=require('path');app.disableHardwareAcceleration();
app.whenReady().then(async()=>{try{
 const w=new BrowserWindow({width:1200,height:3500,useContentSize:true,show:false,webPreferences:{backgroundThrottling:false,partition:'logo-review-'+Date.now()}});
 if(process.env.WEB_URL)await w.loadURL(process.env.WEB_URL);else await w.loadFile(path.join(__dirname,'../public/brand/round-3/index.html'));
 const result=await w.webContents.executeJavaScript(`(async()=>{const images=[...document.querySelectorAll('.card img')];images.forEach(i=>i.loading='eager');const outcomes=await Promise.allSettled(images.map(i=>i.decode()));document.querySelector('.card').click();const dialogWorks=document.querySelector('dialog').open;document.querySelector('dialog').close();return {cards:images.length,loaded:images.filter(i=>i.naturalWidth>0).length,dialogWorks,failed:images.filter(i=>!i.naturalWidth).map(i=>i.src)};})()`);
 if(result.cards!==10||result.loaded!==10||!result.dialogWorks)throw Error(JSON.stringify(result));
 fs.writeFileSync(path.join(__dirname,'../shots/logo-round3-sheet.png'),(await w.capturePage()).toPNG());
 console.log(JSON.stringify(result));app.quit();
}catch(e){console.error(e.message);app.exit(1);}});
