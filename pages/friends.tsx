import React, { useState, useEffect } from "react";
import { getUser } from "../lib/session";
import { getFriendDisplayName } from "../lib/hooks";
import Sidebar from "../components/Sidebar";
import ToastNotification from "../components/ToastNotification";
import { FiSearch, FiUserPlus, FiUsers, FiX } from "react-icons/fi";
import styles from '../styles/Friends.module.css';

export default function FriendsPage() {
  const [activeTab, setActiveTab] = useState<'friends' | 'search' | 'requests'>('friends');
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
      <Sidebar />
      <div className={styles.mainContent}>
        <div className={styles.header}>
          <h2 className={styles.title}>Друзья</h2>
          <p className={styles.subtitle}>Найдите новых друзей и управляйте заявками</p>
        </div>

        {toast && (
          <ToastNotification
            type={toast.type}
            message={toast.message}
            duration={2500}
            onClose={() => setToast(null)}
          />
        )}

        {/* Вкладки */}
        <div className={styles.tabsContainer}>
          <button
            className={`${styles.tab} ${activeTab === 'friends' ? styles.active : ''}`}
            onClick={() => setActiveTab('friends')}
          >
            <FiUsers size={20} />
            <span>Мои друзья ({friendsSafe.length})</span>
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'search' ? styles.active : ''}`}
            onClick={() => setActiveTab('search')}
          >
            <FiSearch size={20} />
            <span>Поиск</span>
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'requests' ? styles.active : ''}`}
            onClick={() => setActiveTab('requests')}
          >
            <FiUserPlus size={20} />
            <span>Заявки ({requests.length})</span>
          </button>
        </div>

        {/* Содержимое вкладок */}
        <div className={styles.tabContent}>
          {/* Вкладка: Мои друзья */}
          {activeTab === 'friends' && (
            <div className={styles.friendsList}>
              {friendsSafe.length > 0 ? (
                <div className={styles.grid}>
                  {friendsSafe.map(friend => (
                    <div key={friend.id} className={styles.friendCard}>
                      <div className={styles.friendAvatar}>
                        <img src={friend.avatar || '/window.svg'} alt={friend.login} />
                        {friend.status === 'dnd' ? (
                          <img src="/moon-dnd.svg" alt="dnd" className={styles.statusIcon} />
                        ) : (
                          <span className={styles.statusDot} style={{ background: friend.status === 'online' ? '#1ed760' : '#888' }} />
                        )}
                      </div>
                      <div className={styles.friendInfo}>
                        <div className={styles.friendName}>
                          {getFriendDisplayName(friend.id, friend.link ? `@${friend.link}` : friend.login)}
                        </div>
                        {friend.description && <div className={styles.friendDesc}>{friend.description}</div>}
                      </div>
                      <button onClick={() => window.location.href = `/chat/${friend.id}`} className={styles.btnChat}>
                        Написать
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.empty}>
                  <FiUsers size={48} />
                  <p>У вас еще нет друзей</p>
                  <p style={{ fontSize: 14, color: '#888' }}>Используйте поиск для добавления новых друзей</p>
                </div>
              )}
            </div>
          )}

          {/* Вкладка: Поиск */}
          {activeTab === 'search' && (
            <div className={styles.searchPanel}>
              <div className={styles.searchWrapper}>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Поиск по @линку или имени..."
                  className={styles.searchInput}
                  autoFocus
                />
                {search && (
                  <button onClick={() => setSearch('')} className={styles.clearBtn}>
                    <FiX size={18} />
                  </button>
                )}
              </div>

              {loading && <div className={styles.loading}>Поиск...</div>}
              
              {Array.isArray(searchResult) && searchResult.length === 0 && !loading && search && (
                <div className={styles.empty}>
                  <FiSearch size={48} />
                  <p>Ничего не найдено</p>
                </div>
              )}

              {Array.isArray(searchResult) && searchResult.length > 0 && (
                <div className={styles.searchResults}>
                  {searchResult.map(foundUser => (
                    <div key={foundUser.id} className={styles.searchResultCard}>
                      <div className={styles.resultAvatar}>
                        <img src={foundUser.avatar || '/window.svg'} alt={foundUser.login} />
                        {foundUser.status === 'dnd' ? (
                          <img src="/moon-dnd.svg" alt="dnd" className={styles.statusIcon} />
                        ) : (
                          <span className={styles.statusDot} style={{ background: foundUser.status === 'online' ? '#1ed760' : '#888' }} />
                        )}
                      </div>
                      <div className={styles.resultInfo}>
                        <div className={styles.resultName}>
                          {getFriendDisplayName(foundUser.id, foundUser.link ? `@${foundUser.link}` : foundUser.login)}
                        </div>
                        {foundUser.description && <div className={styles.resultDesc}>{foundUser.description}</div>}
                      </div>
                      <div className={styles.resultAction}>
                        {foundUser.isFriend ? (
                          <div className={styles.btnAlreadyFriend}>Друг</div>
                        ) : foundUser.id === user?.id ? (
                          <div className={styles.btnYourself}>Это вы</div>
                        ) : (
                          <button onClick={() => sendRequest(foundUser.id)} className={styles.btnAdd}>
                            <FiUserPlus size={18} />
                            Добавить
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!search && (
                <div className={styles.empty}>
                  <FiSearch size={48} />
                  <p>Начните поиск</p>
                  <p style={{ fontSize: 14, color: '#888' }}>Введите @линк или имя пользователя</p>
                </div>
              )}
            </div>
          )}

          {/* Вкладка: Входящие заявки */}
          {activeTab === 'requests' && (
            <div className={styles.requestsPanel}>
              {Array.isArray(requests) && requests.length > 0 ? (
                <div className={styles.requestsList}>
                  {requests.map(r => (
                    r && typeof r.login === 'string' ? (
                      <div key={r.id} className={styles.requestCard}>
                        <div className={styles.requestAvatar}>
                          <img src={r.avatar || '/window.svg'} alt={r.login} />
                          {r.status === 'dnd' ? (
                            <img src="/moon-dnd.svg" alt="dnd" className={styles.statusIcon} />
                          ) : (
                            <span className={styles.statusDot} style={{ background: r.status === 'online' ? '#1ed760' : '#888' }} />
                          )}
                        </div>
                        <div className={styles.requestInfo}>
                          <div className={styles.requestName}>
                            {getFriendDisplayName(r.id, r.link ? `@${r.link}` : r.login)}
                          </div>
                          {r.description && <div className={styles.requestDesc}>{r.description}</div>}
                        </div>
                        <div className={styles.requestActions}>
                          <button onClick={() => handleAccept(r.id)} className={styles.btnAccept}>
                            Принять
                          </button>
                          <button onClick={() => handleDecline(r.id)} className={styles.btnDecline}>
                            Отклонить
                          </button>
                        </div>
                      </div>
                    ) : null
                  ))}
                </div>
              ) : (
                <div className={styles.empty}>
                  <FiUserPlus size={48} />
                  <p>Нет входящих заявок</p>
                  <p style={{ fontSize: 14, color: '#888' }}>Когда люди отправят вам заявки, они появятся здесь</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
