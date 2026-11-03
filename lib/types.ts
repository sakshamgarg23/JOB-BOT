import { z } from 'zod';

const text = z.string().max(30000);
export const historySchema = z.object({ id: z.string(), organization: text, title: text, start: text, end: text, details: text });
export const profileSchema = z.object({
  name: text, email: z.union([z.literal(''), z.email()]), phone: text, location: text,
  portfolio: text, linkedin: text, github: text, skills: z.array(z.string().max(100)).max(100),
  yearsExperience: z.number().min(0).max(60).nullable(), currentSalary: z.number().min(0).nullable(),
  expectedSalary: z.number().min(0).nullable(), currency: z.enum(['INR', 'USD', 'EUR', 'GBP']),
  noticePeriod: text, availability: text, authorization: text, sponsorship: z.enum(['', 'Yes', 'No']),
  employment: z.array(historySchema).max(30), education: z.array(historySchema).max(20), projects: z.array(historySchema).max(30),
  answers: z.array(z.object({ question: text, answer: text })).max(100),
  verified: z.boolean(), sourceResumeId: z.string().nullable(),
});
export type Profile = z.infer<typeof profileSchema>;
export const settingsSchema = z.object({
  targetRoles: z.array(z.string().max(100)).max(30), locations: z.array(z.string().max(100)).max(30),
  minExperience: z.number().min(0).max(60), maxExperience: z.number().min(0).max(60),
  remote: z.boolean(), relocate: z.boolean(), requireIndiaEligible: z.boolean(),
  minimumSalary: z.number().min(0).nullable(), salaryHard: z.boolean(), locationHard: z.boolean(),
  demoAdapterEnabled: z.boolean(), automaticDemo: z.boolean(), autoMinScore: z.number().min(0).max(100),
  aiEnabled: z.boolean(),
}).refine(s => s.minExperience <= s.maxExperience, 'Minimum experience must not exceed maximum');
export type Settings = z.infer<typeof settingsSchema>;
export const statuses = ['New','Shortlisted','Needs Input','Ready','Applying','Submitted','Submission Uncertain','Failed','Skipped'] as const;
export type Status = typeof statuses[number];
export const jobInputSchema = z.object({
  title: z.string().max(500).default(''), company: z.string().max(500).default(''),
  location: z.string().max(500).default(''), description: text,
  url: z.string().max(4000).default(''), source: z.string().max(100).default('Manual'),
  sourceId: z.string().max(200).default(''), postedAt: z.string().max(100).nullable().default(null),
  receivedAt: z.string().max(100).nullable().default(null),
  experienceMin: z.number().min(0).max(60).nullable().default(null),
  experienceMax: z.number().min(0).max(60).nullable().default(null),
  salaryMin: z.number().min(0).nullable().default(null), salaryMax: z.number().min(0).nullable().default(null),
  currency: z.enum(['INR','USD','EUR','GBP']).nullable().default(null),
  salaryPeriod: z.enum(['annual','monthly','hourly']).nullable().default(null),
  remoteEligibility: z.enum(['India','Worldwide','Restricted','Unknown','Onsite']).default('Unknown'),
  requiredSkills: z.array(z.string().max(100)).max(100).default([]),
  preferredSkills: z.array(z.string().max(100)).max(100).default([]),
  questions: z.array(z.string().max(2000)).max(50).default([]),
  adapter: z.enum(['manual','demo']).default('manual'),
  originKind: z.enum(['job_listing','hiring_post','email_alert']).optional(),
  sourcePostUrl: z.string().max(4000).optional(),
  companyWebsite: z.union([z.literal(''),z.url()]).optional(),
  descriptionComplete: z.boolean().optional(),
  postingDateKind: z.enum(['published','first_published','post_created','unknown']).optional(),
});
export type JobInput = z.infer<typeof jobInputSchema>;
export type Job = JobInput & { id: string; discoveredAt: string; status: Status; likelyDuplicate: string | null };
export type Match = { score: number; matching: string[]; missing: string[]; preferred: string[]; reasons: string[]; uncertainties: string[]; hardBlocks: string[]; experience: string; location: string; salary: string };
export type Resume = { id: string; name: string; kind: 'original'|'tailored'; text: string; createdAt: string; jobId: string|null; profileHash: string|null; notes: string[] };
export type Application = {
  id: string; jobId: string; status: Status; createdAt: string; updatedAt: string;
  profileHash: string; resumeId: string; answers: {question: string; answer: string|null; kind: 'verified'|'draft'|'unknown'}[];
  missing: string[]; evidence: string[]; approvedAt: string|null; filledAt: string|null; receipt: string|null;
};
export type Task = { id: string; applicationId: string; mode: 'fill'|'submit'; state: 'queued'|'running'|'done'|'failed'; createdAt: string; updatedAt: string; token: string; error: string|null; automatic: boolean };
export const emptyProfile: Profile = {
  name:'', email:'', phone:'', location:'', portfolio:'', linkedin:'', github:'', skills:[], yearsExperience:null,
  currentSalary:null, expectedSalary:null, currency:'INR', noticePeriod:'', availability:'', authorization:'', sponsorship:'',
  employment:[], education:[], projects:[], answers:[], verified:false, sourceResumeId:null,
};
export const defaultSettings: Settings = {
  targetRoles:['React Developer','Frontend Developer','Next.js Developer','Junior Full Stack','MERN Developer','Associate Software Engineer','Software Engineer I'],
  locations:['India'], minExperience:0, maxExperience:3, remote:true, relocate:false, requireIndiaEligible:true,
  minimumSalary:null, salaryHard:false, locationHard:false, demoAdapterEnabled:false, automaticDemo:false, autoMinScore:75, aiEnabled:false,
};
