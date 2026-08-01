import { describe, it, expect } from 'vitest';
import { matchEntries } from '../src/matcher.js';

const entries = [
  { row: 'r1', name: 'mylar3', folderName: '' },
  { row: 'r2', name: 'sonarr', folderName: 'Services' },
  { row: 'r3', name: 'radarr', folderName: 'Services' },
  { row: 'r4', name: 'openstreetmap-nginx-1', folderName: 'map stack' },
];
const names = (r) => r.map(e => e.name);

describe('matchEntries', () => {
  it('matches container names case-insensitively as a substring', () => {
    expect(names(matchEntries(entries, 'ARR'))).toEqual(['sonarr', 'radarr']);
  });

  it('pulls in every child when the query matches a folder name', () => {
    expect(names(matchEntries(entries, 'services'))).toEqual(['sonarr', 'radarr']);
  });

  it('matches folder names containing a space', () => {
    expect(names(matchEntries(entries, 'map stack'))).toEqual(['openstreetmap-nginx-1']);
  });

  it('returns nothing for an empty or whitespace query', () => {
    expect(matchEntries(entries, '')).toEqual([]);
    expect(matchEntries(entries, '   ')).toEqual([]);
  });

  it('returns nothing when nothing matches', () => {
    expect(matchEntries(entries, 'zzzznope')).toEqual([]);
  });

  it('preserves index order and never duplicates a row matched twice', () => {
    const dup = [{ row: 'r5', name: 'services-proxy', folderName: 'Services' }];
    expect(names(matchEntries(dup, 'services'))).toEqual(['services-proxy']);
  });
});
