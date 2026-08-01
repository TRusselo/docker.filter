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
