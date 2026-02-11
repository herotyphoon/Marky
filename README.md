# [Marky](https://herotyphoon.github.io/Marky/)

Marky is a lightweight, browser-based Markdown editor with live preview, custom parsing engine, and native file system integration.

It is built entirely with vanilla HTML, CSS, and JavaScript — no external libraries.

<br>

## ✨ Features

- Custom Markdown tokenizer and parser
- Live editor / preview toggle
- Syntax-highlight-ready code blocks
- Nested lists and nested blockquotes
- Table support with alignment parsing
- Inline formatting (bold, italic, underline, strike, code)
- Image and link parsing with URL normalization
- Horizontal rules
- Automatic page title from first H1
- Unsaved changes indicator
- File open/save using File System Access API (where supported)
- Fallback file download system
- IndexedDB file handle persistence
- URL hash-based document persistence
- Built-in compression using `CompressionStream`
- LocalStorage fallback recovery
- Responsive UI

<br>

## 🧠 How It Works

Marky does not rely on external Markdown libraries.

It includes:

- A **custom tokenizer** that converts raw text into structured tokens.
- A **parser** that transforms tokens into HTML.
- An inline parser for handling:
 	- Links
   	- Images
 	- Bold / Italic / Underline / Strike
	 - Inline code
	 - Auto-link detection
- A compression layer that stores document state inside the URL hash using `deflate-raw`.

This allows:

- Shareable document state
- No backend required
- Recovery even after refresh

<br>

## 🛠 Tech Stack

- HTML5
- CSS3 (custom responsive layout)
- Vanilla JavaScript
- File System Access API
- IndexedDB
- CompressionStream API

No frameworks.
No dependencies.
No build tools.

<br>

## 🚀 Running Marky

Simply go to [Marky](https://herotyphoon.github.io/Marky/) in a modern browser.

For full file system support, use:

- Chrome
- Edge
- Other Chromium-based browsers

Some features (like File System Access API) may not work in Firefox or Safari.

<br>

## 📌 Markdown Features Supported

- Headings
- List
  - Ordered Lists
  - Unordered Lists
  - Nested Lists
- Blockquotes
  - Nested Blockquotes
- Codeblocks
- Tables
- Images
- Links
- Horizontal Rules
- Inline features like:
  - Bold
  - Italic
  - Strike
  - Underline
  - Code

<br>

## 💾 File Handling

Marky supports:

- Native file open and save using File System Access API
- Save As functionality
- Automatic permission verification
- IndexedDB persistence of file handles
- Fallback download method if API unsupported

<br>

## 🔐 Persistence Strategy

Marky preserves documents using:

1. URL hash (compressed)
2. localStorage fallback
3. IndexedDB file handle restore

This ensures work is rarely lost.

<br>

## 🎨 UI Philosophy

- Minimal interface
- Focused writing experience
- Editor / Preview toggle
- Visual unsaved indicator
- Dark theme by default
- Responsive design

<br>

## 📈 Future Improvements

- Syntax highlighting for code blocks
- Keyboard shortcuts (Ctrl+S, Ctrl+O)