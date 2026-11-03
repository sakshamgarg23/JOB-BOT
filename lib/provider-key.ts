import {spawn} from 'node:child_process';
import {kv,setKv} from './db';

const slot='fantastic-jobs-key-dpapi';
// Secrets travel over stdin, never command arguments, logs or plaintext files.
async function protect(value:string,decrypt=false):Promise<string>{
 if(process.platform!=='win32')throw new Error('Key storage requires Windows.');
 const command="$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $inputValue=[Console]::In.ReadToEnd(); "+(decrypt
  ?"$bytes=[Convert]::FromBase64String($inputValue); $clear=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Text.Encoding]::UTF8.GetString($clear))"
  :"$bytes=[Text.Encoding]::UTF8.GetBytes($inputValue); $sealed=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($sealed))");
 return new Promise((resolve,reject)=>{
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,stdio:['pipe','pipe','ignore']});
  let output='';let ended=false;
  const finish=(error=false)=>{if(ended)return;ended=true;clearTimeout(timer);if(error)reject(new Error('Windows could not access the saved provider key. Save it again from this Windows account.'));else resolve(output);};
  const timer=setTimeout(()=>{child.kill();finish(true);},10000);
  child.stdout.setEncoding('utf8');child.stdout.on('data',(data:string)=>{output+=data;if(output.length>20000){child.kill();finish(true);}});
  child.on('error',()=>finish(true));child.on('close',code=>finish(code!==0||!output));child.stdin.on('error',()=>finish(true));child.stdin.end(value,'utf8');
 });
}
export const providerKeyConfigured=()=>!!kv<string|null>(slot,null);
export async function saveProviderKey(value:string){
 if(!value){setKv(slot,null);return;}
 if(!/^[\x21-\x7e]{8,4096}$/.test(value))throw new Error('Enter a valid provider API key without spaces.');
 const sealed=await protect(value);setKv(slot,sealed);
}
export async function readProviderKey(){const sealed=kv<string|null>(slot,null);return sealed?protect(sealed,true):null;}
