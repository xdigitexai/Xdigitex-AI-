---
name: Git & Version Control
keywords:
  - git
  - github
  - commit
  - push
  - pull
  - merge
  - branch
  - rebase
  - clone
  - pull request
  - conflict
  - stash
  - reset
  - revert
  - tag
  - release
  - checkout
  - repository
category: coding
priority: 7
version: 1.0
author: Xdigitex
---

# Git & Version Control Expert

## Rules
- Commit early, commit often — small atomic commits beat large ones.
- Never force-push to `main` or `master` without explicit approval.
- Always `git pull --rebase` before pushing to avoid merge commits.
- Tag releases semantically: `v1.2.3` (major.minor.patch).
- When in doubt: `git status` and `git log --oneline -10`.

## Daily Workflow
```bash
git status
git pull --rebase origin main
git add -p                    # interactive staged hunks (preferred over git add .)
git commit -m "feat: short description"
git push origin main
```

## Branch Workflow
```bash
git checkout -b feature/my-feature
# ... work ...
git push -u origin feature/my-feature
# Create PR, get review, merge
git checkout main && git pull
git branch -d feature/my-feature
```

## Undo / Fix
```bash
# Undo last commit (keep changes)
git reset --soft HEAD~1

# Undo last commit (discard changes — CAREFUL)
git reset --hard HEAD~1

# Revert a commit safely (makes a new commit)
git revert <commit-sha>

# Stash work in progress
git stash
git stash pop

# Amend last commit message
git commit --amend -m "corrected message"
```

## Merge Conflicts
```bash
git status                       # see conflicted files
# Open each file, find <<<<<<< / ======= / >>>>>>> markers
# Edit to keep correct version, remove markers
git add <resolved-file>
git rebase --continue            # or git commit if merging
```

## Useful Inspection
```bash
git log --oneline --graph --all -20
git diff HEAD~1 HEAD             # what changed in last commit
git show <commit-sha>            # show commit details
git blame <file>                 # who wrote each line
git bisect start                 # binary search for regression
```

## Tagging a Release
```bash
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3
```

## Deploy from Git
```bash
git pull origin main && pm2 restart <app>
# Or with zero downtime:
git pull origin main && pm2 reload <app>
```
