const {app,BrowserWindow}=require('electron');const fs=require('fs'),path=require('path');app.disableHardwareAcceleration();
app.whenReady().then(async()=>{try{
 const w=new BrowserWindow({width:390,height:844,useContentSize:true,show:false,webPreferences:{partition:'brand-check-'+Date.now(),backgroundThrottling:false}});
 await w.loadURL(process.env.WEB_URL||'https://songscope.pages.dev');
 const result=await w.webContents.executeJavaScript(`(async()=>{const logo=document.querySelector('.heroLogo img');await logo.decode();const manifest=await (await fetch('./manifest.webmanifest')).json();return {title:document.title,logo:logo.getAttribute('src'),width:document.documentElement.scrollWidth,viewport:innerWidth,shortName:manifest.short_name,oldName:document.title.includes('曲镜')||document.body.innerText.includes('曲镜')};})()`);
 if(result.oldName||result.shortName!=='SongScope'||result.width>result.viewport||!result.logo.includes('songscope-logo.png'))throw Error(JSON.stringify(result));
 fs.writeFileSync(path.join(__dirname,'../shots/songscope-selected-mobile.png'),(await w.capturePage()).toPNG());
 console.log(JSON.stringify(result));app.quit();
 }catch(e){console.error(e.message);app.exit(1);}});
