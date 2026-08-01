import { describe, it, expect } from 'vitest';
import { buildTable, mount } from './fixtures/dockerTable.js';
import { indexContainers } from '../src/indexer.js';

const sample = () => buildTable({
  loose: [{ cid: 'aaa111', name: 'mylar3' }, { cid: 'aaa222', name: 'SimpleX-SMP' }],
  folders: [
    { id: 'F1', name: 'Services', collapsed: true,
      children: [{ cid: 'bbb111', name: 'sonarr' }, { cid: 'bbb222', name: 'radarr' }] },
    { id: 'F2', name: 'map stack', collapsed: false,
      children: [{ cid: 'ccc111', name: 'openstreetmap-nginx-1' }] },
  ],
});

describe('indexContainers', () => {
  it('finds containers parked inside collapsed folders', () => {
    const entries = indexContainers(mount(sample()));
    expect(entries.map(e => e.name).sort()).toEqual(
      ['SimpleX-SMP', 'mylar3', 'openstreetmap-nginx-1', 'radarr', 'sonarr']);
  });

  it('never returns a folder header row as a container', () => {
    const entries = indexContainers(mount(sample()));
    expect(entries.some(e => e.name.startsWith('folder-'))).toBe(false);
    expect(entries.some(e => e.row.classList.contains('folder'))).toBe(false);
  });

  it('attaches the folder display name to children of both collapsed and expanded folders', () => {
    const entries = indexContainers(mount(sample()));
    const byName = Object.fromEntries(entries.map(e => [e.name, e.folderName]));
    expect(byName.sonarr).toBe('Services');
    expect(byName['openstreetmap-nginx-1']).toBe('map stack');
  });

  it('gives loose containers an empty folder name', () => {
    const entries = indexContainers(mount(sample()));
    expect(entries.find(e => e.name === 'mylar3').folderName).toBe('');
  });

  it('returns an empty list for a table with no containers', () => {
    expect(indexContainers(mount(buildTable()))).toEqual([]);
  });
});
