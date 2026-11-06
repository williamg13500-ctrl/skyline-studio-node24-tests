import {admin,db} from 'hatchable';
export async function ownerKey(req,user){
 if(user.role==='admin'){
  const profile=await admin.profile(req);
  if(!profile?.handle)throw Error('Administrative identity unavailable.');
  return 'admin:'+String(profile.handle);
 }
 if(!user.id)throw Error('User identity unavailable.');
 return 'user:'+String(user.id);
}
export function projectId(value){const s=String(value??'');return /^[1-9][0-9]{0,17}$/.test(s)?s:null;}
export async function saveProject(owner,body,draft){
 const args=[draft.brief.name,JSON.stringify(draft.brief),draft.revision];
 if(body.id!==undefined&&body.id!==null){
  const id=projectId(body.id),version=Number(body.expectedVersion);
  if(!id||!Number.isSafeInteger(version)||version<1)return {status:400,error:'invalid_project_version'};
  const result=await db.query(`WITH changed AS (
   UPDATE studio_projects SET name=$1,brief=$2::jsonb,revision=$3,version=version+1,updated_at=NOW()
   WHERE id=$4 AND owner_key=$5 AND version=$6 RETURNING *
  ), appended AS (
   INSERT INTO studio_revisions(project_id,version,brief,geometry,validation,revision)
   SELECT id,version,brief,$7::jsonb,$8::jsonb,revision FROM changed RETURNING id
  ) SELECT changed.id,changed.version,changed.revision FROM changed JOIN appended ON TRUE`,[...args,id,owner,version,JSON.stringify(draft.geometry),JSON.stringify(draft.validation)]);
  if(!result.rows.length)return {status:409,error:'project_conflict',message:'This project changed or is unavailable. Reopen it before saving.'};
  return {status:200,project:result.rows[0]};
 }
 const result=await db.query(`WITH created AS (
  INSERT INTO studio_projects(owner_key,name,brief,revision) VALUES ($1,$2,$3::jsonb,$4) RETURNING *
 ), appended AS (
  INSERT INTO studio_revisions(project_id,version,brief,geometry,validation,revision)
  SELECT id,version,brief,$5::jsonb,$6::jsonb,revision FROM created RETURNING id
 ) SELECT created.id,created.version,created.revision FROM created JOIN appended ON TRUE`,[owner,...args,JSON.stringify(draft.geometry),JSON.stringify(draft.validation)]);
 return {status:201,project:result.rows[0]};
}