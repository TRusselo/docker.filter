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
    const table = document.getElementById('docker_containers');
    relocate(document.querySelector('.df-bar'), table);
    const container = document.querySelector('.TableContainer');
    expect(container.previousElementSibling.className).toBe('df-bar');
  });

  it('removes the leftover section root and its heading', () => {
    page();
    const table = document.getElementById('docker_containers');
    relocate(document.querySelector('.df-bar'), table);
    expect(document.getElementById('df-root')).toBeNull();
    const titles = [...document.querySelectorAll('.title')].map(t => t.textContent);
    expect(titles).toEqual(['Docker Containers']);
  });

  it('does not throw when the page is degenerate (no table, no root)', () => {
    document.body.innerHTML = '<div class="df-bar">BAR</div>';
    expect(() => relocate(document.querySelector('.df-bar'), null)).not.toThrow();
  });

  it('falls back to inserting directly before the table when there is no enclosing .TableContainer', () => {
    document.body.innerHTML = '<div class="content"><div id="df-root"><div class="df-bar">BAR</div></div></div>';
    const table = buildTable({ loose: [{ cid: 'aaa111', name: 'mylar3' }] });
    document.querySelector('.content').appendChild(table);

    relocate(document.querySelector('.df-bar'), table);

    expect(table.previousElementSibling.className).toBe('df-bar');
    expect(document.getElementById('df-root')).toBeNull();
  });

  it('with two .TableContainer elements, lands the bar above the one containing #docker_containers', () => {
    document.body.innerHTML = `
      <div class="content">
        <div class="TableContainer" id="other"></div>
        <div class="TableContainer" id="mine"></div>
        <div id="df-root"><div class="df-bar">BAR</div></div>
      </div>`;
    const unrelated = document.createElement('table');
    document.getElementById('other').appendChild(unrelated);
    const table = buildTable({ loose: [{ cid: 'aaa111', name: 'mylar3' }] });
    document.getElementById('mine').appendChild(table);

    relocate(document.querySelector('.df-bar'), table);

    const mine = document.getElementById('mine');
    const other = document.getElementById('other');
    expect(mine.previousElementSibling.className).toBe('df-bar');
    expect(other.previousElementSibling).toBeNull();
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

  it('does not clear the user\'s typed input on a foreign change when no filter is active', async () => {
    page();
    await start({ settle: { quiet: 0, timeout: 0 } });
    const input = document.querySelector('.df-input');
    input.value = 'sona';

    const tbody = document.getElementById('docker_containers').tBodies[0];
    tbody.appendChild(document.createElement('tr'));
    await new Promise((r) => setTimeout(r, 0));

    expect(input.value).toBe('sona');
  });
});
