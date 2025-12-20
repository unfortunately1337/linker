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
        @keyframes smile-bounce {
          0%, 100% { transform: scale(1) translateY(0); }
          50% { transform: scale(1.1) translateY(-10px); }
        }
        @keyframes wink-open {
          0%, 100% { opacity: 1; }
          45%, 55% { opacity: 0; }
        }
        @keyframes wink-close {
          0%, 100% { opacity: 0; }
          45%, 55% { opacity: 1; }
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
                  <div
                    style={{
                      position: 'relative',
                      width: '100px',
                      height: '100px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      animation: 'smile-bounce 2s ease-in-out infinite'
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        fontSize: '80px',
                        fontWeight: 'bold',
                        color: '#3b82f6',
                        textShadow: '0 0 30px rgba(66, 165, 245, 0.8)',
                        fontFamily: 'monospace',
                        letterSpacing: '2px',
                        opacity: 1,
                        animation: 'wink-open 2s ease-in-out infinite'
                      }}
                    >
                      :)
                    </div>
                    <div
                      style={{
                        position: 'absolute',
                        fontSize: '80px',
                        fontWeight: 'bold',
                        color: '#3b82f6',
                        textShadow: '0 0 30px rgba(66, 165, 245, 0.8)',
                        fontFamily: 'monospace',
                        letterSpacing: '2px',
                        opacity: 0,
                        animation: 'wink-close 2s ease-in-out infinite'
                      }}
                    >
                      ;)
                    </div>
                  </div>
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
            borderRadius: 24,
            padding: 40,
            boxShadow:
              '0 25px 70px rgba(0,0,0,0.9), inset 0 1px 1px rgba(255,255,255,0.05)',
            color: '#fff',
            zIndex: 2010,
            border: '1px solid rgba(255,255,255,0.04)',
            animation: 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
        >
          {/* Avatar section - large circular */}
          <div
            style={{
              position: 'relative',
              marginBottom: 24,
              display: 'flex',
              justifyContent: 'center',
              width: '100%'
            }}
          >
            <div
              style={{
                position: 'relative',
                width: 200,
                height: 200,
                borderRadius: '50%',
                background: '#f5f5f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                border: '4px solid #fff'
              }}
            >
              <img
                src={targetAvatar || '/window.svg'}
                alt="avatar"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
              />
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 12,
                    right: 12,
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: '#22c55e',
                    border: '3px solid #fff',
                    animation: 'glow 2s ease-in-out infinite',
                    boxShadow: '0 0 20px rgba(34, 197, 94, 0.8)'
                  }}
                />
              )}
            </div>
          </div>

          {/* Name and status */}
          <div style={{ textAlign: 'center', marginBottom: 28, width: '100%' }}>
            <div
              style={{
                fontWeight: 800,
                fontSize: 26,
                marginBottom: 8,
                letterSpacing: '-0.3px'
              }}
            >
              {targetName || 'Звонок'}
            </div>

            <div
              style={{
                color: '#a0aec0',
                fontSize: 14,
                fontWeight: 500,
                letterSpacing: '0.2px'
              }}
            >
              {isOutgoing
                ? 'вызов...'
                : isIncoming
                  ? 'входящий звонок'
                  : isConnecting
                    ? 'соединение...'
                    : isActive
                      ? elapsed
                      : ''}
            </div>
          </div>

          {/* Controls - bottom row with 4 buttons */}
          <div
            style={{
              display: 'flex',
              gap: 16,
              justifyContent: 'center',
              width: '100%',
              flexWrap: 'wrap'
            }}
          >
            {isIncoming ? (
              <>
                {/* Accept button - green */}
                <button
                  onClick={onAccept}
                  title="Принять"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    border: 'none',
                    background: '#22c55e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(34,197,94,0.4)',
                    transition: 'all 0.2s ease',
                    transform: 'scale(1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </button>

                {/* Decline button - red */}
                <button
                  onClick={onEnd}
                  title="Отклонить"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    border: 'none',
                    background: '#ef4444',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(239,68,68,0.4)',
                    transition: 'all 0.2s ease',
                    transform: 'scale(1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" style={{ transform: 'rotate(135deg)' }} />
                  </svg>
                </button>
              </>
            ) : (
              <>
                {/* Screen share */}
                <button
                  onClick={onMinimize}
                  title="Экран"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(100, 116, 139, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(100, 116, 139, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(100, 116, 139, 0.3)';
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                  </svg>
                </button>

                {/* End call - red */}
                <button
                  onClick={onEnd}
                  title="Завершить"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    border: 'none',
                    background: '#ef4444',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(239,68,68,0.4)',
                    transition: 'all 0.2s ease',
                    transform: 'scale(1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" style={{ transform: 'rotate(135deg)' }} />
                  </svg>
                </button>

                {/* Mute/unmute */}
                <button
                  onClick={onToggleMute}
                  title={muted ? 'Включить микрофон' : 'Выключить микрофон'}
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    border: 'none',
                    background: muted ? 'rgba(239, 68, 68, 0.4)' : 'rgba(100, 116, 139, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = muted ? 'rgba(239, 68, 68, 0.6)' : 'rgba(100, 116, 139, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = muted ? 'rgba(239, 68, 68, 0.4)' : 'rgba(100, 116, 139, 0.3)';
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={muted ? '#ef4444' : '#cbd5e1'} strokeWidth="2">
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
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CallWindow;
