import type { TempoChange, MeterChange } from './types';

function ordered<T extends {beat:number}>(events:T[]):T[]{
  const byBeat=new Map<number,T>();
  for(const event of events)if(Number.isFinite(event.beat)&&event.beat>=0)byBeat.set(event.beat,event);
  return [...byBeat.values()].sort((a,b)=>a.beat-b.beat);
}
export function readTimeMaps(doc:Document, fallbackTempo:number|null, fallbackMeter:string|null){
  const tempoMap=ordered(Array.from(doc.getElementsByTagName('TempoMapSegment')).flatMap(el=>{
    const seconds=Number(el.getAttribute('tempo')),beat=Number(el.getAttribute('start')||0);
    if(!(seconds>0&&Number.isFinite(seconds)))return [];
    return [{beat,bpm:60/seconds,curveType:Number(el.getAttribute('curveType')||0),raw:Object.fromEntries(Array.from(el.attributes).map(a=>[a.name,a.value]))}];
  }));
  if(!tempoMap.some(e=>e.beat===0))tempoMap.unshift({beat:0,bpm:fallbackTempo||120,curveType:0,raw:{}});
  const meterMap=ordered(Array.from(doc.getElementsByTagName('TimeSignatureMapSegment')).flatMap(el=>{
    const numerator=Number(el.getAttribute('numerator')),denominator=Number(el.getAttribute('denominator'));
    if(!(numerator>0&&Number.isInteger(numerator)&&denominator>0&&Number.isInteger(Math.log2(denominator))))return [];
    return [{beat:Number(el.getAttribute('start')||0),numerator,denominator}];
  }));
  if(!meterMap.some(e=>e.beat===0)){
    const [n,d]=(fallbackMeter||'4/4').split('/').map(Number);
    meterMap.unshift({beat:0,numerator:n||4,denominator:d||4});
  }
  return {tempoMap,meterMap};
}
export function tempoAt(map:TempoChange[],beat:number):TempoChange{
  return [...map].reverse().find(e=>e.beat<=beat)??{beat:0,bpm:120,curveType:0,raw:{}};
}
export function meterAt(map:MeterChange[],beat:number):MeterChange{
  return [...map].reverse().find(e=>e.beat<=beat)??{beat:0,numerator:4,denominator:4};
}
export interface BarMark extends MeterChange {number:number}
/** Positions are quarter-note beats. A meter change starts a new bar, even after a partial bar. */
export function buildBars(map:MeterChange[],end:number):BarMark[]{
  const events=ordered(map);const bars:BarMark[]=[];let beat=0,number=1,index=0;
  while(beat<=end+8&&bars.length<20000){
    while(index+1<events.length&&events[index+1].beat<=beat+1e-8)index++;
    const meter=events[index]??{beat:0,numerator:4,denominator:4};
    bars.push({...meter,beat,number:number++});
    const next=events[index+1]?.beat??Infinity;
    beat=Math.min(beat+meter.numerator*4/meter.denominator,next);
  }
  return bars;
}
export function formatPosition(beat:number,bars:BarMark[]):string{
  let low=0,high=bars.length-1;
  while(low<high){const mid=Math.ceil((low+high)/2);if(bars[mid].beat<=beat)low=mid;else high=mid-1;}
  const bar=bars[low];if(!bar)return '1.1';
  return `${bar.number}.${Number((1+(beat-bar.beat)/(4/bar.denominator)).toFixed(3))}`;
}
/** Rebase a single-clip export; arranged exports use the original global beat positions. */
export function rebaseTimeMaps(tempoMap:TempoChange[],meterMap:MeterChange[],origin:number,end:number){
  return {
    tempoMap:[{...tempoAt(tempoMap,origin),beat:0},...tempoMap.filter(e=>e.beat>origin&&e.beat<=end).map(e=>({...e,beat:e.beat-origin}))],
    meterMap:[{...meterAt(meterMap,origin),beat:0},...meterMap.filter(e=>e.beat>origin&&e.beat<=end).map(e=>({...e,beat:e.beat-origin}))],
  };
}
