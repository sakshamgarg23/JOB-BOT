import {fetchSource} from './source-fetch';
export {fetchSource} from './source-fetch';
import {parseLever,parseAshby,parseStartupRss} from './source-parsers';
import {collectHackerNews} from './hn-collector';
import {observe,markMissing} from './observations';
import {assessJob} from './quality';
import {collectSmartRecruiters} from './smartrecruiters';
import {consultingCompanies,companyPreference} from './company-preferences';
import {sourceCatalog,companyCoverage} from './source-catalog';
import {providerKeyConfigured,readProviderKey} from './provider-key';
import {collectFantasticJobs,fantasticSources} from './fantastic-jobs';
import {plainText,iso,feedEligibility} from './source-utils';
export {plainText,feedEligibility} from './source-utils';
import { z } from 'zod';
import { all, getProfile, getSettings, kv, setKv, now, saveJob, log, transaction } from './db';
import { importJob, matchJob, hasSkill, extractJob } from './jobs';
import { prepare } from './applications';
import type { JobInput } from './types';

export const automationSchema=z.object({
 enabled:z.boolean(), remotive:z.boolean(),
 fantasticEnabled:z.boolean().default(false),
 fantasticSources:z.array(z.enum(fantasticSources)).min(1).max(2).default(['ycombinator','wellfound']),
 fantasticDailyLimit:z.number().int().min(1).max(100).default(25),
 greenhouseBoards:z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/)).max(10),
 leverBoards:z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/)).max(10).default([]),
 ashbyBoards:z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/)).max(10).default([]),
 smartRecruitersBoards:z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/)).max(10).default([]),
 smartRecruitersCountry:z.string().regex(/^(?:[a-zA-Z]{2})?$/).default('in'),
 preferredCompanies:z.array(z.string().min(1).max(150)).max(100).default(consultingCompanies),
 companyMode:z.enum(['prefer','only','all']).default('prefer'),
 startupJobs:z.boolean().default(false), hackerNews:z.boolean().default(false),
 hnMaxPosts:z.number().int().min(10).max(150).default(60),
 pollMinutes:z.number().int().min(30).max(360).default(60),
 maxAgeDays:z.number().int().min(1).max(90).default(14),
 requireKnownDate:z.boolean().default(true), excludeReviewRisk:z.boolean().default(true),
 excludeSeniorTitles:z.boolean().default(true),
 minimumScore:z.number().min(0).max(100), autoPrepare:z.boolean(), maxPreparations:z.number().int().min(1).max(30)
});
export type AutomationConfig=z.infer<typeof automationSchema>;
export const defaultAutomation:AutomationConfig=automationSchema.parse({enabled:false,remotive:true,greenhouseBoards:[],minimumScore:65,autoPrepare:true,maxPreparations:10});
export type AutomationRun={startedAt:string;finishedAt:string|null;state:'running'|'done'|'partial'|'failed';fetched:number;imported:number;duplicates:number;prepared:number;awaitingProfile:boolean;messages:string[]};
export const getAutomation=()=>automationSchema.parse(kv('automation-config',defaultAutomation));
export const getAutomationState=()=>{const config=getAutomation();return {config,providerKeyConfigured:providerKeyConfigured(),run:kv<AutomationRun|null>('automation-run',null),nextFetchAt:kv<string|null>('automation-next',null),requested:kv('automation-requested',false),sources:sourceCatalog(config),companyCoverage:companyCoverage(config)};};
const sixHours=6*60*60*1000;
const remotiveRecord=z.object({id:z.union([z.string(),z.number()]),title:z.string(),company_name:z.string(),url:z.url(),description:z.string(),candidate_required_location:z.string().optional().default(''),publication_date:z.string().optional(),salary:z.string().optional()});
export function parseRemotive(value:unknown):JobInput[] {
 const response=z.object({jobs:z.array(z.unknown()).max(2000)}).parse(value);
 return response.jobs.flatMap(raw=>{
  const parsed=remotiveRecord.safeParse(raw);if(!parsed.success)return [];
  const r=parsed.data;
  const eligibility=feedEligibility(r.candidate_required_location);
  return [{title:r.title.slice(0,500),company:r.company_name.slice(0,500),location:('Remote - '+(r.candidate_required_location||'eligibility unspecified')).slice(0,500),
   description:(plainText(r.description)+(r.salary?'\nSalary as listed: '+r.salary:'')).slice(0,30000),
   url:r.url,source:'Remotive',sourceId:String(r.id),postedAt:iso(r.publication_date),receivedAt:null,
   experienceMin:null,experienceMax:null,salaryMin:null,salaryMax:null,currency:null,salaryPeriod:null,remoteEligibility:eligibility,
   requiredSkills:[],preferredSkills:[],questions:[],adapter:'manual' as const}];
 });
}
export function parseGreenhouse(value:unknown,board:string):JobInput[] {
 const response=z.object({jobs:z.array(z.unknown()).max(5000)}).parse(value);
 return response.jobs.flatMap(raw=>{
  const result=z.object({id:z.number(),title:z.string(),absolute_url:z.url(),location:z.object({name:z.string()}),content:z.string().optional().default(''),first_published:z.string().nullable().optional()}).safeParse(raw);
  if(!result.success)return [];
  const r=result.data;const description=plainText(r.content);
  return [{title:r.title.slice(0,500),company:'',location:r.location.name.slice(0,500),description:('Source board: '+board+'\n'+(description||r.title)).slice(0,30000),url:r.absolute_url,source:'Greenhouse public board',sourceId:board+':'+r.id,
   postedAt:iso(r.first_published),receivedAt:null,experienceMin:null,experienceMax:null,salaryMin:null,salaryMax:null,currency:null,salaryPeriod:null,
   remoteEligibility:'Unknown' as const,requiredSkills:[],preferredSkills:[],questions:[],adapter:'manual' as const}];
 });
}
function relevant(job:JobInput,excludeSenior=true) {
 if(excludeSenior&&getSettings().maxExperience<=3&&/\b(?:senior|sr\.?|lead|staff|principal|architect|manager|director)\b/i.test(job.title))return false;
 const targets=getSettings().targetRoles.filter(Boolean);
 const title=job.title.toLowerCase().replace(/[\s._-]+/g,' ');
 return targets.some(t=>{
  const normalized=t.toLowerCase().replace(/[\s._-]+/g,' ');
  if(title.includes(normalized))return true;
  const tokens=normalized.split(/\s+/).filter(s=>!['developer','engineer','software','junior','associate','i','full','stack'].includes(s));
  return tokens.some(t=>t.length>2&&title.includes(t));
 })||(/\b(front.?end|full.?stack|software engineer i|associate software engineer|web developer|application developer|programmer analyst)\b/i.test(job.title)&&['React','Next.js','JavaScript'].some(s=>hasSkill(job.description,s)))||(job.originKind==='hiring_post'&&/front.?end|full.?stack|react|next[. ]?js/i.test(job.description));
}
function collectionExclusion(record:JobInput,config:AutomationConfig):string|null{
 if(!relevant(record,config.excludeSeniorTitles))return 'Outside target roles or junior seniority preferences';
 if(record.postedAt&&Date.parse(record.postedAt)<Date.now()-config.maxAgeDays*86400000)return 'Older than the configured posting-age window';
 const candidate=extractJob(record),settings=getSettings();
 if(candidate.experienceMin!==null&&candidate.experienceMin>settings.maxExperience)return 'Required experience exceeds your configured range';
 if(settings.requireIndiaEligible&&candidate.remoteEligibility==='Restricted')return 'Source explicitly restricts remote work outside India';
 if(settings.requireIndiaEligible&&record.originKind==='hiring_post'&&!['India','Worldwide'].includes(candidate.remoteEligibility)&&!(/\bindia\b|bengaluru|bangalore|hyderabad|chennai|mumbai|pune|delhi|noida|gurugram/i.test(candidate.location)&&candidate.remoteEligibility==='Onsite'))return 'Hiring-post eligibility from India is unconfirmed';
 if(config.companyMode==='only'&&!companyPreference(record.company,config.preferredCompanies).preferred)return 'Employer is outside your preferred-company list';
 return null;
}
export async function automationTick(fetcher:typeof fetch=fetch) {
 const config=getAutomation();if(!config.enabled)return;
 const requested=kv('automation-requested',false);
 const next=kv<string|null>('automation-next',null);
 if(!requested&&next&&Date.now()<Date.parse(next))return;
 // Only the single active worker calls this. The request is claimed before network I/O.
 transaction(()=>{setKv('automation-requested',false);setKv('automation-next',new Date(Date.now()+config.pollMinutes*60000).toISOString());});
 const run:AutomationRun={startedAt:now(),finishedAt:null,state:'running',fetched:0,imported:0,duplicates:0,prepared:0,awaitingProfile:!getProfile().verified,messages:[]};
 setKv('automation-run',run);
 const sources:{key:string;complete:boolean;interval:number;load:()=>Promise<JobInput[]>}[]=[];
 if(config.remotive)sources.push({key:'remotive',complete:true,interval:sixHours,load:async()=>parseRemotive(await fetchSource('https://remotive.com/api/remote-jobs?category=software-dev',fetcher))});
 const interval=config.pollMinutes*60000;
 for(const board of config.greenhouseBoards)sources.push({key:'greenhouse:'+board,complete:true,interval,load:async()=>parseGreenhouse(await fetchSource('https://boards-api.greenhouse.io/v1/boards/'+encodeURIComponent(board)+'/jobs?content=true',fetcher),board)});
 for(const board of config.leverBoards)sources.push({key:'lever:'+board,complete:true,interval,load:async()=>parseLever(await fetchSource('https://api.lever.co/v0/postings/'+encodeURIComponent(board)+'?mode=json',fetcher),board)});
 for(const board of config.ashbyBoards)sources.push({key:'ashby:'+board,complete:true,interval,load:async()=>parseAshby(await fetchSource('https://api.ashbyhq.com/posting-api/job-board/'+encodeURIComponent(board),fetcher),board)});
 for(const board of config.smartRecruitersBoards)sources.push({key:'smartrecruiters:'+board,complete:false,interval,load:()=>collectSmartRecruiters(board,config.smartRecruitersCountry,fetcher)});
 if(config.startupJobs)sources.push({key:'startup-jobs',complete:false,interval,load:async()=>parseStartupRss(String(await fetchSource('https://startup.jobs/feeds/jobs?role=engineering',fetcher,'text')))});
 if(config.hackerNews)sources.push({key:'hn-hiring',complete:false,interval,load:()=>collectHackerNews(fetcher,config.hnMaxPosts)});
 if(config.fantasticEnabled){
  if(!providerKeyConfigured())run.messages.push('YC / Wellfound provider is enabled but has no saved API key. No provider request was made.');
  else sources.push({key:'fantastic-jobs',complete:false,interval:86400000,load:async()=>{
   if(!getAutomation().fantasticEnabled) return [];
   const key=await readProviderKey();if(!key)throw new Error('No provider key');
   const result=await collectFantasticJobs(key,config.fantasticSources,config.fantasticDailyLimit,fetcher);
   if(result.capped)run.messages.push('YC / Wellfound reached the daily result cap. Additional jobs may be missed; no extra pages were requested.');
   run.messages.push('YC / Wellfound were collected through Fantastic.jobs. The provider does not check these sources for expiry; verify the opening before applying.');
   return result.jobs;
  }});
 }
 let failures=0;
 for(const source of sources) {
  if(!getAutomation().enabled){run.messages.push('Collection was disabled while this run was in progress.');break;}
  // A manual check inside six hours reuses stored data; it cannot bypass feed limits.
  const attempt=kv<string|null>('feed-attempt:'+source.key,null);
  let records:JobInput[]=[];
  let checkedAt=kv<string|null>('feed-checked:'+source.key,null);
  if(attempt&&Date.now()-Date.parse(attempt)<source.interval) {
   records=kv<JobInput[]>('feed-cache:'+source.key,[]);
   run.messages.push(source.key+': reused cached jobs (source polling limit).');
  } else {
   setKv('feed-attempt:'+source.key,now());
   try {records=await source.load();checkedAt=now();setKv('feed-checked:'+source.key,checkedAt);setKv('feed-cache:'+source.key,records);}
   catch {failures++;run.messages.push(source.key==='fantastic-jobs'?'YC / Wellfound provider failed. Check your saved key, subscription quota and network. The next attempt is allowed after 24 hours.':source.key+': fetch failed; check network or board name. Retrying after its polling interval.');continue;}
  }
  run.fetched+=records.length;
  const configuredName=kv<string>('source-company:'+source.key,'');
  if(source.key==='fantastic-jobs')records=records.filter(r=>config.fantasticSources.includes(r.source.startsWith('YC ')?'ycombinator':'wellfound'));
  if(configuredName)records=records.map(r=>r.company?r:{...r,company:configuredName});
  const presentIds=new Set<string>();
  const prior=all('jobs');
  for(const record of records){const known=prior.find(j=>j.source===record.source&&j.sourceId===record.sourceId);if(known){
   presentIds.add(known.id);if(checkedAt)observe(known,source.key,checkedAt,record.postedAt);
   if(known.status==='New'&&!all('applications').some(a=>a.jobId===known.id)){
    if(record.originKind==='hiring_post'){known.title=record.title;known.company=record.company;known.location=record.location;known.description=record.description;}
    const excluded=collectionExclusion(record,config);if(excluded){known.status='Skipped';setKv('collector-exclusion:'+known.id,excluded);}saveJob(known);
   }
  }}
  for(const record of records) {
   if(collectionExclusion(record,config))continue;
   try {const result=importJob(record);presentIds.add(result.job.id);if(checkedAt)observe(result.job,source.key,checkedAt,record.postedAt);if(result.duplicate)run.duplicates++;else run.imported++;}
   catch {run.messages.push('One source record could not be imported.');}
  }
  if(source.complete&&checkedAt)markMissing(source.key,presentIds,checkedAt);
 }
 // Reconsider existing new jobs after profile verification, without another network call.
 const profile=getProfile(),settings=getSettings();
 if(config.autoPrepare&&profile.verified&&getAutomation().enabled) {
  for(const job of all('jobs')) {
   if(!['Remotive','Greenhouse public board','Lever public board','Ashby public board','SmartRecruiters public board','Startup Jobs RSS'].includes(job.source)||!['New','Shortlisted'].includes(job.status)||job.likelyDuplicate)continue;
   if(config.companyMode==='only'&&!companyPreference(job.company,config.preferredCompanies).preferred)continue;
   const quality=assessJob(job);
   if(quality.risk.level==='high'||config.excludeReviewRisk&&quality.risk.level==='review'||quality.freshness.present===false||quality.freshness.repostSuspected)continue;
   if(config.requireKnownDate&&quality.freshness.unknown||job.postedAt&&Date.parse(job.postedAt)<Date.now()-config.maxAgeDays*86400000)continue;
   if(job.descriptionComplete===false)continue;
   if(all('applications').some(a=>a.jobId===job.id))continue;
   const match=matchJob(job,profile,settings);
   if(match.score<config.minimumScore||match.hardBlocks.length)continue;
   // Unknown remote eligibility is never treated as eligible for unattended preparation.
   if(settings.requireIndiaEligible&&job.remoteEligibility==='Unknown')continue;
   if(run.prepared>=config.maxPreparations)break;
   job.status='Shortlisted';saveJob(job);
   try {await prepare(job.id);run.prepared++;}catch {run.messages.push('One application needs manual review before preparation.');}
  }
 }
 run.awaitingProfile=!getProfile().verified;
 if(run.awaitingProfile)run.messages.push('Discovery is active. Review and save the prefilled profile once to enable automatic matching and resume preparation.');
 run.messages.push('Real applications have not been submitted. These public feeds authorize job discovery, not candidate submissions.');
 run.state=failures===sources.length&&sources.length?'failed':failures?'partial':'done';run.finishedAt=now();
 setKv('automation-run',run);log('Automatic discovery finished: '+run.imported+' new jobs; '+run.prepared+' prepared applications',failures?'warning':'info');
 return run;
}

