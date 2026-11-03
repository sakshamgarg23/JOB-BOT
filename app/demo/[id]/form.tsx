'use client';
import { useState } from 'react';
import type { Application } from '@/lib/types';
export default function DemoForm({application}:{application:Application}) {
  const [receipt,setReceipt]=useState(''),[error,setError]=useState('');
  return <form onSubmit={async e=>{e.preventDefault();setError('');const response=await fetch(`/api/demo-submit/${application.id}`,{method:'POST',body:new FormData(e.currentTarget)});const data=await response.json();if(!response.ok)setError(data.error);else setReceipt(data.receipt);}}>
    <label>Full name<input name="name" required/></label><label>Email<input name="email" type="email" required/></label>
    {application.answers.map((a,i)=><label key={i}>Screening: {a.question}<textarea name={`answer-${i}`} required/></label>)}
    <label>Resume PDF<input type="file" name="resume" accept="application/pdf" required/></label><button className="primary">Submit local demo</button>
    {error&&<p role="alert">{error}</p>}{receipt&&<p data-receipt={receipt}>Local demo received: {receipt}</p>}
  </form>;
}
