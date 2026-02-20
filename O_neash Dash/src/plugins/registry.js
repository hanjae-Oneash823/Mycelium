import NotesPlugin from './NotesPlugin/NotesPlugin.jsx';
import GeoPortalViewPlugin from './GeoPortalViewPlugin/GeoPortalView.jsx';

export const plugins = [
  { id: 'notes', name: 'Notes', component: NotesPlugin },
  { id: 'geo-portal', name: 'Geo Portal', component: GeoPortalViewPlugin }
  // Add more plugins here as needed
];
