export type ItemType = 'top' | 'bottom' | 'shoes' | 'outerwear' | 'accessory';

export interface SizingField {
  key: string;
  label: string;
  placeholder: string;
}

export interface ItemTypeMeta {
  key: ItemType;
  label: string;
  color: string;
  sizingFields: SizingField[];
}

export const ITEM_TYPES: ItemTypeMeta[] = [
  {
    key: 'top', label: 'Tops', color: '#e879f9',
    sizingFields: [{ key: 'size', label: 'size', placeholder: 'M' }],
  },
  {
    key: 'bottom', label: 'Bottoms', color: '#6366f1',
    sizingFields: [
      { key: 'waist',  label: 'waist',  placeholder: '32"' },
      { key: 'inseam', label: 'inseam', placeholder: '30"' },
      { key: 'size',   label: 'size',   placeholder: 'M' },
    ],
  },
  {
    key: 'shoes', label: 'Shoes', color: '#00c4a7',
    sizingFields: [
      { key: 'size',  label: 'size',  placeholder: '10.5 US' },
      { key: 'width', label: 'width', placeholder: 'D' },
    ],
  },
  {
    key: 'outerwear', label: 'Outerwear', color: '#f59e0b',
    sizingFields: [{ key: 'size', label: 'size', placeholder: 'L' }],
  },
  {
    key: 'accessory', label: 'Accessories', color: '#f43f5e',
    sizingFields: [{ key: 'size', label: 'size', placeholder: '' }],
  },
];

const ITEM_TYPE_MAP = new Map(ITEM_TYPES.map(t => [t.key, t]));

export function getItemTypeMeta(key: ItemType): ItemTypeMeta {
  return ITEM_TYPE_MAP.get(key) ?? ITEM_TYPES[0];
}
