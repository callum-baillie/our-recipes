import { spawnSync } from 'node:child_process';

const result = spawnSync('git', ['diff', '--check'], {
  cwd: process.cwd(),
  encoding: 'utf8',
});
const whitespaceErrors = (result.stdout ?? '').trim();
const gitNotices = (result.stderr ?? '').trim();
if (gitNotices) console.warn(`Git line-ending notices (not whitespace errors):\n${gitNotices}`);
if (whitespaceErrors) console.error(`Whitespace errors:\n${whitespaceErrors}`);
if (result.status !== 0 || whitespaceErrors) process.exit(result.status || 1);
console.log('No whitespace errors found.');
