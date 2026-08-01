# Docker Filter — Unraid Plugin Design

**Date:** 2026-08-01
**Status:** Approved
**Plugin name:** `docker.filter`

## Problem

The Unraid Docker tab lists every container in one long table. On the target
server that is 106 containers. Finding a known container means scrolling and
scanning. There is no built-in search.

The plugin must coexist with **folder.view2**, which groups containers into
expandable folders.

## Target environment

Verified against the live server before designing:

- Unraid OS **7.3.0**, API 4.36.1, kernel 6.18.29
- **folder.view2** installed, Docker logic in
  `/plugins/folder.view2/scripts/docker.js`
- 106 containers: 5 loose, 101 inside 10 folders

## Findings that constrain the design

These were established by inspecting the live DOM, not assumed.

### 1. Collapsed folders remove rows from the table

When a folder.view2 folder is collapsed, its child `<tr>` elements are not
hidden — they are **moved out of the table** into a
`<div class="folder-storage">` nested inside a `<td>` of the folder row:

```
TR.sortable.folder-id-<id>.folder
  └── TD
      └── DIV.folder-storage
          └── TR.folder-<id>-element.folder-element   ← the container row
```

With all folders collapsed, 101 of 106 container rows live in storage. A
conventional "hide non-matching rows" filter would therefore match against
**5 containers**. This is the single most important constraint.

### 2. Rows carry unique element IDs — cloning is unsafe

Each container row contains elements keyed by container ID:
`<cid>`, `load-<cid>`, `cpu-<cid>`, `<cid>-auto`, `<cid>-wait`.

Unraid's live CPU/memory updater targets these by `getElementById`. Cloning a
row duplicates those IDs and breaks stats updates. **Rows must be moved, never
cloned.**

### 3. Moved rows keep working

Unraid binds click handlers **delegated on `document`** with selectors, not
per-row. A row relocated elsewhere in the DOM keeps all of its buttons and
context menus functional.

### 4. folder.view2 exposes no API

`customEvents.js` is a 39-byte stub; `docker.js` is 66 KB and minified. No
usable functions or events. Synthetic clicks on `.folder-hand` did not toggle
folders. **Driving folder.view2 programmatically is not an option** — which
rules out "expand every folder, then filter".

### 5. Plugins can add sections to the Docker tab

`compose.manager` already renders a second `div.title` + table inside
`div.content` on the Docker tab, confirming the `.page` file mechanism.
`Menu="Docker:1"` orders a section first within the tab.

## Approach

**Move matching rows into a synthetic "Results" group.**

While a filter is active: hide every direct `tbody > tr`, and move matching
rows — sourced from both the tbody and every `.folder-storage` — to the top of
the same table under a Results header row. On clear, every moved row returns to
its exact recorded position.

This yields real rows: full columns, working buttons, live CPU/memory. It works
precisely because of findings 2 and 3 (move, don't clone; delegated handlers
survive relocation).

Rejected alternatives:

- *Hide/show in place* — impossible, see finding 1.
- *Auto-expand all folders, then filter* — impossible, see finding 4. Would also
  mutate the user's persisted folder state.
- *Dropdown jump-list that never touches the table* — safest, but cannot reveal a
  container in place; degenerates into a navigation aid rather than a filter.

## Behavior

- **Match scope:** container name only, case-insensitive substring.
- **Folder names match too:** typing a folder's name contributes all of that
  folder's children. Folder names are meaningful given 10 folders hold 101
  containers.
- **Persistence:** none. The filter always starts empty on page load. It is a
  transient tool, not a saved view.
- **Clearing:** `Esc`, the ✕ button, or emptying the input.
- **Count display:** `N of 106` beside the input.

## Architecture

Five units. Exactly one is permitted to mutate the DOM.

### `bootstrap`
Waits for `#docker_containers` **and** for folder.view2 to finish parking rows
into storage. Settle detection: a `MutationObserver` on the tbody, considered
settled after **400 ms with no mutations**, with a **10 s** hard timeout after
which we proceed anyway. Then builds the UI and hands off.

This matters: during investigation, a snapshot taken mid-initialization showed
101 rows in storage while folder.view2 had not yet re-expanded the folders the
user had left open. Indexing a half-initialized table produces wrong results.

### `index`
Builds the container model, reading from **both** row sources:
`tbody > tr.sortable` and `.folder-storage > tr`. Per entry:

| field | source |
|---|---|
| `row` | the `<tr>` element |
| `name` | `.appname` text content |
| `folderName` | owning folder row's display name, for `.folder-element` rows |
| `home` | `{parent, nextSibling}` — the restore contract |

### `matcher`
Pure function, no DOM access. Case-insensitive substring over `name`; a folder
name match contributes all children of that folder. Returns a `Set` of rows.

