import { useState } from 'react';
import './WardrobePlugin.css';
import ViewSwitcher from './components/ViewSwitcher';
import WikiView from './views/WikiView';
import ArchiveView from './views/ArchiveView';
import MoodboardView from './views/MoodboardView';
import WishlistView from './views/WishlistView';
import type { WardrobeViewType } from './types';

function renderView(v: WardrobeViewType) {
  if (v === 'wiki')      return <WikiView />;
  if (v === 'archive')   return <ArchiveView />;
  if (v === 'moodboard') return <MoodboardView />;
  if (v === 'wishlist')  return <WishlistView />;
  return null;
}

export default function WardrobePlugin() {
  const [activeView, setActiveView] = useState<WardrobeViewType>('wiki');

  return (
    <div className="wardrobe-plugin">
      <ViewSwitcher activeView={activeView} setActiveView={setActiveView} />
      <div className="wardrobe-content">
        {renderView(activeView)}
      </div>
    </div>
  );
}
