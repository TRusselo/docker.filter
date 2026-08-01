import { describe, it, expect } from 'vitest';
import { buildTable, mount } from './fixtures/dockerTable.js';
import { indexContainers } from '../src/indexer.js';
import { matchEntries } from '../src/matcher.js';
import { createGate } from '../src/gate.js';
import { createApplier } from '../src/applier.js';

const sample = () => buildTable({
  loose: [{ cid: 'aaa111', name: 'mylar3' }, { cid: 'aaa222', name: 'SimpleX-SMP' }],
  folders: [
    { id: 'F1', name: 'Services', collapsed: true,
      children: [{ cid: 'bbb111', name: 'sonarr' }, { cid: 'bbb222', name: 'radarr' }] },
    { id: 'F2', name: 'map stack', collapsed: true,
      children: [{ cid: 'ccc111', name: 'openstreetmap-nginx-1' }] },
  ],
});

function setup() {
  const tbody = mount(sample());
  const applier = createApplier(tbody, createGate());
  const filter = (q) => applier.apply(matchEntries(indexContainers(tbody), q));
  return { tbody, applier, filter };
}

const visibleNames = (tbody) => Array.from(tbody.children)
  .filter(r => !r.classList.contains('df-hidden') && !r.classList.contains('df-results-header'))
  .map(r => r.querySelector('.appname')?.textContent);

describe('createApplier', () => {
  it('lifts matching rows out of collapsed folders into the tbody', () => {
    const { tbody, filter } = setup();
    filter('arr');
    expect(visibleNames(tbody)).toEqual(['sonarr', 'radarr']);
  });

  it('inserts a results header above the matches', () => {
    const { tbody, filter } = setup();
    filter('arr');
    expect(tbody.children[0].classList.contains('df-results-header')).toBe(true);
    expect(tbody.children[0].textContent).toContain('2');
  });

  it('hides every original top-level row while filtering', () => {
    const { tbody, filter } = setup();
    filter('mylar');
    const folders = Array.from(tbody.children).filter(r => r.classList.contains('folder'));
    expect(folders.every(r => r.classList.contains('df-hidden'))).toBe(true);
  });

  it('restores the exact DOM structure after reset', () => {
    const { tbody, applier, filter } = setup();
    const before = tbody.innerHTML;
    filter('arr');
    expect(tbody.innerHTML).not.toBe(before);
    applier.reset();
    expect(tbody.innerHTML).toBe(before);
  });

  it('restores rows into the correct folder-storage in the original order', () => {
    const { tbody, applier, filter } = setup();
    filter('arr');
    applier.reset();
    const stored = Array.from(
      tbody.querySelectorAll('.folder-storage > tr'),
      r => r.querySelector('.appname').textContent);
    expect(stored).toEqual(['sonarr', 'radarr', 'openstreetmap-nginx-1']);
  });

  it('is idempotent — reset twice is harmless', () => {
    const { tbody, applier, filter } = setup();
    const before = tbody.innerHTML;
    filter('arr');
    applier.reset();
    applier.reset();
    expect(tbody.innerHTML).toBe(before);
  });

  it('does not nest state when apply is called repeatedly', () => {
    const { tbody, applier, filter } = setup();
    const before = tbody.innerHTML;
    filter('arr');
    filter('mylar');
    filter('map');
    applier.reset();
    expect(tbody.innerHTML).toBe(before);
  });

  it('never clones — the moved row is the original element', () => {
    const { tbody, filter } = setup();
    const original = tbody.querySelector('.folder-storage > tr');
    filter('sonarr');
    expect(tbody.children[1]).toBe(original);
    expect(tbody.querySelectorAll('#cpu-bbb111')).toHaveLength(1);
  });

  it('reports active state', () => {
    const { applier, filter } = setup();
    expect(applier.active).toBe(false);
    filter('arr');
    expect(applier.active).toBe(true);
    applier.reset();
    expect(applier.active).toBe(false);
  });

  it('marks the body while filtering so reorder controls can be hidden', () => {
    const { applier, filter } = setup();
    expect(document.body.classList.contains('df-filtering')).toBe(false);
    filter('arr');
    expect(document.body.classList.contains('df-filtering')).toBe(true);
    applier.reset();
    expect(document.body.classList.contains('df-filtering')).toBe(false);
  });

  it('treats a query with no matches as a full reset', () => {
    const { tbody, applier, filter } = setup();
    const before = tbody.innerHTML;
    filter('zzzznope');
    expect(applier.active).toBe(false);
    expect(tbody.innerHTML).toBe(before);
  });
});
