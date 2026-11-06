import {storage,db} from 'hatchable';
import crypto from 'node:crypto';
import {identify,requireBuild} from '../../lib/access.js';
import {ownerKey} from '../../lib/projects.js';
import {requestId,sendUnexpectedFailure} from '../../lib/http-errors.js';
import {beginRequestLog} from '../../lib/request-logging.js';
import {guardStudioRequest} from '../../lib/request-limits.js';
import {isValidDateOnly} from '../../lib/site-document-validation.js';
export const access='user';
export const methods=['GET','POST'];
const MAX_BYTES=8*1024*1024;
const TYPES={pdf:{mime:'application/pdf',ext:'pdf'},jpeg:{mime:'image/jpeg',ext:'jpg'},png:{mime:'image/png',ext:'png'},webp:{mime:'image/webp',ext:'webp'}};
function detectType(b){
 if(b.length>=5&&b.subarray(0,5).toString('ascii')==='%PDF-')return TYPES.pdf;
 if(b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return TYPES.jpeg;
 if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return TYPES.png;
 if(b.length>=12&&b.subarray(0,4).toString('ascii')==='RIFF'&&b.subarray(8,12).toString('ascii')==='WEBP')return TYPES.webp;
 return null;
}
function cleanFilename(s){return String(s||'site-document').split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,180)||'site-document';}
function positiveInt(v){const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:null;}
export default async function(req,res){
 const rid=requestId();res.setHeader('Cache-Control','no-store');res.setHeader('X-Request-Id',rid);
 const log=beginRequestLog(req,res,{request_id:rid,endpoint:'/api/studio/site-documents',mode:req.method==='GET'?'site-document-read':'site-document-upload'});
 let storedKey=null;
 try{
  if(!await guardStudioRequest(req,res,{route:'studio.site-documents',limit:12,maxBytes:MAX_BYTES+65536}))return;
  const platformUser=req.user,user=await identify(req);if(!platformUser||!requireBuild(user,res))return;
  const owner=await ownerKey(req,user);
  if(req.method==='GET'){
   const id=req.query?.id!==undefined?positiveInt(req.query.id):null;
   if(req.query?.id!==undefined&&!id)return res.status(400).json({error:'invalid_document_id'});
   if(id){
    const row=(await db.query('SELECT id,storage_key,content_type,original_filename,sha256,byte_size FROM studio_site_documents WHERE id=$1 AND owner_key=$2',[id,owner])).rows[0];
    if(!row)return res.status(404).json({error:'document_not_found'});
    const url=await storage.url(row.storage_key,{ttl:30});
    res.setHeader('Cache-Control','no-store');return res.redirect(302,url);
   }
   const siteId=positiveInt(req.query?.siteId);if(!siteId)return res.status(400).json({error:'site_id_required'});
   const site=(await db.query('SELECT id FROM studio_site_contexts WHERE id=$1 AND owner_key=$2',[siteId,owner])).rows[0];
   if(!site)return res.status(404).json({error:'site_context_not_found'});
   const rows=await db.query('SELECT id,site_version,original_filename,content_type,byte_size,sha256,source_type,source_reference,evidence_status,document_date,note,created_at FROM studio_site_documents WHERE site_context_id=$1 AND owner_key=$2 ORDER BY created_at DESC LIMIT 100',[siteId,owner]);
   return res.json({documents:rows.rows});
  }
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  const body=req.body||{},siteId=positiveInt(body.siteContextId),version=positiveInt(body.siteVersion);
  if(!siteId||!version)return res.status(400).json({error:'site_revision_required'});
  const sourceTypes=['survey','title_plan','authority_record','professional_observation','map_reference','other'];
  const statuses=['provided','verified','estimated','unknown','conflicting'];
  const sourceType=String(body.sourceType||''),status=String(body.evidenceStatus||'provided'),reference=String(body.sourceReference||'').trim().slice(0,240);
  if(!sourceTypes.includes(sourceType)||!statuses.includes(status)||!reference)return res.status(400).json({error:'invalid_document_provenance'});
  const date=body.documentDate?String(body.documentDate):null;
  if(date&&!isValidDateOnly(date))return res.status(400).json({error:'invalid_document_date'});
  const file=(req.files||[]).find(f=>f.field==='file');
  if(!file||!file.buffer)return res.status(400).json({error:'document_file_required'});
  if(file.buffer.length===0)return res.status(400).json({error:'empty_document'});
  if(file.buffer.length>MAX_BYTES)return res.status(413).json({error:'document_too_large',maxBytes:MAX_BYTES});
  const type=detectType(file.buffer);if(!type)return res.status(415).json({error:'unsupported_or_unverified_file_format'});
  const site=(await db.query('SELECT id FROM studio_site_contexts WHERE id=$1 AND owner_key=$2',[siteId,owner])).rows[0];
  if(!site)return res.status(404).json({error:'site_context_not_found'});
  const revision=(await db.query('SELECT version FROM studio_site_revisions WHERE site_context_id=$1 AND version=$2',[siteId,version])).rows[0];
  if(!revision)return res.status(404).json({error:'site_revision_not_found'});
  const digest=crypto.createHash('sha256').update(file.buffer).digest('hex');
  const key='site-documents/'+encodeURIComponent(owner)+'/'+siteId+'/'+crypto.randomUUID()+'.'+type.ext;
  storedKey=key;
  try{
   await storage.put(key,file.buffer,'application/octet-stream',{metadata:{'sha256':digest,'site-id':String(siteId),'site-version':String(version),'source-type':sourceType,'source-mime':type.mime}});
   const stored=await storage.get(key),storedBuffer=stored?.buffer||stored;
   const storedDigest=crypto.createHash('sha256').update(storedBuffer).digest('hex');
   if(storedDigest!==digest)throw Error('Stored document integrity check failed.');
   const filename=cleanFilename(file.filename);
   const inserted=await db.query('INSERT INTO studio_site_documents(site_context_id,site_version,owner_key,storage_key,original_filename,content_type,byte_size,sha256,source_type,source_reference,evidence_status,document_date,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id,site_context_id,site_version,original_filename,content_type,byte_size,sha256,source_type,source_reference,evidence_status,document_date,note,created_at',[siteId,version,owner,key,filename,type.mime,file.buffer.length,digest,sourceType,reference,status,date,String(body.note||'').trim().slice(0,1000)]);
   const doc=inserted.rows[0];log.addSummary({document_id:doc.id,site_context_id:siteId,site_version:version,content_type:type.mime,bytes:file.buffer.length,sha256:digest});
   return res.status(201).json({document:doc,message:'Private document stored and integrity digest recorded. Evidence status reflects the submitted provenance; it is not independent verification.'});
  }catch(error){await storage.del(key).catch(()=>{});storedKey=null;throw error;}
 }catch(error){
  log.fail(error);
  return sendUnexpectedFailure(res,error,rid,'studio_site_document_failure');
 }
}