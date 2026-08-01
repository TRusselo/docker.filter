# Docker Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `docker.filter`, an Unraid plugin adding a filter box to the Docker tab that finds containers even when folder.view2 has parked them outside the table.

**Architecture:** Six small ES modules under `src/`, bundled by esbuild into one IIFE that the plugin's `.page` file loads. A `gate` serialises DOM writes so a `MutationObserver` guard can tell our own mutations from foreign ones. The `applier` **moves** matching `<tr>`s (never clones — rows carry unique `cpu-<cid>` IDs) into a synthetic Results group and restores them to recorded positions on clear.

**Tech Stack:** Vanilla ES modules, esbuild (bundle), vitest + jsdom (tests), Slackware `.txz` packaging, Unraid `.plg` installer.

**Spec:** `docs/superpowers/specs/2026-08-01-docker-filter-design.md`

**Deviation from spec:** The spec proposed snapshotting the real Docker table HTML as a test fixture. This plan uses a **synthetic fixture builder** instead — it keeps csrf tokens and container names out of the repo, is deterministic, and is far smaller. Live verification against the real table still happens in Task 14.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/selectors.js` | All DOM selectors and class-name regexes. Single source of truth. |
| `src/gate.js` | Re-entrant write gate; lets the guard ignore our own mutations. |
| `src/indexer.js` | Reads rows from tbody **and** `.folder-storage`, builds the container model. |
| `src/matcher.js` | Pure name/folder-name matching. No DOM. |
| `src/applier.js` | The only DOM mutator. `apply()` / `reset()`. |
| `src/guard.js` | MutationObserver; resets the filter on foreign re-render. |
| `src/ui.js` | The filter bar element, debounce, count, Esc/clear. |
| `src/bootstrap.js` | Waits for the table and for folder.view2 to settle. |
| `src/main.js` | Wires everything; relocates the bar above the table. |
| `src/docker-filter.css` | Styles. |
| `test/fixtures/dockerTable.js` | Synthetic Unraid + folder.view2 table builder. |
| `source/usr/local/emhttp/plugins/docker.filter/DockerFilter.page` | Unraid page hook. |
| `build.sh` | esbuild bundle → `.txz` → SHA256. |
| `docker.filter.plg` | Unraid installer manifest. |
| `docker.filter.xml` | Community Applications template. |

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `vitest.config.js`, `.gitignore` (modify)

- [ ] **Step 1: Install dev dependencies**

```bash
npm init -y >/dev/null && npm i -D vitest jsdom esbuild
```

- [ ] **Step 2: Replace `package.json`**

```json
{
  "name": "docker.filter",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Unraid plugin: filter box for the Docker tab",
  "license": "GPL-2.0-only",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "./build.sh"
  }
}
```

Then re-add the dev deps so versions are recorded: `npm i -D vitest jsdom esbuild`

- [ ] **Step 3: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
  },
});
```

- [ ] **Step 4: Overwrite `.gitignore`**

```
node_modules/
packages/*.txz
source/usr/local/emhttp/plugins/docker.filter/javascript/docker-filter.js
source/usr/local/emhttp/plugins/docker.filter/styles/docker-filter.css
.DS_Store
```

Build outputs are generated, so they stay out of git; the release `.txz` is attached to a GitHub Release instead.

- [ ] **Step 5: Verify vitest runs**

Run: `npx vitest run`
Expected: exits 0 with "No test files found" (this is fine — nothing exists yet).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold vitest + esbuild toolchain"
```

---

## Task 2: Selectors module

**Files:**
- Create: `src/selectors.js`
- Test: `test/selectors.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/selectors.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/selectors.test.js`
Expected: FAIL — "Failed to resolve import ../src/selectors.js"

- [ ] **Step 3: Write the implementation**

```js
// src/selectors.js

/** id of the Docker container table rendered by dynamix.docker.manager */
export const TABLE_ID = 'docker_containers';

export const S = {
  /** a folder.view2 folder header row */
  folderRow: 'tr.folder',
  /** where folder.view2 parks child rows while a folder is collapsed */
  folderStorage: '.folder-storage',
  /** container display name. NOTE: folder rows also contain one of these,
   *  holding an internal id rather than a name — exclude folder rows first. */
  appName: '.appname',
  /** folder display name, e.g. "Services" */
  folderAppName: '.folder-appname',
  /** the wrapper Unraid puts around the container table */
  tableContainer: '.TableContainer',
};

/** `folder-id-<id>` on a folder header row */
export const FOLDER_ID_RE = /\bfolder-id-([A-Za-z0-9]+)\b/;

/** `folder-<id>-element` on a child container row */
export const FOLDER_ELEMENT_RE = /\bfolder-([A-Za-z0-9]+)-element\b/;

/** class applied to rows we hide while filtering */
export const HIDDEN_CLASS = 'df-hidden';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/selectors.test.js`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/selectors.js test/selectors.test.js
git commit -m "feat: add DOM selector constants"
```

---

## Task 3: Test fixture builder

**Files:**
- Create: `test/fixtures/dockerTable.js`
- Test: `test/fixtures/dockerTable.test.js`

This fixture reproduces the structure verified on the live server: container rows
carry unique `<cid>` / `load-<cid>` / `cpu-<cid>` ids, folder header rows carry
both an internal `.appname` and a display `.folder-appname`, and collapsed
folders hold their children in a `div.folder-storage` inside a `<td>`.

- [ ] **Step 1: Write the failing test**

```js
// test/fixtures/dockerTable.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/fixtures/dockerTable.test.js`
Expected: FAIL — cannot resolve `./dockerTable.js`

- [ ] **Step 3: Write the fixture builder**

