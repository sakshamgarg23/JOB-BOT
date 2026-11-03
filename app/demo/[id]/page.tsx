import { get } from '@/lib/db';
import { notFound } from 'next/navigation';
import DemoForm from './form';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;const app=get('applications',id);if(!app)notFound();
  const job=get('jobs',app.jobId);if(job?.adapter!=='demo')notFound();
  return <main className="demo-page"><div className="eyebrow">LOCAL AUTOMATION SANDBOX</div><h1>Orbit Labs</h1><p>This is a local test form. It does not contact an employer.</p><DemoForm application={app}/></main>;
}
