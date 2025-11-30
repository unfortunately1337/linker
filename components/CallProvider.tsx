import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getPusherClient } from '../lib/pusher';
import { getFriendDisplayName } from '../lib/hooks';

type CallType = 'phone' | 'video';
type CallState = {
  id: string;
  type: CallType;
  targetId?: string;
  targetName?: string;
  targetAvatar?: string;
  status: 'calling' | 'ringing' | 'in-call' | 'ended';
  startedAt?: number;
  muted?: boolean;
  endedAt?: number;
  endedReason?: 'declined' | 'ended';
};

type CallContextValue = {
  call: CallState | null;
  startCall: (opts: { type: CallType; targetId: string; targetName?: string; targetAvatar?: string }) => void;
  receiveIncomingCall: (call: CallState) => void;
  acceptCall: () => void;
  endCall: () => void;
  minimizeCall: () => void;
  restoreCall: () => void;
  toggleMute: () => void;
  muted: boolean;
  minimized: boolean;
};

const CallContext = createContext<CallContextValue | null>(null);

export const useCall = () => {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
};

function CallWindow({ call, onAccept, onEnd, onMinimize, muted, onToggleMute }: { call: CallState; onAccept: () => Promise<void> | void; onEnd: () => void; onMinimize: () => void; muted: boolean; onToggleMute: () => void; }) {
  if (!call) return null;
  const isOutgoing = call.status === 'calling';
  const isIncoming = call.status === 'ringing';
  const isActive = call.status === 'in-call';
  const isEnded = call.status === 'ended';

  const [elapsed, setElapsed] = React.useState<string>('00:00');
  const [signalingTime, setSignalingTime] = React.useState<string>('00:00');
  
  React.useEffect(() => {
    let t: any = null;
    const update = () => {
      const start = call.startedAt || Date.now();
      const diff = Math.max(0, Date.now() - start);
      const s = Math.floor(diff / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      setElapsed(`${mm}:${ss}`);
    };
    if (isActive) {
      update();
      t = setInterval(update, 1000);
    } else {
      setElapsed('00:00');
    }
    return () => { if (t) clearInterval(t); };
  }, [call.startedAt, isActive]);

  // Timer for calling/ringing states
  React.useEffect(() => {
    let t: any = null;
    const update = () => {
      const start = call.startedAt || Date.now();
      const diff = Math.max(0, Date.now() - start);
      const s = Math.floor(diff / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      setSignalingTime(`${mm}:${ss}`);
    };
    if (isOutgoing || isIncoming) {
      update();
      t = setInterval(update, 1000);
    } else {
      setSignalingTime('00:00');
    }
    return () => { if (t) clearInterval(t); };
  }, [call.startedAt, isOutgoing, isIncoming]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto', background: 'linear-gradient(135deg,rgba(15,17,19,0.95),rgba(10,12,15,0.98))' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 50%, rgba(33,150,243,0.05), transparent 50%), radial-gradient(circle at 70% 50%, rgba(244,67,54,0.03), transparent 50%)' }} />
      
      {isEnded ? (
        // Full-screen ended panel
        <div style={{ position: 'relative', width: '100%', maxWidth: '100vw', height: '100vh', zIndex: 2010, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          {/* Animated background circles */}
          <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: call.endedReason === 'declined' ? 'radial-gradient(circle, rgba(239,68,68,0.1), transparent)' : 'radial-gradient(circle, rgba(34,197,94,0.1), transparent)', top: '20%', left: '15%', animation: 'float 6s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', width: 250, height: 250, borderRadius: '50%', background: 'radial-gradient(circle, rgba(33,150,243,0.08), transparent)', bottom: '15%', right: '10%', animation: 'float 8s ease-in-out infinite' }} />

          {/* Main content */}
          <div style={{ position: 'relative', zIndex: 2011, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* Status icon with animation */}
            <div style={{ marginBottom: 32, animation: 'scaleIn 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}>
              <div style={{ width: 140, height: 140, borderRadius: '50%', background: call.endedReason === 'declined' ? 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.2))' : 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(22,163,74,0.2))', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `3px solid ${call.endedReason === 'declined' ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)'}`, boxShadow: `0 0 40px ${call.endedReason === 'declined' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)'}` }}>
                <svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke={call.endedReason === 'declined' ? '#ef4444' : '#22c55e'} strokeWidth="2">
                  {call.endedReason === 'declined' ? (
                    <path d="M18 6L6 18M6 6l12 12" />
                  ) : (
                    <path d="M20 6L9 17l-5-5" />
                  )}
                </svg>
              </div>
            </div>

            {/* Status text */}
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 32, marginBottom: 12, letterSpacing: '-0.5px' }}>
              {call.endedReason === 'declined' ? 'Звонок отклонён' : 'Разговор завершён'}
            </div>

            {/* Call duration */}
            <div style={{ color: '#a0aec0', fontSize: 18, fontWeight: 500, marginBottom: 32 }}>
              {call.startedAt && call.endedAt ? (() => {
                const ms = Math.max(0, (call.endedAt || Date.now()) - (call.startedAt || Date.now()));
                const s = Math.floor(ms / 1000);
                const mm = String(Math.floor(s / 60)).padStart(2, '0');
                const ss = String(s % 60).padStart(2, '0');
                return call.endedReason === 'declined' ? 'Вы отклонили звонок' : `Разговор длился ${mm}:${ss}`;
              })() : (call.endedReason === 'declined' ? 'Вы отклонили звонок' : 'Звонок завершён')}
            </div>

            {/* Person info */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 48 }}>
              <img src={call.targetAvatar || '/window.svg'} alt="avatar" style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', background: '#1a1c1f', border: '2px solid rgba(255,255,255,0.1)' }} />
              <div style={{ fontWeight: 600, fontSize: 20, color: '#fff' }}>{call.targetName || 'Неизвестный'}</div>
            </div>

            {/* Close button */}
            <button onClick={onEnd} title="Закрыть" style={{ padding: '14px 32px', borderRadius: 999, background: 'linear-gradient(135deg, rgba(33,150,243,0.2), rgba(33,150,243,0.1))', color: '#81d4fa', border: '1px solid rgba(33,150,243,0.3)', cursor: 'pointer', fontSize: 16, fontWeight: 600, transition: 'all 0.2s', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }} onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(33,150,243,0.3), rgba(33,150,243,0.15))'; e.currentTarget.style.boxShadow = '0 10px 28px rgba(33,150,243,0.1)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(33,150,243,0.2), rgba(33,150,243,0.1))'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)'; }}>
              Закрыть
            </button>
          </div>
        </div>
      ) : (
        // Active call or incoming/outgoing
        <div style={{ position: 'relative', width: 380, maxWidth: '95vw', background: 'linear-gradient(135deg, rgba(20,21,25,0.9), rgba(15,17,19,0.95))', borderRadius: 28, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.05)', color: '#fff', zIndex: 2010, border: '1px solid rgba(255,255,255,0.03)' }}>
          {/* Avatar section with gradient */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}>
              <div style={{ width: 120, height: 120, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(33,150,243,0.2), rgba(156,39,176,0.2))', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(33,150,243,0.3)' }}>
                <img src={call.targetAvatar || '/window.svg'} alt="avatar" style={{ width: 116, height: 116, borderRadius: '50%', objectFit: 'cover', background: '#1a1c1f' }} />
              </div>
              {isActive && (
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: '50%', background: '#22c55e', border: '3px solid rgba(20,21,25,0.95)', animation: 'pulse 2s ease-in-out infinite' }} />
              )}
            </div>
            <div style={{ fontWeight: 700, fontSize: 24, marginBottom: 8, letterSpacing: '-0.5px' }}>{call.targetName || 'Звонок'}</div>
            <div style={{ color: '#a0aec0', fontSize: 15, fontWeight: 500, letterSpacing: '0.3px' }}>
              {isOutgoing ? 'Идёт набор номера...' : isIncoming ? 'Входящий звонок' : isActive ? 'В разговоре' : ''}
            </div>
          </div>

          {/* Timer - only show when in-call and white */}
          {isActive && (
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums' }}>{elapsed}</div>
            </div>
          )}

          {/* Controls */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Incoming: show accept + decline */}
            {isIncoming ? (
              <>
                <button onClick={onAccept} title="Принять" style={{ width: 64, height: 64, borderRadius: '50%', border: 'none', background: 'linear-gradient(135deg, #22c55e, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 10px 30px rgba(34,197,94,0.25), inset 0 1px 2px rgba(255,255,255,0.1)', transition: 'all 0.2s', transform: 'scale(1)' }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </button>
                <button onClick={onEnd} title="Отклонить" style={{ width: 64, height: 64, borderRadius: '50%', border: 'none', background: 'linear-gradient(135deg, #ef4444, #dc2626)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 10px 30px rgba(239,68,68,0.25), inset 0 1px 2px rgba(255,255,255,0.1)', transition: 'all 0.2s', transform: 'scale(1)' }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" style={{ transform: 'rotate(135deg)' }} />
                  </svg>
                </button>
              </>
            ) : (
              // normal in-call controls
              <>
                {/* Mute/unmute */}
                <button onClick={onToggleMute} title={muted ? 'Включить микрофон' : 'Выключить микрофон'} style={{ width: 56, height: 56, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.08)', background: muted ? 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.15))' : 'linear-gradient(135deg, rgba(100,116,139,0.2), rgba(71,85,105,0.15))', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.opacity = '0.8'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={muted ? '#ef4444' : '#94a3b8'} strokeWidth="2">
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
                <button onClick={onMinimize} title="Свернуть" style={{ width: 56, height: 56, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.08)', background: 'linear-gradient(135deg, rgba(100,116,139,0.2), rgba(71,85,105,0.15))', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.opacity = '0.8'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                    <polyline points="4 14 10 14 10 20"></polyline>
                    <path d="M4 14L4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8"></path>
                  </svg>
                </button>

                {/* End call */}
                <button onClick={onEnd} title="Завершить" style={{ width: 64, height: 64, borderRadius: '50%', border: 'none', background: 'linear-gradient(135deg, #ef4444, #dc2626)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 10px 30px rgba(239,68,68,0.25), inset 0 1px 2px rgba(255,255,255,0.1)', transition: 'all 0.2s', transform: 'scale(1)' }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" style={{ transform: 'rotate(135deg)' }} />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      )}

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
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
          50% { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [call, setCall] = useState<CallState | null>(null);
  const callRef = useRef<CallState | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [muted, setMuted] = useState(false);
  const STORAGE_KEY = 'linker.callState';
  const audioStreamRef = React.useRef<MediaStream | null>(null);
  const audioElRef = React.useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const { data: session } = useSession();
  const pusherClient = typeof window !== 'undefined' ? getPusherClient() : null;

  const startCall = useCallback((opts: { type: CallType; targetId: string; targetName?: string; targetAvatar?: string }) => {
    const c: CallState = {
      id: String(Date.now()) + Math.random().toString(36).slice(2, 8),
      type: opts.type,
      targetId: opts.targetId,
      targetName: opts.targetName,
      targetAvatar: opts.targetAvatar,
      status: 'calling',
      // keep startedAt for caller as a placeholder; when the call becomes active we'll reset it to the actual connect time
      startedAt: Date.now(),
    };
    setCall(c);
    callRef.current = c;
  // persist initial call state
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ call: c, minimized: false, muted: false })); } catch (e) {}
    setMinimized(false);

    (async () => {
      try {
        // acquire local audio
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        audioStreamRef.current = stream;

        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        pcRef.current = pc;

        // add local tracks
        stream.getTracks().forEach(t => pc.addTrack(t, stream));

  // collect remote tracks
  const remoteStream = new MediaStream();
  remoteStreamRef.current = remoteStream;
  pc.ontrack = (ev) => { try { if (ev.streams && ev.streams[0]) { remoteStreamRef.current = ev.streams[0]; if (audioElRef.current) { try { audioElRef.current.srcObject = remoteStreamRef.current; audioElRef.current.play().catch(()=>{}); } catch {} } } } catch (e) {} };

        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            try {
              fetch('/api/calls/candidate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: opts.targetId, candidate: ev.candidate, from: (session?.user as any)?.id }) });
            } catch (e) {}
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // send offer to callee via server (Pusher relay)
  await fetch('/api/calls/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: opts.targetId, sdp: offer.sdp, from: (session?.user as any)?.id, fromName: (session?.user as any)?.link || (session?.user as any)?.login || (session?.user as any)?.name, fromAvatar: (session?.user as any)?.avatar }) });
      } catch (e) {
        console.error('startCall WebRTC init failed', e);
      }
    })();
  }, [session]);

  const receiveIncomingCall = useCallback((c: CallState) => {
    const next = { ...c, status: 'ringing' } as CallState;
    setCall(next);
    callRef.current = next;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ call: next, minimized: false, muted })); } catch (e) {}
    setMinimized(false);
  }, []);

  const acceptCall = useCallback(async () => {
    // mark call as active and set startedAt to the moment of acceptance so both sides show consistent timer
    setCall(prev => {
      const now = Date.now();
      const next = prev ? ({ ...prev, status: 'in-call', startedAt: now } as CallState) : prev;
      callRef.current = next as CallState | null;
      try { if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify({ call: next, minimized: false, muted })); } catch (e) {}
      return next as CallState | null;
    });
    setMinimized(false);
    try {
      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = localStream;
      audioStreamRef.current = localStream;

      let pc = pcRef.current;
      if (!pc) {
        pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        pcRef.current = pc;

        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            try { fetch('/api/calls/candidate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: callRef.current?.targetId, candidate: ev.candidate }) }); } catch (e) {}
          }
        };

  const remoteStream = new MediaStream();
  remoteStreamRef.current = remoteStream;
  pc.ontrack = (ev) => { try { if (ev.streams && ev.streams[0]) { remoteStreamRef.current = ev.streams[0]; if (audioElRef.current) { try { audioElRef.current.srcObject = remoteStreamRef.current; audioElRef.current.play().catch(()=>{}); } catch {} } } } catch (e) {} };
      }

      localStream.getTracks().forEach(t => pc!.addTrack(t, localStream));

      const answer = await pc!.createAnswer();
      await pc!.setLocalDescription(answer);
      // send answer to caller (use callRef to ensure we have the correct target id in race conditions)
      try {
        await fetch('/api/calls/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: callRef.current?.targetId, sdp: answer.sdp, from: (session?.user as any)?.id }) });
      } catch (e) {}
    } catch (e) {
      console.warn('acceptCall failed', e);
    }
  }, [muted]);

  const endCall = useCallback(() => {
    setCall(prev => {
      try {
        if (prev) {
          const endedAt = Date.now();
          const wasInCall = prev.status === 'in-call';
          const reason: 'declined' | 'ended' = prev.status === 'ringing' ? 'declined' : 'ended';
          // notify remote party about end/decline
          try {
            if ((prev.targetId) && typeof window !== 'undefined') {
              fetch('/api/calls/end', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: prev.targetId, from: (session as any)?.user?.id, reason }) }).catch(()=>{});
            }
          } catch (e) {}
          // dispatch a global event so pages (chat) can insert system messages (missed/ended)
          try {
            window.dispatchEvent(new CustomEvent('call-ended', { detail: { targetId: prev.targetId, targetName: prev.targetName, startedAt: prev.startedAt, endedAt, wasInCall } }));
          } catch (e) {}
          // return updated call with end metadata so UI can show an ended panel briefly
          const next = ({ ...prev, status: 'ended', endedAt, endedReason: reason } as CallState);
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ call: next, minimized: false, muted })); } catch (e) {}
          return next;
        }
      } catch (e) {}
      return prev ? { ...prev, status: 'ended' } : prev;
    });

    // stop any acquired audio tracks
    try {
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(t => t.stop());
        audioStreamRef.current = null;
      }
    } catch (e) {}
    // close peer connection and hide after a short delay
    try {
      if (pcRef.current) {
        try { pcRef.current.getSenders().forEach(s => { try { s.track && s.track.stop(); } catch {} }); } catch {}
        pcRef.current.close();
        pcRef.current = null;
      }
      if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
      if (remoteStreamRef.current) { remoteStreamRef.current.getTracks().forEach(t => t.stop()); remoteStreamRef.current = null; }
    } catch (e) {}

    // pick a visible duration for the ended panel: longer when declined so user sees 'Звонок отклонён'
    setTimeout(() => {
      setCall(null);
      setMuted(false);
      setMinimized(false);
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    }, 2200);
  }, [session]);

  const toggleMute = useCallback(() => {
    setMuted(m => {
      const next = !m;
      try {
        if (audioStreamRef.current) {
          audioStreamRef.current.getAudioTracks().forEach(t => (t.enabled = !next ? true : false));
        }
      } catch (e) {}
      try { // persist mute change
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.muted = next;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        }
      } catch (e) {}
      return next;
    });
  }, []);

  const minimizeCall = useCallback(() => {
    setMinimized(true);
    try { const stored = localStorage.getItem(STORAGE_KEY); if (stored) { const parsed = JSON.parse(stored); parsed.minimized = true; localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed)); } } catch (e) {}
  }, []);

  const restoreCall = useCallback(() => {
    setMinimized(false);
    try { const stored = localStorage.getItem(STORAGE_KEY); if (stored) { const parsed = JSON.parse(stored); parsed.minimized = false; localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed)); } } catch (e) {}
  }, []);

  // detect mobile for tray styling
  const [isMobileTray, setIsMobileTray] = useState(false);
  useEffect(() => {
    const check = () => setIsMobileTray(typeof window !== 'undefined' && window.innerWidth <= 520);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // allow incoming-call global event to be dispatched from elsewhere (e.g., pusher handler)
  useEffect(() => {
    const handler = (e: any) => {
      try {
        const detail = e.detail as CallState;
        if (!detail) return;
        receiveIncomingCall(detail);
      } catch (e) {}
    };
    window.addEventListener('incoming-call', handler as any);
    return () => window.removeEventListener('incoming-call', handler as any);
  }, [receiveIncomingCall]);

  // rehydrate from localStorage on mount so tray persists across navigation/refresh
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.call && parsed.call.status !== 'ended') {
          setCall(parsed.call as CallState);
          setMinimized(Boolean(parsed.minimized));
          setMuted(Boolean(parsed.muted));
        } else {
          // if ended, remove stale storage
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (e) {}
    // listen storage changes from other tabs
    const onStorage = (ev: StorageEvent) => {
      try {
        if (ev.key !== STORAGE_KEY) return;
        if (!ev.newValue) { setCall(null); setMinimized(false); setMuted(false); return; }
        const parsed = JSON.parse(ev.newValue);
        if (parsed?.call && parsed.call.status !== 'ended') {
          setCall(parsed.call as CallState);
          setMinimized(Boolean(parsed.minimized));
          setMuted(Boolean(parsed.muted));
        } else {
          setCall(null); setMinimized(false); setMuted(false);
        }
      } catch (e) {}
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Pusher-based signaling: subscribe to incoming webrtc events for this user
  useEffect(() => {
    try {
      if (!pusherClient) return;
      if (!session || !(session.user as any)?.id) return;
      const channelName = `user-${(session.user as any).id}`;
      const channel = pusherClient.subscribe(channelName);

      const onOffer = async (data: any) => {
        try {
          const from = data.from as string;
          const sdp = data.sdp as string;
          const callerName = data.fromName as string;
          const callerAvatar = data.fromAvatar as string;
          // determine if we are already calling this user (simultaneous call)
          const alreadyCalling = !!(callRef.current && callRef.current.status === 'calling' && callRef.current.targetId === from);
          const initialStatus: CallState['status'] = alreadyCalling ? 'ringing' : 'ringing';
          const displayName = getFriendDisplayName(from, callerName);
          setCall({ id: String(Date.now()), type: 'phone', targetId: from, targetName: displayName, targetAvatar: callerAvatar, status: initialStatus, startedAt: Date.now() });
          callRef.current = { id: String(Date.now()), type: 'phone', targetId: from, targetName: displayName, targetAvatar: callerAvatar, status: initialStatus, startedAt: Date.now() };

          // prepare pc and set remote description so acceptCall can answer
          const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
          pcRef.current = pc;

          pc.onicecandidate = (ev) => {
            if (ev.candidate) {
              try { fetch('/api/calls/candidate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: from, candidate: ev.candidate, from: (session?.user as any)?.id }) }); } catch (e) {}
            }
          };

          const remoteStream = new MediaStream();
          remoteStreamRef.current = remoteStream;
          pc.ontrack = (ev) => { try { if (ev.streams && ev.streams[0]) { remoteStreamRef.current = ev.streams[0]; if (audioElRef.current) { try { audioElRef.current.srcObject = remoteStreamRef.current; audioElRef.current.play().catch(()=>{}); } catch {} } } } catch (e) {} };

          await pc.setRemoteDescription({ type: 'offer', sdp } as RTCSessionDescriptionInit);
          // If both sides initiated calls to each other, auto-accept to get both sides into in-call state
          if (alreadyCalling) {
            try { await acceptCall(); } catch (e) { /* ignore */ }
          }
        } catch (e) {
          console.error('onOffer handler error', e);
        }
      };

      const onAnswer = async (data: any) => {
        try {
          const sdp = data.sdp as string;
          if (!pcRef.current) return;
          await pcRef.current.setRemoteDescription({ type: 'answer', sdp } as RTCSessionDescriptionInit);
          // mark call as in-call (caller side) and set startedAt to the connect time so both sides show consistent timer
          const now = Date.now();
          setCall(prev => {
            const next = prev ? { ...prev, status: 'in-call', startedAt: now } as CallState : prev;
            callRef.current = next as CallState | null;
            try { if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify({ call: next, minimized: minimized, muted })); } catch (e) {}
            return next;
          });
        } catch (e) { console.error('onAnswer error', e); }
      };

      const onCandidate = async (data: any) => {
        try {
          const cand = data.candidate;
          if (!cand) return;
          if (!pcRef.current) return;
          try { await pcRef.current.addIceCandidate(cand); } catch (e) {}
        } catch (e) {}
      };

      channel.bind('webrtc-offer', onOffer);
      channel.bind('webrtc-answer', onAnswer);
      channel.bind('webrtc-candidate', onCandidate);
      // remote ended/declined
      const onEnd = (data: any) => {
        try {
          const reason = data?.reason as string | undefined;
          // set local call state to ended
          setCall(prev => prev ? { ...prev, status: 'ended', endedAt: Date.now(), endedReason: reason === 'declined' ? 'declined' : 'ended' } : prev);
          // dispatch global event so chat pages can show system message
          try {
            const wasInCall = reason === 'ended';
            window.dispatchEvent(new CustomEvent('call-ended', { detail: { targetId: data.from, targetName: undefined, startedAt: undefined, endedAt: Date.now(), wasInCall } }));
          } catch (e) {}
          // cleanup local media/pc without notifying remote (we already received remote end)
          try {
            if (audioStreamRef.current) { audioStreamRef.current.getTracks().forEach(t=>t.stop()); audioStreamRef.current = null; }
          } catch (e) {}
          try {
            if (pcRef.current) { try { pcRef.current.getSenders().forEach(s=>{ try { s.track && s.track.stop(); } catch{} }); } catch{}; pcRef.current.close(); pcRef.current = null; }
          } catch (e) {}
          try { if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t=>t.stop()); localStreamRef.current = null; } } catch (e) {}
          try { if (remoteStreamRef.current) { remoteStreamRef.current.getTracks().forEach(t=>t.stop()); remoteStreamRef.current = null; } } catch (e) {}
          // allow ended-panel to show briefly, then clear
          try {
            const delay = (reason === 'declined') ? 2200 : 1200;
            setTimeout(() => { try { setCall(null); setMuted(false); setMinimized(false); } catch {} }, delay);
          } catch (e) {}
        } catch (e) {}
      };
      channel.bind('webrtc-end', onEnd);

      return () => {
        try { channel.unbind('webrtc-offer', onOffer); } catch (e) {}
        try { channel.unbind('webrtc-answer', onAnswer); } catch (e) {}
        try { channel.unbind('webrtc-candidate', onCandidate); } catch (e) {}
        try { channel.unbind('webrtc-end', onEnd); } catch (e) {}
        try { pusherClient.unsubscribe(channelName); } catch (e) {}
      };
    } catch (e) {}
  }, [pusherClient, session]);


  const value = useMemo((): CallContextValue => ({ call, startCall, receiveIncomingCall, acceptCall, endCall, minimizeCall, restoreCall, toggleMute, muted, minimized }), [call, startCall, receiveIncomingCall, acceptCall, endCall, minimizeCall, restoreCall, toggleMute, muted, minimized]);

  // keep ref in sync with state for immediate-read scenarios
  useEffect(() => { callRef.current = call; }, [call]);

  // elapsed timer for tray when minimized — show running time when in-call
  const [trayElapsed, setTrayElapsed] = useState<string>('00:00');
  useEffect(() => {
    let t: any = null;
    const update = () => {
      const started = call?.startedAt || callRef.current?.startedAt;
      if (!started || call?.status !== 'in-call') { setTrayElapsed('00:00'); return; }
      const diff = Math.max(0, Date.now() - started);
      const s = Math.floor(diff / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      setTrayElapsed(`${mm}:${ss}`);
    };
    if (call && call.status === 'in-call') {
      update();
      t = setInterval(update, 1000);
    } else {
      setTrayElapsed('00:00');
    }
    return () => { if (t) clearInterval(t); };
  }, [call?.status, call?.startedAt]);

  return (
    <CallContext.Provider value={value}>
      {children}
      {/* hidden audio element for remote playback */}
      <audio ref={audioElRef} autoPlay style={{ display: 'none' }} />
      {/* Render call overlay and tray */}
      {call && !minimized && (
        <CallWindow call={call} onAccept={acceptCall} onEnd={endCall} onMinimize={minimizeCall} muted={muted} onToggleMute={toggleMute} />
      )}
      {call && minimized && call.status !== 'ended' && (
        isMobileTray ? (
          // Mobile: compact minimized view
          <div style={{ position: 'fixed', left: '50%', bottom: 16, transform: 'translateX(-50%)', zIndex: 2100 }}>
            <button onClick={restoreCall} title="Вернуться к звонку" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 999, background: 'linear-gradient(135deg, rgba(33,150,243,0.15), rgba(33,150,243,0.05))', color: '#fff', border: '1px solid rgba(33,150,243,0.2)', cursor: 'pointer', boxShadow: '0 12px 32px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(33,150,243,0.25), rgba(33,150,243,0.1))'; e.currentTarget.style.boxShadow = '0 14px 36px rgba(33,150,243,0.15), inset 0 1px 1px rgba(255,255,255,0.08)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(33,150,243,0.15), rgba(33,150,243,0.05))'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.05)'; }}>
              <div style={{ position: 'relative', width: 32, height: 32 }}>
                <img src={call.targetAvatar || '/phonecall.svg'} alt="a" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', background: '#1a1c1f' }} />
                <div style={{ position: 'absolute', top: -2, right: -2, width: 12, height: 12, borderRadius: '50%', background: '#22c55e', border: '2px solid rgba(0,0,0,0.6)' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.2 }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>{call.targetName ? call.targetName.substring(0, 10) : 'Звонок'}</div>
                <div style={{ color: '#81d4fa', fontSize: 11, fontWeight: 500 }}>{call.status === 'in-call' ? trayElapsed : 'Идёт звонок'}</div>
              </div>
            </button>
          </div>
        ) : (
          // Desktop: beautiful minimized card
          <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 2100 }}>
            <button onClick={restoreCall} title="Вернуться к звонку" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px 14px 14px', borderRadius: 16, background: 'linear-gradient(135deg, rgba(33,150,243,0.12), rgba(33,150,243,0.04))', color: '#fff', border: '1px solid rgba(33,150,243,0.2)', cursor: 'pointer', boxShadow: '0 16px 40px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)', transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)' }} onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(33,150,243,0.18), rgba(33,150,243,0.08))'; e.currentTarget.style.boxShadow = '0 18px 46px rgba(33,150,243,0.12), inset 0 1px 1px rgba(255,255,255,0.08)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(33,150,243,0.12), rgba(33,150,243,0.04))'; e.currentTarget.style.boxShadow = '0 16px 40px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.05)'; }}>
              <div style={{ position: 'relative' }}>
                <img src={call.targetAvatar || '/window.svg'} alt="a" style={{ width: 50, height: 50, borderRadius: '12px', objectFit: 'cover', background: '#1a1c1f', border: '1px solid rgba(255,255,255,0.05)' }} />
                <div style={{ position: 'absolute', bottom: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: '#22c55e', border: '2px solid rgba(20,21,25,0.95)', boxShadow: '0 2px 8px rgba(34,197,94,0.3)' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.3px' }}>{call.targetName || 'Звонок'}</div>
                <div style={{ color: '#81d4fa', fontSize: 12, fontWeight: 500, marginTop: 2 }}>{call.status === 'in-call' ? trayElapsed : (call.type === 'phone' ? 'Телефонный звонок' : 'Видеозвонок')}</div>
              </div>
            </button>
          </div>
        )
      )}
    </CallContext.Provider>
  );
};

export default CallProvider;
