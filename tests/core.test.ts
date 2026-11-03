import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import path from 'node:path';

mkdirSync('.local',{recursive:true});
process.env.JOBDESK_DATA_DIR=mkdtempSync(path.resolve('.local/unit-'));
const {emptyProfile,defaultSettings,jobInputSchema}=await import('../lib/types');
const {importJob,importCsv,matchJob,extractJob,canonicalUrl}=await import('../lib/jobs');
const {buildResume,profileHash,resumePdf}=await import('../lib/resume');
const {prepare,queue,answerQuestion,reconcile}=await import('../lib/applications');
const {setKv,all,get,db,now}=await import('../lib/db');
const profile={...emptyProfile,name:'Test Candidate',email:'candidate@example.test',skills:['JavaScript','React','HTML','CSS'],yearsExperience:1,verified:true,
 employment:[{id:'work',organization:'Example Employer',title:'Developer',start:'2025-01',end:'2025-12',details:'Maintained CSS components.\nCreated React interfaces.'}],
 projects:[{id:'project',organization:'Personal',title:'Portfolio',start:'2025',end:'',details:'Built a React portfolio.'}]};
const settings={...defaultSettings,demoAdapterEnabled:true};
setKv('profile',profile);setKv('settings',settings);
const make=(extra={})=>importJob({description:'Requirements: JavaScript, React. Experience: 0-3 years.',title:'Frontend Developer',company:'Example '+Math.random(),...extra}).job;

