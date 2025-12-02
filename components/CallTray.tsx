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
          0%, 100% { box-shadow: 0 0 0 0 rgba(66, 165, 245, 0.6); }
          50% { box-shadow: 0 0 0 12px rgba(66, 165, 245, 0); }
        }
        @keyframes subtle-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
      `}</style>

      <button
        onClick={onRestore}
        title="Вернуться к звонку"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '14px 20px 14px 14px',
          borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(66, 165, 245, 0.15), rgba(66, 165, 245, 0.05))',
          backdropFilter: 'blur(14px)',
          color: '#fff',
          border: '1px solid rgba(66, 165, 245, 0.25)',
          cursor: 'pointer',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7), inset 0 1px 1px rgba(255, 255, 255, 0.08)',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          fontFamily: 'inherit',
          fontSize: '14px',
          animation: callState !== 'in-call' ? 'glow-pulse 2s ease-in-out infinite' : 'subtle-float 3s ease-in-out infinite'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(66, 165, 245, 0.25), rgba(66, 165, 245, 0.12))';
          e.currentTarget.style.boxShadow = '0 24px 56px rgba(66, 165, 245, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.12)';
          e.currentTarget.style.transform = 'translateY(-4px)';
          e.currentTarget.style.animation = 'none';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(66, 165, 245, 0.15), rgba(66, 165, 245, 0.05))';
          e.currentTarget.style.boxShadow = '0 20px 50px rgba(0, 0, 0, 0.7), inset 0 1px 1px rgba(255, 255, 255, 0.08)';
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.animation = callState !== 'in-call' ? 'glow-pulse 2s ease-in-out infinite' : 'subtle-float 3s ease-in-out infinite';
        }}
      >
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <div
            style={{
              position: 'relative',
              width: 56,
              height: 56,
              borderRadius: '12px',
              overflow: 'hidden',
              background: 'linear-gradient(135deg, rgba(66, 165, 245, 0.1), rgba(156, 39, 176, 0.08))',
              border: '1px solid rgba(66, 165, 245, 0.15)'
            }}
          >
            <img
              src={targetAvatar || '/window.svg'}
              alt="avatar"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                background: '#1a1c1f'
              }}
            />

            {callState === 'in-call' && (
              <>
                <div
                  style={{
                    position: 'absolute',
                    bottom: 2,
                    right: 2,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: '#22c55e',
                    border: '2px solid rgba(20, 21, 25, 0.95)',
                    boxShadow: '0 4px 12px rgba(34, 197, 94, 0.5)'
                  }}
                />
              </>
            )}

            {callState !== 'in-call' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '12px',
                  background: callState === 'ringing'
                    ? 'radial-gradient(circle at center, rgba(251, 191, 36, 0.2), transparent)'
                    : 'radial-gradient(circle at center, rgba(96, 165, 250, 0.2), transparent)',
                  animation: callState === 'ringing' ? 'pulse 2s ease-in-out infinite' : 'pulse 1.5s ease-in-out infinite'
                }}
              />
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '15px', letterSpacing: '-0.3px', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>
            {targetName || 'Звонок'}
          </div>
          <div style={{ color: statusColor, fontSize: '13px', fontWeight: 600, transition: 'color 0.3s' }}>
            {statusText}
          </div>
        </div>

        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{
            color: '#81d4fa',
            flexShrink: 0,
            opacity: 0.7,
            transition: 'all 0.2s'
          }}
        >
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
    </div>
  );
};

export default CallTray;
