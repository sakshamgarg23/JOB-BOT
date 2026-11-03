import {z} from 'zod';
import {XMLParser} from 'fast-xml-parser';
import {jobInputSchema,type JobInput} from './types';
import {plainText,iso,feedEligibility} from './source-utils';

export function parseLever(value:unknown,board:string):JobInput[]{
 return z.array(z.unknown()).max(10000).parse(value).flatMap(raw=>{
  const parsed=z.object({id:z.string(),text:z.string(),hostedUrl:z.url(),applyUrl:z.string().optional(),descriptionPlain:z.string().optional(),description:z.string().optional(),additionalPlain:z.string().optional(),categories:z.object({location:z.string().optional()}).optional(),workplaceType:z.string().optional(),lists:z.array(z.object({text:z.string(),content:z.string()})).optional()}).safeParse(raw);
  if(!parsed.success)return [];
  const r=parsed.data;
  const description=plainText([r.descriptionPlain||r.description||'',...(r.lists||[]).map(l=>l.text+':\n'+l.content),r.additionalPlain||''].join('\n'));
  const location=r.categories?.location||'';
  return [jobInputSchema.parse({title:r.text.slice(0,500),company:'',location:(r.workplaceType==='remote'?'Remote - ':'')+location,description:description||r.text,url:r.hostedUrl,source:'Lever public board',sourceId:board+':'+r.id,
   // The public posting payload does not document a publication date. Never use a creation/update guess.
   postedAt:null,postingDateKind:'unknown',originKind:'job_listing',descriptionComplete:!!description,remoteEligibility:r.workplaceType==='remote'?feedEligibility(location):r.workplaceType==='on-site'?'Onsite':'Unknown'})];
 });
}
export function parseAshby(value:unknown,board:string):JobInput[]{
 return z.object({jobs:z.array(z.unknown()).max(10000)}).parse(value).jobs.flatMap(raw=>{
  const parsed=z.object({title:z.string(),jobUrl:z.url(),descriptionPlain:z.string().optional(),descriptionHtml:z.string().optional(),location:z.string().optional(),secondaryLocations:z.array(z.object({location:z.string()})).optional(),isRemote:z.boolean().optional(),workplaceType:z.string().optional(),isListed:z.boolean().optional(),publishedAt:z.string().optional()}).safeParse(raw);
  if(!parsed.success||parsed.data.isListed===false)return [];
  const r=parsed.data;const description=plainText(r.descriptionPlain||r.descriptionHtml||'');
  const location=[r.location,...(r.secondaryLocations||[]).map(l=>l.location)].filter(Boolean).join('; ').slice(0,450);
  const jobId=new URL(r.jobUrl).pathname.split('/').filter(Boolean).at(-1)||r.jobUrl;
  return [jobInputSchema.parse({title:r.title.slice(0,500),company:'',location:(r.isRemote?'Remote - ':'')+location,description:description||r.title,url:r.jobUrl,source:'Ashby public board',sourceId:board+':'+jobId,postedAt:iso(r.publishedAt),postingDateKind:r.publishedAt?'published':'unknown',originKind:'job_listing',descriptionComplete:!!description,remoteEligibility:r.isRemote?feedEligibility(location):r.workplaceType==='OnSite'||r.workplaceType==='Hybrid'?'Onsite':'Unknown'})];
 });
}
export function parseStartupRss(xml:string):JobInput[]{
 // No external entities or DTDs are resolved.
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('Feed DTDs are unsupported');
 const data=new XMLParser({ignoreAttributes:false,processEntities:false,parseTagValue:false,trimValues:true}).parse(xml);
 const raw=data?.rss?.channel?.item||[];const entries=Array.isArray(raw)?raw:[raw];
 return entries.slice(0,100).flatMap((r:Record<string,unknown>)=>{
  if(typeof r.title!=='string'||typeof r.link!=='string')return [];
  const url=new URL(r.link);if(!['startup.jobs','www.startup.jobs'].includes(url.hostname))return [];
  const description=plainText(String(r.description||r['content:encoded']||''));
  return [jobInputSchema.parse({title:plainText(r.title).slice(0,500),company:'',description:description||plainText(r.title),url:url.href,source:'Startup Jobs RSS',sourceId:url.pathname,postedAt:typeof r.pubDate==='string'&&Number.isFinite(Date.parse(r.pubDate))?new Date(r.pubDate).toISOString():null,originKind:'job_listing',descriptionComplete:!!description,postingDateKind:r.pubDate?'published':'unknown'})];
 });
}
export function parseHiringPost(raw:unknown):JobInput|null {
 const result=z.object({text:z.string().min(20).max(60000),url:z.url(),platform:z.enum(['LinkedIn','Hacker News','Wellfound','YC','Other']),title:z.string().max(500).optional(),company:z.string().max(500).optional(),postedAt:z.string().nullable().optional(),author:z.string().max(200).optional()}).parse(raw);
 const u=new URL(result.url);
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('Use a public post URL without credentials');
 if(result.platform==='LinkedIn'&&!(u.hostname==='linkedin.com'||u.hostname.endsWith('.linkedin.com')))throw new Error('LinkedIn posts require a LinkedIn URL');
 // Drop personalized authentication and tracking parameters from shared links.
 for(const key of [...u.searchParams.keys()])if(/token|signature|midsig|^trk|^utm_|tracking/i.test(key))u.searchParams.delete(key);
 const text=plainText(result.text);
 if(!/\b(?:hiring|vacanc(?:y|ies)|openings?|recruiting|looking for|join (?:our|the) team)\b/i.test(text))throw new Error('This text does not clearly describe a hiring opportunity');
 const labeled=(name:string)=>text.match(new RegExp('^(?:'+name+')\\s*:\\s*(.+)$','im'))?.[1]?.trim();
 const firstLine=text.split('\n').find(Boolean)||'Hiring post';
 const company=result.company||labeled('company')||'';
 const title=result.title||labeled('role|position|job title')||firstLine.slice(0,150);
 const application=text.match(/https?:\/\/[^\s<>"']+/g)?.map(s=>s.replace(/[),.;]+$/,'')).find(s=>{try{const a=new URL(s);return a.href!==u.href&&!/linkedin.com|news.ycombinator.com/i.test(a.hostname);}catch{return false;}});
 const sourceId=result.platform==='Hacker News'?u.searchParams.get('id')||u.pathname:u.pathname.replace(/\/$/,'');
 return jobInputSchema.parse({title,company,description:text,url:application||u.href,source:result.platform+' hiring post',sourceId,sourcePostUrl:u.href,originKind:'hiring_post',postedAt:iso(result.postedAt),postingDateKind:result.postedAt?'post_created':'unknown',descriptionComplete:false});
}
export function parseHackerNewsComment(raw:unknown):JobInput|null{
 const parsed=z.object({id:z.number(),type:z.string(),text:z.string().optional(),time:z.number().optional(),by:z.string().optional(),dead:z.boolean().optional(),deleted:z.boolean().optional()}).safeParse(raw);
 if(!parsed.success)return null;const r=parsed.data;
 if(r.type!=='comment'||r.deleted||r.dead||!r.text)return null;
 // Membership of the monthly Who is hiring thread is the hiring context.
 const text=plainText(r.text);if(text.length<25)return null;
 const first=text.split('\n').find(Boolean)||'Hiring post';
 const headingCompany=first.includes('|')?first.split('|')[0].trim():'';
 const company=headingCompany.length<=120&&!/\b(?:hiring|looking for|remote|onsite)\b/i.test(headingCompany)?headingCompany:'';
 const location=first.split('|').find(s=>/\bindia\b|bengaluru|bangalore|hyderabad|chennai|mumbai|pune|delhi|noida|gurugram|worldwide/i.test(s))?.trim()||'';
 return jobInputSchema.parse({title:first.slice(0,150),company,location,description:text,url:'https://news.ycombinator.com/item?id='+r.id,source:'Hacker News hiring post',sourceId:String(r.id),sourcePostUrl:'https://news.ycombinator.com/item?id='+r.id,originKind:'hiring_post',postedAt:r.time?new Date(r.time*1000).toISOString():null,postingDateKind:r.time?'post_created':'unknown',descriptionComplete:false});
}

