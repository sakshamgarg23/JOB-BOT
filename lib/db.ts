import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { emptyProfile, defaultSettings, type Profile, type Settings, type Job, type Resume, type Application, type Task } from './types';

export const dataDir = path.resolve(process.env.JOBDESK_DATA_DIR || '.local');
mkdirSync(dataDir, {recursive:true, mode:0o700});
const globalDb = globalThis as typeof globalThis & { jobdeskDb?: DatabaseSync };
export const db = globalDb.jobdeskDb ?? new DatabaseSync(path.join(dataDir, 'jobdesk.sqlite'));
globalDb.jobdeskDb = db;
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, canonical TEXT UNIQUE, source_key TEXT UNIQUE, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS resumes (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY, job_id TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, application_id TEXT NOT NULL, state TEXT NOT NULL, data TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS active_task ON tasks(application_id) WHERE state IN ('queued','running');
CREATE TABLE IF NOT EXISTS receipts (application_id TEXT PRIMARY KEY, receipt TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, at TEXT NOT NULL, message TEXT NOT NULL, level TEXT NOT NULL);
`);
export const now = () => new Date().toISOString();
export const id = () => randomUUID();
export function kv<T>(key: string, fallback: T): T {
  const row = db.prepare('SELECT value FROM kv WHERE key=?').get(key) as {value:string}|undefined;
  return row ? JSON.parse(row.value) : fallback;
}
export function setKv(key: string, value: unknown) { db.prepare('INSERT OR REPLACE INTO kv VALUES (?,?)').run(key, JSON.stringify(value)); }
export const getProfile = () => kv<Profile>('profile', emptyProfile);
export const getSettings = () => kv<Settings>('settings', defaultSettings);
type Tables = { jobs:Job; resumes:Resume; applications:Application; tasks:Task };
export function all<K extends keyof Tables>(table: K): Tables[K][] {
  return (db.prepare(`SELECT data FROM ${table} ORDER BY rowid DESC`).all() as {data:string}[]).map(r => JSON.parse(r.data));
}
export function get<K extends keyof Tables>(table: K, key: string): Tables[K] | undefined {
  const row = db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(key) as {data:string}|undefined;
  return row && JSON.parse(row.data);
}
export function saveJob(job: Job) { db.prepare('UPDATE jobs SET data=? WHERE id=?').run(JSON.stringify(job),job.id); }
export function saveResume(resume: Resume) { db.prepare('INSERT INTO resumes VALUES (?,?)').run(resume.id,JSON.stringify(resume)); }
export function saveApplication(app: Application) {
  db.prepare('INSERT INTO applications VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(app.id,app.jobId,JSON.stringify(app));
  const job = get('jobs',app.jobId); if (job) { job.status=app.status; saveJob(job); }
}
export function saveTask(task: Task) {
  db.prepare('INSERT INTO tasks VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,data=excluded.data').run(task.id,task.applicationId,task.state,JSON.stringify(task));
}
export function log(message: string, level = 'info') {
  db.prepare('INSERT INTO activity VALUES (?,?,?,?)').run(id(),now(),message,level);
  db.prepare('DELETE FROM activity WHERE id NOT IN (SELECT id FROM activity ORDER BY at DESC LIMIT 200)').run();
}
export function activity() { return db.prepare('SELECT * FROM activity ORDER BY at DESC LIMIT 40').all(); }
export function transaction<T>(fn:()=>T): T { db.exec('BEGIN IMMEDIATE'); try { const result=fn(); db.exec('COMMIT'); return result; } catch(e) { db.exec('ROLLBACK'); throw e; } }
