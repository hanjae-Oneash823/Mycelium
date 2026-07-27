import type { ReactNode } from 'react';

const VT = "var(--font-main), var(--font-kr), monospace";

interface ComingSoonViewProps {
  icon: ReactNode;
  label: string;
  description: string;
}

export default function ComingSoonView({ icon, label, description }: ComingSoonViewProps) {
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14,
      color: 'rgba(255,255,255,0.22)',
    }}>
      <span style={{ opacity: 0.6 }}>{icon}</span>
      <div style={{ fontFamily: VT, fontSize: '1.6rem', letterSpacing: 3, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontFamily: VT, fontSize: '1rem', letterSpacing: 1, color: 'rgba(255,255,255,0.15)' }}>
        {description}
      </div>
    </div>
  );
}
