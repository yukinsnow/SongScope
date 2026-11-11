import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { t as tr } from '../i18n';

// Height belongs to App so F2/F3 can remember their sizes independently.
export default function ResizablePanel({className, height, onHeight, children}: {
  className:string; height:number|null; onHeight:(height:number)=>void; children:ReactNode;
}) {
  const panel=useRef<HTMLElement>(null);
  const drag=useRef<{id:number;y:number;height:number}|null>(null);
  const [maximum,setMaximum]=useState(600);
  const minimum=Math.min(180,maximum);
  useLayoutEffect(()=>{
    const node=panel.current!;
    const measure=()=>{
      const workspace=node.parentElement?.querySelector('.workspace');
      // Reserve a visible part of the arrangement, even on small viewports.
      const max=Math.max(60,Math.floor(node.getBoundingClientRect().height+(workspace?.getBoundingClientRect().height||0)-80));
      setMaximum(max);
    };
    const observer=new ResizeObserver(measure);
    observer.observe(node.parentElement!);measure();
    return ()=>observer.disconnect();
  },[]);
  const clamp=(value:number)=>Math.round(Math.max(minimum,Math.min(maximum,value)));
  useEffect(()=>{
    const move=(e:PointerEvent)=>{const d=drag.current;if(d&&d.id===e.pointerId)onHeight(clamp(d.height+d.y-e.clientY));};
    const stop=()=>{drag.current=null;};
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',stop);
    window.addEventListener('pointercancel',stop);
    window.addEventListener('blur',stop);
    return ()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);window.removeEventListener('blur',stop);};
  },[minimum,maximum,onHeight]);
  const current=height===null?undefined:clamp(height);
  return <section ref={panel} className={className+' resizablePanel'} style={{height:current,maxHeight:maximum,minHeight:minimum}}>
    <div className="panelResizeHandle" role="separator" tabIndex={0} aria-orientation="horizontal"
      aria-label={tr('调整底部面板高度')} title={tr('上下拖动调整高度；方向键微调，双击恢复默认')}
      aria-valuemin={minimum} aria-valuemax={maximum} aria-valuenow={current??Math.min(maximum,className==='mixer'?300:440)}
      onPointerDown={e=>{if(!e.isPrimary||e.button!==0)return;e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,y:e.clientY,height:panel.current!.getBoundingClientRect().height};}}
      onDoubleClick={()=>onHeight(clamp(className==='mixer'?300:440))}
      onKeyDown={e=>{const h=panel.current!.getBoundingClientRect().height;
        const values:Record<string,number>={ArrowUp:h+(e.shiftKey?50:20),ArrowDown:h-(e.shiftKey?50:20),Home:minimum,End:maximum};
        if(e.key in values){e.preventDefault();onHeight(clamp(values[e.key]));}
      }}><span/></div>
    {children}
  </section>;
}
