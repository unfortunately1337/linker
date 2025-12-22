import React, { useState } from 'react';

type CallStatus = 'calling' | 'ringing' | 'connecting' | 'in-call' | 'ended';

interface CallWindowProps {
  targetName?: string;
  targetAvatar?: string;
  status: CallStatus;
  type: 'phone' | 'video';
  elapsed: string;
  signalingTime: string;
  muted: boolean;
  endedReason?: 'declined' | 'ended' | 'cancelled' | 'timeout';
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
  const [isAccepting, setIsAccepting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [wasInCall, setWasInCall] = useState(false);

  React.useEffect(() => {
    if (isActive) {
      setWasInCall(true);
    }
  }, [isActive]);

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      await onAccept();
    } finally {
      setIsAccepting(false);
    }
  };

  // Monitor audio levels for visual feedback
  React.useEffect(() => {
    if (!isActive) return;

    let animationId: number;
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let stream: MediaStream | null = null;

    const startAudioMonitoring = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const analyzeAudio = () => {
          analyser!.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setAudioLevel(Math.min(average / 255, 1));
          animationId = requestAnimationFrame(analyzeAudio);
        };

        analyzeAudio();
      } catch (err) {
        console.log('Audio monitoring not available:', err);
      }
    };

    startAudioMonitoring();

    return () => {
      cancelAnimationFrame(animationId);
      // Stop all audio tracks from monitoring stream
      if (stream) {
        stream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (e) {}
        });
      }
      // Close audio context
      if (audioContext) {
        try {
          audioContext.close();
        } catch (e) {}
      }
    };
  }, [isActive]);

  // Auto-close ended call screen after 2 seconds
  React.useEffect(() => {
    if (isEnded) {
      const timer = setTimeout(() => {
        onEnd();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isEnded, onEnd]);

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
        background: 'rgba(0, 0, 0, 0.95)',
        backdropFilter: 'blur(12px)'
      }}
    >
      <style>{`
        @keyframes slideIn {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes ring {
          0%, 100% { transform: rotate(-8deg); }
          50% { transform: rotate(8deg); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(12px); }
        }
        @keyframes pulse-ring {
          0% { box-shadow: 0 0 0 0 rgba(49, 162, 76, 0.7); }
          70% { box-shadow: 0 0 0 25px rgba(49, 162, 76, 0); }
          100% { box-shadow: 0 0 0 0 rgba(49, 162, 76, 0); }
        }
        @keyframes wave {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes wave-delay-1 {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes wave-delay-2 {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>

      {isEnded ? (
        // Ended call screen
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            zIndex: 2010,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            animation: 'slideIn 0.3s ease-out'
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              marginBottom: 40
            }}
          >
            <img
              src={targetAvatar || '/window.svg'}
              alt="avatar"
              style={{
                width: 140,
                height: 140,
                borderRadius: '50%',
                objectFit: 'cover',
                background: '#1a1a1a'
              }}
            />
            <div style={{ fontWeight: 600, fontSize: 20, color: '#fff' }}>
              {targetName || 'Неизвестный'}
            </div>
          </div>

          <div
            style={{
              color: (endedReason === 'declined' || endedReason === 'cancelled' || endedReason === 'timeout' || (startedAt && endedAt && (endedAt - startedAt) < 2000)) ? '#e84c3d' : '#a0aec0',
              fontSize: 16,
              fontWeight: 500,
              marginBottom: 48,
              textAlign: 'center'
            }}
          >
            {endedReason === 'declined'
              ? 'Вы отклонили звонок'
              : endedReason === 'cancelled'
                ? 'Звонок отменён'
                : endedReason === 'timeout'
                  ? 'Не удалось дозвониться'
                  : startedAt && endedAt && (endedAt - startedAt) < 2000
                    ? 'Звонок отменён'
                    : wasInCall && startedAt && endedAt && (endedAt - startedAt > 1000)
                      ? (() => {
                          const ms = Math.max(0, endedAt - startedAt);
                          const s = Math.floor(ms / 1000);
                          const mm = String(Math.floor(s / 60)).padStart(2, '0');
                          const ss = String(s % 60).padStart(2, '0');
                          return `Разговор длился ${mm}:${ss}`;
                        })()
                      : 'Звонок завершился'}
          </div>
        </div>
      ) : (
        // Active/incoming/outgoing call
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            zIndex: 2010,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '60px 20px 40px',
            animation: 'slideIn 0.3s ease-out'
          }}
        >
          {/* Top section */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              flex: 1,
              justifyContent: 'center',
              position: 'relative'
            }}
          >
            {/* Incoming call waves */}
            {isIncoming && (
              <>
                <div
                  style={{
                    position: 'absolute',
                    width: 200,
                    height: 200,
                    borderRadius: '50%',
                    border: '2px solid rgba(49, 162, 76, 0.6)',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    animation: 'wave 1.5s ease-out infinite',
                    pointerEvents: 'none'
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    width: 200,
                    height: 200,
                    borderRadius: '50%',
                    border: '2px solid rgba(49, 162, 76, 0.4)',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    animation: 'wave 1.5s ease-out infinite 0.5s',
                    pointerEvents: 'none'
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    width: 200,
                    height: 200,
                    borderRadius: '50%',
                    border: '2px solid rgba(49, 162, 76, 0.2)',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    animation: 'wave 1.5s ease-out infinite 1s',
                    pointerEvents: 'none'
                  }}
                />
              </>
            )}
            
            {/* Avatar */}
            <div
              style={{
                position: 'relative',
                width: 200,
                height: 200,
                borderRadius: '50%',
                overflow: 'hidden',
                boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 ${4 + audioLevel * 8}px rgba(49, 162, 76, ${0.3 * audioLevel})`,
                animation: isActive ? 'none' : isIncoming ? 'ring 0.8s ease-in-out infinite' : 'float 3s ease-in-out infinite',
                transform: `scale(${1 + audioLevel * 0.08})`,
                transition: 'transform 0.05s ease-out, box-shadow 0.05s ease-out',
                zIndex: 1
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
                    inset: 0,
                    borderRadius: '50%',
                    border: `3px solid rgba(49, 162, 76, ${0.6 + audioLevel * 0.4})`,
                    animation: 'pulse-ring 1.5s ease-out infinite',
                    boxShadow: `inset 0 0 20px rgba(49, 162, 76, ${audioLevel * 0.5})`
                  }}
                />
              )}
            </div>

            {/* Name */}
            <div
              style={{
                fontWeight: '600',
                fontSize: '24px',
                color: '#fff',
                textAlign: 'center',
                maxWidth: '90%'
              }}
            >
              {targetName || 'Звонок'}
            </div>

            {/* Status */}
            <div
              style={{
                color: '#a0aec0',
                fontSize: '14px',
                fontWeight: '500',
                minHeight: '20px'
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

          {/* Bottom controls */}
          <div
            style={{
              display: 'flex',
              gap: 20,
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%',
              flexWrap: 'wrap',
              paddingBottom: 20
            }}
          >
            {isIncoming ? (
              <>
                {/* Accept */}
                <button
                  onClick={handleAccept}
                  disabled={isAccepting}
                  title="Принять"
                  style={{
                    width: 68,
                    height: 68,
                    borderRadius: '50%',
                    border: 'none',
                    background: '#31a24c',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: isAccepting ? 'not-allowed' : 'pointer',
                    boxShadow: '0 6px 20px rgba(49, 162, 76, 0.4)',
                    transition: 'all 0.2s ease',
                    transform: 'scale(1)',
                    opacity: isAccepting ? 0.8 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!isAccepting) {
                      e.currentTarget.style.transform = 'scale(1.1)';
                      e.currentTarget.style.boxShadow = '0 8px 24px rgba(49, 162, 76, 0.5)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(49, 162, 76, 0.4)';
                  }}
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                    <path d="M3 9.5c0-1.5 1-3.5 2.5-5s3.5-2.5 5-2.5c1.5 0 3 1 4 2l1 1.5c.5.5 1 1.5 1 2.5 0 1-1 2-2 2s-2-1-2-2c0-.5.5-1 1-1.5l-1-1.5c-.5-.5-1.5-1-2-1s-1.5.5-2.5 1.5c-1 1-2 2.5-2 4s.5 3 2 5l2 2c1.5 1.5 3.5 2.5 5.5 2.5s4-1 5.5-2.5l1.5-1.5c1.5-1.5 2.5-3.5 2.5-5.5 0-1-.5-2-1-3l-1.5 1.5c.5 1 1 2 1 2.5 0 1.5-1 3.5-2.5 5s-3.5 2.5-5 2.5c-1.5 0-3-1-4-2l-2-2c-1.5-1.5-2.5-3-2.5-5z" />
                  </svg>
                </button>

                {/* Decline */}
                <button
                  onClick={onEnd}
                  title="Отклонить"
                  style={{
                    width: 68,
                    height: 68,
                    borderRadius: '50%',
                    border: 'none',
                    background: '#e84c3d',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 6px 20px rgba(232, 76, 61, 0.4)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.1)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(232, 76, 61, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(232, 76, 61, 0.4)';
                  }}
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                    <path d="M21 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21 16.92z" style={{ transform: 'rotate(135deg)' }} />
                  </svg>
                </button>
              </>
            ) : (
              <>
                {/* Minimize button */}
                <button
                  onClick={onMinimize}
                  title="Свернуть звонок"
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(255,255,255,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>

                {/* Mute */}
                <button
                  onClick={onToggleMute}
                  title={muted ? 'Включить микрофон' : 'Выключить микрофон'}
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: '50%',
                    border: 'none',
                    background: muted ? 'rgba(232, 76, 61, 0.25)' : 'rgba(255,255,255,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = muted ? 'rgba(232, 76, 61, 0.4)' : 'rgba(255,255,255,0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = muted ? 'rgba(232, 76, 61, 0.25)' : 'rgba(255,255,255,0.1)';
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={muted ? '#e84c3d' : '#fff'} strokeWidth="2">
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

                {/* End call */}
                <button
                  onClick={onEnd}
                  title="Завершить"
                  style={{
                    width: 68,
                    height: 68,
                    borderRadius: '50%',
                    border: 'none',
                    background: '#e84c3d',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 6px 20px rgba(232, 76, 61, 0.4)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.1)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(232, 76, 61, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(232, 76, 61, 0.4)';
                  }}
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                    <path d="M21 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21 16.92z" style={{ transform: 'rotate(135deg)' }} />
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
