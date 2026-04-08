import { Node, mergeAttributes, nodeInputRule } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';

const INPUT_RULE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]$/;

export interface WikiSuggestion {
  query: string;
  from: number; // position of [[ start
  to: number;   // current cursor position
}

export const WikiLink = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return {
      onSuggestion: (_: WikiSuggestion | null) => {},
      onKeyDown: (_: { event: KeyboardEvent }) => false as boolean,
    };
  },

  addAttributes() {
    return {
      title: { default: null },
      alias: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-wiki-title]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const display = (node.attrs.alias || node.attrs.title) as string;
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-wiki-title': node.attrs.title,
        class: 'wiki-link',
      }),
      display,
    ];
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: INPUT_RULE,
        type: this.type,
        getAttributes: match => ({
          title: match[1] ?? null,
          alias: match[2] ?? null,
        }),
      }),
    ];
  },

  addProseMirrorPlugins() {
    const ext = this;
    return [
      new Plugin({
        key: new PluginKey('wikiSuggestion'),
        props: {
          handleKeyDown(_view, event) {
            return ext.options.onKeyDown({ event }) ?? false;
          },
        },
        view() {
          return {
            update(view) {
              const { selection } = view.state;
              if (!selection.empty) { ext.options.onSuggestion(null); return; }
              const { from } = selection;
              const $from = view.state.doc.resolve(from);
              const textBefore = $from.parent.textBetween(0, $from.parentOffset, null, '\0');
              const match = textBefore.match(/\[\[([^\]]*)$/);
              if (match) {
                ext.options.onSuggestion({
                  query: match[1],
                  from: from - match[1].length - 2,
                  to: from,
                });
              } else {
                ext.options.onSuggestion(null);
              }
            },
          };
        },
      }),
    ];
  },
});
