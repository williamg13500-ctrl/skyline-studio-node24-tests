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
