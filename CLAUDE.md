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

## Testing

- **Every code change** (new feature, bug fix, refactor) must include a corresponding new or updated unit test that covers the changed behaviour.
- **Run `npm test` after every commit.** If tests fail, fix the code — never modify a test just to make it pass. Tests must fail for a real reason; the fix belongs in the implementation, not the test.

## Git push

- Always push with: `git push -u origin <branch-name>`
- Branch names must start with `claude/` and end with the session id suffix (e.g. `claude/my-feature-UhWbZ`).
