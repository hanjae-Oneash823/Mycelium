# PDF Export — How It Works & Known Limitations

## How Documents Are Built (TipTap)

Notes are edited in a TipTap rich-text editor (`TypewriterEditor.tsx`). TipTap stores
content as a ProseMirror document tree and renders it as live DOM inside a
`.ProseMirror` container. The app applies its own CSS to this container — including
the VT323 pixel font as a global default — so the editor looks intentionally retro on
screen.

Extensions in use that affect export:
- **Bold / Italic / Underline / Strike / Color / Highlight** — standard marks, render
  as `<strong>`, `<em>`, `<u>`, `<s>`, `<mark style="background-color:...">`,
  `<span style="color:...">`.
- **Code / CodeBlock** — inline `<code>`, block `<pre><code>`.
- **Lists** — `<ul>`, `<ol>`, and TipTap's TaskList (`<ul data-type="taskList">`
  containing `<li data-type="taskItem">` with a `<label><input type="checkbox"></label>`
  sibling to a `<div>` for the text).
- **Blockquote** — `<blockquote>`.
- **KaTeX (LaTeX)** — a custom extension that renders math via KaTeX into
  `.katex` / `.katex-display` spans inline in the DOM.
- **Images** — custom `NotesImageExtension`, stores images as `<img>` tags with
  local asset URLs.
- **Wiki-links** — custom node rendered as a `.wiki-link` chip.
- **Web-links** — custom node with a `.web-link-btn` pill and a hidden
  `.web-link-raw-hidden` span containing the raw URL text.

---

## How the PDF Export Works

`exportDocumentPdf()` in `exportPdf.ts`:

1. **Clones the live TipTap DOM** with `editorDom.cloneNode(true)`. This preserves
   rendered KaTeX spans, image src attributes, and all inline decorations exactly as
   they appear on screen.

2. **Builds a print container** (`#pdf-print-root`) that is initially
   `display: none`. It contains:
   - A metadata header (arc badge, project badge, created/modified dates, logo).
   - The document title (`.pdf-export-title`).
   - The cloned editor content wrapped in `.pdf-export-body`.

3. **Injects a `<style>` tag** via `getPrintStyles()` with `@media print` rules that:
   - Hide the entire running app (`body > * { display: none }`).
   - Make only `#pdf-print-root` visible.
   - Re-style all content for a white-page, light-mode, Inconsolata-font output
     (overriding the app's VT323 / dark-mode styles with `!important`).
   - Force background colours to print (`-webkit-print-color-adjust: exact`).

4. **Calls `window.print()`** — this opens the OS native print dialog. The user
   selects "Save as PDF" and the destination.

5. **Cleans up** by removing `#pdf-print-root` and the `<style>` tag once the
   print dialog closes (`afterprint` event).

---

## The Margin Problem

### What we want
- 2 cm top/bottom margin on every page (including the gap between page N and page N+1).
- 2.2 cm left/right margin throughout.

### The CSS Paged Media standard (`@page`)

The correct CSS tool for per-page margins is:

```css
@page { margin: 2cm 2.2cm; size: A4; }
```

This is a top-level at-rule; browsers are supposed to apply it to every physical page
of the printed output.

### Why `@page` does nothing here

Tauri uses **WKWebView** (WebKit) on macOS as its rendering engine. When
`window.print()` is called from within a WKWebView, the print pipeline is handed off
to the macOS printing system. In this handoff **the CSS `@page` rule is silently
ignored** — the page size and margins are determined entirely by the OS print
settings, not by the stylesheet.

This is a known, longstanding WKWebView limitation. It is not fixable in CSS.

Attempts tried and why they failed:

| Attempt | Result |
|---|---|
| `@page { margin: 2cm 2.2cm }` inside `@media print` | Ignored (also invalid — `@page` cannot be nested in `@media`) |
| `@page { margin: 2cm 2.2cm }` at top level of injected `<style>` | Still ignored by WKWebView |
| `margin: 1.5cm 0` on `#pdf-print-root` | Only affects first/last page edges, not between pages |
| `padding: 2cm 2.2cm` on `#pdf-print-root` | Left/right work throughout; top/bottom only on first/last page |

### Current state

Left/right margins work because `padding: 2cm 2.2cm` on `#pdf-print-root` is applied
as normal CSS box-model padding, which carries through the whole content column on
every page. The left/right edges of the page are always inside the padded container.

Top/bottom margins at the **start** and **end** of the document also work for the
same reason. But at page breaks in the middle of the document, the content flows
continuously through the `#pdf-print-root` container with no mechanism to inject
space at the top/bottom of each new physical page.

### What would actually fix it

1. **Tauri's `tauri-plugin-printpdf`** — generates a PDF from HTML directly using a
   headless renderer (not WKWebView's print dialog), which respects `@page`.
2. **A headless Chromium / Puppeteer call** — Chromium fully implements CSS Paged
   Media including `@page` margins.
3. **Instructing the user** to set "Custom margins" (≥ 2 cm) in the OS print dialog
   before saving. This is the zero-code workaround until one of the above is
   implemented.
