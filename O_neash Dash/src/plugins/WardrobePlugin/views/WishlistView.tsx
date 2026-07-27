import { Clipboard } from 'pixelarticons/react';
import ComingSoonView from '../components/ComingSoonView';

export default function WishlistView() {
  return (
    <ComingSoonView
      icon={<Clipboard size={40} />}
      label="wishlist"
      description="clothes to buy, with working links — coming soon"
    />
  );
}