test('canonical and source-ID duplicates preserve a single application target',()=>{
 const job=make({url:'https://example.test/jobs/42?utm_source=mail&jobId=42',source:'Example',sourceId:'42'});
 assert.equal(importJob({...job,url:'https://example.test/jobs/42?jobId=42&utm_campaign=test'}).duplicate,true);
 assert.equal(importJob({...job,url:'https://example.test/different',description:'Changed details'}).job.id,job.id);
 assert.equal(canonicalUrl('https://example.test/jobs/42?jobId=43')===canonicalUrl(job.url),false);
 assert.throws(()=>canonicalUrl('javascript:alert(1)'));
});
test('likely duplicate stays visible and blocks demo automation',async()=>{
 const first=make({company:'Same',location:'India',url:'https://example.test/one'});
 const second=importJob({...first,url:'https://example.test/two',adapter:'demo',sourceId:''}).job;
 assert.equal(second.likelyDuplicate,first.id);
 const app=await prepare(second.id);assert.throws(()=>queue(app.id,'fill'),/duplicate/i);
});
test('India eligibility is not inferred from generic remote or US-only remote',()=>{
 const unknown=make({description:'React, JavaScript. Remote work.'});
 assert.equal(unknown.remoteEligibility,'Unknown');
 const us=make({description:'React. Remote - US only.'});
 assert.equal(us.remoteEligibility,'Restricted');
 assert.ok(matchJob(us,profile,settings).hardBlocks.some(x=>x.includes('outside India')));
 const india=make({description:'React. Remote within India.'});
 assert.equal(india.remoteEligibility,'India');
});
test('undisclosed salary is an uncertainty, never a salary hard block',()=>{
 const job=make();const m=matchJob(job,profile,{...settings,salaryHard:true,minimumSalary:900000});
 assert.equal(m.salary,'Undisclosed');assert.equal(m.hardBlocks.length,0);
 const annual=make({description:'React, JavaScript. Salary: 6-8 LPA.'});
 assert.equal(annual.salaryMax,800000);
 assert.ok(matchJob(annual,profile,{...settings,salaryHard:true,minimumSalary:900000}).hardBlocks.some(x=>x.includes('salary')));
});
test('preferred skills are separate and dates remain independent',()=>{
 const parsed=extractJob(jobInputSchema.parse({description:'Title: Frontend Developer\nCompany: Example\nRequirements: React\nPreferred:\nAWS\nPosted: 2026-10-10'}));
 assert.equal(parsed.title,'Frontend Developer');assert.equal(parsed.company,'Example');
 assert.ok(parsed.preferredSkills.includes('AWS'));assert.ok(!parsed.requiredSkills.includes('AWS'));
 assert.equal(parsed.postedAt,'2026-10-10');assert.equal(parsed.receivedAt,null);
});
test('CSV handles quoted multiline text and reports duplicates and malformed rows',()=>{
 const csv='title,company,description,url\nFrontend,CSV Company,"React\nJavaScript",https://csv.test/one\nFrontend,CSV Company,React,https://csv.test/one';
 const report=importCsv(csv);assert.equal(report.length,2);assert.equal('duplicate' in report[1]&&report[1].duplicate,true);
 assert.throws(()=>importCsv('title,company\nTest,Test'),/description/);
});
test('unknown and ambiguous questions are never answered using a keyword guess',async()=>{
 const job=make({questions:['How many years of React experience?','Expected annual salary']});
 const app=await prepare(job.id);assert.equal(app.status,'Needs Input');
 assert.ok(app.missing.includes('How many years of React experience?'));assert.ok(app.missing.includes('Expected annual salary'));
 assert.equal(answerQuestion('Years of experience',profile,job).answer,'1');
 assert.equal(answerQuestion('Years of experience',{...profile,verified:false},job).answer,null);
});
test('tailoring preserves dates, employers and bullet wording and omits unverified skills',async()=>{
 const job=make({requiredSkills:['React','Docker']});const built=buildResume(job,profile);
 assert.ok(built.text.includes('Example Employer'));assert.ok(built.text.includes('2025-01 - 2025-12'));
 for(const bullet of profile.employment[0].details.split('\n'))assert.ok(built.text.includes(bullet));
 assert.ok(!built.text.includes('Docker'));assert.ok(built.notes.some(n=>n.includes('Docker')));
 assert.throws(()=>buildResume(job,{...profile,verified:false}),/verify/);
 const pdf=await resumePdf({id:'test',name:'Test',kind:'tailored',createdAt:now(),jobId:job.id,profileHash:profileHash(profile),...built});
 assert.equal(Buffer.from(pdf).subarray(0,4).toString(),'%PDF');
});
test('approval requires a successful fill and current verified profile; active tasks cannot duplicate',async()=>{
 const job=make({adapter:'demo'});const app=await prepare(job.id);
 assert.throws(()=>queue(app.id,'submit'),/fill/);
 queue(app.id,'fill');assert.throws(()=>queue(app.id,'fill'),/already/);
 const other=await prepare(make({adapter:'demo'}).id);
 setKv('profile',{...profile,phone:'changed'});assert.throws(()=>queue(other.id,'fill'),/changed/);setKv('profile',profile);
});
test('automatic mode does not accept draft answers or missing job skills',async()=>{
 setKv('settings',{...settings,automaticDemo:true,autoMinScore:0});
 const draft=await prepare(make({adapter:'demo',remoteEligibility:'India',questions:['Why this role?']}).id);
 assert.equal(all('tasks').some(t=>t.applicationId===draft.id),false);
 const missing=await prepare(make({adapter:'demo',remoteEligibility:'India',requiredSkills:['React','Docker']}).id);
 assert.equal(all('tasks').some(t=>t.applicationId===missing.id),false);
 const unknown=await prepare(make({adapter:'demo'}).id);
 assert.equal(all('tasks').some(t=>t.applicationId===unknown.id),false);
 const verified=await prepare(make({adapter:'demo',remoteEligibility:'India'}).id);
 assert.equal(all('tasks').find(t=>t.applicationId===verified.id)?.mode,'submit');setKv('settings',settings);
});
test('uncertain outcomes only reconcile when a receipt actually exists',async()=>{
 const job=make({adapter:'demo'});const app=await prepare(job.id);
 assert.throws(()=>reconcile(app.id),/No confirmation/);
 db.prepare('INSERT INTO receipts VALUES (?,?,?)').run(app.id,'DEMO-confirmed',now());
 assert.equal(reconcile(app.id).status,'Submitted');assert.equal(get('applications',app.id)?.receipt,'DEMO-confirmed');
 assert.throws(()=>queue(app.id,'submit'),/Duplicate/);
});

