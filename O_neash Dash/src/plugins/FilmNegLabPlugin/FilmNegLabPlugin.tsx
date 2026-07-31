import { useState } from 'react';
import './FilmNegLabPlugin.css';
import ViewSwitcher from './components/ViewSwitcher';
import GridView from './views/GridView';
import MapView from './views/MapView';
import TrailsView from './views/TrailsView';
import CamerasView from './views/CamerasView';
import type { FilmNegViewType } from './types';

function renderView(v: FilmNegViewType) {
  if (v === 'grid')    return <GridView />;
  if (v === 'map')     return <MapView />;
  if (v === 'trails')  return <TrailsView />;
  if (v === 'cameras') return <CamerasView />;
  return null;
}

export default function FilmNegLabPlugin() {
  const [activeView, setActiveView] = useState<FilmNegViewType>('grid');

  return (
    <div className="filmneg-plugin">
      <ViewSwitcher activeView={activeView} setActiveView={setActiveView} />
      <div className="filmneg-content">
        {renderView(activeView)}
      </div>
    </div>
  );
}
