import { ensureDatabase } from '@/lib/db/client';

ensureDatabase();
console.log('Database migrations are current.');
