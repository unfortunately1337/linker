import React, { useEffect, useState } from "react";
import { FaCog, FaQrcode } from 'react-icons/fa';
import ToastNotification from '../../components/ToastNotification';

// Small copy button component used on other users' profile page
function CopyButton({ idToCopy }: { idToCopy: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(idToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch (e) {
      // ignore
    }
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button onClick={handleCopy} aria-label="Copy UserID" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: '#e6e6e6', cursor: 'pointer' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2"/><rect x="4" y="4" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2"/></svg>
      </button>
      {copied && <span style={{ fontSize: 13, color: '#9aa0a6' }}>Скопировано</span>}
    </div>
  );
}
import { useRouter } from "next/router";

export default function UserProfile() {
  const router = useRouter();
  const { id } = router.query;
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isFriend, setIsFriend] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [currentUser, setCurrentUser] = useState<{id:string,login:string}|null>(null);
  const [showToastLocal, setShowToastLocal] = useState(false);
  const [toastMsgLocal, setToastMsgLocal] = useState('');
  const [toastTypeLocal, setToastTypeLocal] = useState<'success'|'error'>('success');
  const [customName, setCustomName] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingNameInput, setEditingNameInput] = useState('');

  useEffect(() => {
    if (!id) return;
    // Получаем текущего пользователя из localStorage
    let loadedUser = null;
    try {
      const u = localStorage.getItem('app_user') || localStorage.getItem('user');
      if (u) loadedUser = JSON.parse(u);
    } catch {}
    setCurrentUser(loadedUser);
    
    // Загружаем кастомное имя для этого друга
    try {
      const customNames = JSON.parse(localStorage.getItem('friend_custom_names') || '{}');
      if (customNames[id as string]) {
        setCustomName(customNames[id as string]);
        setEditingNameInput(customNames[id as string]);
      }
    } catch {}
    
    fetch(`/api/profile?userId=${id}`)
      .then(r => r.json())
      .then(data => {
        setUser(data.user);
        setLoading(false);
        // Проверяем, друг ли этот пользователь — поиск только по полю link
        if (data.user && loadedUser && data.user.link) {
          const q = encodeURIComponent(data.user.link);
          fetch(`/api/friends/search?link=${q}&userId=${loadedUser.id}`)
            .then(r => r.json())
            .then(fdata => {
              if (Array.isArray(fdata.users)) {
                const found = fdata.users.find((u: any) => u.id === data.user.id);
                setIsFriend(!!(found && found.isFriend));
              } else {
                setIsFriend(false);
              }
            })
            .catch(() => setIsFriend(false));
        } else {
          setIsFriend(false);
        }
      })
      .catch(() => {
        setUser(null);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <div style={{ color: "#bbb", textAlign: "center", marginTop: 40 }}>Загрузка профиля...</div>;
  if (!user) return <div style={{ color: "#e74c3c", textAlign: "center", marginTop: 40 }}>Пользователь не найден</div>;

  const saveCustomName = () => {
    try {
      const customNames = JSON.parse(localStorage.getItem('friend_custom_names') || '{}');
      if (editingNameInput.trim()) {
        customNames[id as string] = editingNameInput.trim();
        setCustomName(editingNameInput.trim());
      } else {
        delete customNames[id as string];
        setCustomName(null);
      }
      localStorage.setItem('friend_custom_names', JSON.stringify(customNames));
      setIsEditingName(false);
      window.dispatchEvent(new Event('friend-name-changed'));
    } catch (e) {
      console.error('Error saving custom name:', e);
    }
  };

  const deleteCustomName = () => {
    try {
      const customNames = JSON.parse(localStorage.getItem('friend_custom_names') || '{}');
      delete customNames[id as string];
      localStorage.setItem('friend_custom_names', JSON.stringify(customNames));
      setCustomName(null);
      setEditingNameInput('');
      setIsEditingName(false);
      window.dispatchEvent(new Event('friend-name-changed'));
    } catch (e) {
      console.error('Error deleting custom name:', e);
    }
  };

  return (
    <div
      className="profile-container"
      style={{
        maxWidth: 600,
        margin: "40px auto",
        padding: 32,
        borderRadius: 18,
        boxShadow: "0 2px 24px #0006",
        color: "#fff",
        fontFamily: "Segoe UI, Verdana, Arial, sans-serif",
        position: 'relative',
        background: user.backgroundUrl
          ? `linear-gradient(rgba(30,32,42,0.65),rgba(30,32,42,0.82)), url(${user.backgroundUrl}) center/cover no-repeat`
          : "#23242a"
      }}
    >
      <style>{`
        @media (max-width: 600px) {
          .profile-container {
            margin: 20px auto !important;
            padding: 18px !important;
            borderRadius: 12px !important;
          }
          .profile-buttons {
            top: 12px !important;
            right: 12px !important;
            font-size: 18px !important;
          }
          .profile-avatar {
            width: 80px !important;
            height: 80px !important;
          }
          .profile-title {
            font-size: 18px !important;
          }
          .profile-description {
            font-size: 13px !important;
          }
          .profile-friend-button {
            padding: 8px 16px !important;
            font-size: 13px !important;
          }
        }
        @media (max-width: 480px) {
          .profile-container {
            margin: 16px 12px !important;
            padding: 14px !important;
            borderRadius: 10px !important;
          }
          .profile-buttons {
            top: 10px !important;
            right: 10px !important;
            font-size: 16px !important;
          }
          .profile-avatar {
            width: 72px !important;
            height: 72px !important;
          }
          .profile-avatar-status {
            width: 14px !important;
            height: 14px !important;
            right: 0 !important;
            bottom: 0 !important;
          }
          .profile-title {
            font-size: 16px !important;
            gap: 6px !important;
          }
          .profile-description {
            font-size: 12px !important;
            margin-top: 4px !important;
          }
          .profile-friend-button {
            padding: 7px 14px !important;
            font-size: 12px !important;
            margin-top: 8px !important;
          }
          .userid-row {
            font-size: 12px !important;
            padding: 6px 10px !important;
            gap: 8px !important;
          }
        }
      `}</style>
      {/* Settings button absolutely top-right for the current user (no border) */}
      {currentUser && currentUser.id === user.id && (
        <button
          onClick={() => router.push('/profile')}
          title="Настройки"
          className="profile-buttons"
          style={{
            position: 'absolute',
            top: 18,
            right: 18,
            zIndex: 10,
            background: 'transparent',
            border: 'none',
            color: '#fff',
            padding: 0,
            cursor: 'pointer',
            fontSize: 22,
            lineHeight: 1,
            boxShadow: 'none',
            outline: 'none',
            transition: 'color .18s'
          }}
          aria-label="Open settings"
          onMouseOver={e => { e.currentTarget.style.color = '#229ed9'; }}
          onMouseOut={e => { e.currentTarget.style.color = '#fff'; }}
        >
          <FaCog />
        </button>
      )}
      {currentUser && currentUser.id === user.id && (
        <button
          onClick={() => { setToastMsgLocal('Функция в разработке...'); setToastTypeLocal('success'); setShowToastLocal(true); }}
          title="Сканировать QR"
          aria-label="Сканировать QR"
          className="profile-buttons"
          style={{ position: 'absolute', top: 18, left: 18, zIndex: 10, background: 'transparent', border: 'none', color: '#fff', padding: 6, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
        >
          <FaQrcode />
        </button>
      )}
      <div style={{ display: "flex", flexDirection: 'column', alignItems: 'center', gap: 12, paddingBottom: 24, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ position: "relative", width: 96, height: 96 }} className="profile-avatar">
          {user.avatar ? (
            <img src={user.avatar} alt="avatar" style={{ width: '100%', height: '100%', borderRadius: "50%", objectFit: "cover", background: "#444" }} />
          ) : (
            <div style={{ width: '100%', height: '100%', borderRadius: "50%", background: "#444", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, color: "#bbb" }}>{(user.link ? user.link[0] : user.login[0]).toUpperCase()}</div>
          )}
          {/* Статус dnd/online/offline (overlay bottom-right) */}
          {user.status === 'dnd' ? (
            <img src="/moon-dnd.svg" alt="dnd" style={{ position: "absolute", right: 2, bottom: 2, width: 22, height: 22, zIndex: 3 }} />
          ) : (
            <span style={{ position: "absolute", right: 0, bottom: 0, width: 16, height: 16, borderRadius: "50%", background: user.status === 'online' ? "#1ed760" : "#9ca3af", border: "3px solid #1f2937", zIndex: 3 }} className="profile-avatar-status" />
          )}
        </div>
        
        <div style={{ display: "flex", flexDirection: "column", alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, justifyContent: 'center', position: 'relative' }} className="profile-title">
            <span>{customName || (user.link ? `@${user.link}` : user.login)}</span>
            {currentUser && currentUser.id !== user.id && (
              <button
                onClick={() => {
                  setIsEditingName(!isEditingName);
                  if (!isEditingName) setEditingNameInput(customName || (user.link ? `@${user.link}` : user.login));
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#888',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  transition: 'all 0.2s ease'
                }}
                title="Изменить название для себя"
                onMouseEnter={(e) => e.currentTarget.style.color = '#aaa'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#888'}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 17.25V21h3.75L17.81 9.94m-5.66-5.66l2.83-2.83a2 2 0 012.83 0l2.83 2.83a2 2 0 010 2.83l-2.83 2.83m-5.66-5.66l5.66 5.66" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
            {user.role === "admin" && (
              <span
                style={{ position: 'relative', display: 'inline-block' }}
                onMouseEnter={e => {
                  const tip = document.createElement('div');
                  tip.innerText = 'Этот аккаунт принадлежит создателю Linker';
                  Object.assign(tip.style, {
                    position: 'absolute', top: '32px', left: '0', background: '#23242a', color: '#fff', padding: '7px 16px', borderRadius: '10px', fontSize: '15px', boxShadow: '0 2px 16px #229ED944', zIndex: 1000, whiteSpace: 'nowrap'
                  });
                  tip.className = 'admin-tooltip';
                  if (e.currentTarget) e.currentTarget.appendChild(tip);
                }}
                onMouseLeave={e => {
                  if (e.currentTarget) {
                    const tips = e.currentTarget.querySelectorAll('.admin-tooltip');
                    tips.forEach((tip: any) => tip.remove());
                  }
                }}
              >
                <img src="/role-icons/admin.svg" alt="admin" style={{width:18, height:18, marginLeft:2, verticalAlign:'middle', cursor:'pointer'}} />
              </span>
            )}
            {user.role === "pepe" && (
              <span
                style={{ position: 'relative', display: 'inline-block' }}
                onMouseEnter={e => {
                  const tip = document.createElement('div');
                  tip.innerText = 'пепешка дается только легендам, или же разработчикам - эта и тем, и другим';
                  Object.assign(tip.style, {
                    position: 'absolute', top: '40px', left: '0', background: '#23242a', color: '#fff', padding: '7px 16px', borderRadius: '10px', fontSize: '15px', boxShadow: '0 2px 16px #229ED944', zIndex: 1000, whiteSpace: 'nowrap'
                  });
                  tip.className = 'pepe-tooltip';
                  if (e.currentTarget) e.currentTarget.appendChild(tip);
                }}
                onMouseLeave={e => {
                  if (e.currentTarget) {
                    const tips = e.currentTarget.querySelectorAll('.pepe-tooltip');
                    tips.forEach((tip: any) => tip.remove());
                  }
                }}
              >
                <img src="/role-icons/pepe.svg" alt="pepe" style={{width:40, height:40, marginLeft:0, verticalAlign:'middle', cursor:'pointer'}} />
              </span>
            )}
            {user.role === "moderator" && (
              <span
                style={{ position: 'relative', display: 'inline-block' }}
                onMouseEnter={e => {
                  const tip = document.createElement('div');
                  tip.innerText = 'Аккаунт имеет статус модератора, отвечает за вашу безопасность';
                  Object.assign(tip.style, {
                    position: 'absolute', top: '32px', left: '0', background: '#23242a', color: '#fff', padding: '7px 16px', borderRadius: '10px', fontSize: '15px', boxShadow: '0 2px 16px #229ED944', zIndex: 1000, whiteSpace: 'nowrap'
                  });
                  tip.className = 'moderator-tooltip';
                  if (e.currentTarget) e.currentTarget.appendChild(tip);
                }}
                onMouseLeave={e => {
                  if (e.currentTarget) {
                    const tips = e.currentTarget.querySelectorAll('.moderator-tooltip');
                    tips.forEach((tip: any) => tip.remove());
                  }
                }}
              >
                <img src="/role-icons/moderator.svg" alt="moderator" style={{width:18, height:18, marginLeft:2, verticalAlign:'middle', cursor:'pointer'}} />
              </span>
            )}
            {user.role === "verif" && (
              <span
                style={{ position: 'relative', display: 'inline-block' }}
                onMouseEnter={e => {
                  const tip = document.createElement('div');
                  tip.innerText = 'Аккаунт верифицирован компаниней Linker';
                  Object.assign(tip.style, {
                    position: 'absolute', top: '32px', left: '0', background: '#23242a', color: '#fff', padding: '7px 16px', borderRadius: '10px', fontSize: '15px', boxShadow: '0 2px 16px #229ED944', zIndex: 1000, whiteSpace: 'nowrap'
                  });
                  tip.className = 'verif-tooltip';
                  if (e.currentTarget) e.currentTarget.appendChild(tip);
                }}
                onMouseLeave={e => {
                  if (e.currentTarget) {
                    const tips = e.currentTarget.querySelectorAll('.verif-tooltip');
                    tips.forEach((tip: any) => tip.remove());
                  }
                }}
              >
                <img src="/role-icons/verif.svg" alt="verif" style={{width:18, height:18, marginLeft:2, verticalAlign:'middle', cursor:'pointer'}} />
              </span>
            )}
          </div>
          
          <div style={{ fontSize: 14, color: "#a8adb5", marginTop: 6 }} className="profile-description">{user.description || "Нет описания"}</div>
          {isFriend && (
            <div style={{ fontSize: 13, color: '#64b5f6', fontWeight: 500, marginTop: 2 }}>Ваш друг</div>
          )}
          
          {/* Кнопка заявки */}
          {currentUser && user && currentUser.id !== user.id && !isFriend && (
            requestSent ? (
              <span style={{ color: '#64b5f6', fontWeight: 500, fontSize: 14, marginTop: 8 }}>Заявка отправлена</span>
            ) : (
              <button
                className="profile-friend-button"
                style={{
                  marginTop: 12,
                  background: '#64b5f6',
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 14,
                  padding: '8px 20px',
                  boxShadow: '0 2px 12px #64b5f644',
                  cursor: 'pointer',
                  transition: 'all .2s ease',
                }}
                title="Отправить заявку в друзья"
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#4a9fd8';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 16px #64b5f655';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#64b5f6';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 12px #64b5f644';
                }}
                onClick={async () => {
                  if (!currentUser || !user) return;
                  try {
                    const res = await fetch('/api/friends/request', {
                      method: 'POST',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ userId: currentUser.id, friendId: user.id })
                    });
                    if (res.ok) {
                      setRequestSent(true);
                    } else {
                      const data = await res.json().catch(() => ({}));
                      alert(data?.error || 'Ошибка при отправке заявки');
                    }
                  } catch (e) {
                    alert('Ошибка сети');
                  }
                }}
              >
                + В друзья
              </button>
            )
          )}
        </div>
      </div>
      {/* If this user is a friend, show their UserID and a copy button */}
      {isFriend && user && user.id && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: 10, color: '#ccc', marginTop: 12 }} className="userid-row">
            <div style={{ fontSize: 13, color: '#bfbfbf' }}>UserID — <span style={{ color: '#9aa0a6', fontWeight: 700 }}>{user.id}</span></div>
            <CopyButton idToCopy={user.id} />
          </div>
        </div>
      )}
      {showToastLocal && <ToastNotification type={toastTypeLocal === 'success' ? 'success' : 'error'} message={toastMsgLocal} duration={3000} onClose={()=>setShowToastLocal(false)} />}
      
      {/* Modal for editing custom name */}
      {isEditingName && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 5000,
          backdropFilter: 'blur(2px)',
          padding: '16px',
        }} onClick={() => setIsEditingName(false)}>
          <div style={{
            background: '#2a2d33',
            borderRadius: 12,
            padding: '24px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255,255,255,0.06)',
            maxWidth: 380,
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            animation: 'slideUp 0.3s ease-out',
          }} onClick={(e) => e.stopPropagation()}>
            <style>{`
              @keyframes slideUp {
                from {
                  transform: translateY(40px);
                  opacity: 0;
                }
                to {
                  transform: translateY(0);
                  opacity: 1;
                }
              }
              @media (max-width: 600px) {
                .modal-container {
                  padding: 16px !important;
                }
                .modal-title {
                  font-size: 14px !important;
                }
                .modal-subtitle {
                  font-size: 12px !important;
                  margin-bottom: 12px !important;
                }
                .modal-input {
                  font-size: 16px !important;
                  padding: 12px 12px !important;
                  margin-bottom: 16px !important;
                }
                .modal-buttons {
                  gap: 8px !important;
                }
                .modal-button {
                  padding: 8px 8px !important;
                }
              }
              @media (max-width: 480px) {
                .modal-container {
                  padding: 14px !important;
                  border-radius: 8px !important;
                }
                .modal-input {
                  font-size: 16px !important;
                  padding: 14px 12px !important;
                  margin-bottom: 14px !important;
                }
              }
            `}</style>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }} className="modal-header">
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#c0c0c0', margin: 0 }} className="modal-title">Изменить название</h2>
              <button
                onClick={() => setIsEditingName(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#666',
                  cursor: 'pointer',
                  fontSize: 28,
                  padding: 0,
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.2s ease',
                  lineHeight: 1,
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#888'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#666'}
                title="Закрыть"
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: 13, color: '#888', margin: '0 0 16px 0' }} className="modal-subtitle">Видимо только для вас</p>
            
            <input
              type="text"
              value={editingNameInput}
              onChange={(e) => setEditingNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveCustomName();
                if (e.key === 'Escape') setIsEditingName(false);
              }}
              placeholder={user.link ? `@${user.link}` : user.login}
              autoFocus
              className="modal-input"
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.08)',
                background: '#1f2125',
                color: '#d0d0d0',
                fontSize: 14,
                marginBottom: 20,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
            
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }} className="modal-buttons">
              {customName && (
                <button
                  onClick={deleteCustomName}
                  className="modal-button"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#555',
                    cursor: 'pointer',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                    transition: 'color 0.2s ease',
                    minWidth: 32,
                    height: 32,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#ff5555'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#555'}
                  title="Удалить название"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                </button>
              )}
              <button
                onClick={saveCustomName}
                className="modal-button"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#555',
                  cursor: 'pointer',
                  padding: '8px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  transition: 'color 0.2s ease',
                  minWidth: 32,
                  height: 32,
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#66cc66'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#555'}
                title="Сохранить"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
