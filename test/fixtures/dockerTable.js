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
