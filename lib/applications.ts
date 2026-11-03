import { all, get, getProfile, getSettings, id, now, saveApplication, saveTask, transaction, log, db } from './db';
import { matchJob } from './jobs';
import { profileHash, tailorResume } from './resume';
import type { Application, Job, Profile, Task, Settings } from './types';

export function automaticEligible(job:Job,p:Profile,s:Settings,app:Application) {
  const m=matchJob(job,p,s);
  const knownExperience=(job.experienceMin===null&&job.experienceMax===null)||p.yearsExperience!==null;
  const knownLocation=!s.requireIndiaEligible||['India','Worldwide'].includes(job.remoteEligibility)||(job.remoteEligibility==='Onsite'&&s.locations.some(l=>job.location.toLowerCase().includes(l.toLowerCase())));
  return s.automaticDemo&&s.demoAdapterEnabled&&job.adapter==='demo'&&p.verified&&!app.missing.length&&app.answers.every(a=>a.kind==='verified')&&!m.hardBlocks.length&&!m.missing.length&&m.score>=s.autoMinScore&&!job.likelyDuplicate&&knownExperience&&knownLocation;
}

export function answerQuestion(question:string,p:Profile,job:Job):Application['answers'][number] {
  const unknown={question,answer:null,kind:'unknown' as const};
  if(!p.verified) return unknown;
  const saved=p.answers.find(a=>a.question.trim().toLowerCase()===question.trim().toLowerCase());
  if(saved?.answer) return {question,answer:saved.answer,kind:'verified'};
  const q=question.toLowerCase().trim().replace(/[?!.]$/,'');
  // Exact supported prompts prevent a broad keyword from answering a different factual question.
  const facts:Record<string,string|null>={
    'full name':p.name, 'email':p.email, 'phone':p.phone, 'current location':p.location,
    'portfolio url':p.portfolio, 'github url':p.github, 'linkedin url':p.linkedin,
    'years of experience':p.yearsExperience===null?null:String(p.yearsExperience),
    'notice period':p.noticePeriod, 'availability':p.availability,
    'current annual salary':p.currentSalary===null?null:`${p.currency} ${p.currentSalary}`,
    'expected annual salary':p.expectedSalary===null?null:`${p.currency} ${p.expectedSalary}`,
    'work authorization':p.authorization, 'do you require sponsorship':p.sponsorship,
  };
  if(facts[q]) return {question,answer:facts[q],kind:'verified'};
  if(q==='why this role') {
    const skills=matchJob(job,p,getSettings()).matching;
    return {question,answer:`I am interested in the ${job.title} role${job.company?` at ${job.company}`:''}.${skills.length?` My verified skills include ${skills.slice(0,4).join(', ')}.`:''} I would welcome the opportunity to discuss how my background fits your team.`,kind:'draft'};
  }
  return unknown;
}
export async function prepare(jobId:string) {
  const job=get('jobs',jobId); if(!job) throw new Error('Job not found');
  const old=all('applications').find(a=>a.jobId===jobId);
  if(old&&['Applying','Submitted','Submission Uncertain'].includes(old.status)) throw new Error('This application is submitted, running or uncertain. Reconcile its outcome before preparing again.');
  const active=all('tasks').find(t=>t.applicationId===old?.id&&['queued','running'].includes(t.state));
  if(active) throw new Error('Wait for the active worker task');
  const p=getProfile();
  const missing:string[]=[];
  if(!p.verified) missing.push('Review and verify profile facts');
  if(!p.name) missing.push('Full name'); if(!p.email) missing.push('Email'); if(!p.skills.length) missing.push('Verified skills');
  const questions=[...new Set(['Full name','Email',...job.questions])];
  const answers=questions.map(q=>answerQuestion(q,p,job));
  for(const a of answers) if(!a.answer) missing.push(a.question);
  let resumeId='';
  if(p.verified&&p.name&&p.email&&p.skills.length) resumeId=(await tailorResume(job)).id;
  else missing.push('Verified resume');
  const app:Application={id:old?.id||id(),jobId,status:missing.length?'Needs Input':'Ready',createdAt:old?.createdAt||now(),updatedAt:now(),profileHash:profileHash(p),resumeId,answers,missing:[...new Set(missing)],evidence:[],approvedAt:null,filledAt:null,receipt:null};
  // Concurrent prepares are serialized by SQLite's unique job_id constraint.
  saveApplication(app); log('Application prepared for review');
  const s=getSettings();
  if(automaticEligible(job,p,s,app)) queue(app.id,'submit',true);
  return app;
}
export function queue(appId:string,mode:'fill'|'submit',automatic=false):Task {
  return transaction(()=>{
    const app=get('applications',appId); if(!app) throw new Error('Application not found');
    const job=get('jobs',app.jobId)!; const p=getProfile(); const s=getSettings();
    if(job.adapter!=='demo') throw new Error('No authorized automation adapter for this platform. Use the manual application link.');
    if(!s.demoAdapterEnabled) throw new Error('Enable the local demo adapter in Settings');
    if(app.profileHash!==profileHash(p)) throw new Error('Profile changed. Prepare again to refresh answers and resume.');
    if(app.missing.length||!p.verified||!app.resumeId) throw new Error('Resolve missing verified answers before continuing');
    if(['Applying','Submitted','Submission Uncertain'].includes(app.status)) throw new Error('Duplicate or uncertain submission blocked');
    if(job.likelyDuplicate) throw new Error('Resolve the likely duplicate flag before automation');
    if(mode==='submit'&&!automatic&&!app.filledAt) throw new Error('Run the demo fill and review its evidence first');
    if(automatic) {
      if(!automaticEligible(job,p,s,app)) throw new Error('Automatic-mode requirements are not satisfied');
    }
    if(all('tasks').some(t=>t.applicationId===appId&&['queued','running'].includes(t.state))) throw new Error('An application task is already queued or running');
    if(mode==='submit'){app.approvedAt=now();app.status='Applying';app.updatedAt=now();saveApplication(app);}
    const task:Task={id:id(),applicationId:app.id,mode,state:'queued',createdAt:now(),updatedAt:now(),token:id(),error:null,automatic};
    saveTask(task);log(mode==='fill'?'Demo fill queued':'Demo submission queued');return task;
  });
}
export function confirmedReceipt(appId:string) {
  return db.prepare('SELECT receipt,created_at FROM receipts WHERE application_id=?').get(appId) as {receipt:string;created_at:string}|undefined;
}
export function reconcile(appId:string) {
  const app=get('applications',appId);if(!app)throw new Error('Application not found');
  const receipt=confirmedReceipt(appId);
  if(receipt){app.status='Submitted';app.receipt=receipt.receipt;app.updatedAt=now();app.evidence.push(`Confirmed local demo receipt: ${receipt.receipt}`);saveApplication(app);return app;}
  throw new Error('No confirmation found. Keep this application uncertain and check manually.');
}
