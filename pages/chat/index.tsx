import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import dynamic from 'next/dynamic';
import Pusher from 'pusher-js';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { getFriendDisplayName } from '../../lib/hooks';
const ToastNotification = dynamic(() => import('./ToastNotification'), { ssr: false });
import SettingsModal from '../../components/SettingsModal';
import styles from '../../styles/Chat.module.css';

interface Chat {
  id: string;
  name?: string | null;
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
  const [showSettingsModal, setShowSettingsModal] = useState(false);
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

  // Pusher подписка на новые сообщения для обновления последних сообщений
  const pusherRef = useRef<Pusher|null>(null);

  useEffect(() => {
    fetchChats();

    // Подписка на Pusher для всех чатов
    if (pusherRef.current) {
      pusherRef.current.disconnect();
      pusherRef.current = null;
    }
    if (!chats.length) return;
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY || '', {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || '',
      forceTLS: true,
    });
    pusherRef.current = pusher;
    chats.forEach(chat => {
      const channel = pusher.subscribe(`chat-${chat.id}`);
      channel.bind('new-message', (msg: any) => {
        setLastMessages(prev => ({ ...prev, [chat.id]: msg }));
      });
      // Subscribe to status changes for the other participant (1:1 chats)
      if (!chat.name) {
        const meId = (session?.user as any)?.id as string | undefined;
        const otherUser = chat.users.find(u => u.id !== meId);
        if (otherUser) {
          try {
            const uChannel = pusher.subscribe(`user-${otherUser.id}`);
            uChannel.bind('status-changed', (data: any) => {
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
    return () => {
      if (pusherRef.current) {
        pusherRef.current.disconnect();
        pusherRef.current = null;
      }
    };
    // eslint-disable-next-line
  }, [session, chats.length]);

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
      // For groups: show up to 3 avatars overlapped like Telegram
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
        href={`/chat/${isGroup ? chat.id : chat.users.find(u => u.id !== meId)?.id}`}
        className={styles.chatItem}
      >
        {renderAvatar()}
        <div className={styles.chatItemInfo}>
          <span className={styles.chatItemTitle}>
            {title || 'Группа'}
            {role === 'admin' && <img src="/role-icons/admin.svg" alt="admin" className={styles.chatItemTitleIcon} />}
            {role === 'moderator' && <img src="/role-icons/moderator.svg" alt="moderator" className={styles.chatItemTitleIcon} />}
            {role === 'verif' && <img src="/role-icons/verif.svg" alt="verif" className={styles.chatItemTitleIcon} />}
          </span>
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
                {lastMessages[chat.id]!.text.length > 40
                  ? lastMessages[chat.id]!.text.slice(0, 40) + '...'
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
          <button
            aria-label="Настройки"
            title="Настройки"
            onClick={() => setShowSettingsModal(true)}
            className={styles.headerButton}
          >
            <img src="/settings.svg" alt="Настройки" width={20} height={20} style={{display:'block'}} />
          </button>
          <h2 className={styles.headerTitle}>Чаты</h2>
          <div style={{width:44}} />
        </div>
        {chats.length === 0 ? (
          <div className={styles.chatListEmpty}>Похоже, тут пусто...<br /></div>
        ) : (
          <div className={styles.chatList}>
            {chatList}
          </div>
        )}
        <SettingsModal open={showSettingsModal} onClose={() => setShowSettingsModal(false)} />

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

