import { db, dataDir } from '../lib/db';
db.prepare('SELECT 1').get();
console.log(`SQLite database ready in ${dataDir}. No candidate facts or demo applications were seeded.`);
