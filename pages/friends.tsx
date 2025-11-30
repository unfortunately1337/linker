import React, { useState, useEffect } from "react";
import { getUser } from "../lib/session";
import { getFriendDisplayName } from "../lib/hooks";
import Sidebar from "../components/Sidebar";
import ToastNotification from "../components/ToastNotification";
import { FiSearch, FiUserPlus, FiCheck, FiX } from "react-icons/fi";
import styles from '../styles/Friends.module.css';

export default function FriendsPage() {
  // Отправить заявку в друзья
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const sendRequest = async (friendId: string) => {
    if (!user?.id || friendId === user.id) return;
    try {
      const res = await fetch(`/api/friends/request`, {
        method: "POST",
        credentials: 'include',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, friendId })
      });
      if (res.ok) {
        setSearchResult(null);
        setToast({ type: 'success', message: 'Заявка отправлена' });
      } else {
        const data = await res.json().catch(() => ({}));
        setToast({ type: 'error', message: data?.error || 'Ошибка при отправке заявки' });
      }
    } catch (e) {
      setToast({ type: 'error', message: 'Ошибка сети' });
    }
  };

  // Принять заявку
  const handleAccept = async (requestId: string) => {
    const res = await fetch(`/api/friends/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user?.id, requestId })
    });
    const data = await res.json();
    
    setRequests(requests.filter(r => r.id !== requestId));
    setToast({ type: 'success', message: 'Заявка принята' });
    
    // Do not navigate automatically after accept; server still creates chat if needed.
  };

  // Отклонить заявку
  const handleDecline = async (requestId: string) => {
    await fetch(`/api/friends/decline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user?.id, requestId })
    });
  setRequests(requests.filter(r => r.id !== requestId));
  setToast({ type: 'success', message: 'Заявка отклонена' });
  };
  const [user, setUser] = useState<{ id: string; login: string } | null>(null);
  const [search, setSearch] = useState("");
  const [searchResult, setSearchResult] = useState<any>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const friendsSafe = Array.isArray(friends) ? friends : [];
  // Автоматический поиск при вводе
  useEffect(() => {
    if (!search || search.length < 2) {
      setSearchResult([]);
      return;
    }
    let active = true;
    setLoading(true);
    fetch(`/api/friends/search?link=${encodeURIComponent(search)}&userId=${user?.id || ''}`)
      .then(res => res.json())
      .then(data => {
        if (active) {
          setSearchResult(Array.isArray(data.users) ? data.users : []);
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [search]);
  useEffect(() => {
    const u = getUser();
    setUser(u);
    // If we don't have a client-side user, still try to fetch the profile from the server
    // The server will return 401 when the session/token is invalid — only then redirect.
    const profileUrl = u ? `/api/profile?userId=${u.id}` : `/api/profile`;
    fetch(profileUrl, { credentials: 'include' })
      .then(async (r) => {
        if (r.status === 401) {
          // server says unauthorized — redirect to login
          window.location.href = '/auth/login';
          return;
        }
        const data = await r.json().catch(() => ({}));
        const profile = data && data.user ? data.user : null;
        if (!profile) {
          // If we don't have a profile and no local user, redirect; otherwise preserve empty lists
          console.warn('Profile fetch did not return user:', data);
          if (!u) {
            window.location.href = '/auth/login';
            return;
          }
          setFriends([]);
          setRequests([]);
          return;
        }
        setFriends(Array.isArray(profile.friends) ? profile.friends : []);
        setRequests(Array.isArray(profile.friendRequests) ? profile.friendRequests : []);
      }).catch(e => {
        console.error('Failed to fetch profile:', e);
        setFriends([]);
        setRequests([]);
      });
  }, []);

  // Прослушиваем изменения кастомных имён друзей для обновления UI
  useEffect(() => {
    const updateFriendsList = () => {
      // Принуждаем переренdered при изменении имён
      setFriends((prev: any) => [...prev]);
      setSearchResult((prev: any) => prev ? [...prev] : null);
    };
    
    window.addEventListener('friend-name-changed', updateFriendsList as EventListener);
    return () => window.removeEventListener('friend-name-changed', updateFriendsList as EventListener);
  }, []);

  return (
    <div className={styles.friendsPage}>
      <div className={styles.header}>
        <h2 className={styles.title}>Меню друзей</h2>
        <p className={styles.subtitle}>Поиск и заявки, взаимная дружба создана для общения в чатах</p>
      </div>
      {toast && (
        <ToastNotification
          type={toast.type}
          message={toast.message}
          duration={2500}
          onClose={() => setToast(null)}
        />
      )}
      <div className={styles.layout}>
        <div className={styles.grid}>
          <div className={`${styles.panel}`}>
            <div className={styles.panelHeader}>
              <FiSearch style={{ fontSize: 22, color: '#4fc3f7' }} />
              <div className={styles.panelTitle}>Поиск друзей</div>
            </div>
            <div className={styles.searchRow}>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поиск по линку или имени"
                className={styles.searchInput}
              />
              <button onClick={() => setSearch('')} className={styles.clearBtn}>Очистить</button>
            </div>

            <div>
              {loading && <div className={styles.loading}>Поиск...</div>}
              {Array.isArray(searchResult) && searchResult.length === 0 && !loading && (
                <div className={styles.empty}></div>
              )}
              {Array.isArray(searchResult) && searchResult.length > 0 && (
                <div className={styles.results}>
                  {searchResult.map(foundUser => (
                    <div key={foundUser.id} className={styles.resultItem}>
                      <div className={styles.avatarWrap}>
                        <img src={foundUser.avatar || '/window.svg'} alt="avatar" className={styles.avatar} />
                        {foundUser.status === 'dnd' ? (
                          <img src="/moon-dnd.svg" alt="dnd" style={{ position: 'absolute', left: 36, top: 36, width: 16, height: 16 }} />
                        ) : (
                          <span className={styles.statusDot} style={{ background: foundUser.status === 'online' ? '#1ed760' : '#888' }} />
                        )}
                      </div>
                      <div className={styles.userInfo}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className={styles.username}>{getFriendDisplayName(foundUser.id, foundUser.link ? `@${foundUser.link}` : foundUser.login)}</div>
                          <img src={`/role-icons/${foundUser.role || 'user'}.svg`} alt={foundUser.role || 'user'} style={{ width: 16, height: 16 }} />
                        </div>
                        <div className={styles.userMeta}>{foundUser.description || ''}</div>
                      </div>
                      <div className={styles.actions}>
                        {foundUser.isFriend ? (
                          <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', color: '#bfc9cf' }}>Уже друг</div>
                        ) : (foundUser.id === user?.id) ? (
                          <div style={{ color: '#4fc3f7', fontWeight: 700 }}>Это вы</div>
                        ) : (
                          <button onClick={() => sendRequest(foundUser.id)} className={styles.btnPrimary}>Добавить</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={`${styles.panel} ${styles.secondaryPanel}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <FiUserPlus style={{ fontSize: 20, color: '#4fc3f7' }} />
              <div className={styles.panelTitle}>Входящие заявки</div>
            </div>
            <div className={styles.requestsList}>
              {Array.isArray(requests) && requests.length > 0 ? requests.map(r => (
                r && typeof r.login === 'string' ? (
                  <div key={r.id} className={styles.requestItem}>
                    <div style={{ position: 'relative' }}>
                      <img src={r.avatar || '/window.svg'} alt="avatar" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', boxShadow: '0 6px 18px rgba(2,6,23,0.6)' }} />
                      {r.status === 'dnd' ? (
                        <img src="/moon-dnd.svg" alt="dnd" style={{ position: 'absolute', left: 30, top: 30, width: 14, height: 14 }} />
                      ) : (
                        <span style={{ position: 'absolute', left: 32, top: 32, width: 9, height: 9, borderRadius: '50%', background: r.status === 'online' ? '#1ed760' : '#888', border: '2px solid #0f1113' }} />
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ color: '#fff', fontWeight: 700, cursor: 'pointer' }} onClick={() => window.location.href = `/profile/${r.id}`}>{getFriendDisplayName(r.id, r.link ? `@${r.link}` : r.login)}</div>
                        <img src={`/role-icons/${r.role || 'user'}.svg`} alt={r.role || 'user'} style={{ width: 16, height: 16 }} />
                      </div>
                      <div style={{ color: '#9fbfe6', fontSize: 13 }}>{r.description || ''}</div>
                    </div>
                    <div className={styles.requestActions}>
                      <button title="Принять" onClick={() => handleAccept(r.id)} className={styles.acceptBtn}>Принять</button>
                      <button title="Отклонить" onClick={() => handleDecline(r.id)} className={styles.declineBtn}>Отклонить</button>
                    </div>
                  </div>
                ) : null
              )) : <div className={styles.empty}>Нет входящих заявок</div>}
            </div>
          </div>
        </div>
      </div>
      <style jsx global>{`
        /* Remove panel backgrounds but preserve layout/padding/content */
        .friend-panel { background: transparent !important; box-shadow: none !important; border-radius: 0 !important; }
        /* Responsive: stack panels on mobile */
        .friends-grid { display: flex; gap: 20px; }
        /* Mobile adjustments: make inner controls full width and stack neatly */
        .friend-panel input { width: 100% !important; box-sizing: border-box; }
        .friend-panel button { min-width: 0; }
        .friend-panel .search-result-item { display: flex; flex-direction: column; gap: 8px; align-items: stretch; }
        @media (max-width: 820px) {
          .friends-grid { flex-direction: column; width: 100% !important; gap: 12px; }
          .friends-grid > div { width: 100% !important; }
        }
        @media (max-width: 480px) {
          h2 { font-size: 28px !important; margin: 28px 0 16px 0 !important; }
          .friend-panel { padding: 12px !important; }
          .friend-panel .search-result-item > div:last-child { display: flex; gap: 8px; flex-wrap: wrap; }
          .friend-panel .search-result-item button { flex: 1 1 auto; }
        }
      `}</style>
    </div>
  );
}
