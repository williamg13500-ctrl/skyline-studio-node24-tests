import {parseBrief} from './engine.js';
export function parseInterpretation(text){
 const clean=String(text).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 const data=JSON.parse(clean);if(!data||typeof data!=='object'||Array.isArray(data)||!data.brief||typeof data.brief!=='object')throw Error('Invalid brief interpretation');
 const raw=data.brief,missing=[],unsupported=[],assumptions=[];
 for(const key of ['W','D','storeys','beds','baths']){
  if(raw[key]===null||raw[key]===undefined)missing.push(key);
  else if(typeof raw[key]!=='number'||!Number.isFinite(raw[key]))throw Error('Invalid numeric interpretation');
 }
 for(const [key,target]of [['unsupported',unsupported],['assumptions',assumptions]]){
  if(data[key]!==undefined){if(!Array.isArray(data[key]))throw Error('Invalid interpretation list');for(const item of data[key].slice(0,20)){if(typeof item!=='string')throw Error('Invalid interpretation item');target.push(item.slice(0,400));}}
 }
 const brief={name:typeof raw.name==='string'?raw.name.slice(0,60):'AI concept',W:raw.W??null,D:raw.D??null,storeys:raw.storeys??null,beds:raw.beds??null,baths:raw.baths??null,study:raw.study===true,roof:false,low:false};
 brief.style=raw.style??'modern';if(raw.rooms!==undefined)brief.rooms=raw.rooms;
 if(brief.storeys!==null&&brief.storeys!==1)unsupported.push('Multi-storey generation is paused pending stair headroom and escape-route verification.');
 if(!missing.length&&!unsupported.length)parseBrief(brief);
 return {brief,missing,unsupported,assumptions,ready:missing.length===0&&unsupported.length===0};
}