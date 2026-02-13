# Security Policy

Marky renders user-provided Markdown into HTML.

Security considerations:

- All HTML input is escaped before rendering.
- Inline links are normalized.
- External links use:
  - target="_blank"
  - rel="noopener noreferrer"

---

## Potential Risks

- Extremely large inputs may impact performance.
- Browser APIs (File System Access) depend on user permissions.

---

## Reporting Vulnerabilities

If you discover a vulnerability, please open an issue with:

- Description
- Steps to reproduce
- Impact explanation