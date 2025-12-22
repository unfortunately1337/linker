import { useState, useEffect } from "react";
import { useRef } from "react";
import Link from "next/link";
import { getUser, clearUser, saveUser } from "../lib/session";
import { useRouter } from "next/router";
import { signOut } from "next-auth/react";
import { FaComments, FaUser, FaSignOutAlt, FaRegNewspaper, FaVideo, FaFeatherAlt } from "react-icons/fa";
import styles from "../styles/Sidebar.module.css"; // создадим CSS для hover и анимаций
import { getSocketClient } from '../lib/socketClient';
import ToastNotification from './ToastNotification';

export default function Sidebar() {
  const router = useRouter();
  const [user, setUser] = useState(getUser());
  const [open, setOpen] = useState(false);
  const [showChatList, setShowChatList] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  // SSR-safe isMobile detection
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // helper: fetch latest profile from server and merge into local state/storage
  const fetchAndMergeProfile = async (localUser: any) => {
    if (!localUser || !localUser.id) return null;
    try {
      const res = await fetch(`/api/profile?userId=${localUser.id}`, { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      console.debug('[Sidebar] /api/profile response for', localUser.id, data?.user && { avatar: data.user.avatar, role: data.user.role });
      if (data && data.user) {
        const avatarChanged = typeof data.user.avatar === 'string' && data.user.avatar !== (localUser.avatar || null);
        const merged: any = { ...(localUser || {}), ...(data.user || {}) };
        if (avatarChanged) {
          merged._avatarBust = Date.now();
        } else {
          merged._avatarBust = localUser._avatarBust || Date.now();
        }
        setUser(merged);
        try { saveUser(merged as any); } catch (e) {}
        return merged;
      }
    } catch (e) {
      // ignore
    }
    return null;
  };
  useEffect(() => {
    setIsMobile(window.innerWidth <= 600);
    const checkMobile = () => setIsMobile(window.innerWidth <= 600);
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // --- Загрузка количества pending friend requests ---
  useEffect(() => {
    let mounted = true;
    let lastVisibilityCheckTime = 0;
    const VISIBILITY_CHECK_DEBOUNCE = 5000; // не чаще чем раз в 5 секунд

    // helper to fetch pending count (extracted so we can call it from Pusher handler)
    const fetchPending = async () => {
      try {
        // Ensure cookies (next-auth session) are sent with the request
        const res = await fetch("/api/friends/pending", { credentials: 'include' });
        const data = await res.json();
        if (mounted) setPendingCount(data.count || 0);
      } catch (err) {
        console.error(err);
      }
    };
    fetchPending();

    const handleVisibility = async () => {
      const now = Date.now();
      // Пропускаем если был запрос менее чем 5 секунд назад
      if (now - lastVisibilityCheckTime < VISIBILITY_CHECK_DEBOUNCE) {
        return;
      }
      lastVisibilityCheckTime = now;

      const u = getUser();
      if (!u) {
        setUser(null);
        setOpen(false); // скрыть сайдбар если пользователь вышел
        return;
      }
      // try refresh profile from server so avatar/role are up-to-date
      await fetchAndMergeProfile(u);
    };
    window.addEventListener("focus", handleVisibility);
    window.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mounted = false;
      window.removeEventListener("focus", handleVisibility);
      window.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  // Pusher: listen for incoming friend requests and show toast
  useEffect(() => {
    const u = getUser();
    if (!u) return;
    const socketClient = getSocketClient();
    if (!socketClient) return;
    
    // Set window variable for socketClient adapter to know user ID
    if (typeof window !== 'undefined') {
      (window as any).__userId = u.id;
    }
    
    const onFriendRequest = (data: any) => {
      try {
  const from = data?.fromLink ? `@${data.fromLink}` : (data?.fromLogin || 'Пользователь');
        const fromId = data?.fromId;
        // increment pending count optimistically
        setPendingCount(prev => (typeof prev === 'number' ? prev + 1 : 1));
        // prepare actions: accept and decline
        const accept = async () => {
          try {
            const res = await fetch('/api/friends/accept', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ requestId: fromId })
            });
            if (res.ok) {
              // decrement pending count
              setPendingCount(prev => (typeof prev === 'number' && prev > 0 ? prev - 1 : 0));
              // consume response but do not navigate automatically; show confirmation
              await res.json().catch(() => ({}));
              setToastMsg({ type: 'success', message: 'Заявка принята' });
            } else {
              const d = await res.json().catch(() => ({}));
              setToastMsg({ type: 'error', message: d?.error || 'Ошибка при принятии' });
            }
          } catch (e) {
            console.error('Accept failed', e);
            setToastMsg({ type: 'error', message: 'Ошибка сети' });
          }
        };
        const decline = async () => {
          try {
            const res = await fetch('/api/friends/decline', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ requestId: fromId })
            });
            if (res.ok) {
              setPendingCount(prev => (typeof prev === 'number' && prev > 0 ? prev - 1 : 0));
              setToastMsg({ type: 'success', message: 'Заявка отклонена' });
            } else {
              const d = await res.json().catch(() => ({}));
              setToastMsg({ type: 'error', message: d?.error || 'Ошибка при отклонении' });
            }
          } catch (e) {
            console.error('Decline failed', e);
            setToastMsg({ type: 'error', message: 'Ошибка сети' });
          }
        };

        setToastMsg({ type: 'success', message: `${from} отправил вам заявку в друзья`, actions: [ { label: 'Принять', onClick: accept }, { label: 'Отклонить', onClick: decline, style: { background: '#ff5252' } } ] });
      } catch (e) {
        console.error('Error handling friend-request Pusher event', e);
      }
    };
    socketClient.on('friend-request', onFriendRequest);
    return () => {
      try {
        socketClient.off('friend-request', onFriendRequest);
      } catch (e) {}
    };
  }, []);

  type ToastActionLocal = { label: string; onClick: () => void | Promise<void>; style?: React.CSSProperties };
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; message: string; actions?: ToastActionLocal[] } | null>(null);

  useEffect(() => {
    // Проверяем пользователя при монтировании
    const u = getUser();
    setUser(u);
    if (!u) setOpen(false);

    // Ensure avatar/link are fresh from server (DB) — overwrite local cached user where available
    if (u && u.id) {
      (async () => {
        try {
          await fetchAndMergeProfile(u);
        } catch (e) {
          // ignore
        }
      })();
    }

    // Слушаем событие входа
    const handleLogin = async () => {
      const u = getUser();
      if (!u) {
        setUser(null);
        return;
      }
      await fetchAndMergeProfile(u);
    };
    window.addEventListener("user-login", handleLogin);
    // listen for explicit profile updates (e.g., after avatar saved in profile page)
    const onProfileUpdated = async () => {
      const u = getUser();
      if (!u) return;
      await fetchAndMergeProfile(u);
    };
    window.addEventListener('profile-updated', onProfileUpdated as any);
    return () => {
      window.removeEventListener("user-login", handleLogin);
      window.removeEventListener('profile-updated', onProfileUpdated as any);
    };
  }, []);

  const logout = () => {
    // Clear local cache and perform a full sign out via NextAuth.
    try { clearUser(); } catch (e) {}
    setUser(null);
    setOpen(false);
    // trigger NextAuth signOut which will redirect to auth/login
    try {
      signOut({ callbackUrl: "/auth/login" as any });
    } catch (e) {
      // fallback: router push
      router.push("/auth/login");
    }
  };

  const [menuOpen, setMenuOpen] = useState(false);
  
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Mobile swipe vertical offset (px)
  const [dragY, setDragY] = useState(0);
  const draggingRef = useRef(false);
  const touchStartRef = useRef<number | null>(null);
  const initialDragRef = useRef(0);
  const MAX_UP = 140; // max pixels can drag upward (reveal footer)
  const MAX_DOWN = 60; // max pixels can drag downward

  // close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!(e.target instanceof Node)) return;
      if (!menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [menuOpen]);

  // touch handlers for mobile swipe up/down of sidebar
  const onTouchStart = (e: any) => {
    if (!isMobile || !open) return;
    draggingRef.current = true;
    touchStartRef.current = e.touches[0].clientY;
    initialDragRef.current = dragY;
  };

  const onTouchMove = (e: any) => {
    if (!draggingRef.current || touchStartRef.current === null) return;
    const y = e.touches[0].clientY;
    const delta = y - (touchStartRef.current || 0);
    let next = initialDragRef.current + delta;
    if (next < -MAX_UP) next = -MAX_UP;
    if (next > MAX_DOWN) next = MAX_DOWN;
    setDragY(next);
  };

  const onTouchEnd = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    touchStartRef.current = null;
    initialDragRef.current = 0;
    // snap back to 0 smoothly
    setDragY(0);
  };

  if (!user || !mounted) return null;

  return (
    <>
      {toastMsg && (
        <ToastNotification
          type={toastMsg.type}
          message={toastMsg.message}
          duration={4000}
          onClose={() => setToastMsg(null)}
          actions={toastMsg.actions}
        />
      )}
      {/* Оверлей для мобильного закрытия сайдбара */}
      {isMobile && open && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.15)',
            zIndex: 999,
            touchAction: 'none',
          }}
          onClick={() => setOpen(false)}
          onTouchStart={e => {
            const startY = e.touches[0].clientY;
            (e.currentTarget as any).dataset.touchStart = startY;
          }}
          onTouchEnd={e => {
            const startY = Number((e.currentTarget as any).dataset.touchStart);
            const endY = e.changedTouches[0].clientY;
            if (startY && endY - startY > 80) setOpen(false);
          }}
        />
      )}
      <aside
        className={`${styles.sidebar} ${!(mounted && isMobile) ? (open ? styles.open : styles.closed) : ''}`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={(() => {
          // compute inline style to include horizontal and vertical transform for mobile
          if (mounted && isMobile) {
            const translateX = open ? '0' : '-100%';
            return {
              width: open ? '80vw' : 0,
              minWidth: 0,
              maxWidth: '320px',
              zIndex: 1000,
              transform: `translateX(${translateX}) translateY(${dragY}px)`,
              transition: draggingRef.current ? 'none' : 'transform 0.22s cubic-bezier(.2,.9,.2,1)',
            };
          }
          return {};
        })()}
      >
        <div className={styles.logo}>
          <img
            src={open ? "/logo.svg" : "/logo2.svg"}
            alt="Logo"
            className={styles.logoImg}
          />
        </div>

        <nav className={styles.nav}>
          <SidebarLink
            href="/chat"
            icon={
              <span className={styles.iconWrapper}>
                <FaComments />
              </span>
            }
            text="Чат"
            open={open}
            onClick={() => setShowChatList(!showChatList)}
            isMobile={isMobile}
          />
          <SidebarLink
            href="/friends"
            icon={
              <span className={styles.iconWrapper}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="white"
                >
                  <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05C15.64 13.36 17 14.28 17 15.5V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                </svg>
                {pendingCount === null ? (
                  <span className={styles.pendingDotGrey} />
                ) : pendingCount > 0 ? (
                  <span className={styles.pendingDotRed} />
                ) : null}
              </span>
            }
            text="Друзья"
            open={open}
            isMobile={isMobile}
          />
          {/* Posts */}
          <SidebarLink href="/posts" icon={<FaFeatherAlt style={{ transform: 'translateY(1px)' }} />} text="Посты" open={open} isMobile={isMobile} />
          {/* Profile */}
          <SidebarLink href="/profile" icon={<FaUser />} text="Профиль" open={open} isMobile={isMobile} />
        </nav>

        <div className={styles.footer}>
          <div className={styles.userBlock} ref={menuRef}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              {(() => {
                const raw = user.avatar || '';
                let src = '/window.svg';
                if (raw) {
                  // If avatar is a data URI, don't append cache-busting query (it breaks data URIs)
                  if (typeof raw === 'string' && raw.startsWith('data:')) {
                    src = raw;
                  } else {
                    const sep = raw.includes('?') ? '&' : '?';
                    const bust = (user as any)._avatarBust ? (user as any)._avatarBust : Date.now();
                    src = `${raw}${sep}v=${bust}`;
                  }
                }
                return (
                  <img
                    src={src}
                    alt="avatar"
                    className={styles.avatar}
                    onError={(e) => {
                      try { (e.currentTarget as HTMLImageElement).src = '/window.svg'; } catch (er) {}
                    }}
                  />
                );
              })()}
              <div style={{ flex: 1, marginLeft: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontWeight: 600 }}>{user.login}</div>
                  {user.role === 'admin' && <img src="/role-icons/admin.svg" alt="admin" title="Админ" style={{ width: 14, height: 14 }} />}
                  {user.role === 'moderator' && <img src="/role-icons/moderator.svg" alt="moderator" title="Модератор" style={{ width: 14, height: 14 }} />}
                  {user.role === 'verif' && <img src="/role-icons/verif.svg" alt="verif" title="Верифицирован" style={{ width: 14, height: 14 }} />}
                  {user.role === 'pepe' && <img src="/role-icons/pepe.svg" alt="pepe" title="Пепешка" style={{ width: 14, height: 14 }} />}
                </div>
                {open && <div className={styles.userLink}>@{user.link || ''}</div>}
              </div>

              {/* three dots menu */}
              <div style={{ marginLeft: 8, position: 'relative' }}>
                <button className={styles.menuBtn} onClick={() => setMenuOpen(s => !s)} aria-label="menu">⋯</button>
                {menuOpen && (
                  <div className={styles.menu}>
                    <button className={styles.logoutMenuItem} onClick={() => { setMenuOpen(false); logout(); }}>
                      <FaSignOutAlt style={{ marginRight: 8 }} /> Выйти
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </aside>
      {/* Кнопка открытия/закрытия всегда рядом с сайдбаром */}
      <button
        aria-label={open ? "Close sidebar" : "Open sidebar"}
        className={styles.toggleBtn}
        onClick={() => setOpen(!open)}
        style={{
          left: (open ? 260 : 0) + 8,
          top: 28,
          position: 'fixed',
          zIndex: 1101,
          background: 'transparent',
          borderRadius: 8,
          padding: 4,
          fontSize: 18,
          boxShadow: 'none',
          border: 'none',
          textDecoration: 'none',
          transition: 'left 0.4s cubic-bezier(.4,0,.2,1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6.83496 3.99992C6.38353 4.00411 6.01421 4.0122 5.69824 4.03801C5.31232 4.06954 5.03904 4.12266 4.82227 4.20012L4.62207 4.28606C4.18264 4.50996 3.81498 4.85035 3.55859 5.26848L3.45605 5.45207C3.33013 5.69922 3.25006 6.01354 3.20801 6.52824C3.16533 7.05065 3.16504 7.71885 3.16504 8.66301V11.3271C3.16504 12.2712 3.16533 12.9394 3.20801 13.4618C3.25006 13.9766 3.33013 14.2909 3.45605 14.538L3.55859 14.7216C3.81498 15.1397 4.18266 15.4801 4.62207 15.704L4.82227 15.79C5.03904 15.8674 5.31234 15.9205 5.69824 15.9521C6.01398 15.9779 6.383 15.986 6.83398 15.9902L6.83496 3.99992ZM18.165 11.3271C18.165 12.2493 18.1653 12.9811 18.1172 13.5702C18.0745 14.0924 17.9916 14.5472 17.8125 14.9648L17.7295 15.1415C17.394 15.8 16.8834 16.3511 16.2568 16.7353L15.9814 16.8896C15.5157 17.1268 15.0069 17.2285 14.4102 17.2773C13.821 17.3254 13.0893 17.3251 12.167 17.3251H7.83301C6.91071 17.3251 6.17898 17.3254 5.58984 17.2773C5.06757 17.2346 4.61294 17.1508 4.19531 16.9716L4.01855 16.8896C3.36014 16.5541 2.80898 16.0434 2.4248 15.4169L2.27051 15.1415C2.03328 14.6758 1.93158 14.167 1.88281 13.5702C1.83468 12.9811 1.83496 12.2493 1.83496 11.3271V8.66301C1.83496 7.74072 1.83468 7.00898 1.88281 6.41985C1.93157 5.82309 2.03329 5.31432 2.27051 4.84856L2.4248 4.57317C2.80898 3.94666 3.36012 3.436 4.01855 3.10051L4.19531 3.0175C4.61285 2.83843 5.06771 2.75548 5.58984 2.71281C6.17898 2.66468 6.91071 2.66496 7.83301 2.66496H12.167C13.0893 2.66496 13.821 2.66468 14.4102 2.71281C15.0069 2.76157 15.5157 2.86329 15.9814 3.10051L16.2568 3.25481C16.8833 3.63898 17.394 4.19012 17.7295 4.84856L17.8125 5.02531C17.9916 5.44285 18.0745 5.89771 18.1172 6.41985C18.1653 7.00898 18.165 7.74072 18.165 8.66301V11.3271ZM8.16406 15.995H12.167C13.1112 15.995 13.7794 15.9947 14.3018 15.9521C14.8164 15.91 15.1308 15.8299 15.3779 15.704L15.5615 15.6015C15.9797 15.3451 16.32 14.9774 16.5439 14.538L16.6299 14.3378C16.7074 14.121 16.7605 13.8478 16.792 13.4618C16.8347 12.9394 16.835 12.2712 16.835 11.3271V8.66301C16.835 7.71885 16.8347 7.05065 16.792 6.52824C16.7605 6.14232 16.7073 5.86904 16.6299 5.65227L16.5439 5.45207C16.32 5.01264 15.9796 4.64498 15.5615 4.3886L15.3779 4.28606C15.1308 4.16013 14.8165 4.08006 14.3018 4.03801C13.7794 3.99533 13.1112 3.99504 12.167 3.99504H8.16406C8.16407 3.99667 8.16504 3.99829 8.16504 3.99992L8.16406 15.995Z" fill="currentColor" />
        </svg>
      </button>
    </>
  );
}

function SidebarLink({ href, icon, text, open, onClick, isMobile }: any) {
  const router = useRouter();
  const active = router.pathname.startsWith(href);
  return (
    <Link href={href} className={styles.link} onClick={onClick}>
      <div className={`${styles.linkContent} ${active ? styles.active : ''}`}>
        <span className={styles.icon}>{icon}</span>
        {open ? <span className={styles.text}>{text}</span> : null}
      </div>
    </Link>
  );
}