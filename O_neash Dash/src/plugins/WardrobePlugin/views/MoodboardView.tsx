import { ImageSharp } from 'pixelarticons/react';
import ComingSoonView from '../components/ComingSoonView';

export default function MoodboardView() {
  return (
    <ComingSoonView
      icon={<ImageSharp size={40} />}
      label="moodboard"
      description="image import & moodboard canvas — coming soon"
    />
  );
}
