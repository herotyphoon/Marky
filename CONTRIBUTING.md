# Contributing to Marky

Thank you for considering contributing.

---

## Setup

Marky requires no build tools.

Simply open `index.html` in a modern browser.

For full functionality, use Chrome or another Chromium-based browser.

---

## Guidelines

- Keep the project dependency-free.
- Avoid introducing external Markdown libraries.
- Maintain the current architectural separation:
  - Tokenizer
  - Parser
  - Persistence
  - File system logic
- Add your name in [CONTIBUTERS](./CONTRIBUTERS.md).
- Update the [CHANGELOG](./CHANGELOG.md) according to the changes made.
- Update the [README](./README.md) accordingly too.

---

## Pull Requests

Before submitting:

- Ensure functionality works in Chrome.
- Verify no regression in parsing behavior.
- Keep commits small and descriptive.

---

## Reporting Issues

When reporting bugs:

- Provide input Markdown
- Provide expected output
- Provide actual output
- Mention browser version
