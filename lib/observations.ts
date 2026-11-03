import { kv, setKv, all } from './db';
import type { Job, JobInput } from './types';
export type Observation={sourceKey:string;firstSeenAt:string;lastSeenAt:string;lastCheckedAt:string;present:boolean;postedAt:string|null;dateChanges:{from:string|null;to:string|null;at:string}[]};
export type Provenance={source:string;url:string;postUrl:string;sourceId:string;observedAt:string};
export const getObservation=(id:string)=>kv<Observation|null>('observed:'+id,null);
export const getProvenance=(id:string)=>kv<Provenance[]>('provenance:'+id,[]);
export function addProvenance(job:Job,input:JobInput,at=new Date().toISOString()){
 const previous=getProvenance(job.id);
 const entry={source:input.source,url:input.url,postUrl:input.sourcePostUrl||'',sourceId:input.sourceId,observedAt:at};
 if(!previous.some(p=>p.source===entry.source&&p.url===entry.url&&p.postUrl===entry.postUrl&&p.sourceId===entry.sourceId))setKv('provenance:'+job.id,[...previous,entry].slice(-20));
}
export function observe(job:Job,sourceKey:string,checkedAt:string,postedAt:string|null){
 const previous=getObservation(job.id);
 const changes=previous?.dateChanges||[];
 if(previous&&previous.postedAt!==postedAt)changes.push({from:previous.postedAt,to:postedAt,at:checkedAt});
 setKv('observed:'+job.id,{sourceKey,firstSeenAt:previous?.firstSeenAt||job.discoveredAt,lastSeenAt:checkedAt,lastCheckedAt:checkedAt,present:true,postedAt,dateChanges:changes.slice(-10)} satisfies Observation);
}
export function markMissing(sourceKey:string,presentIds:Set<string>,checkedAt:string){
 for(const job of all('jobs')){
  const previous=getObservation(job.id);
  if(previous?.sourceKey===sourceKey&&!presentIds.has(job.id))setKv('observed:'+job.id,{...previous,present:false,lastCheckedAt:checkedAt});
 }
}

