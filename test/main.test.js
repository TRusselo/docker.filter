import { describe, it, expect } from 'vitest';
import { buildTable } from './fixtures/dockerTable.js';
import { start, relocate } from '../src/main.js';

function page() {
  document.body.innerHTML = `
    <div class="content">
      <div class="title">Docker Containers</div>
      <div class="TableContainer"></div>
      <div class="title">Docker Filter</div>
      <div id="df-root"><div class="df-bar">BAR</div></div>
    </div>`;
  document.querySelector('.TableContainer').appendChild(buildTable({
    loose: [{ cid: 'aaa111', name: 'mylar3' }],
    folders: [{ id: 'F1', name: 'Services', collapsed: true,
      children: [{ cid: 'bbb111', name: 'sonarr' }] }],
  }));
}

describe('relocate', () => {
  it('moves the bar directly above the table container', () => {
    page();
    relocate(document.querySelector('.df-bar'));
    const container = document.querySelector('.TableContainer');
    expect(container.previousElementSibling.className).toBe('df-bar');
  });

  it('removes the leftover section root and its heading', () => {
    page();
    relocate(document.querySelector('.df-bar'));
    expect(document.getElementById('df-root')).toBeNull();
    const titles = [...document.querySelectorAll('.title')].map(t => t.textContent);
    expect(titles).toEqual(['Docker Containers']);
  });

  it('leaves the page alone when there is no table container', () => {
    document.body.innerHTML = '<div class="df-bar">BAR</div>';
    expect(() => relocate(document.querySelector('.df-bar'))).not.toThrow();
  });
});

describe('start', () => {
  it('filters and restores through the full stack', async () => {
    page();
    const app = await start({ settle: { quiet: 0, timeout: 0 } });
    const tbody = document.getElementById('docker_containers').tBodies[0];
    const before = tbody.innerHTML;

    app.setQuery('sonarr');
    expect(tbody.children[1].querySelector('.appname').textContent).toBe('sonarr');

    app.setQuery('');
    expect(tbody.innerHTML).toBe(before);
  });

  it('reports the match count', async () => {
    page();
    const app = await start({ settle: { quiet: 0, timeout: 0 } });
    app.setQuery('arr');
    expect(app.lastCount).toEqual({ shown: 1, total: 2 });
  });

  it('does nothing when the docker table is absent', async () => {
    document.body.innerHTML = '<div class="content"></div>';
    expect(await start({ settle: { quiet: 0, timeout: 0 } })).toBeNull();
  });
});
