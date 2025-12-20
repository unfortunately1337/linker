import React, { useMemo } from 'react';

type CallState = 'in-call' | 'calling' | 'connecting' | 'ringing';

interface CallTrayProps {
  callState: CallState;
  targetName?: string;
  targetAvatar?: string;
  elapsed: string;
  onRestore: () => void;
  isMobile: boolean;
}

export const CallTray: React.FC<CallTrayProps> = ({
  callState,
  targetName,
  targetAvatar,
  elapsed,
  onRestore,
  isMobile
}) => {
  const statusText = useMemo(() => {
    if (callState === 'in-call') return elapsed;
    if (callState === 'calling') return 'Вызов...';
    if (callState === 'connecting') return 'Соединение...';
    if (callState === 'ringing') return 'Входящий звонок';
    return 'Звонок';
  }, [callState, elapsed]);

  const statusColor = useMemo(() => {
    if (callState === 'in-call') return '#22c55e';
    if (callState === 'ringing') return '#fbbf24';
    return '#60a5fa';
  }, [callState]);

  if (isMobile) {
    return (
      <div style={{ position: 'fixed', left: '50%', bottom: 16, transform: 'translateX(-50%)', zIndex: 2100, animation: 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>
        <style>{`
          @keyframes slideUp {
            from { transform: translateX(-50%) translateY(20px); opacity: 0; }
            to { transform: translateX(-50%) translateY(0); opacity: 1; }
          }
          @keyframes pulse-ring {
            0% { box-shadow: 0 0 0 0 rgba(66, 165, 245, 0.7); }
            70% { box-shadow: 0 0 0 8px rgba(66, 165, 245, 0); }
            100% { box-shadow: 0 0 0 0 rgba(66, 165, 245, 0); }
          }
        `}</style>
        
        <button
          onClick={onRestore}
          title="Вернуться к звонку"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px 12px 12px',
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(66, 165, 245, 0.2), rgba(66, 165, 245, 0.08))',
            backdropFilter: 'blur(12px)',
            color: '#fff',
            border: '1px solid rgba(66, 165, 245, 0.3)',
            cursor: 'pointer',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.08)',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            fontFamily: 'inherit',
            fontSize: '13px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(66, 165, 245, 0.3), rgba(66, 165, 245, 0.15))';
            e.currentTarget.style.boxShadow = '0 14px 36px rgba(66, 165, 245, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.12)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(66, 165, 245, 0.2), rgba(66, 165, 245, 0.08))';
            e.currentTarget.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img
              src={targetAvatar || '/window.svg'}
              alt="avatar"
              style={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                objectFit: 'cover',
                background: '#1a1c1f',
                border: '1px solid rgba(255, 255, 255, 0.05)'
              }}
            />
            {callState === 'in-call' && (
              <div
                style={{
                  position: 'absolute',
                  bottom: -4,
                  right: -4,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: '#22c55e',
                  border: '2px solid rgba(20, 21, 25, 0.95)',
                  boxShadow: '0 2px 6px rgba(34, 197, 94, 0.4)'
                }}
              />
            )}
            {callState !== 'in-call' && (
              <div
                style={{
                  position: 'absolute',
                  inset: -2,
                  borderRadius: '8px',
                  border: `2px solid ${callState === 'ringing' ? 'rgba(251, 191, 36, 0.3)' : 'rgba(66, 165, 245, 0.3)'}`,
                  animation: callState === 'ringing' ? 'pulse-ring 1.5s infinite' : 'pulse-ring 2s infinite'
                }}
              />
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.3, gap: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '12px', letterSpacing: '-0.2px', color: '#fff' }}>
              {(targetName || 'Звонок').substring(0, 16)}
            </div>
            <div style={{ color: statusColor, fontSize: '11px', fontWeight: 600, transition: 'color 0.3s' }}>
              {statusText}
            </div>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 2100, animation: 'slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(400px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes glow-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
      `}</style>

      <button
        onClick={onRestore}
        title="Вернуться к звонку"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          borderRadius: 12,
          background: 'rgba(20, 21, 25, 0.9)',
          backdropFilter: 'blur(10px)',
          color: '#fff',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
          transition: 'all 0.2s ease',
          fontFamily: 'inherit',
          fontSize: '14px',
          animation: callState !== 'in-call' ? 'glow-pulse 2s ease-in-out infinite' : 'none'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(30, 31, 35, 0.95)';
          e.currentTarget.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.6)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(20, 21, 25, 0.9)';
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.5)';
        }}
      >
        {/* Avatar */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <img
            src={targetAvatar || '/window.svg'}
            alt="avatar"
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '2px solid rgba(255, 255, 255, 0.1)'
            }}
          />
          {callState === 'in-call' && (
            <div
              style={{
                position: 'absolute',
                bottom: -2,
                right: -2,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: '#22c55e',
                border: '2px solid rgba(20, 21, 25, 0.95)',
                boxShadow: '0 2px 8px rgba(34, 197, 94, 0.6)'
              }}
            />
          )}
        </div>

        {/* Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '13px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {targetName || 'Звонок'}
          </div>
          <div style={{ color: statusColor, fontSize: '12px', fontWeight: 500 }}>
            {statusText}
          </div>
        </div>

        {/* Expand arrow */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          style={{
            color: '#a0aec0',
            flexShrink: 0,
            transition: 'transform 0.2s'
          }}
        >
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
    </div>
  );
};

export default CallTray;
