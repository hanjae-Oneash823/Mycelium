import type { WardrobeItemRow } from '../lib/wardrobeItemsDb';
import { toDisplaySrc } from '../lib/wardrobeImageLib';
import { getItemTypeMeta } from '../lib/wardrobeItemTypes';

const VT = "var(--font-main), var(--font-kr), monospace";

interface ItemCardProps {
  item: WardrobeItemRow;
  onClick: () => void;
  selected?: boolean;
}

export default function ItemCard({ item, onClick, selected }: ItemCardProps) {
  const typeMeta = getItemTypeMeta(item.item_type);
  return (
    <button
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${selected ? typeMeta.color : 'rgba(255,255,255,0.08)'}`,
        background: selected ? `${typeMeta.color}14` : 'rgba(255,255,255,0.02)',
        transition: 'border-color 0.12s, background 0.12s',
      }}
    >
      <div style={{ width: '100%', aspectRatio: '1', background: '#000', overflow: 'hidden' }}>
        {item.image_path ? (
          <img
            src={toDisplaySrc(item.image_path)}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: VT, fontSize: '0.8rem', color: `${typeMeta.color}55`, letterSpacing: 1 }}>
              {typeMeta.label}
            </span>
          </div>
        )}
      </div>
      <div style={{ padding: '6px 8px' }}>
        <div style={{
          fontFamily: VT, fontSize: '0.95rem', color: '#fff', letterSpacing: 0.5,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {item.name}
        </div>
        {item.brand && (
          <div style={{
            fontFamily: VT, fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', letterSpacing: 0.5,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {item.brand}
          </div>
        )}
      </div>
    </button>
  );
}
