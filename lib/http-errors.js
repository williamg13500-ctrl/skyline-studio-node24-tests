export function requestId(){try{return crypto.randomUUID();}catch{return 'req-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);}}
export function sendInputFailure(res,error,rid,code='invalid_input'){
 const fields=error?.fields&&typeof error.fields==='object'?error.fields:{};
 const details=Object.values(fields).filter(v=>typeof v==='string');
 const message=error?.message&&error.message!=='Check the project brief.'?error.message:(details.join(' ')||'The supplied geometry or project brief is not valid.');
 return res.status(error?.status===422?422:400).json({error_code:code,message,offending_element_id:error?.elementId||error?.offendingElementId||null,suggestion:error?.suggestion||'Review the highlighted fields or geometry, correct the issue, and try again.',request_id:rid,fields:Object.keys(fields).length?fields:undefined});
}
export function sendUnexpectedFailure(res,error,rid,label){
 const stack=typeof error?.stack==='string'?error.stack.slice(error.stack.indexOf(String.fromCharCode(10))+1):'[stack unavailable]';console.error(label,stack.slice(0,2400));
 return res.status(500).json({error_code:'internal_error',message:'The request could not be completed because of an unexpected server error.',offending_element_id:null,suggestion:'Retry once. If the problem continues, share the request ID with support.',request_id:rid});
}