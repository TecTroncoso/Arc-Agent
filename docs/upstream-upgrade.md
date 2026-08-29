# Upstream upgrade procedure

Arc Agent is a fork of [earendil-works/pi](https://github.com/earendil-works/pi).
Each upstream pi release is brought into Arc Agent as a new branch in
the form `feat/arc-<upstream-version>-arc.<n>`, with the
customizations re-applied on top via a small script.

This document explains the rationale, the version scheme, and the
end-to-end upgrade procedure. If you only need to upgrade to a new
upstream pi release, jump to [Running the upgrade](#running-the-upgrade).

## Why this procedure exists

Upstream pi is actively developed. It releases new patch versions
roughly every week. Each release can touch any of the 1,200+ files in
the monorepo. Merging upstream into a fork that already carries
customizations produces hundreds of false conflicts (whitespace,
line ending, reflowed prose) that have nothing to do with the actual
upstream changes.

The two alternatives are both bad:

- Auto-merge everything. Hides real conflicts in noise.
- Cherry-pick upstream commits one by one. Works, but is tedious,
  error-prone, and gets slower the further Arc Agent drifts from
  the upstream history.

The middle ground that the script implements:

- The current Arc branch is a clean copy of an upstream release (so
  the diff against the next upstream release is small and clean).
- The Arc customizations are checked out on top of that base from
  a manifest, in one pass.
- The version is bumped to a SemVer-compliant scheme that does not
  trigger the upstream "Update Available" check on every start.

## Version scheme

`@earendil-works/pi-coding-agent` follows the scheme:

```
<upstream-pi-version>-arc.<n>
```

Examples:

- `0.84.4-arc.1` — first Arc release on top of upstream pi v0.84.4.
- `0.84.5-arc.1` — first Arc release on top of upstream pi v0.84.5.
- `0.84.5-arc.2` — second Arc release on the same upstream base (rare;
  only if upstream cuts a v0.84.5 patch we need to rebase onto).

The `-arc.N` suffix is a pre-release identifier in SemVer, so:

- `0.84.4-arc.1 < 0.84.4` (Arc release is "before" upstream final,
  semantically). This is the price of staying strictly SemVer-compliant
  while keeping the upstream version visible in the string.
- `0.84.5-arc.1 > 0.84.4` (new upstream base moves the version forward).

This is why Arc versions can and should bump the upstream digit on
every base upgrade: the new minor/patch is the upstream base, and the
new `-arc.1` is the first Arc release on that base.

## Layout of an Arc branch

```
* feat/arc-0.84.4-arc.1              ← HEAD (current Arc release)
|
|  ← cherry-pick of Arc-only commits on top of v0.84.4
v
* b79e4cc (tag: v0.84.4)            ← upstream pi v0.84.4 base
|
|  ← upstream pi v0.84.4..main
v
* <earendil-works/pi main>           ← upstream pi trunk
```

The Arc-only commits at the tip are the ones that show up in
`git log main..HEAD` when the branch is compared to upstream. They
are what makes this fork distinct.

## Running the upgrade

Prerequisites:

- The current branch is the Arc branch you want to upgrade from
  (typically `feat/arc-0.84.4-arc.1` for the first 0.84.5 upgrade).
- The working tree is clean. `git status --porcelain` must be empty.
- The target upstream tag is fetchable from
  `https://github.com/earendil-works/pi.git`.

Steps:

1. Fetch the new upstream tag and confirm it exists:

   ```bash
   git fetch upstream tag v0.84.5
   git rev-parse v0.84.5
   ```

2. Open a new Arc branch for the new base (do this on the current
   Arc branch, not on `main`):

   ```bash
   git checkout -b feat/arc-0.84.5-arc.1
   ```

3. Run the upgrade script:

   ```bash
   scripts/upgrade-from-upstream.sh v0.84.5
   ```

   The script will:

   - Save the current HEAD as the rollback anchor.
   - Add the `upstream` remote if it is missing.
   - Fetch the requested tag.
   - `git reset --hard v0.84.5`.
   - Check out every path listed in
     `scripts/arc-customizations.manifest` from the saved HEAD.
   - Bump `packages/coding-agent/package.json` to `0.84.5-arc.1`.
   - Append a `[Unreleased]` entry to
     `packages/coding-agent/CHANGELOG.md`.
   - Print a `git status` for review.

4. Inspect the result:

   ```bash
   git status --short
   git diff packages/coding-agent/package.json
   git diff packages/coding-agent/CHANGELOG.md
   ./pi-test.bat --version
   node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" \
        --run packages/coding-agent/test/extensions/mcp-client.test.ts
   ```

5. Commit and push:

   ```bash
   git add -A
   git commit -m "chore: upgrade base to v0.84.5 (Arc Agent 0.84.5-arc.1)"
   git push --force-with-lease origin feat/arc-0.84.5-arc.1
   ```

6. (Optional) Tag the previous Arc release for rollback safety:

   ```bash
   git tag backup/pre-0.84.5-arc.1 feat/arc-0.84.4-arc.1
   ```

## Updating the manifest

If you add a new Arc customization (a new extension, a new skill, a
new doc), add its path to `scripts/arc-customizations.manifest`. The
next upgrade will pick it up automatically. Removing an entry from
the manifest does not delete the file from a future upgrade branch;
it only stops re-applying it from the previous HEAD.

## When the manifest is wrong

If a path in the manifest was renamed or deleted between two upstream
releases, the script skips it with a warning (the file does not
exist at the previous HEAD). The upgrade still completes; you just
need to handle the renamed path manually after the script finishes.

If a path the manifest depends on was removed by the upstream
release (rare), the file will not exist on disk and you will see a
"pathspec did not match" error on commit. The fix is to delete the
stale path with `git rm` and amend the commit.

## Rollback

If the upgrade produces a branch you do not want, the script prints
the previous HEAD SHA at the end of its run. To roll back:

```bash
git reset --hard <PREVIOUS_HEAD>
```

That returns the working tree to the state it was in before the
script started.
