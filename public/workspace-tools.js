// Pure workspace helpers. View controls never alter the saved geometry.
(()=>{
 const targetBounds={Bed:[9,26],Bath:[3.6,10],Living:[22,65],Study:[6,18],Kitchen:[7,22],Dining:[8,24],Utility:[3,16]};
 const clone=x=>JSON.parse(JSON.stringify(x));
 const templates=[
  {id:'compact',title:'Compact home',description:'One storey · 3 bedrooms · 2 bathrooms · 10 × 12 m',brief:{name:'Compact home concept',W:10,D:12,storeys:1,beds:3,baths:2,study:false,style:'modern',roof:false,low:false}},
  {id:'family',title:'Family home',description:'One storey · 4 bedrooms · 2 bathrooms · 12 × 12 m',brief:{name:'Family home concept',W:12,D:12,storeys:1,beds:4,baths:2,study:false,style:'warm',roof:false,low:false}},
  {id:'studio',title:'Home with a study',description:'One storey · 3 bedrooms · 2 bathrooms · 11 × 13 m',brief:{name:'Home and study concept',W:11,D:13,storeys:1,beds:3,baths:2,study:true,style:'modern',roof:false,low:false}}
 ];
 function programFromGeometry(geometry){
  const rooms=[],indices={};geometry.floors.forEach((f,k)=>f.L.R.filter(r=>!r.hall).forEach(r=>{indices[r.id]=rooms.length;rooms.push({name:r.name,kind:r.kind,floor:k,weight:Math.max(3,Math.min(120,r.a||r.net?.area||r.w*r.h))});}));return {rooms,indices};
 }
 function viewOf(model,selected=-1){
  const selectedFloor=Number.isInteger(selected)&&selected>=0?selected:-1;
  const faces=selectedFloor<0?model.F:model.F.filter(f=>f.k===selectedFloor).map(f=>({...f,p:f.p.map(p=>[p[0],p[1],p[2]-selectedFloor*2.95])}));
  return {F:faces,W:model.W,D:model.D,H:selectedFloor<0?model.H:Math.max(1,...faces.flatMap(f=>f.p.map(p=>p[2])))+.3};
 }
 function editRoom(geometry,id,changes){
  const {rooms,indices}=programFromGeometry(geometry),index=indices[id];if(index===undefined)throw Error('Circulation is fixed by the solver.');
  const name=String(changes.name||'').trim(),weight=Number(changes.weight),floor=Number(changes.floor);
  if(!name||name.length>40)throw Error('Enter a room name of 1–40 characters.');
  if(!Number.isFinite(weight)||weight<3||weight>120)throw Error('Target area must be from 3 to 120 m².');
  if(!Number.isInteger(floor)||floor<0||floor>=geometry.floors.length)throw Error('Choose an existing floor.');
  const bounds=targetBounds[rooms[index].kind];if(bounds&&(weight<bounds[0]||weight>bounds[1]))throw Error('Target area for this room type must be '+bounds[0]+'–'+bounds[1]+' m² under studio planning limits.');
  rooms[index]={...rooms[index],name,weight,floor};if(geometry.floors.some((_,k)=>!rooms.some(r=>r.floor===k)))throw Error('Keep at least one programmed room on every floor.');
  return rooms;
 }
 globalThis.SkylineWorkspace={targetBounds,templates:clone(templates),programFromGeometry,viewOf,editRoom};
})();