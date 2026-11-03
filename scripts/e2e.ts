import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { emptyProfile, defaultSettings } from '../lib/types';

mkdirSync('.local',{recursive:true});mkdirSync('test-results',{recursive:true});
const dataDir=mkdtempSync(path.resolve('.local/e2e-'));
const port=Number(process.env.E2E_PORT||3101),base='http://127.0.0.1:'+port;
const env:NodeJS.ProcessEnv={...process.env,JOBDESK_DATA_DIR:dataDir,JOBDESK_BASE_URL:base,NEXT_TELEMETRY_DISABLED:'1'};
const logs:string[]=[];const children:ChildProcess[]=[];
function start(args:string[]) {
 const child=spawn(process.execPath,args,{cwd:process.cwd(),env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout?.on('data',d=>logs.push(d.toString()));child.stderr?.on('data',d=>logs.push(d.toString()));children.push(child);return child;
}
const sleep=(n:number)=>new Promise(r=>setTimeout(r,n));
async function request(route:string,body?:unknown,expected=200) {
 const response=await fetch(base+'/api/'+route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(body)});
 const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));return result;
}
async function until(check:()=>Promise<boolean>,label:string,timeout=45000) {
 const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await sleep(600);}throw new Error('Timed out: '+label);
}
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try {
 start(['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)]);
 await until(async()=>{try{return(await fetch(base)).ok;}catch{return false;}},'server startup');
 browser=await chromium.launch({headless:true,...(env.PLAYWRIGHT_CHANNEL?{channel:env.PLAYWRIGHT_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.getByRole('heading',{name:'Your next opportunity belongs here.'}).waitFor();
 await page.screenshot({path:'test-results/inbox-desktop.png',fullPage:true});
 // Verify actual profile editing and resume upload through the UI.
 await page.getByRole('button',{name:'My profile',exact:true}).click();
 await page.getByLabel('Or paste resume text').fill('Test Candidate\ncandidate@example.test\nJavaScript, React, HTML, CSS\nExample Employer | Developer | 2025-01 - 2025-12\nCreated React interfaces.');
 await page.getByRole('button',{name:'Import pasted resume',exact:true}).click();
 await page.getByRole('button',{name:'Close resume',exact:true}).click();
 await page.getByLabel('Full name',{exact:true}).fill('Test Candidate');
 await page.getByLabel('Email',{exact:true}).fill('candidate@example.test');
 await page.getByLabel('Skills',{exact:true}).fill('JavaScript, React, HTML, CSS');
 await page.getByLabel('Years of experience',{exact:true}).fill('1');
 await page.getByRole('checkbox',{name:/I reviewed these facts/}).check();
 await page.getByRole('button',{name:'Save profile',exact:true}).click();
 await until(async()=>(await request('state')).profile.verified,'profile saved');
 // Fixture includes factual history; the UI remains the source-review surface.
 const saved=(await request('state')).profile;
 await request('profile',{...saved,employment:[{id:'test-work',organization:'Example Employer',title:'Developer',start:'2025-01',end:'2025-12',details:'Created React interfaces.'}]});
 await request('settings',{...defaultSettings,demoAdapterEnabled:true});
 start(['--import','tsx','worker/index.ts']);
 await until(async()=>Boolean((await request('state')).worker),'worker heartbeat');
 await page.getByRole('button',{name:/Jobs inbox/}).click();
 await page.getByRole('button',{name:'Try the local demo',exact:true}).click();
 await page.getByRole('heading',{name:'Frontend Developer',exact:true}).waitFor();
 await page.getByRole('button',{name:'Prepare application',exact:true}).click();
 let state=await request('state');
 await until(async()=>{state=await request('state');return state.applications.length===1;},'prepared application');
 const app=state.applications[0];assert.equal(app.status,'Ready');assert.equal(app.answers.at(-1).kind,'draft');
 assert.equal((await request('demo',{})).duplicate,true);
 assert.equal((await request('state')).jobs.length,1);
 await page.getByRole('button',{name:'1. Fill demo & stop',exact:true}).click();
 await until(async()=>{state=await request('state');return Boolean(state.applications[0].filledAt);},'browser filled demo');
 assert.equal(state.applications[0].status,'Ready');assert.equal(state.applications[0].receipt,null);
 await page.getByRole('button',{name:'2. Approve demo submission',exact:true}).waitFor();
 await until(async()=>page.getByRole('button',{name:'2. Approve demo submission',exact:true}).isEnabled(),'fill evidence reflected in UI');
 await page.screenshot({path:'test-results/application-review.png',fullPage:true});
 await page.getByRole('button',{name:'2. Approve demo submission',exact:true}).click();
 await until(async()=>{state=await request('state');return state.applications[0].status==='Submitted';},'confirmed demo submission');
 assert.match(state.applications[0].receipt,/^DEMO-/);
 assert.ok(state.applications[0].evidence.some((s:string)=>s.includes('Browser confirmation')));
 await request('applications/'+app.id+'/submit',{},400);
 // Test resume output and original preservation, including the PDF extraction path.
 const original=state.resumes.find((r:{kind:string})=>r.kind==='original');assert.ok(original);
 const tailored=state.resumes.find((r:{id:string})=>r.id===app.resumeId);
 assert.ok(tailored.text.includes('Example Employer'));assert.ok(tailored.text.includes('2025-01 - 2025-12'));assert.ok(!tailored.text.includes('Docker'));
 const pdf=await fetch(base+'/api/resumes/'+app.resumeId+'/pdf');const pdfBytes=await pdf.arrayBuffer();
 assert.equal(Buffer.from(pdfBytes).subarray(0,4).toString(),'%PDF');
 const form=new FormData();form.set('file',new File([pdfBytes],'test.pdf',{type:'application/pdf'}));
 const imported=await fetch(base+'/api/resumes/import',{method:'POST',body:form,headers:{Origin:base}});
 assert.equal(imported.status,200);assert.ok((await imported.json()).resume.text.includes('Test Candidate'));
 // Missing and ambiguous questions cannot be submitted.
 const unknown=await request('jobs',{description:'React frontend role',title:'React Developer',company:'Unknown Questions',questions:['Do you hold a clearance?'],url:'https://example.test/unknown'});
 const missing=await request('jobs/'+unknown.job.id+'/prepare',{});
 assert.equal(missing.status,'Needs Input');assert.ok(missing.missing.includes('Do you hold a clearance?'));
 const csv=await request('imports/csv',{csv:'title,company,description,url\nReact Developer,CSV Example,React and CSS,https://example.test/csv'});
 assert.equal(csv[0].duplicate,false);
 // Cross-origin browser requests cannot mutate local candidate data.
 const cross=await fetch(base+'/api/settings',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify(defaultSettings)});
 assert.equal(cross.status,400);
 // Verify actual automatic-mode submission on another explicitly local fixture.
 process.env.JOBDESK_DATA_DIR=dataDir;
 const {importJob}=await import('../lib/jobs');
 const autoJob=importJob({description:'LOCAL DEMO ONLY. Requirements: React and JavaScript. Remote within India. Experience: 0-3 years.',title:'React Developer',company:'Automatic Local Demo',source:'Local demo',sourceId:'auto-demo',adapter:'demo',remoteEligibility:'India'}).job;
 await request('settings',{...defaultSettings,demoAdapterEnabled:true,automaticDemo:true,autoMinScore:0});
 const auto=await request('jobs/'+autoJob.id+'/prepare',{});
 await until(async()=>{const s=await request('state');return s.applications.find((a:{id:string})=>a.id===auto.id)?.status==='Submitted';},'automatic demo confirmation');
 await request('settings',{...defaultSettings,demoAdapterEnabled:true});
 // Responsive inbox, real tab changes, and manual job import controls.
 await page.getByRole('button',{name:'Close job',exact:true}).click();
 await page.getByRole('button',{name:'Resume studio',exact:true}).click();
 await page.getByRole('heading',{name:'Create a job-specific version'}).waitFor();
 await page.getByRole('button',{name:'Automation',exact:true}).click();
 await page.getByRole('heading',{name:'What runs automatically'}).waitFor();
 await page.getByRole('heading',{name:'Connect YC & Wellfound'}).waitFor();
 assert.equal((await request('state')).automation.providerKeyConfigured,false);
 await request('automation',{...(await request('state')).automation.config,fantasticEnabled:true},400);
 await page.getByLabel('Fantastic.jobs API key',{exact:true}).fill('fixture-ui-key-not-a-real-credential');
 await page.getByRole('button',{name:'Save provider key',exact:true}).click();
 await page.getByRole('button',{name:'Remove saved key',exact:true}).waitFor();
 const providerState=await request('state');
 assert.equal(providerState.automation.providerKeyConfigured,true);
 assert.equal(providerState.automation.config.fantasticEnabled,false,'Saving a key cannot enable paid requests');
 assert.ok(!JSON.stringify(providerState).includes('fixture-ui-key'));
 assert.equal(await page.getByLabel('Fantastic.jobs API key',{exact:true}).inputValue(),'');
 await page.getByRole('button',{name:'Remove saved key',exact:true}).click();
 await until(async()=>!(await request('state')).automation.providerKeyConfigured,'provider key removed');
 await page.getByRole('button',{name:'Save automation settings',exact:true}).click();
 assert.equal((await request('state')).automation.config.enabled,false);
 assert.equal(await page.getByRole('link',{name:'Open Naukri Neo setup'}).getAttribute('href'),'https://www.naukri.com/naukri360/neo-auto-apply-job-agent');
 await page.getByRole('button',{name:/Jobs inbox/}).click();
 await page.getByRole('button',{name:'Import a job',exact:true}).click();
 await page.getByLabel('Job description',{exact:true}).fill('Title: Next.js Developer\nCompany: UI Import Example\nLocation: Remote within India\nRequirements: React and Next.js');
 await page.getByRole('button',{name:'Extract & review',exact:true}).click();
 await page.getByLabel('Title',{exact:true}).waitFor();assert.equal(await page.getByLabel('Title',{exact:true}).inputValue(),'Next.js Developer');
 await page.getByRole('button',{name:'Save opportunity',exact:true}).click();
 await page.getByRole('button',{name:'Close job',exact:true}).click();
 await page.getByRole('button',{name:'Automation',exact:true}).click();
 await page.getByLabel('Original post URL',{exact:true}).fill('https://www.linkedin.com/posts/jobdesk-fixture?trk=test');
 await page.getByLabel('Hiring post text',{exact:true}).fill('We are hiring.\nRole: Frontend Developer\nCompany: Accenture\nPay a registration fee to apply.');
 await page.getByRole('button',{name:'Extract hiring post',exact:true}).click();
 await page.locator('.detail-drawer').getByText('High risk',{exact:true}).waitFor();
 assert.ok((await request('state')).jobs.some((j:{source:string;quality:{risk:{level:string}}})=>j.source==='LinkedIn hiring post'&&j.quality.risk.level==='high'));
 await page.getByRole('button',{name:'Close job',exact:true}).click();
 await page.getByLabel('Filter by risk',{exact:true}).selectOption('high');
 assert.equal(await page.locator('.job-row').count(),1);
 await page.getByLabel('Filter by risk',{exact:true}).selectOption('all');
 await request('sources/career',{url:'https://example.test/private',company:'Unconnected Company'},400);
 await page.setViewportSize({width:390,height:844});
 await until(async()=>page.locator('.sidebar').evaluate(el=>el.getBoundingClientRect().right<=0),'sidebar hidden on mobile');
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();
 await until(async()=>page.locator('.sidebar').evaluate(el=>el.getBoundingClientRect().left>=0),'mobile navigation opened');
 await page.getByRole('button',{name:/Jobs inbox/}).click();
 await until(async()=>page.locator('.sidebar').evaluate(el=>el.getBoundingClientRect().right<=0),'mobile navigation closed');
 await page.screenshot({path:'test-results/inbox-mobile.png',fullPage:true,animations:'disabled'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'mobile overflow');
 assert.deepEqual(errors,[]);
 console.log('E2E passed: profile review, resume import/PDF extraction, dedup, CSV, missing answers, browser fill, approval, automatic mode, receipts, duplicate submission block, origin protection and mobile navigation/layout.');
 console.log('Screenshots: test-results/inbox-desktop.png, application-review.png, inbox-mobile.png');
} catch(e) {
 writeFileSync('test-results/e2e-server.log',logs.join(''));throw e;
} finally {
 await browser?.close();
 for(const child of children.reverse())child.kill();
}