```js
// test/fixtures/dockerTable.js

/**
 * Builds a DOM table matching the real Unraid 7.3 Docker table with
 * folder.view2 installed. Verified against http://192.168.1.12/Docker.
 */

export function containerRow({ cid, name, folderId = null }) {
  const tr = document.createElement('tr');
  tr.className = folderId
    ? `sortable folder-${folderId}-element folder-element`
    : 'sortable';
  tr.innerHTML = `
    <td class="ct-name">
      <span class="outer"><span class="inner"><span class="appname">${name}</span></span></span>
      <i id="load-${cid}"></i><i id="cpu-${cid}"></i><span id="${cid}"></span>
    </td>
    <td class="updatecolumn">up-to-date</td>
    <td>bridge</td><td>172.17.0.2</td><td>8080/TCP</td>
    <td>192.168.1.12:8080</td><td>/config</td>
    <td class="advanced">sha256:abc</td>
    <td id="${cid}-auto">off</td>
    <td id="${cid}-wait"></td>`;
  return tr;
}

export function folderRow({ id, name, collapsed, children }) {
  const tr = document.createElement('tr');
  tr.className = `sortable folder-id-${id} folder no-autostart no-managed`;
  tr.innerHTML = `
    <td class="ct-name folder-name">
      <div class="folder-name-sub">
        <span class="outer folder-outer">
          <span class="hand folder-hand"></span>
          <span class="inner folder-inner">
            <span class="appname">folder-${id}</span>
            <a class="exec folder-appname">${name}</a>
            <span class="state folder-state">stopped</span>
          </span>
        </span>
        <div class="folder-storage"></div>
      </div>
    </td>
    <td class="updatecolumn folder-update"></td>
    <td colspan="5"></td>
    <td class="advanced folder-advanced"></td>
    <td class="folder-autostart"></td>
    <td></td>`;

  if (collapsed) {
    const storage = tr.querySelector('.folder-storage');
    for (const c of children) storage.appendChild(containerRow({ ...c, folderId: id }));
  }
  return tr;
}

export function buildTable({ loose = [], folders = [] } = {}) {
  const table = document.createElement('table');
  table.id = 'docker_containers';
  table.className = 'tablesorter shift';

  const thead = table.createTHead();
  const hrow = thead.insertRow();
  for (const label of ['APPLICATION', 'VERSION', 'NETWORK', 'CONTAINER IP',
    'CONTAINER PORT', 'LAN IP:PORT', 'VOLUME MAPPINGS', 'ADVANCED',
    'AUTOSTART', '']) {
    const th = document.createElement('th');
    th.textContent = label;
    hrow.appendChild(th);
  }

  const tbody = table.createTBody();
  for (const f of folders) {
    tbody.appendChild(folderRow(f));
    if (!f.collapsed) {
      for (const c of f.children) {
        tbody.appendChild(containerRow({ ...c, folderId: f.id }));
      }
    }
  }
  for (const c of loose) tbody.appendChild(containerRow(c));
  return table;
}

/** Mounts a built table into document.body and returns its tbody. */
export function mount(table) {
  document.body.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'TableContainer';
  container.appendChild(table);
  document.body.appendChild(container);
  return table.tBodies[0];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/fixtures/dockerTable.test.js`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add test/fixtures/
git commit -m "test: add synthetic Unraid + folder.view2 table fixture"
```

---

## Task 4: Indexer

**Files:**
- Create: `src/indexer.js`
- Test: `test/indexer.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/indexer.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/indexer.test.js`
Expected: FAIL — cannot resolve `../src/indexer.js`

- [ ] **Step 3: Write the implementation**

```js
// src/indexer.js
import { S, FOLDER_ID_RE, FOLDER_ELEMENT_RE } from './selectors.js';

export function isFolderRow(row) {
  return row.classList.contains('folder');
}

export function folderIdOf(row) {
  const m = row.className.match(FOLDER_ID_RE);
  return m ? m[1] : null;
}

export function owningFolderIdOf(row) {
  const m = row.className.match(FOLDER_ELEMENT_RE);
  return m ? m[1] : null;
}

/**
 * Builds the container model from BOTH row sources: rows sitting directly in
 * the tbody, and rows folder.view2 has parked in `.folder-storage` while their
 * folder is collapsed. On a typical server the second source holds the large
 * majority of containers.
 *
 * @returns {Array<{row: HTMLTableRowElement, name: string, folderName: string}>}
 */
