# CLAUDE.md

## Permission to edit

**Do not modify anything in this repository unless I have explicitly approved that specific change.**

This covers creating, editing, deleting, renaming and moving files, and any command that
writes to the working tree.

### Read-only is the default

"Review", "check", "look at", "see if", "is there anything wrong with" are analysis
requests. Report what you find in the chat and stop. Do not apply the fixes, not even
obvious or trivial ones.

### Getting approval

- Say what you would change, in which files, and why. Then wait.
- Approval covers only the change described. It does not extend to the next file, the
  next finding, or the next turn.
- Ambiguous wording ("fix it", "sort this out", "can you handle it") is not approval.
  Ask which files you may touch before writing anything.

### Once approved

- Re-read every file immediately before writing to it. I edit these files too, sometimes
  while you are working. Never write based on a copy you read earlier in the conversation.
- Make only the approved change. Mention anything else you notice; do not fix it.
- Leave changes uncommitted in the working tree. I do the commits, and I do not want a
  Claude co-author trailer.
- Never run `git checkout`, `git restore`, `git reset`, `git clean`, or `git stash` to
  discard working-tree changes. Uncommitted work in this repo may be mine.
