import "../styles/globals.css";
import Head from "next/head";
import type { AppProps } from "next/app";
import dynamic from "next/dynamic";
import { SessionProvider, useSession, signOut } from "next-auth/react";
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { AnimatePresence, motion } from 'framer-motion';
import { SWRConfig, mutate } from "swr";
import CallProvider from '../components/CallProvider';
import { swrConfig, profileKey, chatsKey, messagesKey } from "../lib/hooks";
import { Toaster, toast } from 'react-hot-toast';
import { MessageToast } from '../components/MessageToast';
import ToastNotification from '../components/ToastNotification';
import { getPusherClient } from '../lib/pusher';
import { getUser as getLocalUser } from '../lib/session';
import GuideModal from '../components/GuideModal';

const Sidebar = dynamic(() => import("../components/Sidebar"), { ssr: false });

function MainApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [bottomToast, setBottomToast] = useState<null | { type: 'error' | 'success'; message: string; duration?: number; actions?: any[] }>(null);
  const [showGuide, setShowGuide] = useState(false);
  const guideShownRef = useRef(false);

  // Главная страница доступна всем, редирект убран
  const hideSidebarRoutes = ["/auth/login", "/auth/register", "/", "/chat/[id]"];
  const showSidebar = !hideSidebarRoutes.includes(router.pathname);

    // Elms Sans should be applied only on specific pages. We'll whitelist routes.
    const elmsRoutes = new Set([
      '/friends',
      '/profile',
      '/chat',
      '/chat/[id]',
      '/profile/[id]'
    ]);
    const useElms = elmsRoutes.has(router.pathname);

  useEffect(() => {
    if (!session?.user?.id) return;
    const userId = (session.user as any).id;
    let cancelled = false;

    const prefetchData = async (showToast: boolean) => {
      // show a persistent bottom loading toast while we prefetch user data if requested
      if (showToast) setBottomToast({ type: 'success', message: 'Загрузка данных...', duration: 60000 });
      // prefetch profile
      try {
        const pKey = profileKey(userId);
        const profileRes = await fetch(pKey, { credentials: 'include' });
        const profileJson = await profileRes.json().catch(() => null);
        if (!cancelled) await mutate(pKey, profileJson, false);
        
        // Check if user has completed the first login guide
        if (profileJson && profileJson.user && !profileJson.user.firstLoginDone && !guideShownRef.current) {
          guideShownRef.current = true;
          // Show guide after 3 seconds delay
          setTimeout(() => {
            if (!cancelled) setShowGuide(true);
          }, 3000);
        }
        
        // if we got a profile, save it to local storage so Sidebar and other local helpers can pick it up
        try {
          if (profileJson && profileJson.user) {
            // save to local session cache and notify listeners
            try { (await import('../lib/session')).saveUser(profileJson.user); } catch (e) {}
            try { window.dispatchEvent(new Event('profile-updated')); } catch (e) {}
          }
        } catch (e) {}
      } catch (e) {}

      // prefetch chats and recent messages for top chats
      try {
        const chatsRes = await fetch(chatsKey, { credentials: 'include' });
        const chatsJson = await chatsRes.json().catch(() => null);
        if (!cancelled) await mutate(chatsKey, chatsJson, false);

  const chatsList = (chatsJson && (chatsJson.chats || chatsJson)) || [];
        const top = chatsList.slice(0, 6);
        await Promise.all(
          top.map(async (c: any) => {
            try {
              const mKey = messagesKey(c.id);
              const mRes = await fetch(mKey, { credentials: 'include' });
              const mJson = await mRes.json().catch(() => null);
              if (!cancelled) await mutate(mKey, mJson, false);
            } catch (e) {}
          })
        );
        // If user is on the homepage, redirect them to the chats page so chats are visible immediately
        try {
          if (router.pathname === '/' ) {
            router.replace('/profile');
          }
        } catch (e) {}
        // done prefetching — dismiss the bottom loading toast and show success briefly if we showed it
        try { if (showToast) { setBottomToast(null); setBottomToast({ type: 'success', message: 'Данные загружены', duration: 2000 }); } } catch (e) {}
      } catch (e) {}
      finally {
        // ensure we dismiss the bottom toast if something threw earlier
        try { if (showToast) setBottomToast(null); } catch (e) {}
      }
    };

    // Run a silent prefetch on mount (no bottom toast)
    prefetchData(false);

    // Also listen for explicit 'user-login' events and show the bottom toast only then
    const onUserLogin = () => { prefetchData(true); };
    window.addEventListener('user-login', onUserLogin);

    return () => {
      cancelled = true;
      window.removeEventListener('user-login', onUserLogin);
    };
  }, [session?.user?.id]);

  /* Removed automatic sign-out/toast for 'ban' role — role is no longer handled client-side */

  /* Removed route-change blocking for 'ban' role — navigation is no longer blocked client-side */

  // Global Pusher listener for incoming messages -> show toast on any page
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthFallbackRef = useRef<boolean>(false);
  const audioContextRef = useRef<any>(null);
  const audioBufferRef = useRef<any>(null);

  // Try to detect whether notification file exists; if not, enable synth fallback
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/sounds/notification.mp3', { method: 'HEAD' });
        if (!mounted) return;
        if (!res.ok) {
          // try fallback path
          const res2 = await fetch('/sound/notification.mp3', { method: 'HEAD' });
          synthFallbackRef.current = !res2.ok;
        } else {
          synthFallbackRef.current = false;
        }
        // If we have a real file, try to prefetch and decode it into an AudioBuffer for low-latency playback.
        if (!synthFallbackRef.current) {
          try {
            // Create AudioContext if possible (some browsers restrict before user gesture but decoding is usually allowed)
            if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            const audioUrl = res.ok ? '/sounds/notification.mp3' : '/sound/notification.mp3';
            // Fetch the file as arrayBuffer and decode once
            const abResp = await fetch(audioUrl);
            if (abResp.ok) {
              const arrayBuffer = await abResp.arrayBuffer();
              try {
                const decoded = await audioContextRef.current.decodeAudioData(arrayBuffer.slice(0));
                audioBufferRef.current = decoded;
              } catch (dErr) {
                // decodeAudioData may reject on some browsers; fall back to audio element preload
                try { if (audioRef.current) audioRef.current.preload = 'auto'; } catch (e) {}
              }
            }
          } catch (e) {
            // ignore prefetch/decode errors
          }
        }
      } catch (e) {
        synthFallbackRef.current = true;
      }
    })();
    return () => { mounted = false; };
  }, []);

  const playSynth = () => {
    try {
      if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioContextRef.current;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.value = 0.05;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      setTimeout(() => { try { o.stop(); } catch (e) {} }, 150);
    } catch (e) {
      // last-resort no-op
    }
  };

  const playSound = async () => {
    try {
      if (synthFallbackRef.current) {
        playSynth();
        return;
      }
      // Prefer decoded AudioBuffer playback for lowest latency if available
      if (audioBufferRef.current && (audioContextRef.current || (audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()))) {
        try {
          const ctx = audioContextRef.current;
          const src = ctx.createBufferSource();
          src.buffer = audioBufferRef.current;
          const g = ctx.createGain();
          g.gain.value = 0.12;
          src.connect(g);
          g.connect(ctx.destination);
          src.start();
          // auto-stop after short duration to avoid leaks
          setTimeout(() => { try { src.stop(); } catch (e) {} }, 1000);
          return;
        } catch (e) {
          // fallback to audio element below
        }
      }
      const audio = audioRef.current;
      if (audio) {
        // ensure preloaded if possible
        try { audio.preload = 'auto'; } catch (e) {}
        const p = audio.play();
        if (p && typeof p.then === 'function') {
          await p.catch(() => {
            // autoplay blocked — fallback to synth
            playSynth();
          });
        }
      } else {
        playSynth();
      }
    } catch (e) {
      playSynth();
    }
  };
  useEffect(() => {
    if (!session?.user?.id) return;
    const userId = (session.user as any).id;
    const channelName = `user-${userId}`;

    try {
      const pusherClient = getPusherClient();
      if (!pusherClient) return;
      const channel = pusherClient.subscribe(channelName);
  const handler = (data: any) => {
        // data expected: { chatId, senderId, senderAvatar, senderName, senderRole?, content }
        // if user currently viewing the same chat, skip the toast
        try {
          const onChatPage = router.pathname === '/chat/[id]';
          const currentChatId = onChatPage ? String(router.query.id || '') : '';
          if (onChatPage && currentChatId && data.chatId && String(data.chatId) === currentChatId) {
            // optionally still play sound? we skip toast to avoid duplication
            return;
          }
        } catch (e) {}

        (async () => {
          try { playSound(); } catch (e) {}

          // The server intentionally doesn't include plaintext in the user-level pusher payload.
          // If `data.content` is missing, fetch the last message for the chat and use that decrypted text.
          let messageText = '';
          try {
            if (data.content && typeof data.content === 'string' && data.content.trim()) {
              messageText = data.content;
            } else if (data.chatId) {
              const resp = await fetch(`/api/messages?chatId=${encodeURIComponent(String(data.chatId))}&limit=60`, { credentials: 'include' });
              if (resp.ok) {
                const json = await resp.json().catch(() => null);
                const msgs = (json && json.messages) || [];
                if (Array.isArray(msgs) && msgs.length) {
                  const last = msgs[msgs.length - 1];
                  messageText = last && (last.text || last.message || '') ? (last.text || last.message || '') : '';
                }
              }
            }
          } catch (e) {
            // ignore fetch errors and show empty message if we couldn't load plaintext
            console.warn('Failed to fetch last message for toast', e);
          }

          toast.custom(
            (t) => (
              <MessageToast
                t={t}
                avatar={data.senderAvatar || '/media/linker/hello.png'}
                username={data.senderName || 'Новый пользователь'}
                role={data.senderRole}
                message={messageText || ''}
                chatId={data.chatId}
              />
            ),
            { position: 'bottom-right', duration: 7000 }
          );
        })();
      };

      channel.bind('new-message', handler);

      return () => {
        try { channel.unbind('new-message', handler); } catch (e) {}
        try { pusherClient.unsubscribe(channelName); } catch (e) {}
      };
    } catch (e) {
      // ignore
    }
  }, [session?.user?.id]);

  // Sliding session refresh on user activity.
  // We'll call /api/auth/session (no-store) to force NextAuth to refresh the JWT when updateAge=0.
  // Throttle calls to once every 25 seconds to avoid spamming the server.
  useEffect(() => {
    if (!session) return;
    let mounted = true;
    const lastRef = { last: 0 } as { last: number };

    const doRefresh = async () => {
      try {
        const now = Date.now();
        if (now - lastRef.last < 25_000) return; // throttle 25s
        lastRef.last = now;
        // call NextAuth session endpoint to force refresh (updateAge=0 will make backend refresh)
        await fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' }).catch(() => null);
      } catch (e) {
        // ignore
      }
    };

    const onActivity = () => {
      if (!mounted) return;
      void doRefresh();
    };

    // Listen to a set of user interactions
    window.addEventListener('mousemove', onActivity);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('click', onActivity);
    window.addEventListener('touchstart', onActivity);
    window.addEventListener('scroll', onActivity, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') onActivity();
    });

    // also refresh once on mount
    void doRefresh();

    return () => {
      mounted = false;
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('click', onActivity);
      window.removeEventListener('touchstart', onActivity);
      window.removeEventListener('scroll', onActivity);
    };
  }, [session]);

  const handleGuideClose = async () => {
    setShowGuide(false);
    // Update user's firstLoginDone flag
    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstLoginDone: true })
      });
    } catch (e) {
      console.error('Failed to update firstLoginDone:', e);
    }
  };

  return (
    <div className={useElms ? 'use-elms-sans' : ''}>
      <Head>
        <title>Linker Social</title>
        {/* Mobile meta tags for responsive layout and theme color */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#0f1214" />
          {/* Load Elms Sans early (preconnect + stylesheet) on the whitelisted pages */}
          {useElms && (
            <>
              <link rel="preconnect" href="https://fonts.googleapis.com" />
              <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
              <link href="https://fonts.googleapis.com/css2?family=Elms+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
            </>
          )}
            {/* Load JetBrains Mono font so it's available for code blocks / monospace sections. */}
            <>
              <link rel="preconnect" href="https://fonts.googleapis.com" />
              <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
              <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@200;300;400;500;600;700&display=swap" rel="stylesheet" />
            </>

            {/* Load Roboto as the default UI font */}
            <>
              <link rel="preconnect" href="https://fonts.googleapis.com" />
              <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
              <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet" />
            </>
        {/* reCAPTCHA script moved to registration page to avoid loading globally */}
      </Head>
      {showSidebar && <Sidebar />}
      {/* Apply app pages with route transitions; the surrounding div toggles fonts. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={router.asPath}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: [0.2, 0.9, 0.2, 1] }}
          style={{ willChange: 'opacity, transform' }}
        >
          <Component {...pageProps} />
        </motion.div>
      </AnimatePresence>
      {bottomToast && (
        <ToastNotification
          type={bottomToast.type}
          message={bottomToast.message}
          duration={bottomToast.duration}
          onClose={() => setBottomToast(null)}
          actions={bottomToast.actions}
        />
      )}
      <GuideModal isOpen={showGuide} onClose={handleGuideClose} />
      <Toaster position="top-right" />
      {/* Audio fallback: try /sounds first (existing), then /sound */}
      <audio ref={audioRef} preload="none">
        <source src="/sounds/notification.mp3" />
        <source src="/sound/notification.mp3" />
        Your browser does not support the audio element.
      </audio>
    </div>
  );
}

export default function App(props: AppProps) {
  return (
    // Tune session polling to be less chatty. refetchInterval is in seconds.
    <SessionProvider session={props.pageProps.session} refetchInterval={300} refetchOnWindowFocus={false}>
      <SWRConfig value={swrConfig}>
        <CallProvider>
          <MainApp {...props} />
        </CallProvider>
      </SWRConfig>
    </SessionProvider>
  );
}