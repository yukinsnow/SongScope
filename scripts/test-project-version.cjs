// Metadata tests only: no DAW/plugin is started and no project is uploaded.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ show: false });
    await win.loadURL('about:blank');
    const bundle = esbuild.buildSync({
      stdin: { contents: "export {readProjectVersion} from './src/lib/project-version'; export {readSong} from './src/lib/song'; export {default as JSZip} from 'jszip';", resolveDir: process.cwd() },
      bundle: true, write: false, format: 'iife', globalName: 'ProjectVersionTest', platform: 'browser',
    }).outputFiles[0].text;
    await win.webContents.executeJavaScript(bundle);
    const cases = [
      ['Studio One/7.0.2.103197', '7.0.2.103197'],
      ['StudioOne/6.6.2.100548', '6.6.2.100548'],
      ['Studio Pro/8.2.0.114903', '8.2.0.114903'],
      ['Fender Studio Pro/8.1.2.113407', '8.1.2.113407'],
      ['studio one / 7.0', '7.0'],
      [' Studio One 6.5 ', '6.5'],
      ['Studio One', null],
      ['Studio Pro', null],
    ];
    for (const [generator, version] of cases) {
      const result = await win.webContents.executeJavaScript(`ProjectVersionTest.readProjectVersion(${JSON.stringify({ 'Document:Generator': generator, 'Document:FormatVersion': '9' })})`);
      assert.equal(result.softwareName, 'Studio One / Fender Studio Pro');
      assert.equal(result.softwareVersion, version);
      assert.equal(result.formatVersion, '9');
      assert.equal(result.rawGenerator, generator, 'raw metadata is not rewritten');
    }
    for (const generator of ['Reaper/7.0', 'Not Studio One/7.0', 'Studio OnePlus/7.0', 'StudioOne8', 'Studio One/7..0', 'Studio Pro/8.2-script', 'Studio Pro/8.2.0.1.99', '']) {
      const result = await win.webContents.executeJavaScript(`ProjectVersionTest.readProjectVersion(${JSON.stringify({ 'Document:Generator': generator })})`);
      assert.equal(result.softwareName, null, generator);
      assert.equal(result.softwareVersion, null, generator);
    }
    for (const format of ['', '9.1', '-9', '9<script>', 'version9']) {
      const result = await win.webContents.executeJavaScript(`ProjectVersionTest.readProjectVersion(${JSON.stringify({ 'Document:FormatVersion': format })})`);
      assert.equal(result.formatVersion, null);
      assert.equal(result.softwareVersion, null);
    }
    const synthetic = await win.webContents.executeJavaScript(`(async()=>{
      const z=new ProjectVersionTest.JSZip();
      z.file('Song/song.xml','<?xml version="1.0"?><Song version="99.0"><Attributes x:id="Root"><List x:id="Tracks"/></Attributes></Song>');
      z.file('metainfo.xml','<?xml version="1.0"?><MetaInformation><Attribute x:id="Document:Generator" value="Fender Studio Pro/8.2.0.114903"/><Attribute x:id="Document:FormatVersion" value="9"/><Attribute x:id="Document:Title" value="Version test"/></MetaInformation>');
      const song=await ProjectVersionTest.readSong('version.song',await z.generateAsync({type:'arraybuffer'}));
      z.remove('metainfo.xml');
      const unknown=await ProjectVersionTest.readSong('unknown.song',await z.generateAsync({type:'arraybuffer'}));
      return {version:song.projectVersion,metadata:song.metadata,unknown:unknown.projectVersion};
    })()`);
    assert.equal(synthetic.version.softwareVersion, '8.2.0.114903');
    assert.equal(synthetic.version.formatVersion, '9');
    assert.equal(synthetic.metadata['Document:Generator'], 'Fender Studio Pro/8.2.0.114903');
    assert.equal(synthetic.metadata['Document:Title'], 'Version test');
    assert.equal(synthetic.unknown.softwareVersion, null, 'Song@version and XML declaration are not application versions');
    assert.equal(synthetic.unknown.formatVersion, null);
    console.log('PASS: exact product aliases, saved build versions, invalid/unknown fields, x:id metadata and no XML/root-version guessing');

    const inbound = '/home/ubuntu/.openclaw/media/inbound';
    const comparison = fs.existsSync(inbound) ? fs.readdirSync(inbound).find(n => n.endsWith('5a018938-d1ed-451c-8932-6fe03b9b6eef.zip')) : null;
    const samples = [['/tmp/s1real/song.zip', '8.1.2.113407']];
    if (comparison) samples.push([path.join(inbound, comparison), '8.2.0.114903']);
    for (const [file, expected] of samples) {
      if (!fs.existsSync(file)) continue;
      const b64 = fs.readFileSync(file).toString('base64');
      const result = await win.webContents.executeJavaScript(`(async()=>{const b=Uint8Array.from(atob('${b64}'),c=>c.charCodeAt(0));const song=await ProjectVersionTest.readSong('private.song',b.buffer);return {version:song.projectVersion,generator:song.metadata['Document:Generator']};})()`);
      assert.equal(result.version.softwareName, 'Studio One / Fender Studio Pro');
      assert.equal(result.version.softwareVersion, expected);
      assert.equal(result.version.formatVersion, '9');
      assert.equal(result.version.rawGenerator, result.generator);
      console.log('PASS: authorized local real project saved application ' + expected + ', document format 9; original metadata preserved');
    }
    app.quit();
  } catch (error) { console.error(error); app.exit(1); }
});
