import { Toaster as Sonner, toast } from 'sonner';

export { toast };

export function Toaster() {
  return (
    <Sonner
      position="top-center"
      toastOptions={{
        style: {
          background: '#0a0a0a',
          border: '1px solid rgba(255,255,255,0.15)',
          color: '#fff',
          fontFamily: "'VT323', monospace",
          fontSize: '1rem',
          letterSpacing: '1px',
          borderRadius: 0,
        },
      }}
    />
  );
}
