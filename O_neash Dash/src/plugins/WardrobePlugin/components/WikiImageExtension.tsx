import { Image } from '@tiptap/extension-image';
import type { ImageOptions } from '@tiptap/extension-image';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { useState, useEffect, useRef } from 'react';
import { toDisplaySrc } from '../lib/wardrobeImageLib';

const VT = "var(--font-main), var(--font-kr), monospace";
const MAX_IMAGE_HEIGHT = 520;

// ── Node view ─────────────────────────────────────────────────────────────────

function ImageView({ node, selected, updateAttributes, extension }: any) {
  const rawSrc: string       = node.attrs.src   ?? '';
  const alt: string          = node.attrs.alt   ?? '';
  const storedWidth: number | null = node.attrs.width ?? null;

  const [displaySrc,   setDisplaySrc]   = useState('');
  const [errored,      setErrored]      = useState(false);
  const [hovered,      setHovered]      = useState(false);
  const [liveWidth,    setLiveWidth]    = useState<number | null>(storedWidth);
  const [coverJustSet, setCoverJustSet] = useState(false);
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

  const handleSetCover = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    extension?.options?.onSetCover?.(rawSrc);
    setCoverJustSet(true);
    setTimeout(() => setCoverJustSet(false), 1400);
  };

  return (
    <NodeViewWrapper style={{ display: 'block', margin: '1.2em 0', textAlign: 'center', userSelect: 'none' }}>
      {errored || !displaySrc ? (
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.04)', border: '1px dashed rgba(0,0,0,0.18)',
          borderRadius: 4, padding: '20px 32px', color: 'rgba(0,0,0,0.35)',
          fontSize: '0.8rem', fontFamily: VT, gap: 8,
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
              width:     liveWidth ? liveWidth + 'px' : 'auto',
              maxWidth:  '100%',
              maxHeight: MAX_IMAGE_HEIGHT,
              objectFit: 'contain',
              borderRadius: 4,
              boxShadow: selected ? '0 0 0 2px #e879f9' : 'none',
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
              background: '#e879f9', borderRadius: 5,
              cursor: 'ew-resize',
              opacity: showHandle ? 0.85 : 0,
              transition: 'opacity 0.15s',
              pointerEvents: showHandle ? 'auto' : 'none',
            }}
          />

          {/* Set as cover — top-left */}
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={handleSetCover}
            style={{
              position: 'absolute', top: 6, left: 6,
              fontFamily: VT, fontSize: '0.85rem', letterSpacing: 0.5,
              background: coverJustSet ? 'rgba(232,121,249,0.9)' : 'rgba(0,0,0,0.6)',
              color: coverJustSet ? '#000' : '#fff',
              border: 'none', borderRadius: 3, padding: '2px 8px',
              cursor: 'pointer',
              opacity: showHandle || coverJustSet ? 1 : 0,
              pointerEvents: showHandle || coverJustSet ? 'auto' : 'none',
              transition: 'opacity 0.15s, background 0.15s, color 0.15s',
            }}
          >
            {coverJustSet ? '✓ cover set' : 'set as cover'}
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
}

// ── Extension ─────────────────────────────────────────────────────────────────

export const WikiImageExtension = Image.extend<ImageOptions & { onSetCover: (src: string) => void }>({
  draggable: true,

  addOptions() {
    return {
      ...this.parent?.(),
      onSetCover: (_src: string) => {},
    } as ImageOptions & { onSetCover: (src: string) => void };
  },

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
