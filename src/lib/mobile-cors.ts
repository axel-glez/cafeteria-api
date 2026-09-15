import type { RequestHandler } from 'express';
// Solo si el compañero desarrolla una app web en otro origen. Nunca habilita cookies del equipo.
const origins=new Set((process.env.MOBILE_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean));
for(const origin of origins){const url=new URL(origin);if(!['http:','https:'].includes(url.protocol)||url.origin!==origin||url.username||url.password)throw new Error('MOBILE_ORIGINS debe contener orígenes exactos separados por comas');}
export const mobileCors:RequestHandler=(req,res,next)=>{
 if(!/^\/api\/v1(?:\/|$)/.test(req.path)){next();return;}
 const origin=req.get('origin');
 if(origin&&origins.has(origin)){
  res.locals.mobileOriginAllowed=true;res.vary('Origin');res.set('Access-Control-Allow-Origin',origin);
  res.set('Access-Control-Expose-Headers','Idempotency-Replayed, Location');
  if(req.method==='OPTIONS'){
   const headers=(req.get('access-control-request-headers')||'').toLowerCase().split(',').map(v=>v.trim()).filter(Boolean);
   if(!['GET','POST'].includes(req.get('access-control-request-method')||'')||headers.some(h=>!['authorization','content-type','x-cafe-request','idempotency-key'].includes(h))){res.status(403).end();return;}
   res.set('Access-Control-Allow-Methods','GET, POST');res.set('Access-Control-Allow-Headers','Authorization, Content-Type, X-Cafe-Request, Idempotency-Key');res.status(204).end();return;
  }
 }
 next();
};
