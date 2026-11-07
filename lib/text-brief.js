import {parseBrief} from './engine.js';
const values={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
const count=s=>Object.hasOwn(values,s)?values[s]:Number(s);
const amount='(\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)';
const names={W:'building width in metres',D:'building depth in metres',storeys:'number of storeys',beds:'bedroom count',baths:'bathroom count'};
export function interpretText(input){
 const text=String(input).toLowerCase().replace(/[–—]/g,'-').replace(/\bmeters?\b/g,'metres').replace(/\bfeet\b/g,'ft').replace(/\bhome office\b/g,'study');
 const brief={name:'Residential concept',W:null,D:null,storeys:null,beds:null,baths:null,study:false,roof:false,low:false},unsupported=[],assumptions=['Project name defaults to Residential concept; you can change it.'],conflicts=[];
 const matches=(pattern)=>[...text.matchAll(new RegExp(pattern,'g'))];
 function extract(key,pattern){const found=matches(pattern).map(m=>count(m[1]));if(new Set(found).size>1)conflicts.push('Conflicting '+names[key]+'.');else if(found.length)brief[key]=found[0];}
 extract('beds',amount+'\\s*[- ]?\\s*(?:bedrooms?|beds?)\\b');
 extract('baths',amount+'\\s*[- ]?\\s*(?:bathrooms?|baths?)\\b');
 extract('storeys',amount+'\\s*[- ]?\\s*(?:storeys?|stories|story|floors?)\\b');
 if(/\b(?:single[- ]storey|single[- ]story|bungalow)\b/.test(text)){
  if(brief.storeys!==null&&brief.storeys!==1)conflicts.push('Conflicting storey count.');else brief.storeys=1;
 }
 const unit='(?:m|metre|metres|ft)';
 const pairs=matches('(\\d+(?:\\.\\d+)?)\\s*('+unit+')?\\s*(?:by|x|×)\\s*(\\d+(?:\\.\\d+)?)\\s*('+unit+')?\\b');
 for(const pair of pairs){
  const u1=pair[2]||pair[4],u2=pair[4]||pair[2];
  if(!u1||!u2){conflicts.push('State the units for the building footprint, for example 14 m by 12 m.');continue;}
  const width=Number(pair[1])*(u1==='ft'?.3048:1),depth=Number(pair[3])*(u2==='ft'?.3048:1);
  if(brief.W!==null&&(Math.abs(brief.W-width)>1e-6||Math.abs(brief.D-depth)>1e-6))conflicts.push('More than one footprint was supplied. State one building footprint.');
  else{brief.W=width;brief.D=depth;if(u1==='ft'||u2==='ft')assumptions.push('Explicit feet dimensions were converted to metres.');assumptions.push('The first footprint dimension is width; the second is depth.');}
 }
 for(const [key,adjective]of [['W','wide|width'],['D','deep|depth|long|length']]){
  const found=matches('(\\d+(?:\\.\\d+)?)\\s*('+unit+')\\s*(?:'+adjective+')\\b');
  for(const item of found){const n=Number(item[1])*(item[2]==='ft'?.3048:1);if(brief[key]!==null&&Math.abs(brief[key]-n)>1e-6)conflicts.push('Conflicting '+names[key]+'.');else brief[key]=n;}
 }
 if(/\b(?:plot|land|site|lot)\b/.test(text)&&pairs.length)unsupported.push('Plot/site dimensions cannot be used as building dimensions. Describe only the building footprint in this step.');
 if(/\b(?:school|hospital|hotel|office|warehouse|shop|mall|factory|church|mosque|apartments?|duplex|commercial)\b/.test(text))unsupported.push('This generator currently supports one residential house, not this building type.');
 if(brief.storeys!==null&&brief.storeys!==1)unsupported.push('Multi-storey generation is paused pending stair headroom and escape-route verification.');
 if(/\b(?:l[- ]shaped|u[- ]shaped|irregular|circular|round footprint)\b/.test(text))unsupported.push('Only a rectangular building footprint is supported.');
 if(/\b(?:garage|pool|balcon(?:y|ies)|basement|terrace|verandah?|laundry|pantry|gym|prayer room|ensuite|en-suite|separate kitchen|separate dining)\b/.test(text))unsupported.push('Extra room types or separate kitchen/dining requests need a more capable layout generator and have not been applied.');
 if(/\b(?:facing|north|south|east|west|adjacent|next to|beside|near|away from|wheelchair|accessible|accessibility|structural|code compliant|permit)\b/.test(text))unsupported.push('Orientation, adjacency, accessibility, engineering and code requirements are not modelled by this generator.');
 brief.style=/\btraditional\b/.test(text)?'traditional':/\b(?:warm|rustic)\b/.test(text)?'warm':'modern';if(/\b(?:modern|traditional|contemporary|minimalist|rustic|warm)\b/.test(text))assumptions.push('Style controls schematic material colours only, not facade details or a photorealistic design.');if(/\bluxury\b/.test(text))unsupported.push('Luxury specifications require an explicit material and design brief.');
 brief.study=/\b(?:study|home office)\b/.test(text)&&!/(?:no|without)\s+(?:a\s+)?(?:study|home office)\b/.test(text);
 const missing=Object.keys(names).filter(key=>brief[key]===null),questions=missing.map(key=>'Please provide the '+names[key]+'.');
 let errors={};
 if(!missing.length&&brief.storeys>=1&&brief.storeys<=3){try{parseBrief(brief);}catch(error){errors=error.fields||{brief:'The extracted brief is outside the supported range.'};}}
 const ready=!missing.length&&!unsupported.length&&!conflicts.length&&!Object.keys(errors).length;
 return {source:'guided_text',brief,missing,questions,unsupported:[...new Set(unsupported)],assumptions:[...new Set(assumptions)],conflicts,errors,ready,
 limitations:['Only the extracted dimensions, storeys, room counts and study selection control this layout.','Exact room dimensions, furniture, facade details, access clearances and code compliance are not inferred.']};
}