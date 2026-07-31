import { Heart } from 'pixelarticons/react';
import type { PhotoRow, TagRow } from '../lib/filmNegDb';
import { toDisplaySrc } from '../lib/filmNegImageLib';

const ACC = '#e8a94f';
const VT = "var(--font-main), var(--font-kr), monospace";

interface PhotoCardProps {
  photo: PhotoRow;
  tags: TagRow[];
  onClick: () => void;
}

export default function PhotoCard({ photo, tags, onClick }: PhotoCardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        cursor: 'pointer',
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.02)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '3 / 2', overflow: 'hidden', background: '#111' }}>
        <img
          src={toDisplaySrc(photo.image_path)}
          alt={photo.title ?? ''}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {photo.is_favorite && (
          <div style={{ position: 'absolute', top: 8, right: 8 }}>
            <Heart size={16} fill={ACC} color={ACC} />
          </div>
        )}
      </div>
      <div style={{ padding: '8px 10px' }}>
        <div style={{
          fontFamily: VT, fontSize: '0.95rem', letterSpacing: 0.5, color: '#fff',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {photo.title || 'untitled'}
        </div>
        <div style={{
          fontFamily: VT, fontSize: '0.75rem', letterSpacing: 0.5, color: 'rgba(255,255,255,0.35)',
          marginTop: 2,
        }}>
          {photo.taken_at ? photo.taken_at.slice(0, 10) : ''}
        </div>
        {tags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
            {tags.slice(0, 3).map(t => (
              <span key={t.id} style={{
                fontFamily: VT, fontSize: '0.65rem', letterSpacing: 0.5,
                color: t.color, border: `1px solid ${t.color}55`, padding: '1px 6px',
              }}>
                {t.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
