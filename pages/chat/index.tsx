import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { getFriendDisplayName } from '../../lib/hooks';
const ToastNotification = dynamic(() => import('./ToastNotification'), { ssr: false });
const LottiePlayer = dynamic(() => import('../../lib/LottiePlayer'), { ssr: false });
import styles from '../../styles/Chat.module.css';

interface Chat {
  id: string;
  name?: string | null;
  avatarUrl?: string | null;
  users: { id: string; login: string; link?: string | null; avatar?: string | null; role?: string; backgroundUrl?: string | null }[];
  unreadCount?: number;
  lastMessage?: LastMessage | null;
}

interface LastMessage {
  id: string;
  text: string;
  createdAt: string;
  senderId: string;
  audioUrl?: string;
  videoUrl?: string;
}

// Обновлён компонент для воспроизведения/индикации видео в списке.
// Сделан компактным: меньший круг и меньший треугольник.
const VideoPlayCircle: React.FC<{ videoUrl: string }> = ({ videoUrl }) => {
  const [playing, setPlaying] = React.useState(false);
  const [ended, setEnded] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  React.useEffect(() => {
    return () => {
      if (videoRef.current) {
        try { videoRef.current.pause(); } catch {}
        videoRef.current.src = '';
        videoRef.current = null;
      }
    };
  }, []);

  const handlePlay = async () => {
    setEnded(false);
    if (!videoRef.current) {
      const v = document.createElement('video');
      v.src = videoUrl;
      v.preload = 'metadata';
      v.onplay = () => setPlaying(true);
      v.onpause = () => setPlaying(false);
      v.onended = () => { setPlaying(false); setEnded(true); };
      videoRef.current = v;
    }
    try {
      await videoRef.current.play();
    } catch (e) {
      // autoplay may be blocked
      setPlaying(false);
    }
  };

  return (
    <button
      onClick={handlePlay}
      aria-label="play video"
      title="Воспроизвести"
      style={{ background: 'transparent', border: 'none', padding: 0, margin: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
    >
      <style>{`
        /* Компактный круг по умолчанию (уменьшено) */
        .vpc-wrap { width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; }
        /* круг с легкой обводкой */
        .vpc-ring { width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; transition: border-radius .28s ease, transform .28s ease, background .28s ease, width .18s ease, height .18s ease; border: 1px solid rgba(79,195,247,0.14); background: transparent; }
        .vpc-inner { width: 10px; height: 10px; display:inline-flex; align-items:center; justify-content:center; color: #4fc3f7; transition: transform .28s ease; }
        /* вращение внутренней иконки во время воспроизведения */
        .vpc-rotating .vpc-inner { animation: vpc-spin 1s linear infinite; }
        @keyframes vpc-spin { to { transform: rotate(360deg); } }
        /* когда закончилось — компактный заполненный круг */
        .vpc-ended { background: rgba(79,195,247,0.18) !important; border-color: rgba(79,195,247,0.22) !important; transform: scale(0.96); }
        .vpc-ended .vpc-inner { transform: scale(0.92); }
      `}</style>
      <span className="vpc-wrap">
        <span className={`vpc-ring ${playing ? 'vpc-rotating' : ''} ${ended ? 'vpc-ended' : ''}`}>
          <span className="vpc-inner">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 5v14l11-7-11-7z" fill="#4fc3f7"/>
            </svg>
          </span>
        </span>
      </span>
    </button>
  );
};

const ChatPage: React.FC = () => {
  const [toast, setToast] = useState<{type: 'error'|'success', message: string}|null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [lastMessages, setLastMessages] = useState<Record<string, LastMessage | null>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupPhoto, setGroupPhoto] = useState<string | null>(null);
  const [groupPhotoFile, setGroupPhotoFile] = useState<File | null>(null);
  const [showMemberSelection, setShowMemberSelection] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const { data: session } = useSession();
  const router = useRouter();

  const fetchChats = async () => {
    const userId = (session?.user && (session.user as any).id) ? (session.user as any).id : undefined;
    if (!userId) return;
    
    const res = await fetch('/api/chats', { credentials: 'include' });
    if (!res.ok) return setChats([]);
    const data = await res.json();
    const chatsList: Chat[] = data.chats || [];
    setChats(chatsList);
    console.log('chatsList', chatsList);
    // Use lastMessage included by the API to avoid N additional requests
    const lm: Record<string, LastMessage | null> = {};
    for (const chat of chatsList) {
      const m = (chat as any).lastMessage;
      if (m) {
        lm[chat.id] = {
          id: m.id,
          text: m.text || '',
          createdAt: m.createdAt,
          senderId: m.senderId,
          audioUrl: m.audioUrl,
          videoUrl: m.videoUrl
        };
      } else {
        lm[chat.id] = null;
      }
    }
    console.log('lastMessages loaded:', lm);
    setLastMessages(lm);
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      setToast({ type: 'error', message: 'Введите название группы' });
      return;
    }
    if (selectedMembers.length < 1) {
      setToast({ type: 'error', message: 'Выберите минимум 1 участника' });
      return;
    }

    setCreatingGroup(true);
    try {
      const res = await fetch('/api/chats', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName,
          userIds: selectedMembers,
          avatarUrl: groupPhoto
        })
      });

      if (res.ok) {
        const data = await res.json();
        setToast({ type: 'success', message: 'Группа создана!' });
        setShowCreateGroupModal(false);
        setGroupName('');
        setSelectedMembers([]);
        setGroupPhoto(null);
        setGroupPhotoFile(null);
        setMemberSearch('');
        // Refresh chat list
        await fetchChats();
        // Navigate to the new group
        if (data.chat?.id) {
          router.push(`/chat/${data.chat.id}`);
        }
      } else {
        const error = await res.json();
        setToast({ type: 'error', message: error.error || 'Ошибка при создании группы' });
      }
    } catch (err) {
      console.error('Failed to create group:', err);
      setToast({ type: 'error', message: 'Ошибка при создании группы' });
    } finally {
      setCreatingGroup(false);
    }
  };

  // Pusher подписка на новые сообщения для обновления последних сообщений
  const socketRef = useRef<any>(null);

  useEffect(() => {
    fetchChats();

    // Подписка на Pusher для всех чатов
    if (!chats.length) return;
    
    const meId = (session?.user as any)?.id as string | undefined;
    if (!meId) return;

    // Initialize socket client and subscribe to chat channels
    const { getSocketClient } = require('@/lib/socketClient');
    const socket = getSocketClient();
    socketRef.current = socket;

    if (socket) {
      chats.forEach(chat => {
        socket.on(`chat-${chat.id}:new-message`, (msg: any) => {
          setLastMessages(prev => ({ ...prev, [chat.id]: msg }));
        });

        // Subscribe to status changes for the other participant (1:1 chats)
        if (!chat.name) {
          const otherUser = chat.users.find(u => u.id !== meId);
          if (otherUser) {
            try {
              socket.on(`user-${otherUser.id}:status-changed`, (data: any) => {
                // expected data: { userId, status }
                setChats(prev => prev.map(c => ({
                  ...c,
                  users: c.users.map(u => u.id === data.userId ? { ...u, status: data.status } : u)
                })));
              });
            } catch (e) {
              // ignore
            }
          }
        }
      });
    }

    return () => {
      // cleanup not needed with Pusher
    };
    // eslint-disable-next-line
  }, [session, chats.length]);

  // Загружаем друзей при открытии модалки создания группы
  useEffect(() => {
    const userId = (session?.user as any)?.id;
    console.log('[Modal] showCreateGroupModal:', showCreateGroupModal, 'userId:', userId);
    
    if (!showCreateGroupModal || !userId) {
      return;
    }

    const loadFriends = async () => {
      try {
        console.log('[Modal] Fetching friends...');
        const res = await fetch('/api/friends', { credentials: 'include' });
        const data = await res.json();
        console.log('[Modal] Response status:', res.status);
        console.log('[Modal] Response data:', data);
        
        if (res.ok) {
          console.log('[Modal] Friends loaded:', data.friends?.length || 0, data.friends);
          setFriends(Array.isArray(data.friends) ? data.friends : []);
        } else {
          console.error('[Modal] Failed to load friends:', data.error);
          setFriends([]);
        }
      } catch (err) {
        console.error('[Modal] Fetch error:', err);
        setFriends([]);
      }
    };

    loadFriends();
  }, [showCreateGroupModal, session]);

  // Прослушиваем изменения кастомных имён друзей для обновления UI
  useEffect(() => {
    const updateChatsList = () => {
      // Принуждаем переренdered при изменении имён
      setChats(prev => [...prev]);
    };
    
    window.addEventListener('friend-name-changed', updateChatsList as EventListener);
    return () => window.removeEventListener('friend-name-changed', updateChatsList as EventListener);
  }, []);

  // Вынесите useMemo на верхний уровень компонента
  const chatList = useMemo(() => chats.map(chat => {
    const isGroup = !!chat.name;
    let title = chat.name;
    let role: string | undefined;
    const meId = (session?.user as any)?.id as string | undefined;
    // find other participant for 1:1 chats
    const other = !isGroup ? chat.users.find(u => u.id !== meId) : null;
    if (!isGroup) {
      if (other) {
        const defaultName = other.link ? `@${other.link}` : other.login;
        title = getFriendDisplayName(other.id, defaultName);
        role = other.role;
      }
    } else {
      // Для группового чата показываем роль текущего пользователя, если есть
      const me = chat.users.find(u => u.id === meId);
      role = me?.role;
      // If group has no explicit name, build fallback: "Группа (admin) и (another)"
      if (!title) {
        const admin = chat.users.find(u => u.role === 'admin') || chat.users[0];
        const otherMember = chat.users.find(u => u.id !== admin?.id) || chat.users[1] || chat.users[0];
        const adminNick = getFriendDisplayName(admin?.id || '', admin?.link ? `@${admin.link}` : (admin?.login || 'user'));
        const otherNick = getFriendDisplayName(otherMember?.id || '', otherMember?.link ? `@${otherMember.link}` : (otherMember?.login || 'user'));
        title = `Группа (${adminNick}) и (${otherNick})`;
      }
    }
    const bgUrl = (other as any)?.backgroundUrl || undefined;
    const itemBackground = bgUrl
      ? `linear-gradient(rgba(10,11,13,0.6), rgba(10,11,13,0.6)), url(${bgUrl}) center/cover no-repeat`
      : '#191a1e';

    // Helper render for avatars: single avatar or stacked for groups
    const renderAvatar = () => {
      const fallback = 'https://spng.pngfind.com/pngs/s/64-647085_teamwork-png-teamwork-symbol-png-transparent-png.png';
      if (!isGroup) {
        const src = (other && other.avatar) ? other.avatar : '/window.svg';
        return (
          <div className={styles.chatItemAvatar}>
            {other?.backgroundUrl && (
              <img src={other.backgroundUrl} alt="background" className={styles.chatItemAvatarImg} style={{ opacity: 0.6 }} />
            )}
            <img src={src} alt="avatar" className={styles.chatItemAvatarImg} />
            {/* status overlay in chat list: show only online or dnd */}
            {((other as any)?.status === 'online') && (
              <span style={{ position: 'absolute', right: 0, bottom: 0, width: 12, height: 12, borderRadius: '50%', background: '#1ed760', border: '2px solid #0f1113' }} />
            )}
            {((other as any)?.status === 'dnd') && (
              <img src="/moon-dnd.svg" alt="dnd" style={{ position: 'absolute', right: -2, bottom: -2, width: 16, height: 16 }} />
            )}
            {/* no call buttons here — buttons are shown inside the chat view */}
          </div>
        );
      }
      // For groups: if avatarUrl exists, show it; otherwise show stacked member avatars
      if (chat.avatarUrl) {
        return (
          <div className={styles.chatItemAvatar}>
            <img src={chat.avatarUrl} alt="group" className={styles.chatItemAvatarImg} />
          </div>
        );
      }
      // Show up to 3 avatars overlapped like Telegram
      const avatars = (chat.users || []).slice(0, 3).map(u => u.avatar || fallback);
      return (
        <div style={{width:44,height:44,position:'relative'}}>
          {avatars.map((a, idx) => {
            const size = 28 - idx * 6; // 28,22,16
            const right = idx * 10;
            return (
              <img key={idx} src={a} alt={`g${idx}`} style={{position:'absolute',right:`${right}px`,bottom:0,width:size,height:size,borderRadius:'50%',objectFit:'cover',border:'2px solid #0f1113',background:'#333'}} />
            );
          })}
        </div>
      );
    };

    return (
      <a
        key={chat.id}
        href={`/chat/${chat.id}`}
        className={styles.chatItem}
      >
        {renderAvatar()}
        <div className={styles.chatItemInfo}>
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8}}>
            <span className={styles.chatItemTitle} style={{display: 'flex', alignItems: 'center', gap: 6}}>
              {isGroup && (
                <img src="/group-icon.svg" alt="group" style={{width: 16, height: 16, opacity: 0.8, flexShrink: 0}} />
              )}
              <span>{title || 'Группа'}</span>
              {role === 'admin' && <img src="/role-icons/admin.svg" alt="admin" className={styles.chatItemTitleIcon} />}
              {role === 'moderator' && <img src="/role-icons/moderator.svg" alt="moderator" className={styles.chatItemTitleIcon} />}
              {role === 'verif' && <img src="/role-icons/verif.svg" alt="verif" className={styles.chatItemTitleIcon} />}
            </span>
            {lastMessages[chat.id]?.createdAt && (
              <span style={{fontSize: 12, color: '#999', whiteSpace: 'nowrap', flexShrink: 0}}>
                {new Date(lastMessages[chat.id]!.createdAt).toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'})}
              </span>
            )}
          </div>
          {lastMessages[chat.id] && (
            lastMessages[chat.id]?.videoUrl ? (
              <div className={styles.chatItemPreview}>
                <VideoPlayCircle videoUrl={lastMessages[chat.id]!.videoUrl!} />
                <span style={{fontSize: 13, color: '#64b5f6'}}>Видео</span>
              </div>
            ) : lastMessages[chat.id]?.audioUrl ? (
              <span className={styles.chatItemPreview}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 5v14l11-7z" fill="#64b5f6"/></svg>
                <span style={{fontSize: 13, color: '#64b5f6'}}>Голос</span>
              </span>
            ) : lastMessages[chat.id]?.text ? (
              <span className={styles.chatItemPreview}>
                {lastMessages[chat.id]!.text.length > 50
                  ? lastMessages[chat.id]!.text.slice(0, 50) + '...'
                  : lastMessages[chat.id]!.text}
              </span>
            ) : null
          )}
        </div>
      </a>
    );
  }), [chats, lastMessages, session]);

  // Group info modal via click was removed: clicking a chat (group or 1:1) navigates into the chat directly

  return (
    <div className={styles.chatContainer}>
      <div className={styles.chatContent}>
        <div className={styles.chatHeader}>
          <div style={{width:44}} />
          <h2 className={styles.headerTitle}>Чаты</h2>
          <button
            aria-label="Создать группу"
            title="Создать группу"
            onClick={() => setShowCreateGroupModal(true)}
            className={styles.headerButton}
          >
            <img src="/group_create.svg" alt="create group" width="24" height="24" />
          </button>
        </div>
        {chats.length === 0 ? (
          <div className={styles.chatListEmpty} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '80px' }}>
            <div style={{ textAlign: 'center' }}>
              <LottiePlayer src="/nochats.json" width={200} height={200} />
              <p style={{ color: '#888', fontSize: '14px', margin: '24px 0 0 0' }}>Еще нет чатов</p>
            </div>
          </div>
        ) : (
          <div className={styles.chatList}>
            {chatList}
          </div>
        )}

        {/* Create Group Modal */}
        {showCreateGroupModal && !showMemberSelection && (
          <div 
            onClick={() => setShowCreateGroupModal(false)}
            style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            animation: 'fadeIn 0.3s ease-in-out'
          }}>
            <style>{`
              @keyframes fadeIn {
                from { background: rgba(0, 0, 0, 0); }
                to { background: rgba(0, 0, 0, 0.7); }
              }
              @keyframes slideUp {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
              }
            `}</style>
            <div 
              onClick={(e) => e.stopPropagation()}
              style={{
              background: '#0a0b0d',
              borderRadius: '12px',
              border: '1px solid #2a2b31',
              padding: '30px',
              maxWidth: '450px',
              width: '90%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              overflowY: 'auto',
              animation: 'slideUp 0.3s cubic-bezier(0.23, 1, 0.32, 1)'
            }}>
              <div style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '24px'
              }}>
                <h3 style={{ margin: 0, color: '#fff', fontSize: '18px' }}>Создать группу</h3>
                <button
                  onClick={handleCreateGroup}
                  disabled={creatingGroup || selectedMembers.length < 1}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#3399ff',
                    cursor: (creatingGroup || selectedMembers.length < 1) ? 'not-allowed' : 'pointer',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    opacity: (creatingGroup || selectedMembers.length < 1) ? 0.6 : 1
                  }}
                >
                  {creatingGroup ? 'Создание...' : 'Создать'}
                </button>
              </div>
              
              {/* Group Photo Circle */}
              <div style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                background: groupPhoto ? `url(${groupPhoto}) center/cover` : '#191a1e',
                border: '2px solid #2a2b31',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                marginBottom: '24px',
                position: 'relative',
                overflow: 'hidden'
              }}
              onClick={() => document.getElementById('groupPhotoInput')?.click()}
              >
                {!groupPhoto && (
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <path d="M21 15l-5-5L5 21"/>
                  </svg>
                )}
              </div>
              
              <input
                id="groupPhotoInput"
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setGroupPhotoFile(file);
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      setGroupPhoto(event.target?.result as string);
                    };
                    reader.readAsDataURL(file);
                  }
                }}
              />

              {/* Group Name Input */}
              <input
                type="text"
                placeholder="Название группы"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                style={{
                  width: '100%',
                  background: '#191a1e',
                  border: '1px solid #2a2b31',
                  borderRadius: '8px',
                  color: '#fff',
                  padding: '10px 12px',
                  marginBottom: '20px',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = '#3399ff'}
                onBlur={(e) => e.target.style.borderColor = '#2a2b31'}
              />

              {/* Add Members Button */}
              <button
                onClick={() => setShowMemberSelection(true)}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: '1px solid #2a2b31',
                  borderRadius: '8px',
                  color: '#3399ff',
                  padding: '10px 12px',
                  marginBottom: '16px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                + Добавить участников
              </button>

              {/* Selected Members Display */}
              {selectedMembers.length > 0 && (
                <div style={{
                  width: '100%',
                  marginBottom: '20px'
                }}>
                  <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
                    Выбранные участники ({selectedMembers.length}):
                  </div>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px'
                  }}>
                    {selectedMembers.map(memberId => {
                      const member = friends.find(f => f.id === memberId);
                      return (
                        <div
                          key={memberId}
                          style={{
                            background: '#191a1e',
                            border: '1px solid #2a2b31',
                            borderRadius: '20px',
                            padding: '6px 12px',
                            fontSize: '12px',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <span>{member?.link ? `@${member.link}` : member?.login}</span>
                          <button
                            onClick={() => setSelectedMembers(selectedMembers.filter(id => id !== memberId))}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#888',
                              cursor: 'pointer',
                              padding: '0',
                              fontSize: '16px'
                            }}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* Member Selection Modal */}
        {showCreateGroupModal && showMemberSelection && (
          <div 
            onClick={() => setShowMemberSelection(false)}
            style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001
          }}>
            <div 
              onClick={(e) => e.stopPropagation()}
              style={{
              background: '#0a0b0d',
              borderRadius: '12px',
              border: '1px solid #2a2b31',
              padding: '20px',
              maxWidth: '400px',
              width: '90%',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* Header with Save Button */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
              }}>
                <h3 style={{ margin: 0, color: '#fff', fontSize: '16px' }}>Выбрать участников</h3>
                <button
                  onClick={() => setShowMemberSelection(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#3399ff',
                    cursor: 'pointer',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px'
                  }}
                >
                  Сохранить
                </button>
              </div>

              {/* Search */}
              <input
                type="text"
                placeholder="Поиск по @link"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                style={{
                  background: '#191a1e',
                  border: '1px solid #2a2b31',
                  borderRadius: '8px',
                  color: '#fff',
                  padding: '8px 12px',
                  marginBottom: '12px',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = '#3399ff'}
                onBlur={(e) => e.target.style.borderColor = '#2a2b31'}
              />

              {/* Debug info */}
              <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
                Загружено друзей: {friends.length}
              </div>

              {/* Friends List with Checkboxes */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                marginBottom: '0',
                border: '1px solid #2a2b31',
                borderRadius: '8px',
                padding: '8px'
              }}>
                {friends
                  .filter(f => {
                    const searchTerm = memberSearch.toLowerCase();
                    const link = f.link ? `@${f.link}` : '';
                    const login = f.login?.toLowerCase() || '';
                    return !searchTerm || link.toLowerCase().includes(searchTerm) || login.includes(searchTerm);
                  })
                  .length === 0 ? (
                  <div style={{ color: '#888', fontSize: '13px', padding: '8px' }}>
                    {memberSearch ? 'Друзей не найдено' : 'Нет доступных друзей'}
                  </div>
                ) : (
                  friends
                    .filter(f => {
                      const searchTerm = memberSearch.toLowerCase();
                      const link = f.link ? `@${f.link}` : '';
                      const login = f.login?.toLowerCase() || '';
                      return !searchTerm || link.toLowerCase().includes(searchTerm) || login.includes(searchTerm);
                    })
                    .map(friend => (
                      <label
                        key={friend.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '10px',
                          cursor: 'pointer',
                          borderRadius: '6px',
                          userSelect: 'none',
                          background: selectedMembers.includes(friend.id) ? '#191a1e' : 'transparent',
                          gap: '10px'
                        }}
                        onMouseEnter={(e) => {
                          if (!selectedMembers.includes(friend.id)) {
                            e.currentTarget.style.background = '#0f1013';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!selectedMembers.includes(friend.id)) {
                            e.currentTarget.style.background = 'transparent';
                          }
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedMembers.includes(friend.id)}
                          onChange={() => {
                            if (selectedMembers.includes(friend.id)) {
                              setSelectedMembers(selectedMembers.filter(id => id !== friend.id));
                            } else {
                              setSelectedMembers([...selectedMembers, friend.id]);
                            }
                          }}
                          style={{
                            marginRight: '0px',
                            cursor: 'pointer',
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            accentColor: '#3399ff',
                            flexShrink: 0
                          }}
                        />
                        {friend.avatar && (
                          <img
                            src={friend.avatar}
                            alt={friend.link || friend.login}
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              objectFit: 'cover'
                            }}
                          />
                        )}
                        <span style={{ color: '#fff', fontSize: '13px', flex: 1 }}>
                          {friend.link ? `@${friend.link}` : friend.login}
                        </span>
                      </label>
                    ))
                )}
              </div>
            </div>
          </div>
        )}

        {toast && (
          <ToastNotification
            type={toast.type}
            message={toast.message}
            onClose={()=>setToast(null)}
            duration={4000}
          />
        )}
      </div>
    </div>
  );
};

export default ChatPage;
