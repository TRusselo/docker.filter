import { describe, it, expect } from 'vitest';
import { buildTable } from './dockerTable.js';

describe('buildTable fixture', () => {
  it('places loose containers directly in the tbody', () => {
    const table = buildTable({ loose: [{ cid: 'aaa111', name: 'mylar3' }] });
    const tbody = table.tBodies[0];
    expect(tbody.children).toHaveLength(1);
    expect(tbody.querySelector('.appname').textContent).toBe('mylar3');
  });

  it('parks collapsed folder children in folder-storage, not the tbody', () => {
    const table = buildTable({
      folders: [{
        id: 'F1', name: 'Services', collapsed: true,
        children: [{ cid: 'bbb222', name: 'sonarr' }],
      }],
    });
    const tbody = table.tBodies[0];
    expect(tbody.children).toHaveLength(1);               // just the folder header
    expect(tbody.querySelectorAll('.folder-storage > tr')).toHaveLength(1);
  });

  it('puts expanded folder children in the tbody after their header', () => {
    const table = buildTable({
      folders: [{
        id: 'F1', name: 'Services', collapsed: false,
        children: [{ cid: 'bbb222', name: 'sonarr' }],
      }],
    });
    const tbody = table.tBodies[0];
    expect(tbody.children).toHaveLength(2);
    expect(tbody.children[1].className).toContain('folder-F1-element');
    expect(tbody.querySelectorAll('.folder-storage > tr')).toHaveLength(0);
  });

  it('gives folder headers an internal appname and a display folder-appname', () => {
    const table = buildTable({
      folders: [{ id: 'F1', name: 'Services', collapsed: true, children: [] }],
    });
    const header = table.tBodies[0].children[0];
    expect(header.querySelector('.appname').textContent).toBe('folder-F1');
    expect(header.querySelector('.folder-appname').textContent).toBe('Services');
  });

  it('gives every container row the unique ids the stats updater targets', () => {
    const table = buildTable({ loose: [{ cid: 'aaa111', name: 'mylar3' }] });
    for (const id of ['aaa111', 'load-aaa111', 'cpu-aaa111', 'aaa111-auto']) {
      expect(table.querySelector(`#${CSS.escape(id)}`)).not.toBeNull();
    }
  });
});
