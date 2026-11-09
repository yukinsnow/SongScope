"""Derive platform sizes/formats from the selected, unchanged icon source.
Requires Pillow: python3 -m pip install Pillow
"""
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parent.parent
im=Image.open(root/'public/brand/songscope-icon-source.png').convert('RGBA')
icon=im.resize((512,512),Image.Resampling.LANCZOS)
icon.save(root/'build/icon.png')
for size in (192,512):im.resize((size,size),Image.Resampling.LANCZOS).save(root/f'public/icon-{size}.png')
im.resize((180,180),Image.Resampling.LANCZOS).save(root/'public/apple-touch-icon.png')
icon.save(root/'build/icon.ico',sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
icon.save(root/'build/icon.icns')
print('PNG / ICO / ICNS / PWA icon formats generated')
