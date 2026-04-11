import { Image } from '@tiptap/extension-image';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { useState, useEffect, useRef } from 'react';
import { toDisplaySrc } from '../lib/notesImageLib';

// ── Node view ─────────────────────────────────────────────────────────────────

function ImageView({ node, selected, updateAttributes }: any) {
  const rawSrc: string       = node.attrs.src   ?? '';
  const alt: string          = node.attrs.alt   ?? '';
  const storedWidth: number | null = node.attrs.width ?? null;

  const [displaySrc,   setDisplaySrc]   = useState('');
  const [errored,      setErrored]      = useState(false);
  const [hovered,      setHovered]      = useState(false);
  const [liveWidth,    setLiveWidth]    = useState<number | null>(storedWidth);
  const imgRef = useRef<HTMLImageElement>(null);

  // Keep liveWidth in sync with stored attr (e.g. undo/redo)
  useEffect(() => { setLiveWidth(storedWidth); }, [storedWidth]);

  useEffect(() => {
    if (!rawSrc) return;
    if (rawSrc.startsWith('http') || rawSrc.startsWith('data:') || rawSrc.startsWith('blob:')) {
      setDisplaySrc(rawSrc);
    } else {
      setDisplaySrc(toDisplaySrc(rawSrc));
    }
    setErrored(false);
  }, [rawSrc]);

  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX     = e.clientX;
    const startWidth = imgRef.current?.offsetWidth ?? liveWidth ?? 400;

    const onMove = (ev: MouseEvent) => {
      const w = Math.max(60, startWidth + (ev.clientX - startX));
      setLiveWidth(w);
    };
    const onUp = (ev: MouseEvent) => {
      const w = Math.max(60, startWidth + (ev.clientX - startX));
      setLiveWidth(w);
      updateAttributes({ width: w });
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const showHandle = (selected || hovered) && !errored && !!displaySrc;

  return (
    <NodeViewWrapper style={{ display: 'block', margin: '1.2em 0', textAlign: 'center', userSelect: 'none' }}>
      {errored || !displaySrc ? (
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.04)', border: '1px dashed rgba(0,0,0,0.18)',
          borderRadius: 4, padding: '20px 32px', color: 'rgba(0,0,0,0.35)',
          fontSize: '0.8rem', fontFamily: 'monospace', gap: 8,
        }}>
          <span>⚠</span>
          <span>{rawSrc ? 'Image not found' : 'No image source'}</span>
        </div>
      ) : (
        <div
          style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <img
            ref={imgRef}
            src={displaySrc}
            alt={alt}
            onError={() => setErrored(true)}
            draggable={false}
            style={{
              display: 'block',
              width:    liveWidth ? liveWidth + 'px' : undefined,
              maxWidth: '100%',
              borderRadius: 4,
              boxShadow: selected ? '0 0 0 2px #1a4acc' : 'none',
              transition: 'box-shadow 0.15s',
            }}
          />

          {/* Resize handle — right edge */}
          <div
            onMouseDown={onResizeMouseDown}
            style={{
              position: 'absolute', right: -5, top: '50%',
              transform: 'translateY(-50%)',
              width: 10, height: 36,
              background: '#1a4acc', borderRadius: 5,
              cursor: 'ew-resize',
              opacity: showHandle ? 0.85 : 0,
              transition: 'opacity 0.15s',
              pointerEvents: showHandle ? 'auto' : 'none',
            }}
          />
        </div>
      )}
    </NodeViewWrapper>
  );
}

// ── Extension ─────────────────────────────────────────────────────────────────

export const NotesImageExtension = Image.extend({
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML:  el => el.getAttribute('width') ? Number(el.getAttribute('width')) : null,
        renderHTML: attrs => attrs.width ? { width: String(attrs.width) } : {},
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});
