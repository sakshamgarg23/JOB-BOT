import {z} from 'zod';
import {fetchSource} from './source-fetch';
import {jobInputSchema,type JobInput} from './types';
import {plainText,iso,feedEligibility} from './source-utils';
const listing=z.object({id:z.string(),name:z.string(),releasedDate:z.string().optional()}).passthrough();
export async function collectSmartRecruiters(board:string,country:string,fetcher:typeof fetch):Promise<JobInput[]>{
 const candidates=new Map<string,z.infer<typeof listing>>();
 for(const query of ['react','frontend','javascript','next.js','full stack']){
  const url=new URL('https://api.smartrecruiters.com/v1/companies/'+encodeURIComponent(board)+'/postings');
  url.searchParams.set('q',query);url.searchParams.set('limit','100');if(country)url.searchParams.set('country',country);
  const data=z.object({content:z.array(z.unknown())}).parse(await fetchSource(url.href,fetcher));
  for(const raw of data.content){const parsed=listing.safeParse(raw);if(parsed.success)candidates.set(parsed.data.id,parsed.data);}
 }
 const selected=[...candidates.values()].filter(r=>/react|front.?end|full.?stack|next[. ]?js|software (?:developer|engineer)|associate.*engineer|javascript/i.test(r.name)).sort((a,b)=>(Date.parse(b.releasedDate||'')||0)-(Date.parse(a.releasedDate||'')||0)).slice(0,40);
 const jobs:JobInput[]=[];
 for(let i=0;i<selected.length;i+=5){
  const batch=await Promise.allSettled(selected.slice(i,i+5).map(async r=>{
   const raw=await fetchSource('https://api.smartrecruiters.com/v1/companies/'+encodeURIComponent(board)+'/postings/'+encodeURIComponent(r.id),fetcher);
   const data=z.object({id:z.string(),name:z.string(),company:z.object({name:z.string()}),location:z.object({city:z.string().optional(),region:z.string().optional(),country:z.string().optional(),remote:z.boolean().optional()}),releasedDate:z.string().optional(),postingUrl:z.string().optional(),jobAd:z.object({sections:z.record(z.string(),z.object({text:z.string().optional(),title:z.string().optional()}))}).optional()}).parse(raw);
   const sections=Object.values(data.jobAd?.sections||{});const description=plainText(sections.map(s=>(s.title||'')+'\n'+(s.text||'')).join('\n'));
   const location=[data.location.city,data.location.region,data.location.country?.toLowerCase()==='in'?'India':data.location.country].filter(Boolean).join(', ');
   const url=data.postingUrl&&/^https:\/\/(?:jobs|careers)\.smartrecruiters\.com\//i.test(data.postingUrl)?data.postingUrl:'https://jobs.smartrecruiters.com/'+encodeURIComponent(board)+'/'+encodeURIComponent(data.id);
   return jobInputSchema.parse({title:data.name.slice(0,500),company:data.company.name.slice(0,500),location:((data.location.remote?'Remote - ':'')+location).slice(0,500),description:description||data.name,url,source:'SmartRecruiters public board',sourceId:board+':'+data.id,postedAt:iso(data.releasedDate||r.releasedDate),postingDateKind:'published',originKind:'job_listing',descriptionComplete:!!description,remoteEligibility:data.location.remote?feedEligibility(location):'Onsite'});
  }));
  for(const result of batch)if(result.status==='fulfilled')jobs.push(result.value);
 }
 if(selected.length&&!jobs.length)throw new Error('Posting details unavailable');
 return jobs;
}

