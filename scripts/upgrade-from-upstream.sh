#!/usr/bin/env bash
#
# upgrade-from-upstream.sh
#
# Applies a new upstream pi release on top of the current Arc Agent
# branch, without losing any Arc Agent customizations.
#
# Workflow:
#   1. Confirm the working tree is clean and we are on an Arc branch.
#   2. Add `upstream` as the earendil-works/pi remote (idempotent).
#   3. Fetch the requested tag (defaults to v0.84.4).
#   4. Reset the current branch to the requested tag.
#   5. Re-apply the Arc Agent customizations listed in
#      `scripts/arc-customizations.manifest` (paths are checked out from
#      the previous HEAD, which the script captures as $PREVIOUS_HEAD).
#   6. Bump packages/coding-agent/package.json to the new arc version.
#   7. Append a [Unreleased] entry to packages/coding-agent/CHANGELOG.md.
#   8. Stage everything and print a `git status` so the operator can
#      inspect before committing.
#
# Usage:
#   scripts/upgrade-from-upstream.sh v0.84.5
#
# The script is intentionally non-destructive on the upstream side
# (it only does `git reset --hard` to the chosen tag) and additive on
# the Arc side (every customization listed in the manifest is checked
# out from the previous HEAD). If something goes wrong mid-way, run
#   git reset --hard "$PREVIOUS_HEAD"
# to roll back to where you were before the script started.

set -euo pipefail

TARGET_TAG="${1:-v0.84.4}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# 1. Sanity checks.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree is dirty. Commit or stash before upgrading." >&2
  exit 1
fi
if ! git rev-parse --verify "$TARGET_TAG" >/dev/null 2>&1; then
  echo "error: tag $TARGET_TAG is not available locally. Run:" >&2
  echo "  git fetch upstream tag $TARGET_TAG" >&2
  exit 1
fi
PREVIOUS_HEAD="$(git rev-parse HEAD)"
echo "previous HEAD: $PREVIOUS_HEAD"
echo "target tag:    $TARGET_TAG"

# 2. Ensure the upstream remote is present.
if ! git remote get-url upstream >/dev/null 2>&1; then
  echo "adding upstream remote (earendil-works/pi)"
  git remote add upstream https://github.com/earendil-works/pi.git
fi

# 3. Fetch the requested tag (and only the tag, to keep this fast).
git fetch upstream "tag" "$TARGET_TAG"

# 4. Reset the current branch to the requested tag.
git reset --hard "$TARGET_TAG"

# 5. Re-apply the Arc Agent customizations from the previous HEAD.
#    The manifest is a flat list of repo-relative paths. If a path
#    does not exist in $PREVIOUS_HEAD (e.g. it was removed by the
#    upstream reset), the checkout is silently skipped with a warning.
MANIFEST="$REPO_ROOT/scripts/arc-customizations.manifest"
if [[ ! -f "$MANIFEST" ]]; then
  echo "error: manifest not found at $MANIFEST" >&2
  echo "create the manifest with one repo-relative path per line." >&2
  exit 1
fi
while IFS= read -r path; do
  [[ -z "$path" || "$path" == \#* ]] && continue
  if git cat-file -e "$PREVIOUS_HEAD:$path" 2>/dev/null; then
    git checkout "$PREVIOUS_HEAD" -- "$path"
  else
    echo "warning: $path did not exist at $PREVIOUS_HEAD, skipping"
  fi
done <"$MANIFEST"

# 6. Bump the version in packages/coding-agent/package.json.
PKG_JSON="packages/coding-agent/package.json"
NEW_VERSION="$(echo "$TARGET_TAG" | sed 's/^v//')"
# Arc Agent's version scheme: <upstream>-arc.N. We start at -arc.1 for
# each new base, since this script is intended to land the first Arc
# release of the new base. If a higher N is needed, edit the file
# directly after the script runs.
ARC_VERSION="${NEW_VERSION}-arc.1"
node -e "
  const fs = require('node:fs');
  const path = '$PKG_JSON';
  const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
  pkg.version = '$ARC_VERSION';
  fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
"
echo "bumped $PKG_JSON to $ARC_VERSION"

# 7. Add an [Unreleased] entry to the package CHANGELOG.
CHANGELOG="packages/coding-agent/CHANGELOG.md"
TODAY="$(date -u +%Y-%m-%d)"
UPSTREAM_NOTE="Upgraded base from previous to $TARGET_TAG (earendil-works/pi upstream)."
node -e "
  const fs = require('node:fs');
  const path = '$CHANGELOG';
  const text = fs.readFileSync(path, 'utf8');
  const insert = \`## [Unreleased]

### Changed

- **Base upgrade**: $UPSTREAM_NOTE Previous base state is recoverable from the most recent tag of the form \`backup/pre-<base>-*\`.

\`;
  // Insert immediately after the first line ('# Changelog').
  const lines = text.split('\n');
  lines.splice(1, 0, insert.trimEnd());
  fs.writeFileSync(path, lines.join('\n'), 'utf8');
"
echo "appended [Unreleased] to $CHANGELOG"

# 8. Show what changed.
echo
echo "==== git status ===="
git status --short
echo
echo "==== next step ===="
echo "Review the diff, then commit:"
echo "  git add -A"
echo "  git commit -m \"chore: upgrade base to $TARGET_TAG (Arc Agent $ARC_VERSION)\""
echo
echo "If you want to roll back:"
echo "  git reset --hard $PREVIOUS_HEAD"
