import { createPortal } from 'react-dom';

interface ModalProps {
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
}

export default function Modal({ onClose, children, maxWidth = 640 }: ModalProps) {
  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        className="filmneg-modal-content"
        style={{
          background: '#0d0d0d',
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '28px 32px',
          minWidth: 420,
          maxWidth,
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
