# Security Policy

## Philosophy

vsr-skills is an **auditable open-text catalog**. We do not include binaries, opaque payloads, or instructions that exfiltrate data without explicit consent.

## Trust Model

- **100% open source**: all content is readable and auditable text
- **No binaries**: no executables or compiled artifacts
- **Human review**: new items go through PR and security checklist
- **Documented permissions**: each plugin/skill declares what it accesses (network, filesystem, etc.)

## What we do not accept

- Obfuscated or minified code
- Binaries or compiled artifacts
- Skills/plugins that access credentials or env vars without explicit documentation
- Instructions that encourage jailbreak or guardrail bypass

## Reporting vulnerabilities

**Do not open public issues for vulnerabilities.**

Use [GitHub Security Advisories](https://github.com/vsanrocha/vsr-skills/security/advisories/new) to report privately.

Include: description, steps to reproduce, affected component, potential impact.

Goal: acknowledge within 48h and resolve within 14 days.
