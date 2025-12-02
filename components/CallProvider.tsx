import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getPusherClient } from '../lib/pusher';
import { getFriendDisplayName } from '../lib/hooks';
import CallTray from './CallTray';
import CallWindowUI from './CallWindowUI';

type CallType = 'phone' | 'video';
type CallState = {
  id: string;
  type: CallType;
  targetId?: string;
  targetName?: string;
  targetAvatar?: string;
  status: 'calling' | 'ringing' | 'connecting' | 'in-call' | 'ended';
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

  // Timer for active call - show running time when in-call
  const [elapsed, setElapsed] = useState<string>('00:00');
  useEffect(() => {
    let t: any = null;
    const update = () => {
      const start = call?.startedAt || Date.now();
      const diff = Math.max(0, Date.now() - start);
      const s = Math.floor(diff / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      setElapsed(`${mm}:${ss}`);
    };
    if (call && call.status === 'in-call') {
      update();
      t = setInterval(update, 1000);
    } else {
      setElapsed('00:00');
    }
    return () => { if (t) clearInterval(t); };
  }, [call?.status, call?.startedAt]);

  // Timer for calling/ringing states
  const [signalingTime, setSignalingTime] = useState<string>('00:00');
  useEffect(() => {
    let t: any = null;
    const update = () => {
      const start = call?.startedAt || Date.now();
      const diff = Math.max(0, Date.now() - start);
      const s = Math.floor(diff / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      setSignalingTime(`${mm}:${ss}`);
    };
    if (call && (call.status === 'calling' || call.status === 'ringing')) {
      update();
      t = setInterval(update, 1000);
    } else {
      setSignalingTime('00:00');
    }
    return () => { if (t) clearInterval(t); };
  }, [call?.status, call?.startedAt]);

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
        <CallWindowUI
          targetName={call.targetName}
          targetAvatar={call.targetAvatar}
          status={call.status}
          type={call.type}
          elapsed={elapsed}
          signalingTime={signalingTime}
          muted={muted}
          endedReason={call.endedReason}
          startedAt={call.startedAt}
          endedAt={call.endedAt}
          onAccept={acceptCall}
          onEnd={endCall}
          onMinimize={minimizeCall}
          onToggleMute={toggleMute}
        />
      )}
      {call && minimized && call.status !== 'ended' && (
        <CallTray
          callState={call.status as any}
          targetName={call.targetName}
          targetAvatar={call.targetAvatar}
          elapsed={trayElapsed}
          onRestore={restoreCall}
          isMobile={isMobileTray}
        />
      )}
    </CallContext.Provider>
  );
};

export default CallProvider;
