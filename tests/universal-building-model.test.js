import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createUniversalBuildingModel,
  validateUniversalBuildingModel,
  duplicateBuildingFloor,
  replaceBuildingFloorLayout
} from '../lib/universal-building-model.js';

const layout = (suffix='g') => ({
  W: 12, D: 10,
  R: [{id:`room-${suffix}`,name:'Living',kind:'Living',x:0,y:0,w:6,h:10}],
  S: [[0,0,12,0,true,`wall-${suffix}`]],
  O: [{id:`opening-${suffix}`,t:'win',a:[1,0],b:[2,0],in:[1,0],n:[0,1]}],
  E: []
});
const legacy = () => ({units:'m',height:2.7,floors:[{id:'ground',label:'Ground Floor',L:layout('g')}]});

test('legacy single-floor geometry upgrades without changing its authoritative layout',()=>{
  const source=legacy(), upgraded=createUniversalBuildingModel(source,{coordinateFrameId:'building-origin'});
  assert.equal(upgraded.buildingModel.schema,'skyline.universal-building');
  assert.equal(upgraded.buildingModel.schemaVersion,1);
  assert.deepEqual(upgraded.floors[0].L,source.floors[0].L);
  assert.equal(upgraded.floors[0].elevation,null);
  assert.equal(validateUniversalBuildingModel(upgraded).status,'not_checked');
});

test('explicit single-floor model passes building-envelope checks',()=>{
  const model=createUniversalBuildingModel(legacy(),{coordinateFrameId:'origin'});
  model.floors[0].elevation=0;
  assert.equal(validateUniversalBuildingModel(model).status,'passed');
});

test('floor duplication requires explicit elevation and height and assigns globally unique element IDs',()=>{
  const model=createUniversalBuildingModel(legacy(),{coordinateFrameId:'origin'});
  model.floors[0].elevation=0;
  assert.throws(()=>duplicateBuildingFloor(model,'ground',{id:'first'}),/elevation/);
  const next=duplicateBuildingFloor(model,'ground',{id:'first',label:'First Floor',elevationM:3.2,floorToFloorHeightM:3.2});
  assert.equal(next.floors.length,2);
  assert.notEqual(next.floors[1].L.R[0].id,next.floors[0].L.R[0].id);
  assert.notEqual(next.floors[1].L.S[0][5],next.floors[0].L.S[0][5]);
  assert.notEqual(next.floors[1].L.O[0].id,next.floors[0].L.O[0].id);
  assert.equal(validateUniversalBuildingModel(next).status,'passed');
});

test('floor elevations and declared heights must agree and remain ordered',()=>{
  const model=createUniversalBuildingModel(legacy(),{coordinateFrameId:'origin'});
  model.floors[0].elevation=0;
  const two=duplicateBuildingFloor(model,'ground',{id:'first',elevationM:3.2,floorToFloorHeightM:3.2});
  two.floors[1].elevation=3.5;
  assert.equal(validateUniversalBuildingModel(two).status,'failed');
  assert.ok(validateUniversalBuildingModel(two).issues.some(i=>i.code==='floor_height_mismatch'));
});

test('floor identities and element identities are unique across the whole building',()=>{
  const model=createUniversalBuildingModel(legacy(),{coordinateFrameId:'origin'});
  model.floors[0].elevation=0;
  const two=duplicateBuildingFloor(model,'ground',{id:'first',elevationM:3,floorToFloorHeightM:3});
  two.floors[1].L.R[0].id=two.floors[0].L.R[0].id;
  const result=validateUniversalBuildingModel(two);
  assert.equal(result.status,'failed');
  assert.ok(result.issues.some(i=>i.code==='building_element_identity_invalid'));
});

test('floor count is data-driven and supports a five-floor coordinated stack',()=>{
  let model=createUniversalBuildingModel(legacy(),{coordinateFrameId:'origin'});
  model.floors[0].elevation=0;
  for(let i=1;i<5;i++)model=duplicateBuildingFloor(model,model.floors[i-1].id,{
    id:`floor-${i+1}`,label:`Floor ${i+1}`,elevationM:i*3.2,floorToFloorHeightM:3.2
  });
  assert.equal(model.floors.length,5);
  assert.equal(validateUniversalBuildingModel(model).status,'passed');
});

