import { describe, it, expect } from 'vitest';
import { FOLDER_ID_RE, FOLDER_ELEMENT_RE, S } from '../src/selectors.js';

describe('selectors', () => {
  it('extracts a folder id from a folder row class list', () => {
    const cls = 'sortable folder-id-kfusdXmpzRvECazKAu86SnSAOjA folder no-autostart';
    expect(cls.match(FOLDER_ID_RE)[1]).toBe('kfusdXmpzRvECazKAu86SnSAOjA');
  });

  it('extracts the owning folder id from a child row class list', () => {
    const cls = 'folder-JonHDKmK5vKL3TMyrWFECoyeVa0-element folder-element';
    expect(cls.match(FOLDER_ELEMENT_RE)[1]).toBe('JonHDKmK5vKL3TMyrWFECoyeVa0');
  });

  it('does not confuse a folder row with a child row', () => {
    const folder = 'sortable folder-id-ABC123 folder';
    expect(folder.match(FOLDER_ELEMENT_RE)).toBeNull();
  });

  it('exposes the container and folder name selectors separately', () => {
    expect(S.appName).toBe('.appname');
    expect(S.folderAppName).toBe('.folder-appname');
  });
});
