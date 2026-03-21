import { describe, it, expect } from 'vitest';
import { parsePrNumber } from '../scripts/gen-pr.js';

describe('parsePrNumber', () => {
  it('extracts PR number from a standard squash merge subject', () => {
    expect(parsePrNumber('Align header with keyboard left edge (#27)')).toBe(27);
  });

  it('returns null when subject has no PR number', () => {
    expect(parsePrNumber('Make layout fully responsive and add session-start hook')).toBeNull();
  });

  it('returns null for a partial match that does not end with )', () => {
    expect(parsePrNumber('Fix bug (#42) and more')).toBeNull();
  });
});