test('editing one floor leaves other floor layouts unchanged',()=>{
  let model=createUniversalBuildingModel(legacy(),{coordinateFrameId:'origin'});
  model.floors[0].elevation=0;
  model=duplicateBuildingFloor(model,'ground',{id:'first',elevationM:3,floorToFloorHeightM:3});
  const before=structuredClone(model.floors[0].L);
  const replacement={...structuredClone(model.floors[1].L),W:14};
  const edited=replaceBuildingFloorLayout(model,'first',replacement);
  assert.deepEqual(edited.floors[0].L,before);
  assert.equal(edited.floors[1].L.W,14);
});

test('missing coordinate frame and elevation evidence remain not_checked, not silently passed',()=>{
  const model=createUniversalBuildingModel(legacy());
  const result=validateUniversalBuildingModel(model);
  assert.equal(result.status,'not_checked');
  assert.ok(result.issues.some(i=>i.code==='building_coordinate_frame_missing'));
  assert.ok(result.issues.some(i=>i.code==='floor_elevation_missing'));
});

import { registerHooks } from 'node:module';

test('universal building save and restore use owner-scoped immutable project revisions without legacy renderer', async()=>{
  const state={queries:[],saved:null,stored:null};
  const hatchable=`const s=globalThis.__universalApiTest;
    export const admin={check:async()=>false,profile:async()=>({handle:'test'})};
    export const auth={getUser:async req=>req.user};
    export const config={get:async()=> 'subscribers'};
    export const db={query:async(sql,args)=>{
      s.queries.push({sql,args});
      if(sql.includes('FROM subscriptions'))return {rows:[{ok:1}]};
      if(sql.includes('WITH created')){s.saved={sql,args};return {rows:[{id:'12',version:1,revision:args[3]}]};}
      if(sql.includes('FROM studio_revisions r JOIN studio_projects'))return {rows:s.stored?[s.stored]:[]};
      return {rows:[]};
    }};`;
  globalThis.__universalApiTest=state;
  registerHooks({resolve(specifier,context,next){
    if(specifier==='hatchable')return {url:'data:text/javascript,'+encodeURIComponent(hatchable),shortCircuit:true};
    return next(specifier,context);
  }});
  const {default:projects}=await import('../api/studio/projects.js');
  const {revisionFor}=await import('../lib/engine.js');
  const base=createUniversalBuildingModel(legacy(),{id:'building-1',name:'Tower concept',coordinateFrameId:'origin'});
  base.floors[0].elevation=0;
  const geometry=duplicateBuildingFloor(base,'ground',{id:'level-1',label:'First Floor',elevationM:3.2,floorToFloorHeightM:3.2});
  const revision=await revisionFor(geometry);
  const response=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(v){this.code=v;return this;},json(v){this.body=v;return this;}});
  const saved=response();
  await projects({method:'POST',user:{id:'owner-1',email:'owner@example.test'},body:{
    operation:{type:'universal-building-save'},brief:{name:'Tower concept'},geometry,revision
  }},saved);
  assert.equal(saved.code,201);
  assert.match(state.saved.sql,/owner_key/);
  assert.match(state.saved.sql,/INSERT INTO studio_revisions/);
  assert.equal(state.saved.args[0],'user:owner-1');
  state.stored={brief:{name:'Tower concept'},geometry,revision};
  const restored=response();
  await projects({method:'POST',user:{id:'owner-1',email:'owner@example.test'},body:{
    operation:{type:'restore'},projectId:'12',version:1
  }},restored);
  assert.equal(restored.code,200);
  assert.equal(restored.body.reportMode,'universal_building_geometry_only');
  assert.equal(restored.body.geometry.floors.length,2);
  assert.equal(restored.body.model,null);
  assert.equal(restored.body.validation.constructionExportAllowed,false);
});
