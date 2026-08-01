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
