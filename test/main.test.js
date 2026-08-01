import { describe, it, expect, vi, afterEach } from 'vitest';
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

// A stock Unraid Docker tab with folder.view2 NOT installed: every container is
// a plain `tr.sortable` in the tbody, and none of the `folder-*` markup exists.
// The classes relied on here (tr.sortable, span.outer/inner/appname, i#load-<cid>)
// are emitted by Unraid's own DockerContainers.php, not by folder.view2.
function stockPage() {
  document.body.innerHTML = `
    <div class="content">
      <div class="title">Docker Containers</div>
      <div class="TableContainer"></div>
      <div class="title">Docker Filter</div>
      <div id="df-root"></div>
    </div>`;
  document.querySelector('.TableContainer').appendChild(buildTable({
    loose: [
      { cid: 'aaa111', name: 'mylar3' },
      { cid: 'aaa222', name: 'sonarr' },
      { cid: 'aaa333', name: 'radarr' },
    ],
  }));
}

describe('without folder.view2 installed', () => {
  it('the fixture really contains no folder.view2 markup', () => {
    stockPage();
    const table = document.getElementById('docker_containers');
    expect(table.querySelectorAll('.folder-storage')).toHaveLength(0);
    expect(table.querySelectorAll('tr.folder')).toHaveLength(0);
    expect(table.querySelectorAll('.folder-appname')).toHaveLength(0);
    expect(table.querySelectorAll('tr.folder-element')).toHaveLength(0);
  });

  it('filters plain rows and restores the table exactly', async () => {
    stockPage();
    const app = await start({ settle: { quiet: 0, timeout: 0 } });
    expect(app).not.toBeNull();

    const tbody = document.getElementById('docker_containers').tBodies[0];
    const before = tbody.innerHTML;

    app.setQuery('arr');
    expect(app.lastCount).toEqual({ shown: 2, total: 3 });
    const shown = Array.from(tbody.children)
      .filter((r) => !r.classList.contains('df-hidden')
                  && !r.classList.contains('df-results-header'))
      .map((r) => r.querySelector('.appname').textContent);
    expect(shown).toEqual(['sonarr', 'radarr']);

    app.setQuery('');
    expect(tbody.innerHTML).toBe(before);
  });

  it('mounts the filter bar above the table', async () => {
    stockPage();
    await start({ settle: { quiet: 0, timeout: 0 } });
    const container = document.querySelector('.TableContainer');
    expect(container.previousElementSibling.classList.contains('df-bar')).toBe(true);
    expect(document.getElementById('df-root')).toBeNull();
  });

  it('a folder-name query simply matches nothing rather than misbehaving', async () => {
    stockPage();
    const app = await start({ settle: { quiet: 0, timeout: 0 } });
    const tbody = document.getElementById('docker_containers').tBodies[0];
    const before = tbody.innerHTML;

    app.setQuery('Services');
    expect(app.lastCount).toEqual({ shown: 0, total: 3 });

    app.setQuery('');
    expect(tbody.innerHTML).toBe(before);
  });
});

describe('auto-start idempotence', () => {
  afterEach(() => {
    delete window.__dockerFilterStarted;
  });

  it('does not start a second stack when the bundle is evaluated twice on the same page', async () => {
    delete window.__dockerFilterStarted;
    page();

    // Simulate the plugin's bundle script tag being included twice: two
    // independent module evaluations sharing the same `window` and DOM.
    vi.resetModules();
    await import('../src/main.js');
    vi.resetModules();
    await import('../src/main.js');

    // Let both (attempted) auto-starts settle.
    await new Promise((r) => setTimeout(r, 500));

    // Only one stack should have relocated the bar and removed the root;
    // a second stack racing the same rows would leave duplicate bars.
    expect(document.querySelectorAll('.df-bar').length).toBe(1);
    expect(document.getElementById('df-root')).toBeNull();
  });
});
