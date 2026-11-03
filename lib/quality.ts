import { getDomain } from 'tldts';
import type { Job } from './types';
import { getObservation, getProvenance, type Observation } from './observations';
import {kv} from './db';

export type RiskFlag={code:string;severity:'high'|'review';reason:string};
export type JobQuality={
 risk:{level:'high'|'review'|'no_obvious_flags';label:string;flags:RiskFlag[];evidence:string[];unknowns:string[]};
 freshness:{label:string;ageDays:number|null;postedAt:string|null;firstSeenAt:string;lastSeenAt:string|null;lastCheckedAt:string|null;present:boolean|null;repostSuspected:boolean;dateKind:string;unknown:boolean};
 provenance:ReturnType<typeof getProvenance>;
};
const shorteners=new Set(['bit.ly','tinyurl.com','t.co','shorturl.at','rb.gy','cutt.ly']);
const personalMail=new Set(['gmail.com','yahoo.com','outlook.com','hotmail.com','proton.me','protonmail.com']);
export function assessJob(job:Job,at=Date.now(),observation:Observation|null=getObservation(job.id)):JobQuality {
 const flags:RiskFlag[]=[],evidence:string[]=[];
 const unknowns=['Recruiter identity and authority to hire have not been independently verified.','No signal check can guarantee that an opportunity is genuine.'];
 const exclusion=kv<string|null>('collector-exclusion:'+job.id,null);if(exclusion)unknowns.push('Collector skipped this record: '+exclusion+'.');
 const text=job.description;
 // Ignore explicit no-fee warnings while evaluating a separate payment demand.
 const claims=text.split(/(?<=[.!?])\s+|\n|\b(?:but|however)\b/i).filter(s=>!/\b(?:never|do not|don't|will not)\s+(?:\w+\s+){0,2}(?:pay|charge|send|share|provide|ask|require)|\bno\s+(?:application|registration|recruitment|processing|interview)?\s*fees?\b/i.test(s)).join('\n');
 const flag=(code:string,severity:RiskFlag['severity'],reason:string)=>flags.push({code,severity,reason});
 if(/\b(?:registration|application|processing|recruitment|security|refundable)\s*(?:fees?|deposit)\b|\bpay\b[^\n.]{0,50}(?:to (?:apply|secure|get|start)|before (?:interview|joining))|\bupfront\s+(?:payment|fee|deposit)/i.test(claims))flag('payment','high','The text appears to demand a payment or deposit from applicants.');
 if(/(?:deposit|send|transfer|pay|recharge)[^\n.]{0,60}(?:crypto|bitcoin|USDT)|(?:crypto|bitcoin|USDT)[^\n.]{0,60}(?:unlock|withdraw|task)/i.test(claims))flag('crypto','high','Payment or task-unlocking language involving cryptocurrency was detected.');
 if(/(?:deposit|cash)[^\n.]{0,40}(?:cheque|check)|(?:buy|purchase)[^\n.]{0,40}equipment[^\n.]{0,40}(?:reimburse|cheque|check)/i.test(claims))flag('cheque','high','The text contains check-deposit or equipment-purchase reimbursement language.');
 if(/(?:send|share|provide)[^\n.]{0,45}(?:OTP|one.time password|UPI PIN|bank login|card CVV)/i.test(claims))flag('secrets','high','The text requests a financial or authentication secret.');
 if(/(?:send|share|provide)[^\n.]{0,60}(?:aadhaar|aadhar|PAN card|bank account)[^\n.]{0,45}(?:before interview|to apply|for application)/i.test(claims))flag('sensitive-id','review','Sensitive ID or banking details appear to be requested during application.');
 if(/(?:whatsapp|telegram)[^\n.]{0,55}(?:only|no interview)|(?:no interview|instant selection|guaranteed selection)/i.test(claims))flag('selection','review','Off-platform-only contact or guaranteed/no-interview selection needs scrutiny.');
 const contactLines=text.split('\n').filter(s=>/\b(?:apply|send|resume|cv|contact|email)\b/i.test(s)&&!/^Source email/i.test(s));
 const emails=[...contactLines.join('\n').matchAll(/[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/gi)].map(m=>m[1].toLowerCase());
 if(emails.some(d=>personalMail.has(d)))flag('personal-email','review','An application/contact email uses a personal email provider. That alone does not establish fraud.');
 let host='';
 try{
  const u=new URL(job.url);host=u.hostname;
  if(u.protocol!=='https:')flag('http','review','The application link is not HTTPS.');
  if(shorteners.has(host))flag('short-link','review','The application link is shortened; the destination is unverified.');
  if(host.split('.').some(p=>p.startsWith('xn--')))flag('international-domain','review','The link uses an internationalized domain; inspect it for impersonation.');
 }catch{if(job.adapter!=='demo')flag('missing-link','review','No valid application URL is available.');}
 if(job.companyWebsite&&host){
  try{
   const expected=getDomain(new URL(job.companyWebsite).hostname);
   const actual=getDomain(host);
   const ats=['greenhouse.io','lever.co','ashbyhq.com','workable.com','smartrecruiters.com','workdayjobs.com','naukri.com','linkedin.com','wellfound.com','monster.com','startup.jobs','remotive.com','ycombinator.com'];
   if(expected&&actual&&expected!==actual&&!ats.includes(actual))flag('domain-mismatch','review','The application domain differs from the supplied company website; an agency or impersonator may be involved.');
   else if(expected&&expected===actual)evidence.push('Application URL and supplied company website share a registrable domain; ownership was not independently verified.');
  }catch{}
 }
 if(job.originKind==='hiring_post')unknowns.push('This is a person-authored hiring post, not employer-verified job-board data.');
 if(job.source.endsWith('via Fantastic.jobs'))unknowns.push('Third-party collection: this provider does not check YC or Wellfound listings for expiry. Confirm that the original opening is still accepting applications.');
 if(job.descriptionComplete===false||/full job description (?:was not|is not|not)|not a full job description/i.test(text))unknowns.push('Only an alert or post excerpt is available; full requirements are incomplete.');
 if(observation)evidence.push('A configured source was checked at '+observation.lastCheckedAt+'.');
 const timestamp=job.postedAt?Date.parse(job.postedAt):NaN;
 let ageDays=Number.isFinite(timestamp)?Math.floor((at-timestamp)/86400000):null;
 if(ageDays!==null&&ageDays< -1){flag('future-date','review','The source posting date is unexpectedly in the future.');ageDays=null;}
 const firstSeenAt=observation?.firstSeenAt||job.discoveredAt;
 const dateKind=job.postingDateKind||'published';
 const repostSuspected=!!observation?.dateChanges.length || (ageDays!==null&&ageDays<=1&&Date.parse(firstSeenAt)<at-7*86400000);
 const label=observation?.present===false?'Not in latest source snapshot':repostSuspected?'Possible repost / date change':ageDays===null?'Posting date unknown':ageDays<=1?'Posted within 24–48 hours':ageDays<=7?'Posted within 7 days':'Older posting';
 const level=flags.some(f=>f.severity==='high')?'high':flags.length?'review':'no_obvious_flags';
 return {risk:{level,label:level==='high'?'High risk':level==='review'?'Needs review':'No obvious flags',flags,evidence,unknowns},freshness:{label,ageDays,postedAt:job.postedAt,firstSeenAt,lastSeenAt:observation?.lastSeenAt||null,lastCheckedAt:observation?.lastCheckedAt||null,present:observation?.present??null,repostSuspected,dateKind,unknown:ageDays===null},provenance:getProvenance(job.id)};
}

