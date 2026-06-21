import { usePlannerStore } from '../../PlannerPlugin/store/usePlannerStore';
import { useArcVisibilityStore } from '../../../store/useArcVisibilityStore';

const FONT = "'VT323', monospace";

export function ArcVisibility() {
  const arcs        = usePlannerStore(s => s.arcs);
  const hiddenArcIds = useArcVisibilityStore(s => s.hiddenArcIds);
  const toggleArc   = useArcVisibilityStore(s => s.toggleArc);

  if (arcs.length === 0) {
    return (
      <div style={{
        fontFamily: FONT, color: 'rgba(255,255,255,0.18)',
        fontSize: '0.9rem', letterSpacing: '1px',
      }}>
        no arcs defined
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{
        fontFamily: FONT, fontSize: '0.68rem', letterSpacing: '2px',
        color: 'rgba(255,255,255,0.18)', marginBottom: '1.4rem',
      }}>
        HIDDEN ARCS ARE EXCLUDED FROM PLANNER AND ANALYTICS
      </div>

      {arcs.map(arc => {
        const hidden = hiddenArcIds.includes(arc.id);
        return (
          <button
            key={arc.id}
            onClick={() => toggleArc(arc.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.72rem',
              padding: '8px 0',
              background: 'none', border: 'none',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              cursor: 'pointer', textAlign: 'left',
              transition: 'opacity 0.15s ease',
            }}
          >
            <span style={{
              display: 'inline-block', width: 7, height: 7,
              borderRadius: '50%', flexShrink: 0,
              background: hidden ? 'transparent' : arc.color_hex,
              border: `1px solid ${hidden ? 'rgba(255,255,255,0.2)' : arc.color_hex}`,
              transition: 'background 0.15s ease, border-color 0.15s ease',
            }} />
            <span style={{
              fontFamily: FONT, fontSize: '1.05rem', letterSpacing: '1.5px',
              color: hidden ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.78)',
              textDecoration: hidden ? 'line-through' : 'none',
              transition: 'color 0.15s ease',
            }}>
              {arc.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
