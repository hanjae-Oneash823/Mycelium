import { invoke }  from '@tauri-apps/api/core';
import { save }    from '@tauri-apps/plugin-dialog';

const PT = "'Inconsolata', 'IBM Plex Mono KR', monospace";
const VT = "'VT323', 'HBIOS-SYS', monospace";

function fmtDate(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHeaderHtml(
  arc:       { name: string; color_hex: string } | null,
  project:   { name: string } | null,
  createdAt: string,
  updatedAt: string,
): string {
  const arcBadge = arc ? `
    <span style="
      display:inline-flex;align-items:center;gap:5px;
      background:${arc.color_hex};color:#fff;
      font-family:${VT};font-size:0.72rem;letter-spacing:1.5px;
      padding:2px 8px 2px 6px;text-transform:uppercase;
    ">
      <span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.6);flex-shrink:0;display:inline-block;"></span>
      ${escHtml(arc.name)}
    </span>` : '';

  const projBadge = project ? `
    <span style="
      display:inline-flex;align-items:center;
      background:#1a1a1a;color:#fff;
      font-family:${VT};font-size:0.72rem;letter-spacing:1.5px;
      padding:2px 8px;text-transform:uppercase;
    ">${escHtml(project.name)}</span>` : '';

  const sep = (arc || project) ? `
    <span style="color:rgba(0,0,0,0.15);font-family:${VT};font-size:0.72rem;">|</span>` : '';

  const dates = `
    <span style="font-family:${VT};font-size:0.72rem;letter-spacing:1px;line-height:1;">
      <span style="color:#888;text-transform:uppercase;margin-right:5px;">created</span>
      <span style="color:#111;">${fmtDate(createdAt)}</span>
    </span>
    <span style="font-family:${VT};font-size:0.72rem;letter-spacing:1px;line-height:1;">
      <span style="color:#888;text-transform:uppercase;margin-right:5px;">modified</span>
      <span style="color:#111;">${fmtDate(updatedAt)}</span>
    </span>`;

  return `
    <div style="
      display:flex;align-items:flex-start;justify-content:space-between;gap:10px;
      margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid rgba(0,0,0,0.07);
    ">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:1;">
        ${arcBadge}${projBadge}${sep}${dates}
      </div>
      <img src="/icons/character/minibadge.png" alt="mycelium"
        style="height:22px;width:auto;flex-shrink:0;opacity:0.65;" />
    </div>`;
}

// ── Screen-mode styles for WKWebView createPDF ────────────────────────────────
// createPDF renders screen CSS, not @media print. All rules are applied directly.
// We aggressively override the app's dark/VT323 global styles with !important.
function getExportStyles(): string {
  return `
    /* Hide app, reveal only the export layer */
    body > *:not(#pdf-print-root) { display: none !important; }
    body { background: #fff !important; margin: 0 !important; padding: 0 !important; }

    /* Export root */
    #pdf-print-root {
      display: block !important;
      background: #fff !important;
      color: #1a1a1a !important;
      font-family: ${PT} !important;
      font-size: 0.85rem !important;
      line-height: 1.55 !important;
      padding: 2cm 2.2cm !important;
      box-sizing: border-box !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Kill VT323 everywhere inside the export layer */
    #pdf-print-root *:not(.katex):not(.katex *) {
      font-family: ${PT} !important;
    }

    /* Title */
    #pdf-print-root .pdf-export-title {
      font-family: ${PT} !important;
      font-weight: 700 !important;
      font-size: 1.6rem !important;
      color: #111 !important;
      letter-spacing: 0.2px !important;
      line-height: 1.4 !important;
      margin: 0 0 24px !important;
      padding-bottom: 14px !important;
      border-bottom: 1px solid rgba(0,0,0,0.08) !important;
      border-left: none !important; border-right: none !important; border-top: none !important;
      background: transparent !important;
    }

    /* Body content */
    #pdf-print-root .pdf-export-body { outline: none; }
    #pdf-print-root .pdf-export-body p  { font-family: ${PT} !important; color: #1a1a1a !important; margin: 0 0 0.9em !important; }
    #pdf-print-root .pdf-export-body h1 { font-family: ${PT} !important; font-size: 1.4rem !important; font-weight: 700 !important; margin: 1.2em 0 0.4em !important; color: #111 !important; }
    #pdf-print-root .pdf-export-body h2 { font-family: ${PT} !important; font-size: 1.15rem !important; font-weight: 700 !important; margin: 1em 0 0.35em !important; color: #111 !important; }
    #pdf-print-root .pdf-export-body h3 { font-family: ${PT} !important; font-size: 1.0rem !important; font-weight: 700 !important; margin: 0.8em 0 0.3em !important; color: #333 !important; }

    /* Lists */
    #pdf-print-root .pdf-export-body ul { list-style: disc !important; padding-left: 1.4em !important; margin: 0.4em 0 0.8em !important; }
    #pdf-print-root .pdf-export-body ol { list-style: decimal !important; padding-left: 1.4em !important; margin: 0.4em 0 0.8em !important; }
    #pdf-print-root .pdf-export-body ul ul, #pdf-print-root .pdf-export-body ol ol,
    #pdf-print-root .pdf-export-body ul ol, #pdf-print-root .pdf-export-body ol ul { margin: 0 !important; }
    #pdf-print-root .pdf-export-body li { font-family: ${PT} !important; margin: 0.1em 0 !important; display: list-item !important; color: #1a1a1a !important; }
    #pdf-print-root .pdf-export-body li p { margin: 0 !important; }

    /* Task list */
    #pdf-print-root .pdf-export-body ul[data-type="taskList"] { list-style: none !important; padding-left: 0 !important; }
    #pdf-print-root .pdf-export-body li[data-type="taskItem"] { display: flex !important; align-items: flex-start !important; gap: 6px !important; }
    #pdf-print-root .pdf-export-body li[data-type="taskItem"] label { display: flex !important; align-items: center !important; flex-shrink: 0 !important; }
    #pdf-print-root .pdf-export-body li[data-type="taskItem"] > label > input[type="checkbox"] { margin: 0 !important; }
    #pdf-print-root .pdf-export-body li[data-type="taskItem"] > div { flex: 1 !important; }
    #pdf-print-root .pdf-export-body li[data-type="taskItem"] > div > p { margin: 0 !important; }

    /* Inline marks */
    #pdf-print-root .pdf-export-body strong { color: #000 !important; font-family: ${PT} !important; }
    #pdf-print-root .pdf-export-body em   { font-style: italic !important; font-family: ${PT} !important; }
    #pdf-print-root .pdf-export-body u    { text-decoration: underline !important; font-family: ${PT} !important; }
    #pdf-print-root .pdf-export-body s    { text-decoration: line-through !important; font-family: ${PT} !important; }
    #pdf-print-root .pdf-export-body mark {
      font-family: ${PT} !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    #pdf-print-root .pdf-export-body span[style*="color"] { font-family: ${PT} !important; }

    /* Blockquote */
    #pdf-print-root .pdf-export-body blockquote {
      border-left: 3px solid rgba(0,0,0,0.18) !important;
      margin: 0.8em 0 !important;
      padding: 0.2em 0 0.2em 1em !important;
      color: rgba(0,0,0,0.55) !important;
      background: transparent !important;
    }

    /* Code */
    #pdf-print-root .pdf-export-body pre {
      background: rgba(0,0,0,0.04) !important;
      border: 1px solid rgba(0,0,0,0.09) !important;
      padding: 0.7em 1em !important;
      font-family: ${PT} !important;
      font-size: 0.82rem !important;
      overflow-wrap: break-word !important;
      white-space: pre-wrap !important;
      margin: 0.8em 0 !important;
      color: #1a1a1a !important;
    }
    #pdf-print-root .pdf-export-body code,
    #pdf-print-root .pdf-export-body pre * {
      font-family: ${PT} !important;
      font-size: 0.82rem !important;
      color: #1a1a1a !important;
    }
    #pdf-print-root .pdf-export-body code {
      background: rgba(0,0,0,0.06) !important;
      padding: 1px 4px !important;
    }
    #pdf-print-root .pdf-export-body pre code { background: none !important; padding: 0 !important; }

    /* Images */
    #pdf-print-root .pdf-export-body img {
      max-width: 100% !important;
      display: block !important;
      margin: 1.2em auto !important;
    }

    /* Wiki-links */
    #pdf-print-root .pdf-export-body .wiki-link {
      color: #0078d7 !important;
      border-bottom: 1px solid rgba(0,120,215,0.4) !important;
      font-family: ${PT} !important;
      cursor: default !important;
    }

    /* Web-links */
    #pdf-print-root .pdf-export-body .web-link-raw-hidden {
      font-size: inherit !important;
      color: #0078d7 !important;
    }
    #pdf-print-root .pdf-export-body .web-link-btn { display: none !important; }
    #pdf-print-root .pdf-export-body a.web-link {
      color: #0078d7 !important;
      text-decoration: underline !important;
      font-family: ${PT} !important;
    }

    /* Comment highlights: strip */
    #pdf-print-root .pdf-export-body .comment-mark { background: none !important; border-bottom: none !important; }

    /* Block cursor: hide */
    #pdf-print-root .pdf-export-body .block-cursor { display: none !important; }

    /* KaTeX */
    #pdf-print-root .pdf-export-body .katex,
    #pdf-print-root .pdf-export-body .katex * {
      font-family: KaTeX_Main, KaTeX_Math, 'Times New Roman', serif !important;
      color: #1a1a1a !important;
    }
    #pdf-print-root .pdf-export-body .latex-raw-hidden { font-size: 0 !important; color: transparent !important; }
  `;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ExportPdfParams {
  title:     string;
  arc:       { name: string; color_hex: string } | null;
  project:   { name: string } | null;
  createdAt: string;
  updatedAt: string;
  editorDom: HTMLElement;
}

export async function exportDocumentPdf(params: ExportPdfParams): Promise<void> {
  const { title, arc, project, createdAt, updatedAt, editorDom } = params;

  // 1. Ask the user where to save before touching the UI.
  const savePath = await save({
    defaultPath: `${(title || 'document').replace(/[/\\?%*:|"<>]/g, '_')}.pdf`,
    filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
  });
  if (!savePath) return; // user cancelled

  // 2. Build the export DOM.
  const contentClone = editorDom.cloneNode(true) as HTMLElement;

  const root = document.createElement('div');
  root.id = 'pdf-print-root';

  const header = document.createElement('div');
  header.innerHTML = buildHeaderHtml(arc, project, createdAt, updatedAt);

  const titleEl = document.createElement('div');
  titleEl.className = 'pdf-export-title';
  titleEl.textContent = title || 'Untitled';

  const body = document.createElement('div');
  body.className = 'pdf-export-body';
  body.appendChild(contentClone);

  root.appendChild(header);
  root.appendChild(titleEl);
  root.appendChild(body);
  document.body.appendChild(root);

  // 3. Inject screen-mode styles that hide the app and style the export layer.
  const style = document.createElement('style');
  style.id = 'pdf-export-styles';
  style.textContent = getExportStyles();
  document.head.appendChild(style);

  // 4. Force a layout pass so WebKit sees the styled DOM before createPDF runs.
  root.getBoundingClientRect();

  // 5. Call the native Rust command — createPDF + file write.
  try {
    await invoke('export_pdf_native', { savePath });
  } finally {
    root.remove();
    style.remove();
  }
}
