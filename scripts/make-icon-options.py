from pathlib import Path
root=Path(__file__).resolve().parent.parent/'public'
variants={
'E':'''<rect x="18" y="21" width="24" height="6" rx="2.3" fill="#a7ead2"/><rect x="30" y="32" width="24" height="6" rx="2.3" fill="#67c8c1"/><rect x="18" y="43" width="14" height="6" rx="2.3" fill="#ddbf87"/><rect x="35" y="43" width="13" height="6" rx="2.3" fill="#ddbf87"/><path d="M22 17v34" stroke="#ecfff7" stroke-width="1.5" stroke-linecap="round"/><circle cx="22" cy="17" r="2" fill="#ecfff7"/>''',
'F':'''<path d="M16 16v33" stroke="#ecfff7" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="16" r="2.2" fill="#ecfff7"/><rect x="23" y="19" width="27" height="6" rx="2" fill="#a7ead2"/><rect x="23" y="30" width="20" height="6" rx="2" fill="#67c8c1"/><rect x="23" y="41" width="11" height="6" rx="2" fill="#ddbf87"/><rect x="37" y="41" width="13" height="6" rx="2" fill="#ddbf87"/>''',
'G':'''<path d="M24 15v35" stroke="#ecfff7" stroke-width="2" stroke-linecap="round"/><circle cx="24" cy="15" r="2.2" fill="#ecfff7"/><rect x="14" y="21" width="29" height="6" rx="3" fill="#a7ead2"/><rect x="28" y="32" width="23" height="6" rx="3" fill="#67c8c1"/><rect x="14" y="43" width="14" height="6" rx="3" fill="#ddbf87"/><rect x="32" y="43" width="13" height="6" rx="3" fill="#ddbf87"/>'''
}
labels={'E':('原结构','保留原来的交错关系，只去掉镜片'),'F':('整齐版','走带线独立在左，片段整齐排列'),'G':('圆润版','保留交错，比例更饱满、线条更清楚')}
for k,shape in variants.items():
 (root/f'brand/candidates/{k}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1d292f"/>{shape}</svg>')
old=(root/'icons.html').read_text()
style=old.split('<style>',1)[1].split('</style>',1)[0]
style=style.replace('repeat(4,1fr)','repeat(3,1fr)').replace('112px','132px')
style+='@media(max-width:700px){.grid{grid-template-columns:1fr}.option{display:grid;grid-template-columns:90px 1fr;column-gap:20px}.large{grid-row:1/4;margin:0}.sizes{margin-top:10px}}'
cards=''.join(f'<button class="option" data-choice="{k}" onclick="choose(\'{k}\')"><img class="large" src="./brand/candidates/{k}.svg"/><h2>{k} · {labels[k][0]}</h2><p>{labels[k][1]}</p><div class="sizes"><img width="32" src="./brand/candidates/{k}.svg"/><img width="20" src="./brand/candidates/{k}.svg"/><img width="16" src="./brand/candidates/{k}.svg"/></div></button>' for k in variants)
script="""function choose(k){localStorage.setItem('songscope-icon-choice',k);document.querySelectorAll('.option').forEach(e=>e.classList.toggle('selected',e.dataset.choice===k));document.getElementById('choice').textContent='已预选 '+k+' · 请在聊天中回复这个编号，尚未应用。'}const k=localStorage.getItem('songscope-icon-choice');if(['E','F','G'].includes(k))choose(k);"""
(root/'icons.html').write_text(f'''<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>曲镜 · 去镜片图标候选</title><style>{style}</style><main><header><small>SONGSCOPE / REFINED ICONS</small><h1>保留走带与片段，去掉镜片。</h1><p>沿用你喜欢的内部设计与三色搭配。<br>没有圆环、反光、同心线与渐变。现用图标暂未替换。</p></header><div class="grid">{cards}</div><p id="choice">选择方向：E / F / G</p><footer>下方小图为 32 / 20 / 16 像素预览；预选只保存在本机。<br><a href="./">返回曲镜</a></footer></main><script>{script}</script></html>''')
