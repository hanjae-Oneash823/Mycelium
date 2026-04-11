import { Extension } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import katex from 'katex';

// Build a DOM element with the rendered KaTeX formula
function makeKatexWidget(formula: string, display: boolean): HTMLElement {
  const el = document.createElement('span');
  el.setAttribute('data-latex', display ? 'display' : 'inline');
  if (display) el.style.cssText = 'display:block;text-align:center;padding:4px 0 0;';
  else el.style.marginRight = '0.18em';
  try {
    el.innerHTML = katex.renderToString(formula, {
      throwOnError: false,
      displayMode: display,
      output: 'html',
    });
  } catch {
    el.textContent = formula;
    el.style.color = '#c0392b';
  }
  return el;
}

// Find all $...$ and $$...$$ in a text string
function findMath(text: string) {
  const results: { from: number; to: number; formula: string; display: boolean }[] = [];

  // Display math: $$...$$
  const display = /\$\$([^$]+)\$\$/g;
  let m: RegExpExecArray | null;
  while ((m = display.exec(text)) !== null) {
    results.push({ from: m.index, to: m.index + m[0].length, formula: m[1], display: true });
  }

  // Inline math: $...$ (not inside $$...$$)
  const inline = /\$([^$\n]+)\$/g;
  while ((m = inline.exec(text)) !== null) {
    const from = m.index;
    const to   = from + m[0].length;
    if (!results.some(r => from < r.to && to > r.from)) {
      results.push({ from, to, formula: m[1], display: false });
    }
  }

  return results;
}

export const KatexExtension = Extension.create({
  name: 'katex',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('katex'),
        props: {
          decorations(state) {
            const { doc, selection } = state;
            const cursorFrom = selection.from;
            const cursorTo   = selection.to;
            const decos: Decoration[] = [];

            doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;

              for (const { from, to, formula, display } of findMath(node.text)) {
                const absFrom = pos + from;
                const absTo   = pos + to;

                // If cursor is inside this range, leave raw text visible for editing
                if (cursorFrom <= absTo && cursorTo >= absFrom) continue;

                const trimmed = formula.trim();
                if (!trimmed) continue;

                // Insert rendered KaTeX widget right before the raw text
                decos.push(
                  Decoration.widget(absFrom, () => makeKatexWidget(trimmed, display), {
                    side: -1,
                    key: `katex-${absFrom}`,
                  }),
                );

                // Hide the raw $...$ text with an inline decoration
                decos.push(
                  Decoration.inline(absFrom, absTo, { class: 'latex-raw-hidden' }),
                );
              }
            });

            return DecorationSet.create(doc, decos);
          },
        },
      }),
    ];
  },
});
