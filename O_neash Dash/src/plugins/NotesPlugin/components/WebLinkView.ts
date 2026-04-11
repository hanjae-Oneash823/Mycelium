import { Extension } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

function siteLabel(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return href;
  }
}

function makeBtn(href: string): HTMLElement {
  const el = document.createElement('span');
  el.className = 'web-link-btn';
  el.setAttribute('title', href);
  el.textContent = siteLabel(href);

  // Arrow indicator
  const arrow = document.createElement('span');
  arrow.className = 'web-link-btn-arrow';
  arrow.textContent = '↗';
  el.appendChild(arrow);

  el.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(href);
    } catch {
      window.open(href, '_blank', 'noopener');
    }
  });

  return el;
}

export const WebLinkView = Extension.create({
  name: 'webLinkView',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('webLinkView'),
        props: {
          decorations(state) {
            const { doc, selection, schema } = state;
            const linkType = schema.marks['link'];
            if (!linkType) return DecorationSet.empty;

            const cursorFrom = selection.from;
            const cursorTo   = selection.to;

            // Collect link mark ranges, merging adjacent text nodes with the same href
            const ranges: { from: number; to: number; href: string }[] = [];
            doc.descendants((node, pos) => {
              if (!node.isText) return;
              const mark = node.marks.find(m => m.type === linkType);
              if (!mark) return;
              const href = mark.attrs['href'] as string;
              if (!href) return;
              const from = pos;
              const to   = pos + node.nodeSize;
              const last = ranges[ranges.length - 1];
              if (last && last.href === href && last.to === from) {
                last.to = to;
              } else {
                ranges.push({ from, to, href });
              }
            });

            const decos: Decoration[] = [];
            for (const { from, to, href } of ranges) {
              // Reveal raw text when cursor is inside so user can edit
              if (cursorFrom <= to && cursorTo >= from) continue;

              decos.push(
                Decoration.widget(from, () => makeBtn(href), {
                  side: -1,
                  key: `wlv-${from}`,
                }),
              );
              decos.push(
                Decoration.inline(from, to, { class: 'web-link-raw-hidden' }),
              );
            }

            return DecorationSet.create(doc, decos);
          },
        },
      }),
    ];
  },
});
