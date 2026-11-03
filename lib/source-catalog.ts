import type {AutomationConfig} from './automation';
import {kv,all} from './db';
import {companyPreference} from './company-preferences';
import type {JobInput} from './types';
import {providerKeyConfigured} from './provider-key';
export type SourceStatus={id:string;name:string;mode:string;status:string;detail:string;lastCheckedAt:string|null;cachedJobs:number};
export type CompanyCoverage={name:string;status:string;jobs:number;lastCheckedAt:string|null};
export function companyCoverage(c:AutomationConfig):CompanyCoverage[]{
 const keys=[...c.greenhouseBoards.map(b=>'greenhouse:'+b),...c.leverBoards.map(b=>'lever:'+b),...c.ashbyBoards.map(b=>'ashby:'+b),...c.smartRecruitersBoards.map(b=>'smartrecruiters:'+b)];
 const jobs=all('jobs');
 const feeds=keys.map(key=>({key,label:kv<string>('source-company:'+key,''),companies:kv<JobInput[]>('feed-cache:'+key,[]).map(j=>j.company),checkedAt:kv<string|null>('feed-checked:'+key,null)}));
 return c.preferredCompanies.map(name=>{
  const sources=feeds.filter(feed=>companyPreference(feed.label,[name]).preferred||feed.companies.some(company=>companyPreference(company,[name]).preferred));
  const lastCheckedAt=sources.map(feed=>feed.checkedAt).filter((v):v is string=>!!v).sort().at(-1)||null;
  const count=jobs.filter(j=>companyPreference(j.company,[name]).preferred).length;
  return {name,status:lastCheckedAt?'Direct feed checked':sources.length?'Configured, awaiting check':count?'Imported listings only':'No direct collector connected',jobs:count,lastCheckedAt};
 });
}
export function sourceCatalog(c:AutomationConfig):SourceStatus[]{
 const feed=(id:string,name:string,on:boolean,keys:string[],detail:string):SourceStatus=>({id,name,mode:'Scheduled public API/feed',status:on&&keys.length?'Configured':on?'Needs company boards':'Disabled',detail,lastCheckedAt:keys.map(k=>kv<string|null>('feed-checked:'+k,null)).filter((v):v is string=>!!v).sort().at(-1)||null,cachedJobs:keys.reduce((n,k)=>n+kv<unknown[]>('feed-cache:'+k,[]).length,0)});
 return [
  feed('smartrecruiters','Consulting / IT services career boards',true,c.smartRecruitersBoards.map(b=>'smartrecruiters:'+b),'SmartRecruiters role searches by company and country; up to 40 full posting details per company per run.'),
  feed('greenhouse','Greenhouse company careers',true,c.greenhouseBoards.map(b=>'greenhouse:'+b),'Published company job boards. Last-seen observations distinguish missing listings from confirmed closure.'),
  feed('lever','Lever company careers',true,c.leverBoards.map(b=>'lever:'+b),'Published company postings. Publication date remains unknown when not provided.'),
  feed('ashby','Ashby company careers',true,c.ashbyBoards.map(b=>'ashby:'+b),'Listed public openings. A source publication timestamp is not a guarantee of original posting age.'),
  feed('hn','HN Who is hiring — YC community',c.hackerNews,c.hackerNews?['hn-hiring']:[],'People-authored hiring posts from the current monthly thread. This is not YC’s startup job board and does not prove YC affiliation.'),
  feed('startup','Startup Jobs',c.startupJobs,c.startupJobs?['startup-jobs']:[],'Public engineering RSS with Startup Jobs attribution. Limited feed, not exhaustive employer coverage.'),
  feed('remotive','Remotive',c.remotive,c.remotive?['remotive']:[],'Public software-development feed; six-hour network minimum and source attribution.'),
  ...[
   ['linkedin','LinkedIn jobs and people posts','Shared post / alerts','Import available','Shared post text and URL can be extracted and checked. No account or feed crawler is connected.'],
   ['naukri','Naukri','Alerts / native Neo','Account feed not connected','Neo runs separately in your Naukri account. Job-alert imports retain receipt dates; their posting dates may be unknown.'],
   ['yc','YC startup job board','Shared post / import','Direct collector not connected','Import a supplied job description and original URL. The HN collector is a separate source.'],
   ['monster','Monster','Connected chat search / import','India unsupported by connector','The connected Monster search returned that India is unsupported. Its supported countries are US, Canada, UK, Ireland and selected European countries. No local Monster collector is connected.'],
   ['wellfound','Wellfound','Alerts / shared post','Direct collector not connected','Import alerts or shared post text. No candidate-side account collector is enabled.'],
  ].map(([id,name,mode,status,detail])=>{
   if(id==='yc'||id==='wellfound'){
    const selected=c.fantasticSources.includes(id==='yc'?'ycombinator':'wellfound');
    const configured=providerKeyConfigured();
    const cached=kv<JobInput[]>('feed-cache:fantastic-jobs',[]).filter(j=>j.source===(id==='yc'?'YC via Fantastic.jobs':'Wellfound via Fantastic.jobs'));
    return {id,name,mode:'Optional third-party provider / imports',status:configured&&c.fantasticEnabled&&selected?'Configured':configured?'Provider disabled':'Provider key needed',detail:'Fantastic.jobs daily bounded collection, when enabled. This is not a platform-account connection. Subscription and original-source terms apply. Expiry is not checked; confirm the opening before applying.',lastCheckedAt:kv<string|null>('feed-checked:fantastic-jobs',null),cachedJobs:cached.length};
   }
   return {id,name,mode,status,detail,lastCheckedAt:null,cachedJobs:0};
  })
 ];
}

