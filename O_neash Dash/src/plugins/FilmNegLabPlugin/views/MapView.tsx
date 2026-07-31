import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PhotoRow, TrailPhotoRow, TrailRow } from '../lib/filmNegDb';
import { loadGeotaggedPhotos, loadAllTrailsWithPhotos, loadTrails } from '../lib/filmNegDb';
import { toDisplaySrc } from '../lib/filmNegImageLib';

const VT = "var(--font-main), var(--font-kr), monospace";

function makeDotIcon(color: string, isFavorite: boolean): L.DivIcon {
  const size = isFavorite ? 16 : 12;
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:2px solid #000;
      box-shadow:0 0 0 1px ${color};
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 10);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [map, points]);
  return null;
}

export default function MapView() {
  const [photos, setPhotos]           = useState<PhotoRow[]>([]);
  const [trails, setTrails]           = useState<TrailRow[]>([]);
  const [trailPhotos, setTrailPhotos] = useState<Map<string, TrailPhotoRow[]>>(new Map());

  useEffect(() => {
    loadGeotaggedPhotos().then(setPhotos);
    loadTrails().then(setTrails);
    loadAllTrailsWithPhotos().then(setTrailPhotos);
  }, []);

  const trailPhotoIds = new Set(
    Array.from(trailPhotos.values()).flat().map(p => p.id),
  );
  const untrailedPhotos = photos.filter(p => !trailPhotoIds.has(p.id));
  const allPoints: [number, number][] = photos.map(p => [p.lat as number, p.lng as number]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {photos.length === 0 ? (
        <div style={{
          fontFamily: VT, fontSize: '1rem', color: 'rgba(255,255,255,0.15)', letterSpacing: 0.5,
          textAlign: 'center', padding: '60px 0',
        }}>
          no geotagged photos yet — add GPS coordinates in a photo's details
        </div>
      ) : (
        <MapContainer
          center={[20, 0]}
          zoom={2}
          style={{ width: '100%', height: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
            subdomains="abcd"
            maxZoom={20}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          <FitBounds points={allPoints} />

          {trails.map(trail => {
            const pts = (trailPhotos.get(trail.id) ?? []);
            if (pts.length === 0) return null;
            const line: [number, number][] = pts.map(p => [p.lat as number, p.lng as number]);
            return (
              <div key={trail.id}>
                {pts.length > 1 && (
                  <Polyline positions={line} pathOptions={{ color: trail.color, weight: 2, opacity: 0.8 }} />
                )}
                {pts.map(photo => (
                  <Marker key={photo.id} position={[photo.lat as number, photo.lng as number]} icon={makeDotIcon(trail.color, photo.is_favorite)}>
                    <PhotoPopup photo={photo} extra={trail.name} />
                  </Marker>
                ))}
              </div>
            );
          })}

          {untrailedPhotos.map(photo => (
            <Marker key={photo.id} position={[photo.lat as number, photo.lng as number]} icon={makeDotIcon('#e8a94f', photo.is_favorite)}>
              <PhotoPopup photo={photo} />
            </Marker>
          ))}
        </MapContainer>
      )}
    </div>
  );
}

function PhotoPopup({ photo, extra }: { photo: PhotoRow; extra?: string }) {
  return (
    <Popup>
      <div style={{ width: 160 }}>
        <img src={toDisplaySrc(photo.image_path)} alt="" style={{ width: '100%', aspectRatio: '3/2', objectFit: 'cover' }} />
        <div style={{ marginTop: 6, fontWeight: 600 }}>{photo.title || 'untitled'}</div>
        {photo.location_name && <div style={{ opacity: 0.7 }}>{photo.location_name}</div>}
        {photo.taken_at && <div style={{ opacity: 0.5 }}>{photo.taken_at.slice(0, 10)}</div>}
        {extra && <div style={{ opacity: 0.5, marginTop: 4 }}>trail: {extra}</div>}
      </div>
    </Popup>
  );
}
