# Fork rules

This repo is `jasonsims/LibreChat`, a fork of `LibreChat-AI/LibreChat` that serves as a sample app for the traffic-bots personas, which generate traffic for Pendo dev instances. These rules apply on top of `AGENTS.md`, which belongs to upstream. Read `FORK.md` for the full picture.

Where these rules conflict with `AGENTS.md`, these win for fork work. In particular, ignore its branching and pull request section: this fork has no `dev` or `canary` workflow. Upstream's coding standards (module boundaries, imports, typechecking, tests, localization) still apply to any code written here.

## Do not edit upstream-owned files

- Never edit `AGENTS.md` or anything under `.claude/skills/`. Upstream changes them, and any edit here becomes a merge conflict on the next sync.
- Fork-specific instructions go in this file. Don't create a root `CLAUDE.md`; if upstream ever adds one, it would conflict.
- Tools that drop files into the repo (for example `railway init` or agent-skill installers) must have those changes reverted, not committed, unless they belong to the fork and are listed in `FORK.md`.

## Branches

- `main` mirrors `upstream/main`. Never commit to it, never open a PR into it, never merge into it. Only `git merge --ff-only upstream/main`.
- `deploy` is the fork's default branch and the Railway production branch. All fork work goes through PRs into `deploy`.
- Branch work off `deploy`, not `main`.
- Open PRs with `gh pr create --repo jasonsims/LibreChat --base deploy`. Without `--repo`, `gh` targets the upstream parent repo. Never open a PR or push a branch to `LibreChat-AI/LibreChat` from fork work.

## Keep the diff against upstream as small as possible

Every line changed in an upstream file is a future merge conflict. Before editing, ask whether the change can be made with configuration, a new file, or a wrapper instead.

- Prefer Railway variables (in `.railway/railway.ts`) and `librechat.yaml` over code. Most of LibreChat's behavior is switchable by env var; check `.env.example` and `librechat.example.yaml` first.
- Prefer new files over edits to existing ones.
- Do not reformat, rename, reorder imports in, or refactor upstream files. Run `npm run sort-imports` and Prettier only on fork-owned files.
- When an edit to an upstream file is unavoidable, keep it small and mark it with a `// FORK:` comment so `grep -rn "FORK:"` lists every divergence. JSON files can't hold comments, so rely on the table in `FORK.md`.
- Add an entry to the "Changes from upstream" table in `FORK.md` for every change on `deploy`. Name the files and give the reason.
- If a change would be useful to everyone, say so. It may belong upstream instead.

## Deployment and data

- Infrastructure lives in `.railway/railway.ts`. Change it there, then `railway config plan` and `railway config apply`; don't make lasting changes in the Railway dashboard, because the next apply reverts them. Never apply a plan that deletes the `mongo` service.
- Every push to `deploy` builds the root `Dockerfile` and deploys it.
- Sign-in is email and password only. Keep social, OpenID, LDAP and SAML login off. The bots depend on `POST /api/auth/register` staying open and email verification staying off (no `EMAIL_*` variables).
- Keep the Anthropic endpoint on a cheap model (`ANTHROPIC_MODELS`). Bots send many messages.
- Never print or commit `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CREDS_KEY`, `CREDS_IV`, API keys, `MONGO_URI` or bot passwords. They are `preserve()` values in `railway.ts` and live only in Railway.

## Before committing

- Use Node from `.nvmrc` (`nvm use`).
- For app or package code, follow the verification steps in `AGENTS.md`: focused Jest tests and `npx tsc --noEmit` in each workspace you changed. A failing frontend build also fails the Railway deploy.
- Commit messages follow upstream's style: an emoji, a type, and a title, for example `🔧 chore: Pin Railway Model`, `📝 docs: Update FORK.md`.

## Syncing with upstream

Follow "Syncing with upstream" in `FORK.md`. Sync through a `sync/upstream-YYYY-MM` branch and a PR into `deploy`, never directly.
