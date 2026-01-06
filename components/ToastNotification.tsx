import React, { useEffect, useRef, useState } from 'react';

interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
  style?: React.CSSProperties;
}

interface ToastProps {
  type: 'error' | 'success' | 'info' | 'warning';
  message: string;
  duration?: number;
  onClose: () => void;
  actions?: ToastAction[];
}

const ToastNotification: React.FC<ToastProps> = ({ type, message, duration = 4000, onClose, actions }) => {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [duration, onClose]);

  const getColor = () => {
    switch (type) {
      case 'success':
        return '#10b981';
      case 'error':
        return '#ef4444';
      case 'warning':
        return '#f59e0b';
      default:
        return '#3b82f6';
    }
  };

  const color = getColor();
  const rgbColor = color === '#10b981' ? '16,185,129' : color === '#ef4444' ? '239,68,68' : color === '#f59e0b' ? '245,158,11' : '59,130,246';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        animation: visible ? 'toastSlideIn 0.3s ease-out' : 'toastSlideOut 0.3s ease-in',
      }}
      role="status"
      aria-live="polite"
    >
      <div
        style={{
          background: 'rgba(15, 17, 21, 0.95)',
          borderRadius: 12,
          overflow: 'hidden',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2)',
          minWidth: 320,
          maxWidth: 520,
        }}
      >
        {/* Main content */}
        <div
          style={{
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          {/* Message */}
          <div
            style={{
              flex: 1,
              color: '#e5e7eb',
              fontSize: 14,
              fontWeight: 500,
              lineHeight: 1.4,
            }}
          >
            {message}
          </div>

          {/* Actions */}
          {actions && actions.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginLeft: 8, flexShrink: 0 }}>
              {actions.map((a, idx) => (
                <button
                  key={idx}
                  onClick={async () => {
                    try {
                      await a.onClick();
                    } catch (e) {
                      console.error('Toast action error', e);
                    }
                    setVisible(false);
                    setTimeout(onClose, 200);
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: `rgba(${rgbColor}, 0.15)`,
                    color,
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    ...a.style,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `rgba(${rgbColor}, 0.25)`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = `rgba(${rgbColor}, 0.15)`;
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div
          style={{
            height: 3,
            background: 'rgba(0, 0, 0, 0.2)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              background: color,
              animation: `toastProgress ${duration}ms linear forwards`,
              transformOrigin: 'left',
            }}
          />
        </div>
      </div>

      <style jsx>{`
        @keyframes toastSlideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes toastSlideOut {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(400px);
            opacity: 0;
          }
        }

        @keyframes toastProgress {
          0% {
            transform: scaleX(1);
          }
          100% {
            transform: scaleX(0);
          }
        }
      `}</style>
    </div>
  );
};

export default ToastNotification;
