import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import path from 'node:path';
mkdirSync('.local',{recursive:true});
process.env.JOBDESK_DATA_DIR=mkdtempSync(path.resolve('.local/automation-test-'));
const {setKv,all,getProfile}=await import('../lib/db');
const {emptyProfile}=await import('../lib/types');
const {plainText,parseRemotive,parseGreenhouse,feedEligibility,automationTick,defaultAutomation}=await import('../lib/automation');
const fixture=(id:number,location:string,title='Frontend Developer')=>({id,title,company_name:'Fixture Employer',candidate_required_location:location,url:'https://remotive.com/remote-jobs/software-dev/test-'+id,description:'<h2>Requirements</h2><p>JavaScript, React, HTML, CSS.</p><p>Experience: 0-3 years.</p>',publication_date:'2026-10-31T09:00:00'});
test('feed parsing preserves original dates, attribution and conservative country eligibility',()=>{
 const job=parseRemotive({jobs:[fixture(1,'India')]})[0];
 assert.equal(job.source,'Remotive');assert.equal(job.receivedAt,null);assert.ok(job.postedAt?.startsWith('2026-10-31'));
 assert.equal(job.remoteEligibility,'India');assert.equal(job.adapter,'manual');
 assert.equal(feedEligibility('APAC'),'Unknown');assert.equal(feedEligibility('USA'),'Restricted');assert.equal(feedEligibility('Worldwide'),'Worldwide');
 assert.equal(plainText('<script>evil()</script><p>React &amp; CSS</p>'),'React & CSS');
 const greenhouse=parseGreenhouse({jobs:[{id:42,title:'Developer',absolute_url:'https://example.test/42',location:{name:'India'},updated_at:'2026-10-30'}]},'example')[0];
 assert.equal(greenhouse.postedAt,null);assert.equal(greenhouse.company,'');assert.equal(greenhouse.sourceId,'example:42');
});
test('scheduled discovery imports actual-format feeds and waits for profile review',async()=>{
 setKv('automation-config',{...defaultAutomation,enabled:true});
 setKv('profile',{...emptyProfile,name:'Fixture Candidate',email:'fixture@example.test',skills:['React','JavaScript','HTML','CSS']});
 let calls=0;
 const fakeFetch=(async()=>{calls++;return new Response(JSON.stringify({jobs:[fixture(101,'India'),fixture(102,'APAC'),fixture(103,'USA'),fixture(104,'Worldwide','DevOps Engineer')]}),{status:200});}) as typeof fetch;
 const first=await automationTick(fakeFetch);assert.equal(calls,1);assert.equal(first?.imported,2);assert.equal(first?.awaitingProfile,true);assert.equal(all('applications').length,0);
 setKv('profile',{...getProfile(),verified:true,yearsExperience:1});
 setKv('automation-requested',true);
 const second=await automationTick(fakeFetch);
 assert.equal(calls,1,'manual refresh cannot bypass six-hour source limit');
 assert.equal(second?.duplicates,2);assert.equal(second?.prepared,1);
 assert.equal(all('applications').length,1);assert.equal(all('tasks').length,0,'discovery cannot submit applications');
 assert.equal(all('jobs').length,2);
 const apps=all('applications');assert.equal(apps[0].status,'Ready');
 setKv('automation-config',{...defaultAutomation,enabled:false});
 setKv('automation-requested',true);await automationTick(fakeFetch);assert.equal(calls,1,'disabled scheduler cannot fetch');
});

