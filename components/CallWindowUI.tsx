import React, { useEffect, useState } from 'react';

type CallStatus = 'calling' | 'ringing' | 'connecting' | 'in-call' | 'ended';

interface CallWindowProps {
  targetName?: string;
  targetAvatar?: string;
  status: CallStatus;
  type: 'phone' | 'video';
  elapsed: string;
  signalingTime: string;
  muted: boolean;
  endedReason?: 'declined' | 'ended';
  startedAt?: number;
  endedAt?: number;
  onAccept: () => Promise<void> | void;
  onEnd: () => void;
  onMinimize: () => void;
  onToggleMute: () => void;
}

export const CallWindow: React.FC<CallWindowProps> = ({
  targetName,
  targetAvatar,
  status,
  type,
  elapsed,
  signalingTime,
  muted,
  endedReason,
  startedAt,
  endedAt,
  onAccept,
  onEnd,
  onMinimize,
  onToggleMute
}) => {
  const isOutgoing = status === 'calling';
  const isIncoming = status === 'ringing';
  const isConnecting = status === 'connecting';
  const isActive = status === 'in-call';
  const isEnded = status === 'ended';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
        background: 'linear-gradient(135deg, rgba(15,17,19,0.95), rgba(10,12,15,0.98))',
        backdropFilter: 'blur(20px)'
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 30% 50%, rgba(33,150,243,0.08), transparent 50%), radial-gradient(circle at 70% 50%, rgba(244,67,54,0.04), transparent 50%)'
        }}
      />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.8) rotateX(45deg); opacity: 0; }
          to { transform: scale(1) rotateX(0deg); opacity: 1; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(30px); }
        }
        @keyframes slideUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes ring {
          0%, 100% { transform: rotate(0deg); }
          10% { transform: rotate(-15deg); }
          20% { transform: rotate(15deg); }
          30% { transform: rotate(-15deg); }
          40% { transform: rotate(0deg); }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(34, 197, 94, 0.4); }
          50% { box-shadow: 0 0 40px rgba(34, 197, 94, 0.8); }
        }
        @keyframes checkmark {
          0% { stroke-dasharray: 50; stroke-dashoffset: 50; opacity: 0; }
          50% { opacity: 1; }
          100% { stroke-dasharray: 50; stroke-dashoffset: 0; }
        }
        @keyframes pulse-glow {
          0% { box-shadow: inset 0 0 0 0 rgba(34, 197, 94, 0.4); }
          100% { box-shadow: inset 0 0 0 50px rgba(34, 197, 94, 0); }
        }
        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {isEnded ? (
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '100vw',
            height: '100vh',
            zIndex: 2010,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}
        >
          {/* Animated background circles */}
          <div
            style={{
              position: 'absolute',
              width: 300,
              height: 300,
              borderRadius: '50%',
              background:
                endedReason === 'declined'
                  ? 'radial-gradient(circle, rgba(239,68,68,0.15), transparent)'
                  : 'radial-gradient(circle, rgba(66, 165, 245, 0.15), transparent)',
              top: '20%',
              left: '15%',
              animation: 'float 6s ease-in-out infinite'
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: 250,
              height: 250,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(33,150,243,0.1), transparent)',
              bottom: '15%',
              right: '10%',
              animation: 'float 8s ease-in-out infinite'
            }}
          />

          {/* Main content */}
          <div
            style={{
              position: 'relative',
              zIndex: 2011,
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              animation: 'slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            {/* Status icon with animation */}
            <div
              style={{
                marginBottom: 40,
                animation: 'scaleIn 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: 160,
                  height: 160,
                  borderRadius: '50%',
                  background:
                    endedReason === 'declined'
                      ? 'linear-gradient(135deg, rgba(239,68,68,0.25), rgba(220,38,38,0.15))'
                      : isActive
                        ? 'linear-gradient(135deg, rgba(34,197,94,0.25), rgba(22,163,74,0.15))'
                        : 'linear-gradient(135deg, rgba(66, 165, 245, 0.25), rgba(59, 130, 246, 0.15))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `3px solid ${endedReason === 'declined' ? 'rgba(239,68,68,0.5)' : isActive ? 'rgba(34,197,94,0.5)' : 'rgba(66, 165, 245, 0.5)'}`,
                  boxShadow: `0 0 50px ${endedReason === 'declined' ? 'rgba(239,68,68,0.25)' : isActive ? 'rgba(34,197,94,0.25)' : 'rgba(66, 165, 245, 0.25)'}`,
                  overflow: 'hidden'
                }}
              >
                {endedReason === 'declined' ? (
                  <svg
                    width="80"
                    height="80"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                ) : isActive ? (
                  <>
                    <svg
                      width="80"
                      height="80"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="2"
                      style={{
                        animation: 'checkmark 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)'
                      }}
                    >
                      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(34, 197, 94, 0.2), transparent)',
                        animation: 'pulse-glow 1.5s ease-in-out'
                      }}
                    />
                  </>
                ) : (
                  <svg
                    width="80"
                    height="80"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2"
                    style={{
                      animation: 'rotate 3s linear infinite'
                    }}
                  >
                    <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="0" />
                  </svg>
                )}
              </div>
            </div>

            {/* Status text */}
            <div
              style={{
                color: '#fff',
                fontWeight: 800,
                fontSize: 36,
                marginBottom: 16,
                letterSpacing: '-0.8px'
              }}
            >
              {endedReason === 'declined' ? 'Звонок отклонён' : 'Звонок завершился'}
            </div>

            {/* Call duration */}
            <div
              style={{
                color: '#a0aec0',
                fontSize: 18,
                fontWeight: 500,
                marginBottom: 40
              }}
            >
              {endedReason === 'declined'
                ? 'Вы отклонили звонок'
                : startedAt && endedAt && (endedAt - startedAt > 1000)
                  ? (() => {
                      const ms = Math.max(0, endedAt - startedAt);
                      const s = Math.floor(ms / 1000);
                      const mm = String(Math.floor(s / 60)).padStart(2, '0');
                      const ss = String(s % 60).padStart(2, '0');
                      return `Разговор длился ${mm}:${ss}`;
                    })()
                  : 'Звонок завершился'}
            </div>

            {/* Person info */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 16,
                marginBottom: 48
              }}
            >
              <img
                src={targetAvatar || '/window.svg'}
                alt="avatar"
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  background: '#1a1c1f',
                  border: '3px solid rgba(255,255,255,0.1)'
                }}
              />
              <div style={{ fontWeight: 700, fontSize: 22, color: '#fff', letterSpacing: '-0.3px' }}>
                {targetName || 'Неизвестный'}
              </div>
            </div>


          </div>
        </div>
      ) : (
        // Active call or incoming/outgoing
        <div
          style={{
            position: 'relative',
            width: 420,
            maxWidth: '92vw',
            background: 'linear-gradient(135deg, rgba(20,21,25,0.95), rgba(15,17,19,0.98))',
            borderRadius: 32,
            padding: 32,
            boxShadow:
              '0 25px 70px rgba(0,0,0,0.9), inset 0 1px 1px rgba(255,255,255,0.05)',
            color: '#fff',
            zIndex: 2010,
            border: '1px solid rgba(255,255,255,0.04)',
            animation: 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          {/* Avatar section with gradient */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div
              style={{
                position: 'relative',
                display: 'inline-block',
                marginBottom: 20
              }}
            >
              <div
                style={{
                  width: 140,
                  height: 140,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(33,150,243,0.15), rgba(156,39,176,0.12))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid rgba(33,150,243,0.3)',
                  animation: isIncoming || isOutgoing ? 'ring 0.5s ease-in-out' : 'none'
                }}
              >
                <img
                  src={targetAvatar || '/window.svg'}
                  alt="avatar"
                  style={{
                    width: 136,
                    height: 136,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    background: '#1a1c1f'
                  }}
                />
              </div>
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: -6,
                    right: -6,
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: '#22c55e',
                    border: '3px solid rgba(20,21,25,0.95)',
                    animation: 'glow 2s ease-in-out infinite',
                    boxShadow: '0 0 20px rgba(34, 197, 94, 0.6)'
                  }}
                />
              )}
            </div>

            <div
              style={{
                fontWeight: 800,
                fontSize: 28,
                marginBottom: 10,
                letterSpacing: '-0.5px',
                animation: 'slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.1s backwards'
              }}
            >
              {targetName || 'Звонок'}
            </div>

            <div
              style={{
                color: '#a0aec0',
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: '0.2px',
                animation: 'slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.2s backwards'
              }}
            >
              {isOutgoing
                ? 'Вызов...'
                : isIncoming
                  ? 'Входящий звонок'
                  : isConnecting
                    ? 'Соединение...'
                    : isActive
                      ? 'В разговоре'
                      : ''}
            </div>
          </div>

          {/* Timer - only show when in-call */}
          {isActive && (
            <div
              style={{
                textAlign: 'center',
                marginBottom: 28,
                animation: 'slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              <div
                style={{
                  fontSize: 44,
                  fontWeight: 900,
                  color: '#81d4fa',
                  letterSpacing: '-1px',
                  fontVariantNumeric: 'tabular-nums',
                  textShadow: '0 4px 16px rgba(129, 212, 250, 0.2)'
                }}
              >
                {elapsed}
              </div>
            </div>
          )}

          {/* Controls */}
          <div
            style={{
              display: 'flex',
              gap: 16,
              justifyContent: 'center',
              alignItems: 'center',
              flexWrap: 'wrap'
            }}
          >
            {isIncoming ? (
              <>
                {/* Accept button */}
                <button
                  onClick={onAccept}
                  title="Принять"
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow:
                      '0 12px 36px rgba(34,197,94,0.35), inset 0 1px 2px rgba(255,255,255,0.15)',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: 'scale(1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.1)';
                    e.currentTarget.style.boxShadow =
                      '0 16px 44px rgba(34,197,94,0.4), inset 0 1px 2px rgba(255,255,255,0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow =
                      '0 12px 36px rgba(34,197,94,0.35), inset 0 1px 2px rgba(255,255,255,0.15)';
                  }}
                >
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="white"
                    stroke="white"
                    strokeWidth="2"
                  >
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </button>

                {/* Decline button */}
                <button
                  onClick={onEnd}
                  title="Отклонить"
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow:
                      '0 12px 36px rgba(239,68,68,0.35), inset 0 1px 2px rgba(255,255,255,0.15)',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: 'scale(1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.1)';
                    e.currentTarget.style.boxShadow =
                      '0 16px 44px rgba(239,68,68,0.4), inset 0 1px 2px rgba(255,255,255,0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow =
                      '0 12px 36px rgba(239,68,68,0.35), inset 0 1px 2px rgba(255,255,255,0.15)';
                  }}
                >
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="white"
                    stroke="white"
                    strokeWidth="2"
                    style={{ transform: 'rotate(135deg)' }}
                  >
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </button>
              </>
            ) : (
              <>
                {/* Mute/unmute */}
                <button
                  onClick={onToggleMute}
                  title={muted ? 'Включить микрофон' : 'Выключить микрофон'}
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: muted
                      ? 'linear-gradient(135deg, rgba(239,68,68,0.25), rgba(220,38,38,0.15))'
                      : 'linear-gradient(135deg, rgba(100,116,139,0.25), rgba(71,85,105,0.15))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 6px 16px rgba(0,0,0,0.4)',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = muted
                      ? 'linear-gradient(135deg, rgba(239,68,68,0.35), rgba(220,38,38,0.25))'
                      : 'linear-gradient(135deg, rgba(100,116,139,0.35), rgba(71,85,105,0.25))';
                    e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = muted
                      ? 'linear-gradient(135deg, rgba(239,68,68,0.25), rgba(220,38,38,0.15))'
                      : 'linear-gradient(135deg, rgba(100,116,139,0.25), rgba(71,85,105,0.15))';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
                  }}
                >
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={muted ? '#ef4444' : '#94a3b8'}
                    strokeWidth="2"
                  >
                    {muted ? (
                      <>
                        <path d="M1 9v6a7 7 0 0 0 7 7h8m0-13V3a7 7 0 0 0-7 7v6" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </>
                    ) : (
                      <>
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      </>
                    )}
                  </svg>
                </button>

                {/* Minimize */}
                <button
                  onClick={onMinimize}
                  title="Свернуть"
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background:
                      'linear-gradient(135deg, rgba(100,116,139,0.25), rgba(71,85,105,0.15))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 6px 16px rgba(0,0,0,0.4)',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      'linear-gradient(135deg, rgba(100,116,139,0.35), rgba(71,85,105,0.25))';
                    e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      'linear-gradient(135deg, rgba(100,116,139,0.25), rgba(71,85,105,0.15))';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                    <polyline points="4 14 10 14 10 20"></polyline>
                    <path d="M4 14L4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8"></path>
                  </svg>
                </button>

                {/* End call */}
                <button
                  onClick={onEnd}
                  title="Завершить"
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow:
                      '0 12px 36px rgba(239,68,68,0.35), inset 0 1px 2px rgba(255,255,255,0.15)',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: 'scale(1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.1)';
                    e.currentTarget.style.boxShadow =
                      '0 16px 44px rgba(239,68,68,0.4), inset 0 1px 2px rgba(255,255,255,0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow =
                      '0 12px 36px rgba(239,68,68,0.35), inset 0 1px 2px rgba(255,255,255,0.15)';
                  }}
                >
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="white"
                    stroke="white"
                    strokeWidth="2"
                    style={{ transform: 'rotate(135deg)' }}
                  >
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CallWindow;
