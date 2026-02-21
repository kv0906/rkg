#!/bin/bash

# Ralph Wiggum Loop - Autonomous AI Coding Agent
# https://github.com/anthropics/claude-code
set -e

MAX_ITERATIONS=12
ITERATION=0
PRD_FILE="prd.json"
PROGRESS_FILE="progress.txt"
COMPLETE_MARKER="COMPLETE"

echo "Starting Ralph Wiggum Loop..."
echo "Max iterations: $MAX_ITERATIONS"
echo "PRD file: $PRD_FILE"
echo ""

while [ $ITERATION -lt $MAX_ITERATIONS ]; do
  ITERATION=$((ITERATION + 1))
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "ITERATION $ITERATION of $MAX_ITERATIONS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  # Build prompt via temp file to avoid shell quoting issues
  PROMPT_FILE=$(mktemp)
  trap "rm -f $PROMPT_FILE" EXIT

  cat > "$PROMPT_FILE" <<HEADER
You are working on a feature from the PRD below. Follow these rules EXACTLY:

## PRD
\`\`\`json
HEADER

  cat "$PRD_FILE" >> "$PROMPT_FILE"

  cat >> "$PROMPT_FILE" <<MIDDLE
\`\`\`

## Previous Progress
\`\`\`
MIDDLE

  if [ -f "$PROGRESS_FILE" ]; then
    cat "$PROGRESS_FILE" >> "$PROMPT_FILE"
  fi

  cat >> "$PROMPT_FILE" <<FOOTER
\`\`\`

## Your Task

1. **Pick ONE feature**: Select the HIGHEST priority user story where "passes": false
2. **Scope check**: If the feature seems too large, break it into smaller sub-tasks and only do the first sub-task
3. **Implement**: Write code to satisfy ALL acceptance criteria for that feature
4. **Test & Type Check**:
   - Run type check: \`npx tsc --noEmit\`
   - Run all tests: \`npm test\`
   - Fix any failures until CI is green
5. **Commit**:
   - Commit your changes with a clear message
   - Use conventional commit format: "feat: description" or "fix: description"
6. **Update PRD**:
   - Update prd.json to set "passes": true for the completed user story
   - Commit this change separately
7. **Update Progress**:
   - APPEND (do not overwrite) a new entry to progress.txt with:
     - Iteration number ($ITERATION)
     - User story ID completed
     - Brief summary of what was done
     - Test/typecheck status
     - Timestamp
8. **Check completion**:
   - If ALL user stories now have "passes": true, reply with exactly: PROMISE_COMPLETE
   - Otherwise, just confirm what you completed

## Critical Rules
- Keep CI green - all tests and types must pass before committing
- Only work on ONE feature per iteration
- APPEND to progress.txt (don't overwrite previous entries)
- Commit after implementation AND after updating PRD
- Reply with PROMISE_COMPLETE only when ALL stories pass
- Do NOT work on multiple features at once
- Do NOT skip tests or type checking
- Do NOT create new user stories (only work on existing PRD items)

Begin now.
FOOTER

  PROMPT=$(cat "$PROMPT_FILE")
  rm -f "$PROMPT_FILE"

  echo "Running Claude Code..."
  OUTPUT=$(claude --dangerously-skip-permissions -p "$PROMPT" 2>&1 || true)

  echo "$OUTPUT"
  echo ""

  if echo "$OUTPUT" | grep -q "PROMISE_COMPLETE"; then
    echo "COMPLETE marker detected! All PRD items finished."
    echo "Ralph loop completed successfully in $ITERATION iterations."
    exit 0
  fi

  echo "Moving to next iteration..."
  echo ""
  sleep 2
done

echo "Reached maximum iterations ($MAX_ITERATIONS) without completion."
echo "Check progress.txt and prd.json for current status."
