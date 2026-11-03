import { db, all, get, id, now, setKv, saveTask, saveApplication, transaction, log } from '../lib/db';
import { confirmedReceipt } from '../lib/applications';
import { runDemo } from './adapters/demo';
import { automationTick } from '../lib/automation';
import type { Task } from '../lib/types';

const workerId=id();let stopped=false;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function heartbeat() {
  transaction(()=>{
    const row=db.prepare("SELECT value FROM kv WHERE key='worker'").get() as {value:string}|undefined;
    const old=row?JSON.parse(row.value):null;
    if(old&&old.state==='running'&&old.id!==workerId&&Date.now()-Date.parse(old.at)<15000)throw new Error('Another worker is active. Stop it before starting a second worker.');
    setKv('worker',{id:workerId,pid:process.pid,capabilities:['discovery','demo'],at:now(),state:'running'});
  });
}
function recoverStale() {
  for(const task of all('tasks').filter(t=>t.state==='running')) {
    const app=get('applications',task.applicationId)!;const receipt=confirmedReceipt(app.id);
    app.status=receipt?'Submitted':task.mode==='submit'?'Submission Uncertain':'Ready';app.receipt=receipt?.receipt||null;
    app.evidence.push(receipt?`Recovered confirmation: ${receipt.receipt}`:'Worker was interrupted; inspect before retrying.');app.updatedAt=now();saveApplication(app);
    task.state='failed';task.error='Interrupted task recovered without automatic retry';task.updatedAt=now();saveTask(task);
  }
}
export function claim():Task|undefined {
  return transaction(()=>{
    const next=all('tasks').reverse().find(t=>t.state==='queued');
    if(!next)return;next.state='running';next.updatedAt=now();saveTask(next);return next;
  });
}
async function main() {
  heartbeat();recoverStale();log('Local worker started: discovery and demo tasks');console.log('Jobdesk worker running: public-feed discovery and local demo tasks. Ctrl+C to stop.');
  const timer=setInterval(()=>{try{heartbeat();}catch{stopped=true;}},4000);
  process.on('SIGINT',()=>{stopped=true;});process.on('SIGTERM',()=>{stopped=true;});
  try {
    while(!stopped) {
      try {await automationTick();}catch {log('Automatic discovery paused after an error. Check Automation status.','error');}
      const task=claim();if(!task){await sleep(1200);continue;}
      const app=get('applications',task.applicationId)!;
      try {
        const result=await runDemo(task);const current=get('applications',app.id)!;
        current.evidence.push(result.evidence);current.updatedAt=now();
        if(result.receipt){current.status='Submitted';current.receipt=result.receipt;}else{current.status='Ready';current.filledAt=now();}
        saveApplication(current);task.state='done';task.updatedAt=now();saveTask(task);log(task.mode==='fill'?'Demo fill completed; waiting for review':'Demo submission confirmed');
      } catch {
        // Exceptions can contain browser diagnostics. Store a fixed, credential-free explanation.
        const receipt=confirmedReceipt(app.id);const current=get('applications',app.id)!;
        current.status=receipt?'Submitted':task.mode==='submit'?'Submission Uncertain':'Failed';current.receipt=receipt?.receipt||null;
        const explanation=receipt?`Confirmation found after browser interruption: ${receipt.receipt}`:task.mode==='submit'?'Submission did not return a clear confirmation. Check the receipt before any retry.':'Demo fill failed. Check that the app is running, the browser is installed and the profile snapshot is current.';
        current.evidence.push(explanation);current.updatedAt=now();saveApplication(current);
        task.state='failed';task.error=explanation;task.updatedAt=now();saveTask(task);log(explanation,'error');
      }
    }
  } finally { clearInterval(timer);setKv('worker',{id:workerId,at:now(),state:'stopped'}); }
}
main().catch(()=>{console.error('Worker could not start. Check for another worker or a database lock.');process.exitCode=1;});
