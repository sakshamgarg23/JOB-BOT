import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { all, get, getProfile, getSettings, setKv, saveJob, saveResume, saveApplication, activity, kv, log, id, now, transaction, db } from '@/lib/db';
import { jobInputSchema, profileSchema, settingsSchema, statuses, type Resume } from '@/lib/types';
import { importJob, importCsv, matchJob, extractJob } from '@/lib/jobs';
import { suggestFacts, tailorResume, resumePdf, recommendResume, profileHash } from '@/lib/resume';
import { prepare, queue, reconcile, confirmedReceipt } from '@/lib/applications';
import { localRequest } from '@/lib/security';
import { automationSchema, getAutomationState, getAutomation } from '@/lib/automation';
import { assessJob } from '@/lib/quality';
import { companyPreference } from '@/lib/company-preferences';
import { parseHiringPost } from '@/lib/source-parsers';
import { detectCareerSource } from '@/lib/career-source';
import {providerKeyConfigured,saveProviderKey} from '@/lib/provider-key';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{path:string[]}>};
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}});
async function body(req:NextRequest) {
  const raw=await req.text();if(raw.length>2_000_000)throw new Error('Request too large');return JSON.parse(raw);
}
async function handler(req:NextRequest,context:Context) {
  try {
    localRequest(req);
    const parts=(await context.params).path;const path=parts.join('/');const method=req.method;
    if(method==='GET'&&path==='state') {
      const profile=getProfile(),settings=getSettings();
      return json({profile,settings,jobs:all('jobs').map(job=>({...job,match:matchJob(job,profile,settings),recommendedResume:recommendResume(job),quality:assessJob(job),employer:companyPreference(job.company,getAutomation().preferredCompanies)})),applications:all('applications'),resumes:all('resumes'),tasks:all('tasks').slice(0,40).map(({token,...t})=>t),activity:activity(),worker:kv('worker',null),aiConfigured:!!process.env.AI_RANKING_URL,automation:getAutomationState()});
    }
    if(method==='POST'&&path==='profile') {
      const p=profileSchema.parse(await body(req));
      if(p.verified&&(!p.name||!p.email||!p.skills.length))throw new Error('Name, email and at least one skill are required to verify a profile');
      if(p.sourceResumeId&&!get('resumes',p.sourceResumeId))throw new Error('Source resume not found');
      setKv('profile',p);log('Profile saved');return json(p);
    }
    if(method==='POST'&&path==='settings') {const s=settingsSchema.parse(await body(req));setKv('settings',s);return json(s);}
    if(method==='POST'&&path==='automation') {const config=automationSchema.parse(await body(req));if(config.fantasticEnabled&&!providerKeyConfigured())throw new Error('Save a provider API key before enabling YC / Wellfound collection.');setKv('automation-config',config);if(config.enabled)setKv('automation-requested',true);return json(getAutomationState());}
    if(method==='POST'&&path==='sources/provider-key') {
      const {key}=z.object({key:z.string().max(4096)}).parse(await body(req));
      await saveProviderKey(key.trim());
      if(!key.trim()){const config=getAutomation();setKv('automation-config',{...config,fantasticEnabled:false});}
      return json({configured:providerKeyConfigured()});
    }
    if(method==='POST'&&path==='automation/check') {setKv('automation-requested',true);return json({queued:true});}
    if(method==='POST'&&path==='sources/post') {const input=parseHiringPost(await body(req));if(!input)throw new Error('No hiring opportunity found');return json(importJob(input));}
    if(method==='POST'&&path==='sources/career') {
      const input=z.object({url:z.url(),company:z.string().max(150).default('')}).parse(await body(req));
      const source=detectCareerSource(input.url);const config=getAutomation();
      const field=({greenhouse:'greenhouseBoards',lever:'leverBoards',ashby:'ashbyBoards',smartrecruiters:'smartRecruitersBoards'} as const)[source.type];
      config[field]=[...new Set([...config[field],source.board])];
      if(input.company.trim()) {config.preferredCompanies=[...new Set([...config.preferredCompanies,input.company.trim()])];setKv('source-company:'+source.type+':'+source.board,input.company.trim());}
      setKv('automation-config',automationSchema.parse(config));setKv('automation-requested',true);return json({source,automation:getAutomationState()});
    }
    if(method==='POST'&&path==='jobs/preview') return json(extractJob(jobInputSchema.parse(await body(req))));
    if(method==='POST'&&path==='jobs') {
      const input=jobInputSchema.parse(await body(req));
      if(input.adapter==='demo')throw new Error('Demo jobs can only be created with the demo action');
      if(!input.description.trim())throw new Error('Paste a job description');
      return json(importJob(input));
    }
    if(method==='POST'&&path==='imports/csv') { const {csv}=z.object({csv:z.string().min(1).max(2_000_000)}).parse(await body(req));return json(importCsv(csv)); }
    if(method==='POST'&&path==='demo') {
      return json(importJob({title:'Frontend Developer',company:'Orbit Labs (local demo)',location:'Remote - India',description:'LOCAL DEMO — not a real opening.\nRole: Frontend Developer\nCompany: Orbit Labs (local demo)\nLocation: Remote - India\nRequirements: JavaScript, React, HTML, CSS.\nPreferred: Next.js, Tailwind.\nExperience: 0-3 years.\nSalary: 6-12 LPA.\nBuild accessible interfaces for a product team.',source:'Local demo',sourceId:'orbit-frontend-demo-v1',adapter:'demo',questions:['Why this role?']}));
    }
    if(method==='POST'&&parts[0]==='jobs'&&parts[2]==='status') {
      const job=get('jobs',parts[1]);if(!job)throw new Error('Job not found');
      const {status}=z.object({status:z.enum(['New','Shortlisted','Skipped'])}).parse(await body(req));
      const app=all('applications').find(a=>a.jobId===job.id);
      if(app)throw new Error('This job has an application. Record its outcome from the application preview.');
      job.status=status;saveJob(job);return json(job);
    }
    if(method==='POST'&&parts[0]==='jobs'&&parts[2]==='clear-duplicate') {
      const job=get('jobs',parts[1]);if(!job)throw new Error('Job not found');job.likelyDuplicate=null;saveJob(job);return json(job);
    }
    if(method==='POST'&&parts[0]==='jobs'&&parts[2]==='prepare') return json(await prepare(parts[1]));
    if(method==='POST'&&parts[0]==='jobs'&&parts[2]==='tailor') {const job=get('jobs',parts[1]);if(!job)throw new Error('Job not found');return json(await tailorResume(job));}
    if(method==='POST'&&path==='resumes/import') {
      if(Number(req.headers.get('content-length')||0)>6_000_000)throw new Error('Upload up to 5 MB');
      const form=await req.formData();const file=form.get('file');let text=String(form.get('text')||'');let name=String(form.get('name')||'Original resume');
      if(file instanceof File&&file.size) {
        if(file.size>5_000_000)throw new Error('Upload up to 5 MB');
        name=file.name;const buffer=Buffer.from(await file.arrayBuffer());
        if(/\.pdf$/i.test(name)) {const {extractText}=await import('unpdf');text=(await extractText(new Uint8Array(buffer),{mergePages:true})).text;}
        else if(/\.docx$/i.test(name)) {const mammoth=await import('mammoth');text=(await mammoth.extractRawText({buffer})).value;}
        else if(/\.(txt|md)$/i.test(name))text=buffer.toString('utf8');
        else throw new Error('Use PDF, DOCX, TXT or Markdown');
      }
      if(!text.trim())throw new Error('No selectable text found. Paste text from your resume (scanned PDFs need OCR outside this app).');
      if(text.length>100000)throw new Error('Resume text is too long');
      const resume:Resume={id:id(),name:name.slice(0,200),text,kind:'original',jobId:null,profileHash:null,createdAt:now(),notes:['Original extracted text; not automatically verified.']};
      saveResume(resume);log('Resume source imported for fact review');return json({resume,suggestions:suggestFacts(text)});
    }
    if(method==='GET'&&parts[0]==='resumes'&&parts[1]) {
      const resume=get('resumes',parts[1]);if(!resume)throw new Error('Resume not found');
      if(parts[2]==='pdf')return new NextResponse(Buffer.from(await resumePdf(resume)),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="resume-${resume.id.slice(0,8)}.pdf"`,'Cache-Control':'no-store'}});
      return new NextResponse(resume.text,{headers:{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="resume-${resume.id.slice(0,8)}.txt"`}});
    }
    if(method==='POST'&&parts[0]==='applications') {
      const appId=parts[1],action=parts[2];
      if(action==='fill'||action==='submit'){const task=queue(appId,action);return json({id:task.id,state:task.state});}
      if(action==='reconcile')return json(reconcile(appId));
      if(action==='outcome') {
        const app=get('applications',appId);if(!app)throw new Error('Application not found');
        if(all('tasks').some(t=>t.applicationId===appId&&['queued','running'].includes(t.state)))throw new Error('Wait for the active worker task');
        const {status,evidence}=z.object({status:z.enum(['Submitted','Submission Uncertain','Failed','Skipped']),evidence:z.string().min(10).max(4000)}).parse(await body(req));
        app.status=status;app.updatedAt=now();app.evidence.push(`User-recorded outcome: ${evidence}`);saveApplication(app);return json(app);
      }
    }
    if(method==='POST'&&parts[0]==='demo-submit') {
      const appId=parts[1];
      const task=all('tasks').find(t=>t.applicationId===appId&&t.state==='running'&&t.mode==='submit'&&t.token===req.headers.get('x-demo-token'));
      if(!task) return json({error:'Demo submission requires an approved worker task'},403);
      const app=get('applications',appId)!;const p=getProfile();const job=get('jobs',app.jobId)!;
      if(app.profileHash!==profileHash(p)||!getSettings().demoAdapterEnabled||job.adapter!=='demo')throw new Error('Application snapshot or adapter permission changed; prepare again');
      const form=await req.formData();
      if(String(form.get('name'))!==p.name||String(form.get('email'))!==p.email)throw new Error('Demo contact data did not match the approved snapshot');
      for(const [i,answer] of app.answers.entries())if(String(form.get(`answer-${i}`))!==answer.answer)throw new Error('Demo answers did not match the approved snapshot');
      const resumeFile=form.get('resume');if(!(resumeFile instanceof File)||resumeFile.size<100||resumeFile.type!=='application/pdf')throw new Error('Demo resume PDF missing');
      const receipt=transaction(()=>{
        const old=confirmedReceipt(appId);if(old)return old.receipt;
        const value=`DEMO-${id().slice(0,12)}`;db.prepare('INSERT INTO receipts VALUES (?,?,?)').run(appId,value,now());return value;
      });
      return json({receipt,message:'Local demo application received. No real application was sent.'});
    }
    return json({error:'Not found'},404);
  } catch(e) {
    if(e instanceof z.ZodError)return json({error:e.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')},400);
    // Do not return provider exceptions, request headers or stack traces to the UI.
    const message=e instanceof Error?e.message:'Operation failed';
    const safe=/sqlite|SQLITE|fetch failed|ENOTFOUND|ENOENT|Cannot|Unexpected token|JSON|Invalid PDF|Invalid ZIP/i.test(message)?'Operation failed. Check the input or file format and try again.':message;
    return json({error:safe},400);
  }
}
export {handler as GET,handler as POST};
