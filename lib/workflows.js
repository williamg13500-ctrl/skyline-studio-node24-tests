import {db} from 'hatchable';
import {projectId} from './projects.js';
export async function ownedRevision(owner,body){
 const id=projectId(body.projectId);if(!id||!/^[a-f0-9]{64}$/.test(body.revision||''))return null;
 return (await db.query(`SELECT p.id,p.brief,p.revision FROM studio_projects p WHERE p.id=$1 AND p.owner_key=$2 AND p.revision=$3`,[id,owner,body.revision])).rows[0]||null;
}