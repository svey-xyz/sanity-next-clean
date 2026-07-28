# Keeping a fork in sync with the template

`sanity-next-clean` is a **template**. Other sites (e.g. `soule-directory-site`) are **git
forks** of it and are updated *from* it: the template is upstream, the forks are downstream.
Site-specific work flows template → fork, never the reverse. The one sanctioned reverse flow
is a **deliberate backport** of a general fix — see "Backporting general fixes" below; it
goes through a branch + PR on the template, never a direct push to `main`.

## Remotes: a fork's `origin` is NEVER this template

**Incident, 2026-07-12:** a fork's working copy still had this template as `origin`; a
routine `git push` fast-forwarded 11 site-specific commits onto template `main` (silently —
fast-forwards don't warn), replacing the demo content model. `main` was reset to `1d40509`.

Rules:

- `origin` points at the fork's own repo (GitHub or Gitea). The template is registered as
  `upstream` and is fetched from, never pushed to.
- First thing in any fork working copy — and before any push an agent makes — run
  `git remote -v` and verify `origin` is not `…/sanity-next-clean`. If it is, fix it first:
  `git remote rename origin upstream && git remote add origin <fork-url>`.
- Keep `main` protected in the template's Gitea repo settings so a stray push is rejected.

## Rule: sync from upstream before editing a fork

**Before making any edit to a fork of `sanity-next-clean`, first check for upstream template
changes and merge them in.** Editing a stale fork re-introduces bugs already fixed upstream
and creates avoidable merge conflicts. Sync first, then build.

Agents: treat this as a hard precondition. `git fetch` the template and report whether the
fork is behind before proposing any change.

## How to sync — use git's merge, never hand-copy files

A real three-way `git merge` applies every non-conflicting upstream change automatically
(lockfiles included), preserves history (the fork keeps a true merge commit with the
template as a parent), and makes the next sync cheap. Copying files by hand silently drops
or duplicates changes — don't.

From a fork's working copy, with `main` up to date:

```bash
# one-time: register the template as an 'upstream' remote
git remote add upstream https://gitea.tarte.svey.xyz/svey/sanity-next-clean.git

git fetch upstream
git switch -c sync/template-main
git merge upstream/main      # resolve conflicts (see "Handling divergence")
git push origin sync/template-main
# then open a PR: sync/template-main → main
```

If you can't push from where the merge happens, produce it locally and hand off a git
bundle — `git bundle create sync.bundle sync/template-main` — for someone to `git fetch`
from the bundle and push.

## Backporting general fixes (fork → template)

Forks accumulate improvements the template should have. Periodically (or after any burst of
fork work) review fork commits since their merge-base with the template and split them:

- **Backport:** bug fixes, a11y/perf improvements, doc corrections, schema/utility patterns
  any site would want (e.g. a validation fix, a stega-discipline miss, a shadcn component
  extension). Land them on a `backport/*` branch on the template via PR — cherry-pick or
  re-author against template code, template-neutral styling only. Larger ports become
  template issues first (see #12–#20 for the 2026-07-17 review's batch).
- **Leave in the fork:** branding, theme tokens, content-model changes specific to the
  site, deploy-config specifics (project IDs, Vercel build wiring).

After a backport lands in the template, forks pick it up through the normal sync — git
recognises cherry-picked/re-authored changes and merges them cleanly.

## Handling divergence

Most files fast-forward to the template with no conflict. Conflicts arise only where a fork
has **intentionally customized** a file the template also changed. Resolve by **keeping the
fork's customization and layering the template's change on top** — never discard a fork's
deliberate divergence just to "win" the merge.

Keep this registry of known per-fork divergences current so future syncs stay predictable:

| Fork | File | Divergence | On merge |
| --- | --- | --- | --- |
| soule-directory-site | `frontend/app/components/layout/Header.tsx` | custom `HeaderLogo` + `select-none` | keep the fork's structure; take the template's className changes (e.g. `z-50 → z-40`) |
| vsc-website (GitHub `svey-xyz/vsc-website`) | content model + `frontend/app/components/**` | full VSC port: flat pageBuilder blocks, `articles/` + `blocks/archive/` trees, own image stack (`common/Image` + custom loader), VSC theme, `@breadcrumb` parallel route | template demo types/components were removed — expect large renames; sync mostly touches `sanity/lib`, docs, config |
| vsc-website | `frontend/app/components/shader/**`, `studio …/objects/background.ts`, `backgroundField` + background GROQ | WebGL background system removed entirely (vsc `3a91250`, 2026-07-28) | the fork's deletions win — never reintroduce shader/background files on sync; the template keeps them |
| murphy-website (`svey/murphy-website`, branch `feat/brand-book`) | theme + layout (`globals.css`, `Header/Footer`, `MobileNav`), music types (`release`/`event`), `seo/`, `releases/` | Murphy design language; dark default; discography/tour blocks | keep murphy structure; take template changes beneath it — murphy forked at `81044c4`, so first sync crosses the live-caching rework |
