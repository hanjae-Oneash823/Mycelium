import type { WikiCategory } from './wardrobeDb';

export interface CategoryMeta {
  key: WikiCategory;
  label: string;
  color: string;
}

export const WIKI_CATEGORIES: CategoryMeta[] = [
  { key: 'genre',         label: 'Styles',           color: '#e879f9' },
  { key: 'brand',         label: 'Brands/Designers', color: '#00c4a7' },
  { key: 'clothing_type', label: 'Clothing Type',    color: '#6366f1' },
];

const CATEGORY_MAP = new Map(WIKI_CATEGORIES.map(c => [c.key, c]));

export function getCategoryMeta(key: WikiCategory): CategoryMeta {
  return CATEGORY_MAP.get(key) ?? WIKI_CATEGORIES[0];
}
