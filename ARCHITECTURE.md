# Marky Architecture

Marky is a client-side Markdown editor built without external dependencies.

It consists of four primary systems:

1. Editor Layer
2. Parsing Engine
3. Persistence Layer
4. File System Integration

---

## 1. Editor Layer

The editor is a `contenteditable` element operating in plaintext mode.

Responsibilities:
- Capture user input
- Trigger debounced saves
- Track unsaved changes
- Update preview on demand

Tab key insertion is manually handled to support indentation.

---

## 2. Parsing Engine

Marky implements a custom Markdown engine.

### Tokenization Phase

The tokenizer:

- Splits input by line
- Converts structural patterns into tokens
- Supports:
  - Headings (H1–H6)
  - Paragraphs
  - Ordered and unordered lists (nested)
  - Blockquotes (recursive)
  - Code blocks
  - Tables with alignment
  - Horizontal rules

Nested lists are parsed using indentation depth.

Blockquotes recursively call the tokenizer.

### Parsing Phase

The parser converts tokens into HTML.

Each token type maps to a renderer:
- `h1` → `<h1>`
- `list` → `<ul>` / `<ol>`
- `codeblock` → `<pre><code>`
- `blockquote` → `<blockquote>`
- `table` → `<table>`

Inline parsing handles:
- Bold
- Italic
- Underline
- Strike
- Inline code
- Links
- Images
- Auto-link detection

All HTML is escaped before rendering to prevent injection.

---

## 3. Persistence Layer

Marky uses a multi-layer persistence strategy.

### URL Hash Compression

Document content is:

1. Compressed using `CompressionStream('deflate-raw')`
2. Base64url encoded
3. Stored in `location.hash`

This allows:
- Shareable document states
- No backend requirement
- Refresh-safe persistence

### LocalStorage Fallback

If no hash exists, stored compressed data is retrieved from localStorage.

---

## 4. File System Integration

When supported, Marky uses the File System Access API.

Features:
- Open file
- Save file
- Save As
- Permission verification
- IndexedDB persistence of file handles

If unsupported:
- Falls back to browser file download.

---

## Design Philosophy

- Zero dependencies
- Minimal UI
- Browser-native APIs
- Explicit parsing logic
- Defensive rendering

Marky prioritizes transparency over abstraction.
