---
name: git-worktrees
description: Manage git worktrees in ~/.worktrees/ for isolated task development. Use this skill whenever the user asks to create, list, remove, or switch worktrees, or when /start-task needs to create an isolated branch. Also triggers for "create worktree", "list worktrees", "remove worktree", "clean worktrees", "switch worktree".
---

# Git Worktrees

Manage git worktrees in a centralized `~/.worktrees/` directory for isolated task development.

All worktrees MUST be created under `~/.worktrees/` — never as sibling directories to the project. This keeps the filesystem clean and predictable.

## Commands

### Create a worktree

```bash
# Syntax
/git-worktrees create <branch-name> [base-ref]

# Examples
/git-worktrees create feat/APR-1234-jwt-rotation
/git-worktrees create feat/hackathon-toolkit origin/main
```

**Steps:**

1. Ensure `~/.worktrees/` exists:
   ```bash
   mkdir -p ~/.worktrees
   ```

2. Fetch latest refs:
   ```bash
   git fetch origin
   ```

3. Determine base ref (default: `origin/main` or `origin/master`):
   ```bash
   git remote show origin | grep 'HEAD branch' | awk '{print $NF}'
   ```

4. Create the worktree:
   ```bash
   git worktree add -b <branch-name> ~/.worktrees/<branch-name> <base-ref>
   ```

5. If branch already exists:
   ```bash
   git worktree add ~/.worktrees/<branch-name> <branch-name>
   ```

6. **Symlink gitignored local files** into the worktree so local configs and task data are available:

   Get the original repo root:
   ```bash
   REPO_ROOT=$(git rev-parse --show-toplevel)
   WORKTREE=~/.worktrees/<branch-name>
   ```

   For each of the following, if it exists in the repo root, create a symlink in the worktree:
   ```bash
   # .env files
   for f in "$REPO_ROOT"/.env "$REPO_ROOT"/.env.*; do
     [ -f "$f" ] && ln -sf "$f" "$WORKTREE/$(basename $f)"
   done

   # .local-development/
   [ -d "$REPO_ROOT/.local-development" ] && ln -sf "$REPO_ROOT/.local-development" "$WORKTREE/.local-development"

   # Any other .local* directories
   for d in "$REPO_ROOT"/.local*/; do
     [ -d "$d" ] && [ "$d" != "$REPO_ROOT/.local-development/" ] && ln -sf "$d" "$WORKTREE/$(basename $d)"
   done
   ```

   > **Why symlinks, not copies:** These files are gitignored — they're local state (DB, secrets, task context). The worktree must share the same `.local-development/` as the repo so ralph and other tools can write task logs, metrics, and learnings to the same place.

7. **Carry over unstaged and untracked files** from the original repo into the worktree:

   These are files needed to run the flow but that the user hasn't committed (and doesn't intend to).

   ```bash
   REPO_ROOT=$(git rev-parse --show-toplevel)
   WORKTREE=~/.worktrees/<branch-name>

   # Unstaged changes on tracked files → apply as patch to worktree
   git diff > /tmp/worktree-unstaged.patch
   if [ -s /tmp/worktree-unstaged.patch ]; then
     (cd "$WORKTREE" && git apply /tmp/worktree-unstaged.patch) && echo "Applied unstaged changes"
   fi

   # Untracked files (not gitignored) → copy to worktree preserving paths
   git ls-files --others --exclude-standard | while read f; do
     dest="$WORKTREE/$f"
     mkdir -p "$(dirname "$dest")"
     cp "$REPO_ROOT/$f" "$dest"
   done
   ```

   > These are **copies**, not symlinks — the worktree should be able to diverge on these files independently.

8. Print the result:
   ```
   Worktree created:
     Path:   ~/.worktrees/<branch-name>
     Branch: <branch-name>
     Base:   <base-ref>

   To enter: cd ~/.worktrees/<branch-name>
   ```

### List worktrees

```bash
/git-worktrees list
```

Run `git worktree list` and format the output showing path, branch, and commit hash.

### Remove a worktree

```bash
/git-worktrees remove <branch-name>
```

**Steps:**

1. Confirm with user: "Remove worktree at ~/.worktrees/<branch-name>? (y/n)"
2. Check for uncommitted changes:
   ```bash
   cd ~/.worktrees/<branch-name> && git status --porcelain
   ```
3. If dirty, warn: "Worktree has uncommitted changes. Force remove? (y/n)"
4. Remove:
   ```bash
   git worktree remove ~/.worktrees/<branch-name> [--force]
   ```

### Clean stale worktrees

```bash
/git-worktrees clean
```

Run `git worktree prune` to clean up stale entries, then list remaining.

## Integration with /start-task

When `/start-task` needs a worktree (Step 4), it should use this skill's create logic:

```
~/.worktrees/<branch-name>/
├── .local-development/
│   ├── spec.json
│   ├── scout-notes.md
│   ├── interview-notes.md
│   ├── PRD.md
│   └── tasks/
│       ├── manifest.json
│       └── T1.json, T2.json, ...
└── (project source code)
```

## Conventions

- **Location**: Always `~/.worktrees/<branch-name>` — no exceptions
- **Naming**: Branch name IS the directory name (e.g., `feat/APR-1234` → `~/.worktrees/feat/APR-1234`)
- **Cleanup**: Remove worktrees after merging the branch
- **Multiple projects**: Worktrees from different repos coexist in `~/.worktrees/` — the branch name provides uniqueness
