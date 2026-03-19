# PocketPiano — Claude Instructions

## Branch workflow

- **Each new feature or fix** must be developed on a **brand new branch** checked out from the latest `main`.
- **After merging a PR to main**, always delete both the remote and local branch:
  ```
  curl -s -X DELETE "https://api.github.com/repos/msdrey/PocketPiano/git/refs/heads/<branch-name>" \
    -H "Authorization: Bearer <github-token>"
  git branch -D <branch-name>
  ```
- Never reuse old branches. Always start fresh from `main`.

## Git push

- Always push with: `git push -u origin <branch-name>`
- Branch names must start with `claude/` and end with the session id suffix (e.g. `claude/my-feature-UhWbZ`).
