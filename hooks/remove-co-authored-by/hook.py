#!/usr/bin/env python3
"""
PreToolUse hook: blocks git commit commands that contain Co-Authored-By from AI tools.
Instructs the model to redo the commit without the line.
"""
import json
import sys
import re

data = json.load(sys.stdin)

tool_name = data.get("tool_name", "")
tool_input = data.get("tool_input", {})

if tool_name != "Bash":
    sys.exit(0)

command = tool_input.get("command", "")

if "git commit" not in command:
    sys.exit(0)

if not re.search(r'Co-Authored-By:\s*Claude', command, flags=re.IGNORECASE):
    sys.exit(0)

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny"
    },
    "systemMessage": "Co-Authored-By from Claude detected. Redo the commit WITHOUT the 'Co-Authored-By: Claude...' line."
}))
sys.exit(0)
