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
