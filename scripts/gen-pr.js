import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

export function parsePrNumber(subject) {
  const match = subject.match(/#(\d+)\)$/);
  return match ? parseInt(match[1]) : null;
}

const subject = execSync('git log -1 --format=%s').toString().trim();
writeFileSync('pr.json', JSON.stringify({ pr: parsePrNumber(subject) }));
