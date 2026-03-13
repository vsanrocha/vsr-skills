---
name: debug-checklist
description: Systematic checklist for debugging bugs. Use when investigating failures, broken tests, or unexpected behavior.
---

# Debug Checklist

Before proposing a fix:

1. **Reproduce** — does the bug occur consistently? In which environment?
2. **Isolate** — what is the smallest input/scenario that reproduces it?
3. **Trace** — stack trace, logs, breakpoints. Where does it fail exactly?
4. **Hypothesize** — what is the likely cause? Test with minimal change.
5. **Verify** — does the fix resolve without regressions?

Document what was tried and the result before asking for help.
