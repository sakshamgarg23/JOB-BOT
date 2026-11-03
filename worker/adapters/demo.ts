import { chromium } from 'playwright';
import { get, getProfile, getSettings } from '../../lib/db';
import { resumePdf, profileHash } from '../../lib/resume';
import { confirmedReceipt, automaticEligible } from '../../lib/applications';
import type { Task } from '../../lib/types';

export async function runDemo(task:Task) {
  const app=get('applications',task.applicationId)!;const p=getProfile();const s=getSettings();const job=get('jobs',app.jobId)!;
  if(!s.demoAdapterEnabled||job.adapter!=='demo'||!p.verified||app.profileHash!==profileHash(p))throw new Error('Snapshot or demo adapter permission changed; prepare again');
  if(app.missing.length||!app.resumeId)throw new Error('Required application data is missing');
  if(task.mode==='submit'&&!app.approvedAt)throw new Error('Submission approval missing');
  if(task.automatic&&!automaticEligible(job,p,s,app))throw new Error('Automatic-mode permission or rules changed');
  const old=confirmedReceipt(app.id);if(old)return {receipt:old.receipt,evidence:'Found existing local demo confirmation before retrying'};
  const base=new URL(process.env.JOBDESK_BASE_URL||'http://127.0.0.1:3000');
  if(!['127.0.0.1','localhost'].includes(base.hostname)||!['http:','https:'].includes(base.protocol))throw new Error('Demo adapter only permits loopback URLs');
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  try {
    const context=await browser.newContext({extraHTTPHeaders:{'x-demo-token':task.token}});
    const page=await context.newPage();page.setDefaultTimeout(12000);
    // This adapter never reads a user-supplied application URL.
    await page.goto(`${base.origin}/demo/${app.id}`,{waitUntil:'networkidle'});
    if(await page.locator('[data-challenge]').count())throw new Error('Challenge detected; user input required');
    await page.getByLabel('Full name',{exact:true}).fill(p.name);
    await page.getByLabel('Email',{exact:true}).fill(p.email);
    for(const [i,a]of app.answers.entries())await page.locator(`[name="answer-${i}"]`).fill(a.answer!);
    const resume=get('resumes',app.resumeId);if(!resume)throw new Error('Resume not found');
    await page.getByLabel('Resume PDF').setInputFiles({name:'tailored-resume.pdf',mimeType:'application/pdf',buffer:Buffer.from(await resumePdf(resume))});
    if(await page.getByLabel('Full name',{exact:true}).inputValue()!==p.name||await page.getByLabel('Email',{exact:true}).inputValue()!==p.email)throw new Error('Contact verification failed');
    for(const [i,a] of app.answers.entries())if(await page.locator(`[name="answer-${i}"]`).inputValue()!==a.answer)throw new Error('Answer verification failed');
    if(await page.getByLabel('Resume PDF').evaluate(el=>(el as HTMLInputElement).files?.length)!==1)throw new Error('Resume attachment verification failed');
    if(task.mode==='fill')return {receipt:null,evidence:`Filled and verified ${app.answers.length+2} fields and attached the tailored PDF on the local demo. Stopped before submission.`};
    // Recheck the snapshot and permission immediately before the submit click.
    if(profileHash(getProfile())!==app.profileHash||!getSettings().demoAdapterEnabled)throw new Error('Profile or adapter permission changed while filling');
    if(task.automatic&&!automaticEligible(job,getProfile(),getSettings(),app))throw new Error('Automatic-mode permission or rules changed while filling');
    await page.getByRole('button',{name:'Submit local demo'}).click();
    await page.locator('[data-receipt]').waitFor();
    const shown=await page.locator('[data-receipt]').getAttribute('data-receipt');const receipt=confirmedReceipt(app.id);
    if(!shown||shown!==receipt?.receipt)throw new Error('No matching submission confirmation');
    return {receipt:shown,evidence:`Browser confirmation and stored local demo receipt agree: ${shown}`};
  } finally { await browser.close(); }
}
