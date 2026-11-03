import {z} from 'zod';
import {jobInputSchema,type JobInput} from './types';
import {iso,plainText,feedEligibility} from './source-utils';
export const fantasticSources=['ycombinator','wellfound'] as const;
export type FantasticSource=typeof fantasticSources[number];
const row=z.object({
 id:z.union([z.number(),z.string()]),title:z.string(),organization:z.string().nullable().optional(),url:z.url(),
 source:z.enum(fantasticSources),date_posted:z.string().nullable().optional(),date_created:z.string().nullable().optional(),
 locations_derived:z.array(z.string()).nullable().optional(),description_text:z.string().nullable().optional(),
 organization_url:z.string().nullable().optional(),
});
export function parseFantasticJobs(value:unknown,selected:FantasticSource[]):JobInput[]{
 return z.array(z.unknown()).max(1000).parse(value).flatMap(raw=>{
  const parsed=row.safeParse(raw);if(!parsed.success||!selected.includes(parsed.data.source))return [];
  const r=parsed.data,u=new URL(r.url);
  // Keep original public job URLs; never follow URLs supplied by a posting.
  if(u.protocol!=='https:'||u.username||u.password||u.port)return [];
  const location=(r.locations_derived||[]).join(', ').slice(0,500);
  const description=plainText(r.description_text||'');
  return [jobInputSchema.parse({title:r.title.slice(0,500),company:(r.organization||'').slice(0,500),location,description:description||r.title.slice(0,500),
   url:u.href,source:r.source==='ycombinator'?'YC via Fantastic.jobs':'Wellfound via Fantastic.jobs',sourceId:String(r.id).slice(0,200),
   postedAt:iso(r.date_posted),receivedAt:null,postingDateKind:iso(r.date_posted)?'published':'unknown',
   remoteEligibility:feedEligibility(location),descriptionComplete:description.length>100,originKind:'job_listing',adapter:'manual',
  })];
 });
}
export async function collectFantasticJobs(key:string,selected:FantasticSource[],limit:number,fetcher:typeof fetch=fetch){
 const url=new URL('https://data.fantastic.jobs/v1/active-jb');
 url.search=new URLSearchParams({source:selected.join(','),time_frame:'24h',limit:String(limit),offset:'0',description_format:'text',exclude_recruiter_fields:'true',title:'frontend OR front-end OR React OR Next.js OR fullstack OR full-stack',location:'India OR Remote OR Worldwide'}).toString();
 try{
  const response=await fetcher(url.href,{redirect:'error',headers:{Accept:'application/json',Authorization:'Bearer '+key},signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw new Error('Provider unavailable');
  const max=8_000_000;
  if(Number(response.headers.get('content-length')||0)>max)throw new Error('Response too large');
  const reader=response.body?.getReader();if(!reader)throw new Error('Empty response');
  const chunks:Uint8Array[]=[];let bytes=0;
  try{while(true){const result=await reader.read();if(result.done)break;bytes+=result.value.byteLength;if(bytes>max){await reader.cancel();throw new Error('Response too large');}chunks.push(result.value);}}finally{reader.releaseLock();}
  const raw:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  // The documented response is a JSON array. Never return raw provider errors.
  const jobs=parseFantasticJobs(raw,selected);
  return {jobs,capped:Array.isArray(raw)&&raw.length>=limit};
 }catch{throw new Error('Provider collection failed. Check your key, subscription quota and network. No immediate automatic retry will be made.');}
}
