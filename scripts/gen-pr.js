import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

export function parsePrNumber(subject) {
  const match = subject.match(/#(\d+)\)$/);
  return match ? parseInt(match[1]) : null;
}

// Netlify sets REVIEW_ID for PR preview deploys; fall back to parsing the
// squash-merge commit subject for production deploys.
const pr = process.env.REVIEW_ID
  ? parseInt(process.env.REVIEW_ID)
  : parsePrNumber(execSync('git log -1 --format=%s').toString().trim());

writeFileSync('pr.json', JSON.stringify({ pr }));
