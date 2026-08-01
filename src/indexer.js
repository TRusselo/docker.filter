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
