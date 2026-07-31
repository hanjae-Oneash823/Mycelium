import { useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { reverseGeocode, formatLocationName } from '../lib/geocodeLib';

const ACC = '#e8a94f';
const VT = "var(--font-main), var(--font-kr), monospace";

const markerIcon = L.divIcon({
  className: '',
  html: `<div style="width:14px;height:14px;border-radius:50%;background:${ACC};border:2px solid #000;box-shadow:0 0 0 1px ${ACC};"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

interface LocationPickerProps {
  lat: number | null;
  lng: number | null;
  onPick: (lat: number, lng: number, locationName: string | null) => void;
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function LocationPicker({ lat, lng, onPick }: LocationPickerProps) {
  const [geocoding, setGeocoding] = useState(false);
  const position = useMemo<[number, number] | null>(
    () => (lat != null && lng != null ? [lat, lng] : null),
    [lat, lng],
  );

  const handlePick = async (newLat: number, newLng: number) => {
    setGeocoding(true);
    const result = await reverseGeocode(newLat, newLng);
    const name = formatLocationName(result);
    onPick(newLat, newLng, name || null);
    setGeocoding(false);
  };

  return (
    <div style={{ position: 'relative', height: 480, border: '1px solid rgba(255,255,255,0.15)' }}>
      <MapContainer
        center={position ?? [20, 0]}
        zoom={position ? 8 : 2}
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
          subdomains="abcd"
          maxZoom={20}
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
        />
        <ClickHandler onPick={handlePick} />
        {position && (
          <Marker
            position={position}
            icon={markerIcon}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const m = e.target as L.Marker;
                const { lat: newLat, lng: newLng } = m.getLatLng();
                handlePick(newLat, newLng);
              },
            }}
          />
        )}
      </MapContainer>
      <div style={{
        position: 'absolute', bottom: 6, left: 6, zIndex: 1000,
        fontFamily: VT, fontSize: '0.7rem', letterSpacing: 0.5,
        color: 'rgba(255,255,255,0.5)', background: 'rgba(0,0,0,0.6)', padding: '2px 6px',
        pointerEvents: 'none',
      }}>
        {geocoding ? 'locating...' : 'click or drag pin to set location'}
      </div>
    </div>
  );
}