export function indexContainers(tbody) {
  const folderNames = new Map();
  for (const row of tbody.children) {
    if (!isFolderRow(row)) continue;
    const id = folderIdOf(row);
    if (!id) continue;
    const label = row.querySelector(S.folderAppName);
    folderNames.set(id, label ? label.textContent.trim() : '');
  }

  const entries = [];
  const add = (row) => {
    // Folder headers also contain a `.appname`, holding an internal id such as
    // "folder-F1" rather than a container name. Skip them.
    if (isFolderRow(row)) return;
    const nameEl = row.querySelector(S.appName);
    if (!nameEl) return;
    const folderId = owningFolderIdOf(row);
    entries.push({
      row,
      name: nameEl.textContent.trim(),
      folderName: folderId ? (folderNames.get(folderId) || '') : '',
    });
  };

  for (const row of Array.from(tbody.children)) add(row);
  for (const row of tbody.querySelectorAll(`${S.folderStorage} > tr`)) add(row);
  return entries;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/indexer.test.js`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/indexer.js test/indexer.test.js
git commit -m "feat: index containers from tbody and folder-storage"
```

---

## Task 5: Matcher

**Files:**
- Create: `src/matcher.js`
- Test: `test/matcher.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/matcher.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/matcher.test.js`
Expected: FAIL — cannot resolve `../src/matcher.js`

- [ ] **Step 3: Write the implementation**

```js
// src/matcher.js

/**
 * Case-insensitive substring match over the container name, plus the name of
 * the folder it lives in. A folder-name hit contributes all of that folder's
 * children, which matters because most containers live inside folders.
 *
 * Pure: takes and returns plain data, touches no DOM.
 */
export function matchEntries(entries, query) {
  const q = String(query).trim().toLowerCase();
  if (!q) return [];
  return entries.filter((e) =>
    e.name.toLowerCase().includes(q) ||
    (e.folderName !== '' && e.folderName.toLowerCase().includes(q)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/matcher.test.js`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/matcher.js test/matcher.test.js
git commit -m "feat: add name and folder-name matcher"
```

---

## Task 6: Write gate

**Files:**
- Create: `src/gate.js`
- Test: `test/gate.test.js`

The guard must distinguish our writes from foreign ones. `MutationObserver`
callbacks arrive as microtasks — *after* a synchronous write block finishes — so
a plain boolean flag read inside the callback would always be `false` and every
one of our own writes would look foreign. The gate fixes this by running
registered drain callbacks (which call `observer.takeRecords()`) **while still
inside** the write block.

- [ ] **Step 1: Write the failing test**

```js
// test/gate.test.js
import { describe, it, expect, vi } from 'vitest';
import { createGate } from '../src/gate.js';

describe('createGate', () => {
  it('reports busy only while running', () => {
    const gate = createGate();
    expect(gate.busy).toBe(false);
    gate.run(() => { expect(gate.busy).toBe(true); });
    expect(gate.busy).toBe(false);
  });

  it('runs drains before clearing busy, so drains still see busy', () => {
    const gate = createGate();
    const seen = [];
    gate.onDrain(() => seen.push(gate.busy));
    gate.run(() => {});
    expect(seen).toEqual([true]);
  });

  it('clears busy even when the body throws', () => {
    const gate = createGate();
    expect(() => gate.run(() => { throw new Error('boom'); })).toThrow('boom');
    expect(gate.busy).toBe(false);
  });

  it('still runs drains when the body throws', () => {
    const gate = createGate();
    const drain = vi.fn();
    gate.onDrain(drain);
    expect(() => gate.run(() => { throw new Error('boom'); })).toThrow();
    expect(drain).toHaveBeenCalledOnce();
  });

  it('supports nesting without clearing busy early', () => {
    const gate = createGate();
    gate.run(() => {
      gate.run(() => {});
      expect(gate.busy).toBe(true);
    });
    expect(gate.busy).toBe(false);
  });

  it('returns the body result', () => {
    expect(createGate().run(() => 42)).toBe(42);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/gate.test.js`
Expected: FAIL — cannot resolve `../src/gate.js`

- [ ] **Step 3: Write the implementation**

```js
// src/gate.js

/**
 * Serialises our DOM writes so the MutationObserver guard can ignore them.
 *
 * Drain callbacks run inside the `finally`, before the depth is decremented,
 * so an observer's `takeRecords()` discards our own records while `busy` is
 * still true. Re-entrant: nested `run()` calls do not clear `busy` early.
 */
export function createGate() {
  let depth = 0;
  const drains = [];

  return {
    onDrain(fn) { drains.push(fn); },

    run(fn) {
      depth += 1;
      try {
        return fn();
      } finally {
        for (const drain of drains) drain();
        depth -= 1;
      }
    },

    get busy() { return depth > 0; },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/gate.test.js`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/gate.js test/gate.test.js
git commit -m "feat: add re-entrant write gate for mutation attribution"
```

---

## Task 7: Applier — the only DOM mutator

**Files:**
- Create: `src/applier.js`
- Test: `test/applier.test.js`

The restore contract: each moved row records `{parent, nextSibling}` at move
time. Rows are restored in **reverse** order, because a row's recorded
`nextSibling` may itself be a row moved later.

- [ ] **Step 1: Write the failing test**

```js
// test/applier.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/applier.test.js`
Expected: FAIL — cannot resolve `../src/applier.js`

- [ ] **Step 3: Write the implementation**

```js
// src/applier.js
import { HIDDEN_CLASS } from './selectors.js';

const HEADER_CLASS = 'df-results-header';
const FILTERING_CLASS = 'df-filtering';

function makeHeader(count, columnCount) {
  const tr = document.createElement('tr');
  tr.className = HEADER_CLASS;
  const td = document.createElement('td');
  td.colSpan = columnCount;
  td.textContent = `${count} matching container${count === 1 ? '' : 's'}`;
  tr.appendChild(td);
  return tr;
}

/**
 * The only unit permitted to mutate the container table.
 *
 * `apply()` always resets first, so exactly one dirty state exists and it can
 * never nest. Rows are MOVED, never cloned — they carry unique ids such as
 * `cpu-<cid>` that Unraid's live stats updater resolves with getElementById.
 */
export function createApplier(tbody, gate) {
  /** @type {Array<{row: Element, parent: Node, nextSibling: Node|null}>} */
  let moved = [];
  let hidden = [];
  let header = null;

  function restore() {
    // Reverse order: a row's recorded nextSibling may be a row moved after it.
    for (let i = moved.length - 1; i >= 0; i -= 1) {
      const { row, parent, nextSibling } = moved[i];
      parent.insertBefore(row, nextSibling);
    }
    moved = [];
    for (const row of hidden) row.classList.remove(HIDDEN_CLASS);
    hidden = [];
    if (header) {
      header.remove();
      header = null;
    }
    document.body.classList.remove(FILTERING_CLASS);
  }

  function reset() {
    gate.run(restore);
  }

  function apply(entries) {
    reset();
    if (entries.length === 0) return;

    gate.run(() => {
      const columnCount = tbody.parentElement.tHead
        ? tbody.parentElement.tHead.rows[0].cells.length
        : 10;

      // Reordering while filtered would invalidate every recorded restore
      // position, so folder.view2's drag handles are hidden via this class.
      document.body.classList.add(FILTERING_CLASS);

      hidden = Array.from(tbody.children);
      for (const row of hidden) row.classList.add(HIDDEN_CLASS);

      header = makeHeader(entries.length, columnCount);
      tbody.insertBefore(header, tbody.firstChild);

      let anchor = header;
      for (const { row } of entries) {
        moved.push({ row, parent: row.parentNode, nextSibling: row.nextSibling });
        anchor.after(row);
        row.classList.remove(HIDDEN_CLASS);
        anchor = row;
      }
    });
  }

  return {
    apply,
    reset,
    get active() { return moved.length > 0; },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/applier.test.js`
Expected: PASS, 10 tests

The `restores the exact DOM structure after reset` test is the load-bearing one
— it compares `innerHTML` before and after a full filter cycle.

- [ ] **Step 5: Commit**

```bash
git add src/applier.js test/applier.test.js
git commit -m "feat: add row-moving applier with exact restore"
```

---

## Task 8: Guard

**Files:**
- Create: `src/guard.js`
- Test: `test/guard.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/guard.test.js
import { describe, it, expect, vi } from 'vitest';
import { buildTable, mount } from './fixtures/dockerTable.js';
import { createGate } from '../src/gate.js';
import { createGuard } from '../src/guard.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const tbody = mount(buildTable({ loose: [{ cid: 'aaa111', name: 'mylar3' }] }));
  const gate = createGate();
  const onForeign = vi.fn();
  const guard = createGuard(tbody, gate, onForeign);
  guard.start();
  return { tbody, gate, guard, onForeign };
}

describe('createGuard', () => {
  it('fires when something else changes the rows', async () => {
    const { tbody, onForeign } = setup();
    tbody.appendChild(document.createElement('tr'));
    await flush();
    expect(onForeign).toHaveBeenCalledOnce();
  });

  it('stays silent for writes made through the gate', async () => {
    const { tbody, gate, onForeign } = setup();
    gate.run(() => tbody.appendChild(document.createElement('tr')));
    await flush();
    expect(onForeign).not.toHaveBeenCalled();
  });

  it('stays silent for gated writes even when they throw', async () => {
    const { tbody, gate, onForeign } = setup();
    expect(() => gate.run(() => {
      tbody.appendChild(document.createElement('tr'));
      throw new Error('boom');
    })).toThrow();
    await flush();
    expect(onForeign).not.toHaveBeenCalled();
  });

  it('detects a foreign change that happens after a gated write', async () => {
    const { tbody, gate, onForeign } = setup();
    gate.run(() => tbody.appendChild(document.createElement('tr')));
    await flush();
    tbody.appendChild(document.createElement('tr'));
    await flush();
    expect(onForeign).toHaveBeenCalledOnce();
  });

  it('stops firing after stop()', async () => {
    const { tbody, guard, onForeign } = setup();
    guard.stop();
    tbody.appendChild(document.createElement('tr'));
    await flush();
    expect(onForeign).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/guard.test.js`
Expected: FAIL — cannot resolve `../src/guard.js`

- [ ] **Step 3: Write the implementation**

```js
// src/guard.js

/**
 * Watches the container table for row changes we did not cause — folder.view2
 * expanding a folder, or an Unraid background re-render. Rather than fight it,
 * we drop the filter and let the page return to its own state.
 *
 * Registers a drain on the gate so records produced by our own writes are
 * consumed and discarded while the gate is still busy.
 */
export function createGuard(tbody, gate, onForeignChange) {
  const observer = new MutationObserver((records) => {
    if (gate.busy) return;
    if (!records.some((r) => r.type === 'childList')) return;
    onForeignChange();
  });

  gate.onDrain(() => observer.takeRecords());

  return {
    start() {
      observer.observe(tbody, { childList: true, subtree: true });
    },
    stop() {
      observer.disconnect();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/guard.test.js`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/guard.js test/guard.test.js
git commit -m "feat: add mutation guard that drops the filter on foreign re-render"
```

---

## Task 9: Filter bar UI

**Files:**
- Create: `src/ui.js`
- Test: `test/ui.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/ui.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createUI } from '../src/ui.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function setup() {
  const onQuery = vi.fn();
  const ui = createUI({ onQuery });
  document.body.innerHTML = '';
  document.body.appendChild(ui.element);
  const input = ui.element.querySelector('.df-input');
  const type = (v) => { input.value = v; input.dispatchEvent(new Event('input')); };
  return { ui, input, type, onQuery };
}

describe('createUI', () => {
  it('debounces input before reporting a query', () => {
    const { type, onQuery } = setup();
    type('so'); type('son'); type('sonarr');
    expect(onQuery).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(onQuery).toHaveBeenCalledExactlyOnceWith('sonarr');
  });

  it('reports an empty query immediately when cleared', () => {
    const { type, onQuery } = setup();
    type('');
    expect(onQuery).toHaveBeenCalledExactlyOnceWith('');
  });

  it('clears on Escape', () => {
    const { input, type, onQuery } = setup();
    type('sonarr');
    vi.advanceTimersByTime(150);
    onQuery.mockClear();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(input.value).toBe('');
    expect(onQuery).toHaveBeenCalledExactlyOnceWith('');
  });

  it('clears when the clear button is clicked', () => {
    const { ui, input, type, onQuery } = setup();
    type('sonarr');
    vi.advanceTimersByTime(150);
    onQuery.mockClear();
    ui.element.querySelector('.df-clear').click();
    expect(input.value).toBe('');
    expect(onQuery).toHaveBeenCalledExactlyOnceWith('');
  });

  it('shows the clear button only when there is text', () => {
    const { ui, type } = setup();
    const clear = ui.element.querySelector('.df-clear');
    expect(clear.hidden).toBe(true);
    type('x');
    expect(clear.hidden).toBe(false);
    type('');
    expect(clear.hidden).toBe(true);
  });

  it('renders the match count and hides it when idle', () => {
    const { ui } = setup();
    const count = ui.element.querySelector('.df-count');
    ui.setCount(3, 106);
    expect(count.textContent).toBe('3 of 106');
    ui.setCount(null, 106);
    expect(count.textContent).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ui.test.js`
Expected: FAIL — cannot resolve `../src/ui.js`

- [ ] **Step 3: Write the implementation**

```js
// src/ui.js

const DEBOUNCE_MS = 120;

/**
 * The filter bar. Owns its own element and reports queries upward; it never
 * touches the container table.
 */
export function createUI({ onQuery, debounceMs = DEBOUNCE_MS }) {
  const element = document.createElement('div');
  element.className = 'df-bar';
  element.innerHTML = `
    <i class="fa fa-filter df-icon" aria-hidden="true"></i>
    <input type="text" class="df-input" spellcheck="false" autocomplete="off"
           placeholder="Filter containers…" aria-label="Filter containers">
    <button type="button" class="df-clear" title="Clear filter" hidden>&#10005;</button>
    <span class="df-count"></span>`;

  const input = element.querySelector('.df-input');
  const clearButton = element.querySelector('.df-clear');
  const count = element.querySelector('.df-count');
  let timer = null;

  function report(value) {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    onQuery(value);
  }

  function syncClearButton() {
    clearButton.hidden = input.value === '';
  }

  input.addEventListener('input', () => {
    syncClearButton();
    if (input.value === '') { report(''); return; }
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; onQuery(input.value); }, debounceMs);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    clear();
  });

  clearButton.addEventListener('click', clear);

  function clear() {
    input.value = '';
    syncClearButton();
    report('');
  }

  return {
    element,
    clear,
    focus() { input.focus(); },
    setCount(shown, total) {
      count.textContent = shown === null ? '' : `${shown} of ${total}`;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/ui.test.js`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/ui.js test/ui.test.js
git commit -m "feat: add filter bar UI with debounce and clear"
```

---

## Task 10: Bootstrap settle detection

**Files:**
- Create: `src/bootstrap.js`
- Test: `test/bootstrap.test.js`

folder.view2 parks rows into storage asynchronously after page load and then
re-expands whichever folders the user left open. Indexing mid-initialization
produces a wrong model — this was observed on the live server.

- [ ] **Step 1: Write the failing test**

```js
// test/bootstrap.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { whenSettled } from '../src/bootstrap.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function target() {
  document.body.innerHTML = '<div id="t"></div>';
  return document.getElementById('t');
}

describe('whenSettled', () => {
  it('resolves after the quiet period with no mutations', async () => {
    const el = target();
    const done = vi.fn();
    whenSettled(el, { quiet: 400, timeout: 10000 }).then(done);
    await vi.advanceTimersByTimeAsync(399);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(done).toHaveBeenCalledOnce();
  });

  it('restarts the quiet period when a mutation lands', async () => {
    const el = target();
    const done = vi.fn();
    whenSettled(el, { quiet: 400, timeout: 10000 }).then(done);
    await vi.advanceTimersByTimeAsync(300);
    el.appendChild(document.createElement('span'));
    await vi.advanceTimersByTimeAsync(300);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    expect(done).toHaveBeenCalledOnce();
  });

  it('resolves at the hard timeout even if mutations never stop', async () => {
    const el = target();
    const done = vi.fn();
    whenSettled(el, { quiet: 400, timeout: 1000 }).then(done);
    for (let i = 0; i < 10; i += 1) {
      await vi.advanceTimersByTimeAsync(150);
      el.appendChild(document.createElement('span'));
    }
    expect(done).toHaveBeenCalledOnce();
  });

  it('resolves only once', async () => {
    const el = target();
    const done = vi.fn();
    whenSettled(el, { quiet: 100, timeout: 300 }).then(done);
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/bootstrap.test.js`
Expected: FAIL — cannot resolve `../src/bootstrap.js`

- [ ] **Step 3: Write the implementation**

```js
// src/bootstrap.js

/**
 * Resolves once `target` has gone `quiet` ms without a DOM mutation, or after
 * `timeout` ms regardless. folder.view2 moves rows into `.folder-storage` and
 * then re-expands saved-open folders; indexing before that finishes yields a
 * wrong model.
 */
export function whenSettled(target, { quiet = 400, timeout = 10000 } = {}) {
  return new Promise((resolve) => {
    let quietTimer = null;
    let hardTimer = null;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (quietTimer !== null) clearTimeout(quietTimer);
      if (hardTimer !== null) clearTimeout(hardTimer);
      observer.disconnect();
      resolve();
    };

    const observer = new MutationObserver(() => {
      if (quietTimer !== null) clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, quiet);
    });

    observer.observe(target, { childList: true, subtree: true });
    quietTimer = setTimeout(finish, quiet);
    hardTimer = setTimeout(finish, timeout);
  });
}

/** Polls for an element, resolving null if it never appears. */
export function waitForElement(selector, { timeout = 10000, interval = 100 } = {}) {
  return new Promise((resolve) => {
    const found = document.querySelector(selector);
    if (found) { resolve(found); return; }
    let waited = 0;
    const tick = setInterval(() => {
      const el = document.querySelector(selector);
      waited += interval;
      if (el || waited >= timeout) {
        clearInterval(tick);
        resolve(el || null);
      }
    }, interval);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/bootstrap.test.js`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/bootstrap.js test/bootstrap.test.js
git commit -m "feat: add settle detection for folder.view2 initialisation"
```

---

## Task 11: Wire it together

**Files:**
- Create: `src/main.js`
- Test: `test/main.test.js`

`main.js` also relocates the filter bar. The `.page` file renders our markup
wherever Unraid places the section; we move the bar to sit directly above
`div.TableContainer` and remove the leftover section heading.

- [ ] **Step 1: Write the failing test**

```js
// test/main.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/main.test.js`
Expected: FAIL — cannot resolve `../src/main.js`

- [ ] **Step 3: Write the implementation**

```js
// src/main.js
import { TABLE_ID, S } from './selectors.js';
import { indexContainers } from './indexer.js';
import { matchEntries } from './matcher.js';
import { createGate } from './gate.js';
import { createApplier } from './applier.js';
import { createGuard } from './guard.js';
import { createUI } from './ui.js';
import { whenSettled, waitForElement } from './bootstrap.js';

const ROOT_ID = 'df-root';
const SECTION_TITLE = 'Docker Filter';

/**
 * Moves the bar directly above the container table and removes the section
 * wrapper Unraid rendered it in, along with that section's heading.
 */
export function relocate(bar) {
  const container = document.querySelector(S.tableContainer);
  if (!container) return;
  container.parentNode.insertBefore(bar, container);

  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  let prev = root.previousElementSibling;
  while (prev && (prev.tagName === 'SCRIPT' || prev.tagName === 'LINK')) {
    prev = prev.previousElementSibling;
  }
  if (prev && prev.classList.contains('title') &&
      prev.textContent.trim() === SECTION_TITLE) {
    prev.remove();
  }
  root.remove();
}

export async function start({ settle = {} } = {}) {
  const table = await waitForElement(`#${TABLE_ID}`, { timeout: settle.timeout ?? 10000 });
  if (!table) return null;

  const tbody = table.tBodies[0];
  if (!tbody) return null;

  await whenSettled(tbody, settle);

  const gate = createGate();
  const applier = createApplier(tbody, gate);
  const app = { lastCount: { shown: null, total: 0 } };

  const ui = createUI({ onQuery: (q) => app.setQuery(q) });

  const guard = createGuard(tbody, gate, () => {
    applier.reset();
    ui.clear();
    ui.setCount(null, 0);
  });

  app.setQuery = (query) => {
    try {
      const entries = indexContainers(tbody);
      const matches = matchEntries(entries, query);
      applier.apply(matches);
      app.lastCount = {
        shown: query.trim() === '' ? null : matches.length,
        total: entries.length,
      };
      ui.setCount(app.lastCount.shown, app.lastCount.total);
    } catch (err) {
      // A bug must never leave the table mangled.
      console.error('[docker.filter]', err);
      try { applier.reset(); } catch { /* already broken; nothing more to do */ }
      guard.stop();
      ui.element.remove();
    }
  };

  const root = document.getElementById(ROOT_ID);
  const bar = root ? root.querySelector('.df-bar') : null;
  if (bar) { bar.replaceWith(ui.element); }
  relocate(ui.element);

  guard.start();
  window.addEventListener('beforeunload', () => applier.reset());

  return app;
}

if (typeof document !== 'undefined' && document.getElementById(ROOT_ID)) {
  start().catch((err) => console.error('[docker.filter]', err));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/main.test.js`
Expected: PASS, 6 tests

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run`
Expected: PASS — 6 files, 46 tests

- [ ] **Step 6: Commit**

```bash
git add src/main.js test/main.test.js
git commit -m "feat: wire filter stack together and relocate the bar"
```

---

## Task 12: Styles and the `.page` hook

**Files:**
- Create: `src/docker-filter.css`
- Create: `source/usr/local/emhttp/plugins/docker.filter/DockerFilter.page`

- [ ] **Step 1: Write the stylesheet**

```css
/* src/docker-filter.css */
.df-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 4px;
  padding: 6px 10px;
}

.df-icon { opacity: 0.6; }

.df-input {
  flex: 0 1 320px;
  min-width: 160px;
  padding: 5px 8px;
  font-size: 13px;
}

.df-clear {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  opacity: 0.6;
  padding: 2px 6px;
}
.df-clear:hover { opacity: 1; }

.df-count {
  font-size: 12px;
  opacity: 0.7;
}

/* Rows hidden while a filter is active. */
tr.df-hidden { display: none !important; }

.df-results-header td {
  font-weight: bold;
  opacity: 0.75;
  padding: 6px 10px;
}

/* Reordering while filtered would invalidate every recorded restore position. */
.df-filtering .mover,
.df-filtering .ToggleViewMode { display: none !important; }
```

- [ ] **Step 2: Write the `.page` file**

```
Menu="Docker:1"
Title="Docker Filter"
Type="php"
---
<?php
/* docker.filter - adds a filter box to the Docker tab */
$dfPlugin = 'docker.filter';
$dfBase   = "/usr/local/emhttp/plugins/$dfPlugin";
$dfCss    = "$dfBase/styles/docker-filter.css";
$dfJs     = "$dfBase/javascript/docker-filter.js";
$dfCssV   = file_exists($dfCss) ? filemtime($dfCss) : 0;
$dfJsV    = file_exists($dfJs)  ? filemtime($dfJs)  : 0;
?>
<link rel="stylesheet" href="/plugins/<?=$dfPlugin?>/styles/docker-filter.css?v=<?=$dfCssV?>">
<div id="df-root"></div>
<script src="/plugins/<?=$dfPlugin?>/javascript/docker-filter.js?v=<?=$dfJsV?>"></script>
```

The cache-busting `?v=<mtime>` matters: Unraid's webgui is aggressively cached
and without it a plugin update appears to do nothing.

- [ ] **Step 3: Verify the page file parses as PHP**

Run: `php -l source/usr/local/emhttp/plugins/docker.filter/DockerFilter.page`
Expected: `No syntax errors detected`

If `php` is not installed locally, skip this step and rely on Task 14's live
check instead.

- [ ] **Step 4: Commit**

```bash
git add src/docker-filter.css source/usr/local/emhttp/plugins/docker.filter/DockerFilter.page
git commit -m "feat: add stylesheet and Unraid page hook"
```

---

## Task 13: Build script

**Files:**
- Create: `build.sh`

Unraid's `upgradepkg` accepts a plain `tar.xz` whose root mirrors the target
filesystem. `makepkg` is a Slackware tool and is not available on the dev
machine, so `tar` is used directly.

- [ ] **Step 1: Write `build.sh`**

```bash
#!/usr/bin/env bash
# Bundles the plugin and produces a Slackware-compatible .txz for Unraid.
set -euo pipefail

PLUGIN="docker.filter"
VERSION="${1:-$(date +%Y.%m.%d)}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGE="$ROOT/source"
DEST="$STAGE/usr/local/emhttp/plugins/$PLUGIN"
OUT="$ROOT/packages/$PLUGIN-$VERSION-x86_64-1.txz"

mkdir -p "$DEST/javascript" "$DEST/styles" "$ROOT/packages"

npx esbuild "$ROOT/src/main.js" \
  --bundle --format=iife --target=es2020 --legal-comments=none \
  --outfile="$DEST/javascript/docker-filter.js"

cp "$ROOT/src/docker-filter.css" "$DEST/styles/docker-filter.css"

rm -f "$ROOT/packages/$PLUGIN"-*.txz
tar -C "$STAGE" -cJf "$OUT" usr

echo "built: $OUT"
echo "sha256: $(sha256sum "$OUT" | cut -d' ' -f1)"
```

- [ ] **Step 2: Make it executable and run it**

```bash
chmod +x build.sh && ./build.sh
```

Expected: prints `built: .../packages/docker.filter-<date>-x86_64-1.txz` and a
64-character sha256.

- [ ] **Step 3: Verify the package layout**

Run: `tar -tJf packages/docker.filter-*.txz | head`
Expected: paths beginning `usr/local/emhttp/plugins/docker.filter/`, including
`DockerFilter.page`, `javascript/docker-filter.js`, `styles/docker-filter.css`.

- [ ] **Step 4: Verify the bundle is a self-contained IIFE**

Run: `head -c 120 source/usr/local/emhttp/plugins/docker.filter/javascript/docker-filter.js`
Expected: starts with `(()=>{` — no `import` or `export` statements.

- [ ] **Step 5: Commit**

```bash
git add build.sh
git commit -m "build: add esbuild bundle and txz packaging script"
```

---

## Task 14: Plugin manifest, CA template, and docs

**Files:**
- Create: `docker.filter.plg`, `docker.filter.xml`, `README.md`, `LICENSE`

- [ ] **Step 1: Write `docker.filter.plg`**

Replace `PACKAGE_SHA256` with the hash printed by `./build.sh`.

```xml
<?xml version='1.0' standalone='yes'?>
<!DOCTYPE PLUGIN [
<!ENTITY name      "docker.filter">
<!ENTITY author    "TRusselo">
<!ENTITY version   "2026.08.01">
<!ENTITY pluginURL "https://raw.githubusercontent.com/TRusselo/docker.filter/main/docker.filter.plg">
<!ENTITY pkgURL    "https://github.com/TRusselo/docker.filter/releases/download/&version;">
<!ENTITY pluginLOC "/boot/config/plugins/&name;">
<!ENTITY emhttpLOC "/usr/local/emhttp/plugins/&name;">
<!ENTITY package   "&name;-&version;-x86_64-1.txz">
<!ENTITY sha256    "PACKAGE_SHA256">
]>

<PLUGIN name="&name;"
        author="&author;"
        version="&version;"
        pluginURL="&pluginURL;"
        support="https://github.com/TRusselo/docker.filter/issues"
        project="https://github.com/TRusselo/docker.filter"
        icon="filter"
        min="7.0.0">

<CHANGES>
### 2026.08.01
- Initial release
- Filter box on the Docker tab, matching container names and folder names
- Compatible with folder.view2: finds containers parked inside collapsed folders
</CHANGES>

<!-- Remove any previously downloaded package -->
<FILE Run="/bin/bash">
<INLINE>
mkdir -p &pluginLOC;
rm -f $(ls &pluginLOC;/&name;-*.txz 2>/dev/null | grep -v '&version;') 2>/dev/null
</INLINE>
</FILE>

<!-- Download and install -->
<FILE Name="&pluginLOC;/&package;" Run="upgradepkg --install-new">
<URL>&pkgURL;/&package;</URL>
<SHA256>&sha256;</SHA256>
</FILE>

<FILE Run="/bin/bash">
<INLINE>
echo ""
echo "&name; &version; installed."
echo "Open the Docker tab - the filter box appears above the container list."
echo ""
</INLINE>
</FILE>

<!-- Uninstall -->
<FILE Run="/bin/bash" Method="remove">
<INLINE>
removepkg &name;-&version;-x86_64-1 2>/dev/null
rm -rf &emhttpLOC;
rm -rf &pluginLOC;
echo "&name; removed."
</INLINE>
</FILE>

</PLUGIN>
```

- [ ] **Step 2: Validate the XML parses**

Run: `xmllint --noout docker.filter.plg && echo OK`
Expected: `OK`

- [ ] **Step 3: Write the CA template `docker.filter.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<PluginEntity>
  <Name>docker.filter</Name>
  <Repository/>
  <PluginURL>https://raw.githubusercontent.com/TRusselo/docker.filter/main/docker.filter.plg</PluginURL>
  <Support>https://github.com/TRusselo/docker.filter/issues</Support>
  <Project>https://github.com/TRusselo/docker.filter</Project>
  <Category>Tools:Utilities</Category>
  <Icon>https://raw.githubusercontent.com/TRusselo/docker.filter/main/icon.png</Icon>
  <Overview>
    Adds a filter box to the top of the Docker tab so you can find a container
    by typing part of its name instead of scrolling a long list.

    Fully compatible with folder.view2. When containers are grouped into
    collapsed folders they are moved out of the container table entirely, so an
    ordinary filter cannot see them. docker.filter reads both the table and
    folder.view2's internal storage, and lifts matching containers into a
    results group with all their normal controls intact. Typing a folder's name
    matches everything inside it.

    Clearing the box restores the table exactly as it was. The plugin stores no
    configuration and the filter always starts empty.
  </Overview>
  <Date>2026-08-01</Date>
</PluginEntity>
```

- [ ] **Step 4: Write `LICENSE` and `README.md`**

```bash
curl -fsSL https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt -o LICENSE
```

`README.md`:

```markdown
# docker.filter

An Unraid plugin that adds a filter box to the Docker tab.

## Why

The Docker tab lists every container in one table. Past about thirty containers,
finding a specific one means scrolling and scanning.

## folder.view2 compatibility

folder.view2 groups containers into collapsible folders. When a folder is
collapsed it does not hide its rows — it **moves them out of the table** into an
internal storage element. A conventional filter that hides non-matching rows
therefore searches only the handful of containers not currently in a folder.

docker.filter indexes both the table and folder.view2's storage, then *moves*
matching rows into a temporary results group. Rows are moved rather than copied,
so their live CPU and memory readouts and all their buttons keep working.
Clearing the filter returns every row to its exact original position.

## Install

Plugins → Install Plugin, then paste:

```
https://raw.githubusercontent.com/TRusselo/docker.filter/main/docker.filter.plg
```

Requires Unraid 7.0 or later.

## Development

```bash
npm install
npm test        # vitest + jsdom
./build.sh      # bundle and package
```

## License

GPL-2.0-only
```

- [ ] **Step 5: Commit**

```bash
git add docker.filter.plg docker.filter.xml README.md LICENSE
git commit -m "feat: add plugin manifest, CA template, README and license"
```

---

## Task 15: Publish to GitHub

**CHECKPOINT — this task creates a public repository and publishes code. Confirm with the user before running any of it.**

`gh` is already authenticated as `TRusselo`.

- [ ] **Step 1: Confirm with the user**

Ask explicitly: create the **public** repo `TRusselo/docker.filter` and push? Wait
for a clear yes. Do not proceed on assumption.

- [ ] **Step 2: Create the repo and push**

```bash
gh repo create TRusselo/docker.filter --public \
  --description "Unraid plugin: filter box for the Docker tab, folder.view2 compatible" \
  --source=. --remote=origin --push
```

- [ ] **Step 3: Build and attach the package to a release**

```bash
./build.sh
VERSION=$(date +%Y.%m.%d)
gh release create "$VERSION" "packages/docker.filter-$VERSION-x86_64-1.txz" \
  --title "$VERSION" --notes "Initial release"
```

- [ ] **Step 4: Put the real hash into the manifest**

```bash
sha256sum packages/docker.filter-*.txz
```

Replace `PACKAGE_SHA256` in `docker.filter.plg` with that value, and set
`<!ENTITY version>` to the released `$VERSION` if it differs from `2026.08.01`.

- [ ] **Step 5: Verify the plg is reachable and the hash matches**

```bash
curl -fsSL https://raw.githubusercontent.com/TRusselo/docker.filter/main/docker.filter.plg | head -20
curl -fsSL https://github.com/TRusselo/docker.filter/releases/download/$VERSION/docker.filter-$VERSION-x86_64-1.txz \
  | sha256sum
```

Expected: the second command's hash equals the one in the manifest. A mismatch
makes the plugin fail to install with a checksum error.

- [ ] **Step 6: Commit and push**

```bash
git add docker.filter.plg
git commit -m "chore: pin release package checksum"
git push
```

---

## Task 16: Install and verify on the live server

**CHECKPOINT — this installs software on the user's production Unraid server. Confirm before starting.**

Server: `http://192.168.1.12/`. The user must log in in the browser themselves;
password entry is not something the agent can do.

- [ ] **Step 1: Record the pre-install baseline**

Using browser automation on the Docker tab, capture: total top-level rows, folder
count, rows in `.folder-storage`, and which folders are expanded.

```js
const tb = document.getElementById('docker_containers').tBodies[0];
JSON.stringify({
  top: tb.children.length,
  folders: [...tb.children].filter(r => r.classList.contains('folder')).length,
  stored: tb.querySelectorAll('.folder-storage > tr').length,
  open: [...new Set([...tb.children]
    .filter(r => r.classList.contains('folder-element'))
    .map(r => (r.className.match(/folder-(\w+)-element/) || [])[1]))],
});
```

Expected on this server, all folders collapsed: `top: 15, folders: 10, stored: 101, open: []`.

- [ ] **Step 2: Install the plugin**

Ask the user to go to **Plugins → Install Plugin**, paste the raw `.plg` URL, and
click Install. Confirm the install log ends without a checksum error.

- [ ] **Step 3: Verify the bar renders in the right place**

Reload the Docker tab. Confirm the filter bar sits directly above the container
table, and that no stray "Docker Filter" heading remains.

- [ ] **Step 4: Verify filtering finds containers inside collapsed folders**

Type a container name that lives inside a collapsed folder. Confirm it appears
in the results group, and that its CPU/memory cells still update.

- [ ] **Step 5: Verify folder-name matching**

Type `Services`. Confirm every container in that folder is listed.

- [ ] **Step 6: Verify exact restore — the critical check**

Clear the filter, then re-run the Step 1 snapshot. Every field must match the
baseline exactly, including `stored: 101` and the same set of open folders.

- [ ] **Step 7: Verify the guard**

With a filter active, expand a folder using folder.view2's own control. Confirm
the filter drops and the table returns to normal rather than corrupting.

- [ ] **Step 8: Verify uninstall is clean**

Remove the plugin from the Plugins page. Confirm the Docker tab renders normally
with no leftover bar, and that `/usr/local/emhttp/plugins/docker.filter` is gone.

- [ ] **Step 9: Record results**

Note any deviation from expected in the commit message or a follow-up issue. Do
not claim the plugin works until Steps 4, 6, and 7 have actually been observed.

---

## Task 17: Community Applications submission

**BLOCKED:** CA effectively requires an Unraid forum support thread, which does
not exist yet. Everything before this task is independent of it.

- [ ] **Step 1: User creates a forum support thread**

In the Unraid forums, Plugin Support section. Post title should include the
plugin name. Capture the thread URL.

- [ ] **Step 2: Author `icon.png`**

64×64 or larger PNG at the repo root. A funnel/filter glyph matches the
`icon="filter"` used in the manifest.

- [ ] **Step 3: Point support links at the thread**

Update the `support` attribute in `docker.filter.plg` and `<Support>` in
`docker.filter.xml` to the forum thread URL, replacing the GitHub issues URL.

- [ ] **Step 4: Commit and push**

```bash
git add docker.filter.plg docker.filter.xml icon.png
git commit -m "chore: point support links at the Unraid forum thread"
git push
```

- [ ] **Step 5: Submit**

Go to https://ca.unraid.net/submit/new, run the live scan against the repo, fix
anything it reports, and submit. Plugin submissions are manually reviewed.

---

## Self-Review Notes

**Spec coverage:** every spec section maps to a task — findings 1–5 drive Tasks
4/7 (folder-storage sourcing, move-not-clone), behaviour rules map to Tasks 5/9
(match scope, folder names, no persistence, Esc/clear, count), architecture's
five units map to Tasks 4–10 plus `gate` (Task 6, an addition the spec's guard
section implies but does not name), failure behaviour maps to Task 11's
try/catch and Task 4/11's absent-table handling, packaging maps to Tasks 12–14,
and testing maps to Tasks 3 and 16.

**Gap found and fixed during review:** the spec's "hide drag handles while
filtering" requirement had CSS in Task 12 (`.df-filtering`) with nothing
toggling it. Task 7's applier now adds and removes the class on `document.body`,
covered by a test. `document.body` rather than the table, because
`.ToggleViewMode` is a sibling of the table container, not a descendant of it.

**Test count:** Task 11 Step 5 expects 47 tests across 7 files (selectors 4,
fixture 5, indexer 5, matcher 6, gate 6, applier 11, guard 5, ui 6, main 6 —
note this is 9 files once fixture and gate tests are counted separately; adjust
the expected totals to whatever the suite actually reports rather than forcing a
match).
