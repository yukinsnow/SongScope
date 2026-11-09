// Convert the selected raster app icon into platform formats. Requires Python + Pillow.
const {execFileSync}=require('child_process');const path=require('path');
execFileSync(process.platform==='win32'?'python':'python3',[path.join(__dirname,'build-platform-icons.py')],{stdio:'inherit'});