### `applier`
The only mutator.

- `apply(query)` — hides every direct `tbody > tr`, moves matched rows under a
  synthetic `Results` header row at the top of the tbody.
- `reset()` — returns every moved row to its recorded `home`, removes the
  header, un-hides everything.
- **Invariant:** `apply()` always calls `reset()` first. Exactly one dirty state
  exists and it cannot nest.
- `home` is re-captured on every `apply()`, never reused across calls, so it can
  never go stale.

### `guard`
A `MutationObserver` on the tbody. If rows change while filtered and we did not
cause it, immediately `reset()` and clear the input rather than fight
folder.view2 or an Unraid background refresh.

Distinguishing our own mutations from foreign ones: the `applier` raises an
internal `mutating` flag around every DOM write, and the guard drops any
mutation record observed while that flag is set. The flag is cleared in a
`finally` block so an exception mid-apply cannot wedge the guard permanently
off. Because `MutationObserver` callbacks are delivered asynchronously as
microtasks, the guard also drains and discards any records already queued at
the moment the flag is lowered.

While filtering, folder.view2's drag handles and the view-mode toggle are
hidden — reordering in a filtered state would invalidate every `home`.

*Accepted tradeoff:* a background re-render clears an in-progress filter. The
alternative, re-applying after a foreign mutation, risks desync. Start
conservative; revisit if it proves annoying in practice.

## Failure behavior

- No `#docker_containers` → render nothing.
- No folder.view2 → works unchanged; every row is simply loose.
- Exception inside apply/reset → force a full `reset()` and remove the UI. A bug
  must never leave the table mangled.
- `reset()` also fires on `beforeunload`.

## Packaging (Community Applications compliant)

Repository layout:

```
docker.filter.plg                    ← PluginURL targets this raw URL
docker.filter.xml                    ← CA template
README.md
LICENSE                              ← GPL-2.0
icon.png                             ← referenced by the CA template
build.sh                             ← makepkg wrapper, emits SHA256
source/usr/local/emhttp/plugins/docker.filter/
    DockerFilter.page
    javascript/docker-filter.js
    styles/docker-filter.css
packages/docker.filter-YYYY.MM.DD-x86_64-1.txz
```

### `.plg`

DOCTYPE entities for `name`, `author`, `version`, `pluginURL`, `emhttpLOC`,
`pluginLOC`. `<PLUGIN>` attributes: `name`, `author`, `version="YYYY.MM.DD"`
(date-versioning is the ecosystem norm), `pluginURL`, `support`, `project`,
`icon="filter"`, `min="7.0.0"`.

A markdown `<CHANGES>` changelog. `FILE` blocks:

1. pre-install cleanup of older txz files in `&pluginLOC;`
2. download the txz with `<SHA256>`, `Run="upgradepkg --install-new"`
3. `Method="remove"` → `removepkg`, then `rm -rf` both plugin directories

CA requires a real `.txz` package with a hash — inline file blocks are not
acceptable for submission.

### `.page`

```
Menu="Docker:1"
Title="Docker Filter"
Type="php"
```

`Menu="Docker:1"` places the section first within the Docker tab. The JS still
pins the input directly above `div.TableContainer` as a fallback.

### CA template `docker.filter.xml`

Required fields: `<Name>`, `<PluginURL>`, `<Support>`, `<Project>`,
`<Overview>`, `<Category>`, `<Icon>`. Category: `Tools:Utilities`.
Plugin submissions are manually reviewed.

### Placeholders to fill before submission

- `GITHUB_USER` / repo name — needed for `pluginURL`, `project`, icon URL
- Unraid forum support-thread URL — `support` attribute and `<Support>` field
- `icon.png`

### Persistence

The plugin stores no configuration. The filter always starts empty, so nothing
is written to `/boot` beyond the cached txz. Uninstall removes
`/usr/local/emhttp/plugins/docker.filter` and `/boot/config/plugins/docker.filter`
completely.

## Testing

1. **Fixture tests.** Snapshot the real Docker table HTML (folders collapsed,
   csrf tokens stripped) into the repo. Run `index` / `matcher` / `applier`
   against it. Key assertion: `apply()` followed by `reset()` returns the DOM to
   a structurally identical state, including rows restored into the correct
   `.folder-storage` containers.
2. **Live verification** on the server via browser automation: filter, clear,
   and confirm all 101 rows return to storage with folder state matching the
   pre-filter baseline.
3. **Degradation check:** confirm the page is unaffected when the filter is
   empty, and that disabling folder.view2 leaves the plugin functional.

## Out of scope

Matching image, ports, or networks. Fuzzy or regex matching. Saved filters.
Filtering the Compose table or the VMs tab. Any change to folder.view2 itself.
