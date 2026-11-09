const {app,BrowserWindow}=require('electron');const fs=require('fs'),path=require('path');app.disableHardwareAcceleration();
app.whenReady().then(async()=>{try{
 const base=process.env.WEB_URL||'https://songscope.pages.dev';
 const w=new BrowserWindow({width:1080,height:760,show:false,webPreferences:{backgroundThrottling:false,partition:"verify-"+Date.now()}});
 await w.loadURL(base);
 const title=await w.webContents.executeJavaScript('document.title');
 if(!title.includes('SongScope'))throw Error('Unexpected title');
 const b64=fs.readFileSync(path.join(__dirname,'../fixtures/smoke.song')).toString('base64');
 const parsed=await w.webContents.executeJavaScript(`(async()=>{const b=Uint8Array.from(atob('${b64}'),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([b],'smoke.song'));document.querySelector('.landing').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));for(let i=0;i<80&&!document.querySelector('.app');i++)await new Promise(r=>setTimeout(r,100));return {loaded:!!document.querySelector('.app'),title:document.querySelector('.headerTitle')?.textContent};})()`);
 if(!parsed.loaded)throw Error('Web file parsing failed');
 await w.loadURL(base+'/icons?verify='+Date.now());
 const icons=await w.webContents.executeJavaScript(`(()=>{document.querySelector('[data-choice="E"]').click();return {choices:document.querySelectorAll('.option').length,selected:document.querySelector('.option.selected')?.dataset.choice};})()`);
 if(icons.choices!==3||icons.selected!=='E')throw Error('Icon selection failed');
 fs.writeFileSync(path.join(__dirname,'../shots/cloudflare-icons.png'),(await w.capturePage()).toPNG());
 console.log(JSON.stringify({url:base,title,parsed,icons}));app.quit();
 }catch(e){console.error(e.message);app.exit(1);}});
