import { getSocketClient } from '../../lib/socketClient';
import { getFriendDisplayName } from '../../lib/hooks';

// Use shared socket client helper (returns null on server)
const socketClient = typeof window !== 'undefined' ? getSocketClient() : null;
import React, { useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import { FaPaperPlane } from 'react-icons/fa';
import { useRouter } from 'next/router';
import UserStatus, { statusLabels } from '../../components/UserStatus';
import { useSession } from 'next-auth/react';
import { useCall } from '../../components/CallProvider';
import MessageStatus from '../../components/MessageStatus';
import styles from '../../styles/Chat.module.css';

// Инициализация Pusher для real-time чатов
const VoiceMessage: React.FC<{ audioUrl: string; isOwn?: boolean }> = ({ audioUrl, isOwn }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [current, setCurrent] = useState<number>(0);
  const [playing, setPlaying] = useState(false);
  const [messageColor, setMessageColor] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('chatMessageColor') : null;
      if (stored) setMessageColor(stored);
    } catch (e) {}
    const onColor = (e: any) => { try { setMessageColor(e?.detail || null); } catch (err) {} };
    window.addEventListener('chat-color-changed', onColor as EventListener);
    return () => window.removeEventListener('chat-color-changed', onColor as EventListener);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onLoaded = () => setDuration(audio.duration || 0);
    const onTime = () => setCurrent(audio.currentTime || 0);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
    };
  }, []);

  const playAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.play();
    setPlaying(true);
    audio.onended = () => setPlaying(false);
  };

  const pauseAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setPlaying(false);
  };

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const ownBg = messageColor ? `linear-gradient(90deg, ${messageColor} 60%, #1e2a3a 100%)` : 'linear-gradient(90deg,#229ed9 60%,#1e2a3a 100%)';
  const highlightColor = messageColor || '#229ed9';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: isOwn ? ownBg : 'linear-gradient(90deg,#222 60%,#23243a 100%)',
      borderRadius: 16, padding: '8px 18px', boxShadow: '0 2px 8px #2222', minWidth: 120, maxWidth: 320
    }}>
      {!playing ? (
        <button
          onClick={playAudio}
          className="voice-play-btn"
          style={{
            marginRight: 8,
            color: highlightColor
          }}
          aria-label="Воспроизвести"
        >
          <svg width={26} height={26} viewBox="0 0 24 24"><polygon points="6,4 20,12 6,20" fill="currentColor"/></svg>
        </button>
      ) : (
        <button
          onClick={pauseAudio}
          className="voice-play-btn"
          style={{
            marginRight: 8,
            color: '#ffffff'
          }}
          aria-label="Пауза"
        >
          <svg width={26} height={26} viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/></svg>
        </button>
      )}
      <audio ref={audioRef} src={audioUrl.startsWith('/') ? audioUrl : '/' + audioUrl} style={{ display: 'none' }} />
        <div style={{ flex: 1 }}>
        <div style={{ height: 4, background: highlightColor, borderRadius: 2, position: 'relative', marginBottom: 4 }}>
          <div style={{ position: 'absolute', left: 0, top: 0, height: 4, borderRadius: 2, background: '#fff', width: duration ? `${(current/duration)*100}%` : '0%' }} />
        </div>
        <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{formatTime(current)} / {formatTime(duration)}</div>
      </div>
      {/* Индикатор звука удалён по запросу */}
    </div>
  );
};

interface Message {
  id: string;
  sender: string;
  text?: string;
  createdAt: string;
  audioUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  status?: 'sent' | 'read';
  reactions?: Array<{ emoji: string; count: number; userIds: string[]; users?: Array<{ id: string; login: string; avatar?: string }> }>;
  _key?: string;
  // internal flags used by UI (optional)
  _serverId?: string;
  _persisted?: boolean;
  _failed?: boolean;
  // UI-only system message marker — rendered centered like day separators
  _system?: boolean;
  // Sender info for group chats
  senderInfo?: {
    id: string;
    login: string;
    link?: string | null;
    avatar?: string;
  };
}

const ChatWithFriend: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;
  const { data: session, status } = useSession();
  
  // Prevent page scrolling on chat page - only container scrolls
  useEffect(() => {
    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
      // Store original values
      const originalHtmlOverflow = document.documentElement.style.overflow;
      const originalBodyOverflow = document.body.style.overflow;
      const originalHtmlHeight = document.documentElement.style.height;
      const originalBodyHeight = document.body.style.height;
      
      // Set fixed viewport
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.height = '100vh';
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100vh';
      
      return () => {
        document.documentElement.style.overflow = originalHtmlOverflow;
        document.documentElement.style.height = originalHtmlHeight;
        document.body.style.overflow = originalBodyOverflow;
        document.body.style.height = originalBodyHeight;
      };
    }
  }, []);
  
  const [messages, setMessages] = useState<Message[]>([]);
  // Исправить тип friend, чтобы поддерживать login, name, avatar, role
  const [friend, setFriend] = useState<{id: string, login?: string, name?: string, link?: string, avatar?: string | null, role?: string, status?: string} | null>(null);
  const [friendDisplayName, setFriendDisplayName] = useState<string>('');
  // For group chats: store all participants with their data
  const [groupMembers, setGroupMembers] = useState<Array<{id: string, login: string, link?: string, avatar?: string | null, role?: string}>>([]);
  const [isGroup, setIsGroup] = useState(false);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [groupAvatar, setGroupAvatar] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  // Chat background URL (local per-chat, stored in localStorage like Telegram)
  const [chatBgUrl, setChatBgUrl] = useState<string | null>(null);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [viewers, setViewers] = useState<Set<string>>(new Set());
  const [openActionMsgId, setOpenActionMsgId] = useState<string | null>(null);
  const [recentReactions, setRecentReactions] = useState<Record<string, number>>({});
  const [removingReactions, setRemovingReactions] = useState<Set<string>>(new Set());
  const lastTapRef = useRef<number | null>(null);
  const [isTyping, setIsTyping] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [videoRecorder, setVideoRecorder] = useState<MediaRecorder | null>(null);
  const [videoChunks, setVideoChunks] = useState<Blob[]>([]);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoRecording, setVideoRecording] = useState(false);
  const [videoTime, setVideoTime] = useState(0);
  const videoTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (videoTime > 60 && videoRecorder && videoRecording) {
      stopVideoRecording();
    }
  }, [videoTime]);

  // selected chat message color (sync with SettingsModal via localStorage + event)
  const [messageColor, setMessageColor] = useState<string | null>(null);
  useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('chatMessageColor') : null;
      if (stored) setMessageColor(stored);
    } catch (e) {}
    const onColor = (e: any) => { try { setMessageColor(e?.detail || null); } catch (err) {} };
    window.addEventListener('chat-color-changed', onColor as EventListener);
    return () => window.removeEventListener('chat-color-changed', onColor as EventListener);
  }, []);

  // Listen for font size changes from SettingsModal
  const [fontSize, setFontSize] = useState<number>(15);
  useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('chatFontSize') : null;
      if (stored) setFontSize(parseInt(stored, 10));
    } catch (e) {}
    const onFontSize = (e: any) => { try { setFontSize(e?.detail || 15); } catch (err) {} };
    window.addEventListener('chat-font-size-changed', onFontSize as EventListener);
    return () => window.removeEventListener('chat-font-size-changed', onFontSize as EventListener);
  }, []);

  // --- Добавить недостающие переменные и хуки ---
  const [userId, setUserId] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [animatedMsgIds, setAnimatedMsgIds] = useState<Set<string>>(new Set());
  const [recordTime, setRecordTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordInterval = useRef<NodeJS.Timeout | null>(null);
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [savingGroupName, setSavingGroupName] = useState(false);
  const [editingGroupAvatar, setEditingGroupAvatar] = useState(false);
  const [savingGroupAvatar, setSavingGroupAvatar] = useState(false);
  // For 1:1 chats menu
  const [showPrivateMenu, setShowPrivateMenu] = useState(false);
  const [isUserBlocked, setIsUserBlocked] = useState(false);
  const [blockingUser, setBlockingUser] = useState(false);
  // For chat background
  const [editingChatBg, setEditingChatBg] = useState(false);
  const [chatBgInput, setChatBgInput] = useState('');
  const [savingChatBg, setSavingChatBg] = useState(false);

  // Call control (starts phone/video calls)
  const call = useCall();

  // Listen for global call-ended events (dispatched by CallProvider) and insert
  // a centered system message into the chat when the event concerns the
  // currently opened friend.
  useEffect(() => {
    const handler = (e: any) => {
      try {
        const d = e?.detail;
        if (!d) return;
        // only insert if the event is about the currently opened friend
        if (!friend || !friend.id) return;
        if (String(d.targetId) !== String(friend.id)) return;

        const who = d.targetName || friendDisplayName || ''; 
        
        if (d.wasInCall) {
          const started = d.startedAt || d.endedAt || Date.now();
          const ended = d.endedAt || Date.now();
          const sec = Math.max(0, Math.floor((ended - started) / 1000));
          const mins = Math.floor(sec / 60);
          const secs = sec % 60;
          const dur = mins > 0 ? `${mins}м ${String(secs).padStart(2, '0')}с` : `${secs}с`;
          const text = `Звонок от ${who} продлился ${dur}`;
          const sys: Message = { id: `sys-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, sender: 'system', text, createdAt: new Date(ended).toISOString(), _system: true };
          // Optimistically add to UI only (do not persist)
          setMessages(prev => [...prev, sys]);
        } else {
          const ended = d.endedAt || Date.now();
          const timeStr = new Date(ended).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const text = `Пропущеный звонок от ${who} в ${timeStr}`;
          const sys: Message = { id: `sys-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, sender: 'system', text, createdAt: new Date(ended).toISOString(), _system: true };
          // Optimistically add to UI only (do not persist)
          setMessages(prev => [...prev, sys]);
        }
      } catch (err) {}
    };
    window.addEventListener('call-ended', handler as EventListener);
    return () => window.removeEventListener('call-ended', handler as EventListener);
  }, [friend]);
  

  // Typing event throttling: send only once per typing session.
  const typingSentRef = useRef(false);
  const typingInactivityTimer = useRef<number | null>(null);

  const stopTyping = () => {
    try {
      if (!chatId) return;
      // send optional stop event; server may ignore unknown fields but it's harmless
      fetch('/api/messages/typing', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, action: 'stop' }),
      }).catch(() => {});
    } finally {
      typingSentRef.current = false;
      if (typingInactivityTimer.current) {
        clearTimeout(typingInactivityTimer.current as unknown as number);
        typingInactivityTimer.current = null;
      }
    }
  };

  const maybeStartTyping = (text: string) => {
    // If input is empty, ensure we send stop and clear state
    if (!text || text.trim() === '') {
      stopTyping();
      return;
    }
    // If we've already sent typing, just reset inactivity timer
    if (typingSentRef.current) {
      if (typingInactivityTimer.current) clearTimeout(typingInactivityTimer.current as unknown as number);
      typingInactivityTimer.current = window.setTimeout(() => {
        stopTyping();
      }, 6000);
      return;
    }

    // Send typing start event once
    try {
      fetch('/api/messages/typing', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, action: 'start' }),
      }).catch(() => {});
    } finally {
      typingSentRef.current = true;
      if (typingInactivityTimer.current) clearTimeout(typingInactivityTimer.current as unknown as number);
      typingInactivityTimer.current = window.setTimeout(() => {
        stopTyping();
      }, 6000);
    }
  };

  // cancelRecording функция-заглушка (реализуй по необходимости)
  const cancelRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.onstop = null;
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      setIsRecording(false);
      setRecordTime(0);
      audioChunksRef.current = [];
      if (recordInterval.current) clearInterval(recordInterval.current);
    }
  };

  const deleteGroup = async () => {
    if (!chatId || !isGroup || !confirm('Вы уверены, что хотите удалить эту группу?')) return;
    
    setDeletingGroup(true);
    try {
      const res = await fetch('/api/chats', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId }),
      });
      
      if (res.ok) {
        window.location.href = '/chat';
      } else {
        const data = await res.json();
        alert(data.error || 'Ошибка при удалении группы');
      }
    } catch (error) {
      console.error('Delete group error:', error);
      alert('Ошибка при удалении группы');
    } finally {
      setDeletingGroup(false);
      setShowGroupMenu(false);
    }
  };

  const updateGroupName = async () => {
    if (!chatId || !newGroupName.trim()) return;
    
    setSavingGroupName(true);
    try {
      const res = await fetch('/api/chats', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, name: newGroupName.trim() }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setGroupName(data.chat?.name || newGroupName);
        setFriendDisplayName(newGroupName);
        setEditingGroupName(false);
        setNewGroupName('');
      } else {
        alert('Ошибка при изменении названия');
      }
    } catch (error) {
      console.error('Update group name error:', error);
      alert('Ошибка при изменении названия');
    } finally {
      setSavingGroupName(false);
    }
  };

  const updateGroupAvatar = async (file: File) => {
    if (!chatId) return;
    
    setSavingGroupAvatar(true);
    try {
      // Read file as data URL
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        
        const res = await fetch('/api/chats', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, avatarUrl: dataUrl }),
        });
        
        if (res.ok) {
          const data = await res.json();
          setGroupAvatar(data.chat?.avatarUrl || null);
          setEditingGroupAvatar(false);
        } else {
          alert('Ошибка при загрузке аватара');
        }
        setSavingGroupAvatar(false);
      };
      reader.onerror = () => {
        alert('Ошибка при чтении файла');
        setSavingGroupAvatar(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Update group avatar error:', error);
      alert('Ошибка при загрузке аватара');
      setSavingGroupAvatar(false);
    }
  };

  // Блокировать/разблокировать пользователя в 1:1 чате
  const blockUser = async () => {
    if (!friend || !friend.id) return;
    
    console.log('[BLOCK] Starting block/unblock, current state:', isUserBlocked);
    setBlockingUser(true);
    try {
      const res = await fetch('/api/chats/block', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          targetUserId: friend.id, 
          blocked: !isUserBlocked 
        }),
      });
      
      console.log('[BLOCK] Response status:', res.status);
      
      if (res.ok) {
        const data = await res.json();
        console.log('[BLOCK] Success response:', data);
        setIsUserBlocked(!isUserBlocked);
        setShowPrivateMenu(false);
        alert('Успешно');
      } else {
        const error = await res.json();
        console.log('[BLOCK] Error response:', error);
        alert('Ошибка при блокировке пользователя');
      }
    } catch (error) {
      console.error('Block user error:', error);
      alert('Ошибка при блокировке пользователя');
    } finally {
      setBlockingUser(false);
    }
  };

  // Сохранить фон чата
  const saveChatBackground = async () => {
    if (!chatId || !chatBgInput.trim()) return;
    
    setSavingChatBg(true);
    try {
      const res = await fetch('/api/chats/background', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: chatId,
          backgroundUrl: chatBgInput.trim() || null
        }),
      });
      
      if (res.ok) {
        setChatBgUrl(chatBgInput.trim());
        setEditingChatBg(false);
        setChatBgInput('');
        setShowPrivateMenu(false);
        alert('Фон чата сохранён');
      } else {
        alert('Ошибка при сохранении фона');
      }
    } catch (error) {
      console.error('Save background error:', error);
      alert('Ошибка при сохранении фона');
    } finally {
      setSavingChatBg(false);
    }
  };

  // Закрываем меню действий при клике вне
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      
      // закрываем меню действий сообщения
      if (openActionMsgId) {
        if (!target.closest(`[data-action-container="${openActionMsgId}"]`)) {
          setOpenActionMsgId(null);
        }
      }
      
      // закрываем меню группы
      if (showGroupMenu && !target.closest('[data-group-menu]')) {
        setShowGroupMenu(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [openActionMsgId]);

  const TypingIndicator = ({ name }: { name?: string }) => (
    <div style={{
      fontSize: 13,
      color: '#888',
      padding: 0,
      marginTop: 2,
      marginBottom: 0,
      lineHeight: '1.1'
    }}>
      печатает...
    </div>
  );

  // --- Для видеокружков: объявить функции, если их нет ---
  // Остановить запись видео
  const stopVideoRecording = () => {
    if (videoRecorder && videoRecording) {
      videoRecorder.stop();
      setVideoRecording(false);
      if (videoTimer.current) clearInterval(videoTimer.current);
    }
  };

  const sendVideoMessage = async () => {
    if (!videoBlob || !chatId || !session) return;

    try {
      const tempId = 'temp-video-' + Date.now();
      const tempMsg: Message = {
        id: tempId,
        sender: (session?.user as any)?.id || '',
        text: '',
        createdAt: new Date().toISOString(),
        audioUrl: undefined,
        videoUrl: undefined,
        _key: tempId,
        _persisted: false,
        _failed: false,
      };
      setMessages(prev => [...prev, tempMsg]);

      const formData = new FormData();
      formData.append('chatId', chatId);
      formData.append('video', videoBlob, 'circle.webm');

      const res = await fetch('/api/messages/video-upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) {
        const txt = await res.text();
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _failed: true } : m));
        alert('Ошибка отправки видео: ' + txt);
      } else {
        const data = await res.json();
        if (data.videoUrl && data.message && data.message.id) {
          setMessages(prev => prev.map(m => m.id === tempId ? {
            ...m,
            id: data.message.id,
            createdAt: data.message.createdAt || m.createdAt,
            videoUrl: data.videoUrl,
            _persisted: data.persisted !== false,
          } : m));
        }
      }
    } catch (err) {
      alert('Ошибка отправки видео: ' + err);
    } finally {
      cancelVideo();
    }
  };

  // NOTE: single Pusher subscription is handled below (avoid double subscriptions)

  // Отправка события "печатает"
  const sendTypingEvent = () => {
    if (!chatId) return;
    fetch('/api/messages/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId })
    });
  };

  // При открытии превью — запросить камеру и начать live preview
  useEffect(() => {
    if (showVideoPreview && !videoStream && !videoBlob) {
      (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 320, height: 320 }, audio: true });
          setVideoStream(stream);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          // Автоматически начать запись
          let mimeType = 'video/webm';
          if (!window.MediaRecorder.isTypeSupported(mimeType)) mimeType = '';
          const recorder = mimeType ? new window.MediaRecorder(stream, { mimeType }) : new window.MediaRecorder(stream);
          setVideoRecorder(recorder);
          setVideoChunks([]);
          setVideoRecording(true);
          setVideoTime(0);
          if (videoTimer.current) clearInterval(videoTimer.current);
          videoTimer.current = setInterval(() => setVideoTime(t => t + 1), 1000);
          let chunks: Blob[] = [];
          recorder.ondataavailable = (e) => {
            chunks.push(e.data);
          };
          recorder.onstop = async () => {
            if (videoTimer.current) clearInterval(videoTimer.current);
            setVideoRecording(false);
            setVideoTime(0);
            const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
            setVideoBlob(blob);
          };
          recorder.start();
        } catch (err) {
          alert('Не удалось получить доступ к камере: ' + err);
          setShowVideoPreview(false);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showVideoPreview]);
  // Отправить видео (реализовать позже)
  const sendVideo = () => {
    // TODO: реализовать отправку видео
    setShowVideoPreview(false);
    setVideoBlob(null);
    setVideoChunks([]);
    setVideoTime(0);
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }
  };
  // Отмена кружка
  const cancelVideo = () => {
    setShowVideoPreview(false);
    setVideoBlob(null);
    setVideoChunks([]);
    setVideoTime(0);
    setVideoRecording(false);
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }
    if (videoRecorder) {
      videoRecorder.ondataavailable = null;
      videoRecorder.onstop = null;
      setVideoRecorder(null);
    }
  };

  useEffect(() => {
    if (!session || !id || Array.isArray(id)) return;
    setUserId((session.user as any).id);
    const chatId = id as string;
    
    console.log('[CHAT-LOAD] Loading chat:', chatId);
    
    // --- Получить информацию о чате (может быть группа или 1:1) ---
    fetch(`/api/chats?chatId=${chatId}`, { credentials: 'include' })
      .then(res => {
        console.log('[CHAT-LOAD] Response status:', res.status);
        return res.json();
      })
      .then((data) => {
        console.log('[CHAT-LOAD] Chat data received:', data);
        const chat = data?.chat;
        // If no chat exists, return empty state
        if (!chat) {
          console.warn('[CHAT-LOAD] Chat not found');
          setChatId(null);
          setMessages([]);
          setIsGroup(false);
          return;
        }
        
        const _isGroup = !!chat.name;
        console.log('[CHAT-LOAD] Is group:', _isGroup, 'chat.name:', chat.name);
        setIsGroup(_isGroup);
        setGroupName(chat.name || null);
        setGroupAvatar(chat.avatarUrl || null);
        setChatId(chat.id);
        
        // Load block status for 1:1 chats
        if (!_isGroup && data.userBlockedContact !== undefined) {
          console.log('[CHAT-LOAD] User blocked contact:', data.userBlockedContact);
          setIsUserBlocked(data.userBlockedContact);
        }
        
        // Load background URL from API
        if (data.backgroundUrl) {
          console.log('[CHAT-LOAD] Background URL loaded:', data.backgroundUrl);
          setChatBgUrl(data.backgroundUrl);
        }
        
        if (_isGroup) {
          // Group chat: load all members
          console.log('[CHAT-LOAD] Loading group members:', chat.users);
          setGroupMembers(chat.users || []);
          const displayName = chat.name || 'Группа';
          setFriendDisplayName(displayName);
        } else {
          // 1:1 chat: load the other user as "friend"
          console.log('[CHAT-LOAD] Loading 1:1 chat, users:', chat.users);
          const otherUser = chat.users.find((u: any) => u.id !== (session.user as any).id);
          console.log('[CHAT-LOAD] Other user:', otherUser);
          if (otherUser) {
            setFriend(otherUser);
            const displayName = getFriendDisplayName(otherUser.id, otherUser.link ? `@${otherUser.link}` : (otherUser.login || ''));
            setFriendDisplayName(displayName);
          } else {
            console.error('[CHAT-LOAD] Other user not found in 1:1 chat');
          }
        }
        
        // load per-chat background URL from localStorage
        try {
          const key = `chat-bg-${chat.id}`;
          const stored = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
          if (stored) setChatBgUrl(stored);
        } catch (e) {
          console.warn('[CHAT BG] failed to read localStorage', e);
        }
        
        // Получить сообщения
        console.log('[CHAT-LOAD] Fetching messages for chat:', chat.id);
        fetch(`/api/messages?chatId=${chat.id}&limit=60`, { credentials: 'include' })
          .then(res => {
            console.log('[CHAT-LOAD] Messages response status:', res.status);
            return res.json();
          })
          .then(data => {
            console.log('[CHAT-LOAD] Messages data:', data);
            if (Array.isArray(data.messages)) {
                      const msgs = data.messages.map((msg: any) => ({
                          id: msg.id,
                          sender: msg.senderId,
                          text: msg.text,
                          createdAt: msg.createdAt,
                          audioUrl: msg.audioUrl || undefined,
                          videoUrl: msg.videoUrl || undefined,
                          thumbnailUrl: msg.thumbnailUrl || undefined,
                          status: msg.status || 'sent',
                          reactions: msg.reactions || [],
                          senderInfo: msg.senderInfo || undefined
                        }));
                console.log('[CHAT-LOAD] Loaded', msgs.length, 'messages');
                setMessages(msgs);
                // Прокручиваем в конец после загрузки сообщений
                setTimeout(() => {
                  if (chatScrollRef.current) {
                    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
                  }
                }, 100);

                // Mark unread messages from other user as read
                const myId = (session?.user as any)?.id;
                msgs.forEach((msg: Message) => {
                  if (msg.sender !== myId && msg.status === 'sent') {
                    // Send API request to mark as read
                    fetch('/api/messages/status', {
                      method: 'POST',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ messageId: msg.id, status: 'read' })
                    })
                      .then(res => {
                        if (res.ok) {
                          // Update local state immediately
                          setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'read' } : m));
                          console.log('[CHAT] Marked message as read:', msg.id);
                        } else {
                          console.error('[CHAT] Failed to mark message as read:', msg.id, res.status);
                        }
                      })
                      .catch(e => console.error('[CHAT] Failed to mark message as read', msg.id, e));
                  }
                });

                try {
                  localStorage.setItem('chat-messages', JSON.stringify(msgs));
                } catch {}
              } else {
                console.error('[CHAT-LOAD] Messages is not an array:', data);
                setMessages([]);
                try { localStorage.removeItem('chat-messages'); } catch {}
              }
            })
            .catch(err => {
              console.error('[CHAT-LOAD] Error loading messages:', err);
              setMessages([]);
            });
      })
      .catch(err => {
        console.error('[CHAT-LOAD] Error loading chat:', err);
      });
  }, [session, id]);

  // Прослушиваем изменения кастомных имён друзей
  useEffect(() => {
    const updateFriendName = () => {
      if (friend) {
        const displayName = getFriendDisplayName(friend.id, friend.link ? `@${friend.link}` : (friend.login || friend.name || ''));
        setFriendDisplayName(displayName);
      }
    };
    
    window.addEventListener('friend-name-changed', updateFriendName as EventListener);
    return () => window.removeEventListener('friend-name-changed', updateFriendName as EventListener);
  }, [friend]);

  // Копирование текста в буфер и удаление — вынесенные хелперы
  const handleCopy = async (text: string | undefined) => {
    try {
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      // небольшая обратная связь
      try { /* non-blocking */ (window as any).toast && (window as any).toast('Скопировано'); } catch {}
    } catch (err) {
      console.error('Copy failed', err);
    } finally {
      setOpenActionMsgId(null);
    }
  };

  // Accept the whole message object so we can handle both persisted and temp-uploaded messages.
  const handleDeleteMessage = async (msg: Message) => {
    setOpenActionMsgId(null);
    try {

      // If this is a temporary message (upload succeeded but DB create failed), the id may start with 'temp-'
      // In that case, try to delete the uploaded file directly on the server and remove locally.
      if (typeof msg.id === 'string' && msg.id.startsWith('temp-')) {
        const mediaUrl = msg.videoUrl || msg.audioUrl;
        if (mediaUrl) {
          const endpoint = '/api/messages/media-delete';
          console.log('[CHAT] Deleting temp message media:', mediaUrl, '->', endpoint);
          const res = await fetch(endpoint, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: mediaUrl }),
          });
          console.log('[CHAT] Media-delete response:', res.status, res.statusText);
          if (res.ok) {
            setMessages(prev => prev.filter(m => m.id !== msg.id));
            try { (window as any).toast && (window as any).toast('Сообщение и файл удалены'); } catch {}
            return;
          }
          const txt = await res.text().catch(() => '');
          try { (window as any).toast && (window as any).toast('Не удалось удалить файл на сервере'); } catch {}
          console.warn('[CHAT] media-delete failed:', res.status, txt);
          return;
        } else {
          // No uploaded media associated; nothing server-side to delete.
          setMessages(prev => prev.filter(m => m.id !== msg.id));
          try { (window as any).toast && (window as any).toast('Сообщение удалено'); } catch {}
          return;
        }
      }

      // Normal persisted message: call the main messages DELETE endpoint first
      const endpoint = `/api/messages/${msg.id}`;
      console.log('[CHAT] Deleting message (server-first):', msg.id, '->', endpoint);
      const res = await fetch(endpoint, { method: 'DELETE', credentials: 'include' });
      console.log('[CHAT] Delete response:', res.status, res.statusText);
      if (res.ok || res.status === 204) {
        // Remove from UI only after server confirms deletion
        setMessages(prev => prev.filter(m => m.id !== msg.id));
        try { (window as any).toast && (window as any).toast('Сообщение удалено'); } catch {}
        return;
      }

      // If server responded but not OK, show non-blocking error toast and do not remove locally
      const errorText = await res.text().catch(() => '');
      let errorMessage = 'Не удалось удалить сообщение';
      try {
        const errData = JSON.parse(errorText || '{}');
        if (errData && errData.error) errorMessage = errData.error;
      } catch {}
      try { (window as any).toast && (window as any).toast(errorMessage); } catch {}
    } catch (err) {
      console.error('Error deleting message:', err);
      try { (window as any).toast && (window as any).toast('Ошибка при удалении сообщения'); } catch {}
    }
  };

  // Подписка на Pusher для получения изменений статуса пользователя и сообщений
  useEffect(() => {
    if (!friend || !friend.id || !chatId) return;
    try {
      // Set window variables for socketClient adapter to know which channels to subscribe to
      if (typeof window !== 'undefined') {
        (window as any).__userId = session?.user?.id;
        (window as any).__chatId = chatId;
      }
      
      // use the shared socketClient instance (initialized once at module top)
      
      const onStatus = (payload: any) => {
        if (!payload || !payload.userId) return;
        setFriend(prev => prev && prev.id === payload.userId ? { ...prev, status: payload.status } : prev);
      };
      const onNewMessage = (data: any) => {
        // Поддерживаем оба формата: { message: {...} } и прямой объект
        const payload = data?.message ? data.message : data;
        if (!payload || !payload.id) return;

        // message may arrive without plaintext (server no longer broadcasts plaintext).
        const newMsg = {
          id: payload.id,
          sender: payload.sender || payload.senderId,
          text: payload.text || '', // might be empty if server didn't include plaintext
          createdAt: payload.createdAt || new Date().toISOString(),
          audioUrl: payload.audioUrl,
          videoUrl: payload.videoUrl,
          reactions: payload.reactions || [],
          senderInfo: payload.senderInfo || undefined
        };

        setMessages(prev => {
          // Если сообщение с таким id уже есть — игнорируем (дедупликация)
          if (prev.some(m => m.id === newMsg.id)) return prev;

          // Если есть временное сообщение (temp-...) с тем же текстом и отправителем — заменим его,
          // но сохраним внутренний _key, чтобы React не ремонтировал DOM элемент (избегаем дергания).
          // Try to match an optimistic temporary message (id starts with 'temp-') and replace it.
          // Primary match: same sender and identical text. Secondary match: when server didn't include text
          // (payload.text is empty), match by sender and by close createdAt timestamps (within 15s).
          const tempIndex = prev.findIndex(m => {
            if (typeof m.id !== 'string' || !m.id.startsWith('temp-')) return false;
            if (m.sender !== newMsg.sender) return false;
            // exact text match
            if (m.text && newMsg.text && m.text === newMsg.text) return true;
            // if server didn't send text, try matching by timestamp proximity
            if (!newMsg.text) {
              try {
                const a = new Date(m.createdAt).getTime();
                const b = new Date(newMsg.createdAt).getTime();
                if (isNaN(a) || isNaN(b)) return false;
                return Math.abs(a - b) < 15000; // 15 seconds
              } catch (e) {
                return false;
              }
            }
            return false;
          });
          if (tempIndex !== -1) {
            const copy = prev.slice();
            const existing = copy[tempIndex];
            // Preserve existing text if server message arrives without plaintext (encrypted payload).
            // Mark as pending decryption so that later the real text will overwrite it.
            copy[tempIndex] = ({
              ...existing,
              id: newMsg.id,
              text: newMsg.text ?? existing.text,
              createdAt: newMsg.createdAt,
              audioUrl: newMsg.audioUrl,
              videoUrl: newMsg.videoUrl,
              reactions: newMsg.reactions || [],
              _encryptedPending: !Boolean(newMsg.text),
            } as any);
            return copy;
          }

          // Иначе добавляем в конец — добавляем _key равный id, и запускаем анимацию для этого нового сообщения
          const toAdd = { ...newMsg, _key: newMsg.id };
          // помечаем для анимации
          setAnimatedMsgIds(prevAnim => new Set([...prevAnim, newMsg.id]));
          return [...prev, toAdd];
        });

        // Если payload не содержит текста — запросим расшифровку конкретного сообщения по id
        if (!payload.text) {
          (async () => {
            try {
              const r = await fetch('/api/messages/read', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messageId: payload.id })
              });
              if (r.ok) {
                const d = await r.json();
                if (d && typeof d.text === 'string') {
                  setMessages(prev => prev.map(m => m.id === payload.id ? { ...m, text: d.text } : m));
                }
              }
            } catch (e) {
              // non-blocking
              console.error('[CHAT] Failed to fetch decrypted message', e);
            }
          })();
        }

        // Автоматически прокручиваем к новому сообщению
        setTimeout(scrollToBottom, 50);
      };
      // mark-read/unread handlers removed (feature disabled)
      // Обработка события "печатает" - добавляем в реакции сообщения
      const onTypingIndicator = (data: { userId: string, name: string, timestamp: number }) => {
        try {
          if (!data || !data.userId) return;
          if (data.userId === (session?.user as any)?.id) return; // не показываем себе
          
          // Показываем typing indicator на 2 секунды
          setIsTyping(data.name || 'Пользователь');
          const timer = setTimeout(() => {
            setIsTyping(null);
          }, 2000);
          
          return () => clearTimeout(timer);
        } catch (e) {
          console.error('Error handling typing indicator event:', e);
        }
      };
      const onMessageDeleted = (data: any) => {
        try {
          if (!data || !data.messageId) return;
          const mid = data.messageId;
          setMessages(prev => prev.filter(m => m.id !== mid));
          setOpenActionMsgId(prev => (prev === mid ? null : prev));
        } catch (e) {
          console.error('Error handling message-deleted event', e);
        }
      };

      const onViewer = (data: any) => {
        try {
          if (!data || !data.userId) return;
          setViewers(prev => {
            const next = new Set(prev);
            if (data.action === 'enter') next.add(data.userId);
            else if (data.action === 'leave') next.delete(data.userId);
            return next;
          });
        } catch (e) {
          console.error('[Pusher] viewer-state handler error', e);
        }
      };

      // Обработчик для изменения статуса сообщения (например, при прочтении)
      const onMessageStatusChanged = (data: any) => {
        try {
          if (!data || !data.messageId) return;
          console.log('[Pusher] message-status-changed event received:', data);
          setMessages(prev => {
            const updated = prev.map(m => {
              if (m.id === data.messageId) {
                console.log('[Pusher] Updating message status:', m.id, 'from', m.status, 'to', data.status);
                return { ...m, status: data.status };
              }
              return m;
            });
            return updated;
          });
        } catch (e) {
          console.error('[Pusher] message-status-changed handler error', e);
        }
      };

      // Обработчик для изменения реакций на сообщение
      const onMessageReactionsChanged = (data: any) => {
        try {
          if (!data || !data.messageId) return;
          console.log('[SSE] message-reactions-changed event received:', data);
          setMessages(prev => {
            const updated = prev.map(m => {
              if (m.id === data.messageId) {
                console.log('[SSE] Updating message reactions:', m.id);
                return { ...m, reactions: data.reactions || [] };
              }
              return m;
            });
            return updated;
          });
        } catch (e) {
          console.error('[SSE] message-reactions-changed handler error', e);
        }
      };

      socketClient?.on('status-changed', onStatus);
      socketClient?.on('new-message', onNewMessage);
      socketClient?.on('typing-indicator', onTypingIndicator);
      socketClient?.on('message-deleted', onMessageDeleted);
      socketClient?.on('viewer-state', onViewer);
      socketClient?.on('message-status-changed', onMessageStatusChanged);
      socketClient?.on('message-reactions-changed', onMessageReactionsChanged);
      socketClient?.on('reaction-added', onMessageReactionsChanged);  // Alternative name
      socketClient?.on('reaction-removed', onMessageReactionsChanged);  // Alternative name
      
      // cleanup
      return () => {
        try {
          try { stopTyping(); } catch (e) {}
          try { socketClient?.off('status-changed', onStatus); } catch (e) {}
          try { socketClient?.off('new-message', onNewMessage); } catch (e) {}
          try { socketClient?.off('typing-indicator', onTypingIndicator); } catch (e) {}
          try { socketClient?.off('message-deleted', onMessageDeleted); } catch (e) {}
          try { socketClient?.off('viewer-state', onViewer); } catch (e) {}
          try { socketClient?.off('message-status-changed', onMessageStatusChanged); } catch (e) {}
          try { socketClient?.off('message-reactions-changed', onMessageReactionsChanged); } catch (e) {}
          try { socketClient?.off('reaction-added', onMessageReactionsChanged); } catch (e) {}
          try { socketClient?.off('reaction-removed', onMessageReactionsChanged); } catch (e) {}
        } catch (e) {}
      };
    } catch (e) {
      // ignore Pusher errors on client
    }
  }, [friend?.id, chatId]);

  useEffect(() => {
    if (session) {
      console.log('session:', session);
    }
  }, [session]);

  // Функция для автопрокрутки вниз
  const scrollToBottom = (smooth = true) => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !chatId || !session) return;
    
    // Проверяем блокировку в 1:1 чатах
    if (!isGroup && isUserBlocked) {
      alert('Вы не можете отправлять сообщения заблокированному пользователю');
      return;
    }
    
    // Создаем временный ID для сообщения
    const tempId = 'temp-' + Date.now();
    const messageText = newMessage.trim();
    
    // Немедленно добавляем сообщение в UI
    const tempMessage = {
      id: tempId,
      _key: tempId,
      sender: (session.user as any)?.id,
      text: messageText,
      createdAt: new Date().toISOString(),
      status: 'sent' as const,
      reactions: [],
      senderInfo: isGroup ? {
        id: (session.user as any)?.id || '',
        login: (session.user as any)?.name || '',
        link: (session.user as any)?.link || null,
        avatar: (session.user as any)?.image || null
      } : undefined
    };
    
    setMessages(prev => [...prev, tempMessage]);
    setNewMessage(''); // Очищаем поле ввода сразу
    
    // Устанавливаем анимацию для нового сообщения
    setAnimatedMsgIds(prev => {
      const next = new Set(prev);
      next.add(tempId);
      return next;
    });

    // Прокручиваем чат вниз
    setTimeout(scrollToBottom, 50);
    
    // Отправляем сообщение на сервер
    fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ chatId, text: messageText })
    })
      .then(async res => {
        const txt = await res.text();
        let data: any = null;
        try {
          data = txt ? JSON.parse(txt) : {};
        } catch (e) {
          console.error('[SEND] Failed to parse response as JSON', txt, e);
          throw new Error('Invalid JSON from /api/messages');
        }
        return data;
      })
        .then((data) => {
        if (!data || !data.message) {
          console.error('[SEND] Unexpected response from /api/messages', data);
          // mark temp message as failed
          setMessages((prev: any[]) => prev.map((msg: any) => msg.id === tempId ? { ...msg, _failed: true } : msg));
          return;
        }
        const serverMsg = data.message;
        if (serverMsg.dbError || serverMsg.persisted === false) {
          console.error('[SEND] DB write failed for message', serverMsg.dbError || serverMsg);
          // mark temp message as failed visually
          setMessages((prev: any[]) => prev.map((msg: any) => msg.id === tempId ? { ...msg, _failed: true } : msg));
        }
  // If a server message with the same id already exists (arrived via Pusher),
  // remove the temporary message instead of replacing it to avoid duplicates.
        setMessages((prev: any[]) => {
          try {
            if (prev.some((m: any) => m.id === serverMsg.id)) {
              // server message already present (Pusher delivered it): remove temp
              return prev.filter((m: any) => m.id !== tempId);
            }
            // Otherwise replace the temp message with the server-provided message data,
            // preserving _key so the DOM node/key stays stable.
            return prev.map((msg: any) => msg.id === tempId ? {
              ...msg,
              id: serverMsg.id,
              sender: serverMsg.senderId || serverMsg.sender,
              text: serverMsg.text || messageText,
              createdAt: serverMsg.createdAt || new Date().toISOString(),
              videoUrl: serverMsg.videoUrl,
              audioUrl: serverMsg.audioUrl,
              reactions: serverMsg.reactions || [],
              senderInfo: serverMsg.senderInfo || msg.senderInfo,
              _persisted: serverMsg.persisted !== false,
            } : msg);
          } catch (e) {
            console.error('[SEND] Error while merging server message', e);
            return prev;
          }
        });
        // we've sent the message — stop typing state
        try { stopTyping(); } catch (e) {}
      })
      .catch(err => {
        console.error('[SEND] Network or parse error sending message', err);
  setMessages((prev: any[]) => prev.map((msg: any) => msg.id === tempId ? { ...msg, _failed: true } : msg));
      });
  };

  // Показываем UI сразу, даже если данные ещё не загружены
  if (!session) {
    return (
      <div style={{minHeight:'100vh',display:'flex',alignItems:'flex-start',justifyContent:'center',background:'#111'}}>
        <div style={{marginTop:80,color:'#bbb',fontSize:22,fontWeight:500}}>
        </div>
      </div>
    );
  }

  // Адаптивные стили для ПК и мобильных
  const isMobile = typeof window !== 'undefined' ? window.innerWidth <= 600 : false;
  const chatContainerStyle = isMobile
    ? {
        width: '100%',
        maxWidth: '480px',
        minWidth: '0',
        height: '100vh',
        background: 'linear-gradient(120deg,#18191c 60%,#23242a 100%)',
        borderRadius: '0',
        boxShadow: '0 4px 32px #000c',
        margin: '0',
        display: 'flex',
        flexDirection: 'column' as const,
        padding: '12px 6px 8px 6px',
    position: 'relative' as const,
      }
    : {
        width: '100%',
        maxWidth: '480px',
        minWidth: '260px',
        height: '48vh',
        background: 'linear-gradient(120deg,#18191c 60%,#23242a 100%)',
        borderRadius: '18px',
        boxShadow: '0 4px 32px #000c',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column' as const,
        padding: '22px 18px 16px 18px',
        position: 'relative' as const,
      };
  // Apply chat background if provided (localStorage per-chat setting)
  const appliedChatContainerStyle = (() => {
    try {
      if (chatBgUrl) {
        return { ...chatContainerStyle, background: `linear-gradient(rgba(30,32,42,0.55),rgba(30,32,42,0.75)), url('${chatBgUrl}') center/cover no-repeat` };
      }
    } catch (e) {
      console.warn('[CHAT BG] failed to apply background', e);
    }
    return chatContainerStyle;
  })();
  // Default background to use when per-chat bg is not set
  const DEFAULT_CHAT_BG = 'https://cs13.pikabu.ru/post_img/2023/08/31/12/1693515176124117632.jpg';
  const avatarStyle = isMobile
    ? { width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover' as const, background: '#222', boxShadow: '0 2px 8px #2226' }
    : { width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' as const, background: '#222', boxShadow: '0 2px 8px #2226' };
  const nameStyle = isMobile
    ? { fontWeight: 600, fontSize: '18px', color: '#e3e8f0', display: 'flex', alignItems: 'center', gap: '6px' }
    : { fontWeight: 600, fontSize: '17px', color: '#e3e8f0', display: 'flex', alignItems: 'center', gap: '6px' };
  const ownBg = messageColor ? `linear-gradient(90deg, ${messageColor} 60%, #1e2a3a 100%)` : 'linear-gradient(90deg,#229ed9 60%,#1e2a3a 100%)';
  const messageStyle = isMobile
  ? { background: ownBg, color: '#fff', padding: '10px 18px', borderRadius: '12px', display: 'inline-block', boxShadow: '0 2px 6px #2222', fontSize: fontSize + 'px', maxWidth: '80vw', wordBreak: 'break-word' as const, position: 'relative' as 'relative' }
  : { background: ownBg, color: '#fff', padding: '7px 14px', borderRadius: '9px', display: 'inline-block', boxShadow: '0 2px 6px #2222', fontSize: fontSize + 'px', position: 'relative' as 'relative' };
  const inputStyle = isMobile
    ? { flex: 1, padding: '14px 16px', borderRadius: '12px', border: 'none', background: '#18191c', color: '#fff', fontSize: '16px', boxShadow: '0 2px 6px #2222', outline: 'none', minWidth: '0' }
    : { flex: 1, padding: '9px 12px', borderRadius: '9px', border: 'none', background: '#18191c', color: '#fff', fontSize: '14px', boxShadow: '0 2px 6px #2222', outline: 'none' };
  const buttonStyle = isMobile
    ? { width: 44, height: 44, borderRadius: isMobile ? 10 : 8, background: 'transparent', color: '#bbb', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, boxShadow: 'none', transition: 'opacity .14s', cursor: 'pointer' }
    : { width: 36, height: 36, borderRadius: isMobile ? 10 : 8, background: 'transparent', color: '#bbb', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: 'none', transition: 'opacity .14s', cursor: 'pointer' };
  return (
    <>
      <Head>
        <style>{`
          .chat-messages-scroll {
            overflow-y: auto;
            scrollbar-width: thin;
            scrollbar-color: rgba(180,216,255,0.35) rgba(34,34,34,0.1);
          }
          .chat-messages-scroll::-webkit-scrollbar {
            width: 8px;
            background: rgba(34,34,34,0.1);
          }
          .chat-messages-scroll::-webkit-scrollbar-thumb {
            background: linear-gradient(120deg,rgba(180,216,255,0.35),rgba(34,158,217,0.25));
            border-radius: 8px;
            opacity: 0.5;
            transition: opacity 0.2s;
          }
          .chat-messages-scroll:hover::-webkit-scrollbar-thumb {
            opacity: 0.8;
          }
          .chat-msg-appear {
            animation: chatMsgFadeIn 0.32s cubic-bezier(.2,.8,.2,1) both;
          }
          @keyframes chatMsgFadeIn {
            from {
              opacity: 0;
              transform: translateY(6px) scale(0.995);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
          @keyframes actionPop {
            from { opacity: 0; transform: translateY(-6px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes actionPopBottom {
            from { opacity: 0; transform: translateY(6px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes pulse {
            0% { box-shadow: 0 0 8px #ef4444aa, 0 0 12px #ef4444aa; }
            50% { box-shadow: 0 0 12px #ef4444, 0 0 20px #ef4444; }
            100% { box-shadow: 0 0 8px #ef4444aa, 0 0 12px #ef4444aa; }
          }
          .action-menu {
            animation: actionPop 0.22s cubic-bezier(.2,.9,.2,1) both;
          }
          .action-menu-bottom {
            animation: actionPopBottom 0.22s cubic-bezier(.2,.9,.2,1) both;
          }
          }
          .action-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: #e6eef8;
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 6px 8px;
            border-radius: 8px;
            transition: background .12s, transform .12s;
            font-size: 13px;
          }
          .action-btn:hover { background: rgba(255,255,255,0.03); transform: translateY(-1px); }
          .action-btn.icon-only { gap: 0; padding: 6px; }
          @keyframes reactionPop {
            0% {
              transform: scale(0.4) rotate(-30deg);
              opacity: 0;
            }
            50% {
              transform: scale(1.15) rotate(10deg);
            }
            100% {
              transform: scale(1) rotate(0deg);
              opacity: 1;
            }
          }
          @keyframes reactionRemove {
            0% {
              transform: scale(1) rotate(0deg);
              opacity: 1;
            }
            100% {
              transform: scale(0.3) rotate(30deg);
              opacity: 0;
            }
          }
          .reaction-animate {
            animation: reactionPop 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) both;
          }
          .reaction-remove {
            animation: reactionRemove 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55) both;
          }
        `}</style>
      </Head>
      <div 
        className={styles.chatPageContainer}
        style={{
          backgroundImage: chatBgUrl ? `url('${chatBgUrl}')` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
          backgroundRepeat: 'no-repeat'
        }}
      >
        <div 
          className={styles.chatPageHeader}
          style={chatBgUrl ? {
            background: 'rgba(20, 21, 26, 0.6)',
            backdropFilter: 'blur(8px)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
          } : undefined}
        >
          <div className={styles.chatPageHeaderLeft}>
            <button
              onClick={() => router.push('/chat')}
              className={styles.chatHeaderButton}
              title="Назад к чатам"
              aria-label="Назад к чатам"
            >
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15.5 19L9.5 12L15.5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          
          <div className={styles.chatPageHeaderInfo}>
            <div className={styles.chatPageHeaderTitle} style={{cursor: isGroup ? 'default' : 'pointer'}} onClick={() => !isGroup && friend && router.push(`/profile/${friend.id}`)}>
              {isGroup ? (
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', position: 'relative', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', background: groupAvatar ? 'transparent' : 'rgba(51, 153, 255, 0.15)',
                  border: groupAvatar ? 'none' : '2px solid rgba(51, 153, 255, 0.3)', fontSize: 20, color: '#3399ff', overflow: 'hidden'
                }}>
                  {groupAvatar ? (
                    <img src={groupAvatar} alt="group" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                  ) : (
                    <span>👥</span>
                  )}
                </div>
              ) : (
                <img src={friend?.avatar || '/window.svg'} alt="avatar" className={styles.chatPageHeaderAvatar} style={{cursor: 'pointer'}} />
              )}
              <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                  {isGroup && (
                    <img src="/group-icon.svg" alt="group" style={{width: 18, height: 18, opacity: 0.9}} />
                  )}
                  <span style={{cursor: isGroup ? 'default' : 'pointer'}}>{friendDisplayName || <span style={{color:'#888'}}>Загрузка...</span>}</span>
                  {!isGroup && friend?.role === 'admin' && <img src="/role-icons/admin.svg" alt="admin" title="Админ" style={{ width: 14, height: 14 }} />}
                  {!isGroup && friend?.role === 'moderator' && <img src="/role-icons/moderator.svg" alt="moderator" title="Модератор" style={{ width: 14, height: 14 }} />}
                  {!isGroup && friend?.role === 'verif' && <img src="/role-icons/verif.svg" alt="verif" title="Верифицирован" style={{ width: 14, height: 14 }} />}
                  {!isGroup && friend?.role === 'pepe' && <img src="/role-icons/pepe.svg" alt="pepe" title="Пепешка" style={{ width: 14, height: 14 }} />}
                </div>
                <div className={styles.chatPageHeaderStatus} style={{fontSize: 11, marginLeft: 0}}>
                  {isGroup ? (
                    <span style={{ color: '#888' }}>{groupMembers.length} участников</span>
                  ) : isTyping ? (
                    <span style={{ color: '#64b5f6' }}>печатает...</span>
                  ) : isUserBlocked ? (
                    <span style={{ color: '#888' }}>был(а) в сети очень давно</span>
                  ) : (
                    friend?.status === 'dnd' ? 'был(а) недавно' : (friend?.status === 'online' ? 'в сети' : 'не в сети')
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className={styles.chatPageHeaderRight}>
            <div style={{display: 'flex', alignItems: 'center', gap: 0, background: 'rgba(15, 15, 20, 0.8)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 24, padding: '6px 10px', backdropFilter: 'blur(8px)'}}>
              {!isGroup && (
                <>
                  <button
                    aria-label="Позвонить"
                    title="Позвонить"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!friend || !friend.id) return;
                      try { call.startCall({ type: 'phone', targetId: friend.id, targetName: friendDisplayName || friend.link ? `@${friend.link}` : (friend.login || friend.name), targetAvatar: friend.avatar || undefined }); } catch (err) {}
                    }}
                    style={{background: 'transparent', border: 'none', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64b5f6', transition: 'all 0.2s'}}
                    onMouseEnter={(e) => {e.currentTarget.style.color = '#64b5f6'}}
                    onMouseLeave={(e) => {e.currentTarget.style.color = '#64b5f6'}}
                  >
                    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                  </button>
                  <div style={{width: '1px', height: 16, background: 'rgba(255, 255, 255, 0.1)'}} />
                </>
              )}
              <button
                data-group-menu
                aria-label="Меню"
                title="Меню"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isGroup) {
                    setShowGroupMenu(!showGroupMenu);
                  } else {
                    setShowPrivateMenu(!showPrivateMenu);
                  }
                }}
                style={{background: 'transparent', border: 'none', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64b5f6', transition: 'all 0.2s', position: 'relative'}}
                onMouseEnter={(e) => {e.currentTarget.style.color = '#64b5f6'}}
                onMouseLeave={(e) => {e.currentTarget.style.color = '#64b5f6'}}
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="2"/>
                  <circle cx="12" cy="12" r="2"/>
                  <circle cx="12" cy="19" r="2"/>
                </svg>
                {showGroupMenu && isGroup && (
                  <div data-group-menu style={{position: 'absolute', top: '100%', right: 0, background: 'rgba(20, 21, 26, 0.95)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 12, marginTop: 8, backdropFilter: 'blur(8px)', boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 0, padding: 0, minWidth: 180, overflow: 'hidden'}}>
                    {/* Edit name button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setNewGroupName(groupName || '');
                        setEditingGroupName(true);
                      }}
                      title="Сменить название"
                      style={{width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', color: '#e6eef8', cursor: 'pointer', textAlign: 'left', borderRadius: 0, transition: 'background 0.15s', display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, borderBottom: '1px solid rgba(255, 255, 255, 0.05)'}}
                      onMouseEnter={(e) => {e.currentTarget.style.background = 'rgba(100, 181, 246, 0.12)'}}
                      onMouseLeave={(e) => {e.currentTarget.style.background = 'transparent'}}
                    >
                      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9"/>
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19H4v-3L16.5 3.5z"/>
                      </svg>
                      <span>Сменить название</span>
                    </button>

                    {/* Edit avatar button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingGroupAvatar(true);
                      }}
                      title="Сменить аватар"
                      style={{width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', color: '#e6eef8', cursor: 'pointer', textAlign: 'left', borderRadius: 0, transition: 'background 0.15s', display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, borderBottom: '1px solid rgba(255, 255, 255, 0.05)'}}
                      onMouseEnter={(e) => {e.currentTarget.style.background = 'rgba(100, 181, 246, 0.12)'}}
                      onMouseLeave={(e) => {e.currentTarget.style.background = 'transparent'}}
                    >
                      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                      <span>Сменить аватар</span>
                    </button>

                    {/* Delete group button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteGroup();
                      }}
                      disabled={deletingGroup}
                      title="Удалить группу"
                      style={{width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', color: '#ff6b6b', cursor: deletingGroup ? 'not-allowed' : 'pointer', textAlign: 'left', borderRadius: 0, transition: 'background 0.15s', display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, opacity: deletingGroup ? 0.5 : 1}}
                      onMouseEnter={(e) => {if (!deletingGroup) e.currentTarget.style.background = 'rgba(255, 107, 107, 0.12)'}}
                      onMouseLeave={(e) => {e.currentTarget.style.background = 'transparent'}}
                    >
                      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>
                      </svg>
                      <span>Удалить группу</span>
                    </button>
                  </div>
                )}
                {showPrivateMenu && !isGroup && (
                  <div data-private-menu style={{position: 'absolute', top: '100%', right: 0, background: 'rgba(20, 21, 26, 0.95)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 12, marginTop: 8, backdropFilter: 'blur(8px)', boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 0, padding: 0, minWidth: 180, overflow: 'hidden'}}>
                    {/* Block/Unblock button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        blockUser();
                      }}
                      disabled={blockingUser}
                      title={isUserBlocked ? 'Разблокировать' : 'Заблокировать'}
                      style={{width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', color: isUserBlocked ? '#4fc3f7' : '#e6eef8', cursor: blockingUser ? 'not-allowed' : 'pointer', textAlign: 'left', borderRadius: 0, transition: 'background 0.15s', display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, opacity: blockingUser ? 0.5 : 1}}
                      onMouseEnter={(e) => {if (!blockingUser) e.currentTarget.style.background = 'rgba(100, 181, 246, 0.12)'}}
                      onMouseLeave={(e) => {e.currentTarget.style.background = 'transparent'}}
                    >
                      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                      </svg>
                      <span>{isUserBlocked ? 'Разблокировать' : 'Заблокировать'}</span>
                    </button>

                    {/* Chat background button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingChatBg(true);
                        setChatBgInput(chatBgUrl || '');
                      }}
                      title="Установить фон чата"
                      style={{width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', color: '#e6eef8', cursor: 'pointer', textAlign: 'left', borderRadius: 0, transition: 'background 0.15s', display: 'flex', alignItems: 'center', gap: 12, fontSize: 14}}
                      onMouseEnter={(e) => {e.currentTarget.style.background = 'rgba(100, 181, 246, 0.12)'}}
                      onMouseLeave={(e) => {e.currentTarget.style.background = 'transparent'}}
                    >
                      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                      <span>Фон чата</span>
                    </button>
                  </div>
                )}
              </button>
            </div>
          </div>
        </div>
        <div 
          className={styles.messagesContainer} 
          ref={chatScrollRef}
          style={chatBgUrl ? {
            background: 'transparent'
          } : undefined}
        >
          {!chatId ? (
            <div style={{ color: '#bbb', fontSize: 16, textAlign: 'center', marginTop: 32 }}><i>Нет общего чата. Добавьте в друзья, чтобы начать переписку</i></div>
          ) : messages.length === 0 ? (
            <div style={{ color: '#bbb', fontSize: 16, textAlign: 'center', marginTop: 32 }}><i>Нет сообщений</i></div>
          ) : (
            (() => {
              // Группировка сообщений по дням
              const groups: { label: string; date: string; items: Message[] }[] = [];
              const today = new Date();
              const yesterday = new Date();
              yesterday.setDate(today.getDate() - 1);
              const dayBeforeYesterday = new Date();
              dayBeforeYesterday.setDate(today.getDate() - 2);
              function getDayLabel(dateStr: string) {
                const date = new Date(dateStr);
                const d = date.getDate(), m = date.getMonth(), y = date.getFullYear();
                if (d === today.getDate() && m === today.getMonth() && y === today.getFullYear()) return 'Сегодня';
                if (d === yesterday.getDate() && m === yesterday.getMonth() && y === yesterday.getFullYear()) return 'Вчера';
                if (d === dayBeforeYesterday.getDate() && m === dayBeforeYesterday.getMonth() && y === dayBeforeYesterday.getFullYear()) return 'Позавчера';
                return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
              }
              let lastDate = '';
              messages.forEach(msg => {
                const date = new Date(msg.createdAt);
                const dateKey = date.toISOString().slice(0, 10);
                if (!groups.length || groups[groups.length - 1].date !== dateKey) {
                  groups.push({ label: getDayLabel(msg.createdAt), date: dateKey, items: [msg] });
                } else {
                  groups[groups.length - 1].items.push(msg);
                }
              });
              return groups.map(group => (
                <React.Fragment key={group.date}>
                  <div style={{ textAlign: 'center', color: '#bbb', fontWeight: 500, fontSize: 15, margin: '18px 0 8px 0', letterSpacing: 0.5 }}>
                    {group.label}
                  </div>
                  {group.items.map((msg) => {
                    // render system messages (centered) like day separators
                    if ((msg as any)._system) {
                      return (
                        <div key={msg._key || msg.id} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                          <div style={{ textAlign: 'center', color: '#9aa0a6', fontWeight: 500, fontSize: 13, margin: '8px 0', letterSpacing: 0.4, padding: '4px 8px', maxWidth: '78%', lineHeight: 1.1 }}>{msg.text}</div>
                        </div>
                      );
                    }

                    const isOwn = msg.sender === (session?.user as any)?.id;
                    
                    // In group chats: get sender name
                    const senderName = isGroup 
                      ? groupMembers.find(m => m.id === msg.sender)?.login || 'Unknown'
                      : null;
                    // --- callback ref для анимации только для новых сообщений ---
                    const getMsgRef = (el: HTMLDivElement | null) => {
                      if (el && animatedMsgIds.has(msg.id)) {
                        el.classList.add('chat-msg-appear');
                        setTimeout(() => {
                          el.classList.remove('chat-msg-appear');
                          setAnimatedMsgIds(prev => {
                            const next = new Set(prev);
                            next.delete(msg.id);
                            return next;
                          });
                        }, 400);
                      }
                    };
                    return (
                      <>
                        {/* Overlay с размытием при выборе сообщения */}
                        {openActionMsgId === msg.id && (
                          <div
                            style={{
                              position: 'fixed',
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              background: 'rgba(0,0,0,0.3)',
                              backdropFilter: 'blur(4px)',
                              zIndex: 99,
                              cursor: 'pointer'
                            }}
                            onClick={() => setOpenActionMsgId(null)}
                          />
                        )}
                        <div
                          key={msg._key || msg.id}
                          ref={getMsgRef}
                          className={`${styles.messageBubble} ${isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther} ${animatedMsgIds.has(msg.id) ? 'chat-msg-appear' : ''}`}
                          onMouseEnter={() => setHoveredMsgId(msg.id)}
                          onMouseLeave={() => setHoveredMsgId(null)}
                          style={{
                            opacity: openActionMsgId && openActionMsgId !== msg.id ? 0.4 : 1,
                            transition: 'opacity 0.2s ease',
                            position: 'relative'
                          }}
                        >
                        {/* Avatar на левой стороне для других сообщений */}
                        {!isOwn && (
                          <img
                            src={friend?.avatar || '/default-avatar.png'}
                            alt={friend?.login || 'User'}
                            className={styles.messageAvatar}
                            style={{ display: 'block' }}
                          />
                        )}

                        {/* Оборачиваем контент сообщения в контейнер с поддержкой клика (ПК) и долгого нажатия (моб)
                            Меню действий появляется для собственных сообщений (Copy / Delete). */}
                        <div
                          data-action-container={msg.id}
                          style={{ position: 'relative', display: 'inline-flex' }}
                        >
                          <div
                            onClick={(e) => {
                              // ПК: открываем/закрываем меню по двойному клику (double-tap)
                              try { e.stopPropagation(); } catch {}
                              if (isMobile) return;
                              const now = Date.now();
                              const last = lastTapRef.current;
                              const DOUBLE_TAP_MS = 350;
                              if (last && (now - last) <= DOUBLE_TAP_MS) {
                                // double click detected — toggle menu
                                if (openActionMsgId !== msg.id) {
                                  setOpenActionMsgId(msg.id);
                                  // Auto-scroll to ensure message is visible
                                  setTimeout(() => {
                                    const ref = document.querySelector(`[data-action-container="${msg.id}"]`);
                                    if (ref) {
                                      ref.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }
                                  }, 50);
                                } else {
                                  setOpenActionMsgId(null);
                                }
                                lastTapRef.current = null;
                              } else {
                                // record first click, wait for second
                                lastTapRef.current = now;
                                setTimeout(() => {
                                  if (lastTapRef.current === now) lastTapRef.current = null;
                                }, DOUBLE_TAP_MS + 50);
                              }
                            }}
                            onTouchEnd={(e) => {
                              // Моб: обработка двойного тапа (2 клика)
                              if (!isMobile) return;
                              try { e.stopPropagation(); } catch {}
                              const now = Date.now();
                              const last = lastTapRef.current;
                              const DOUBLE_TAP_MS = 350;
                              if (last && (now - last) <= DOUBLE_TAP_MS) {
                                // double tap — toggle menu
                                if (openActionMsgId !== msg.id) {
                                  setOpenActionMsgId(msg.id);
                                  // Auto-scroll to ensure message is visible
                                  setTimeout(() => {
                                    const ref = document.querySelector(`[data-action-container="${msg.id}"]`);
                                    if (ref) {
                                      ref.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }
                                  }, 50);
                                } else {
                                  setOpenActionMsgId(null);
                                }
                                lastTapRef.current = null;
                              } else {
                                lastTapRef.current = now;
                              }
                            }}
                            style={{ display: 'inline-block' }}
                          >
                            {msg.videoUrl ? (
                              <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: isOwn ? 'flex-end' : 'flex-start',
                                gap: 2,
                                margin: '2px 0',
                                marginLeft: 0,
                              }}>
                                <VideoCircle src={msg.videoUrl.startsWith('/') ? msg.videoUrl : '/' + msg.videoUrl} poster={msg.thumbnailUrl} />
                                <span style={{ fontSize: 13, color: '#bbb', marginTop: 2 }}>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            ) : msg.audioUrl ? (
                              <VoiceMessage audioUrl={msg.audioUrl} isOwn={isOwn} />
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: isOwn ? 'flex-end' : 'flex-start', position: 'relative' }}>
                                {/* Show sender name/link in group chats (for messages from others) */}
                                {isGroup && !isOwn && msg.senderInfo && (
                                  (() => {
                                    // Get custom name if exists
                                    const customName = getFriendDisplayName(msg.senderInfo.id, msg.senderInfo.link ? `@${msg.senderInfo.link}` : msg.senderInfo.login);
                                    const isCustomName = customName !== (msg.senderInfo.link ? `@${msg.senderInfo.link}` : msg.senderInfo.login);
                                    
                                    // If it's a custom name, show as plain text instead of link
                                    if (isCustomName) {
                                      return (
                                        <span style={{
                                          fontSize: 12,
                                          color: '#ffffff',
                                          fontWeight: 600,
                                          marginBottom: '2px'
                                        }}>
                                          {customName}
                                        </span>
                                      );
                                    }
                                    
                                    // Otherwise show as white link
                                    return (
                                      <a 
                                        href={msg.senderInfo.link ? `/profile/${msg.senderInfo.link}` : `/profile/${msg.senderInfo.id}`}
                                        style={{ 
                                          fontSize: 12, 
                                          color: '#ffffff',
                                          fontWeight: 600, 
                                          marginBottom: '2px',
                                          textDecoration: 'none',
                                          transition: 'opacity 0.2s'
                                        }}
                                        onMouseEnter={(e) => {e.currentTarget.style.opacity = '0.8'}}
                                        onMouseLeave={(e) => {e.currentTarget.style.opacity = '1'}}
                                      >
                                        {msg.senderInfo.link ? `@${msg.senderInfo.link}` : msg.senderInfo.login}
                                      </a>
                                    );
                                  })()
                                )}
                                <div className={isOwn ? styles.messageTextOwn : styles.messageTextOther}>
                                  <span>{msg.text}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span className={styles.messageTime}>
                                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  {isOwn && (msg.status === 'sent' || msg.status === 'read') && (
                                    <MessageStatus status={msg.status} isOwnMessage={true} />
                                  )}
                                </div>

                                {/* Reactions as badge - positioned on message */}
                                {msg.reactions && msg.reactions.length > 0 && (
                                  <div style={{
                                    display: 'flex',
                                    gap: '6px',
                                    marginTop: '-2px',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    position: 'relative',
                                    zIndex: 5
                                  }}>
                                    {msg.reactions.map((reaction: any, idx: number) => (
                                      <div
                                        key={`${reaction.emoji}-${idx}`}
                                        className={
                                          removingReactions.has(`${msg.id}-${reaction.emoji}`)
                                            ? 'reaction-remove'
                                            : recentReactions[`${msg.id}-${reaction.emoji}`]
                                            ? 'reaction-animate'
                                            : ''
                                        }
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '2px',
                                          position: 'relative',
                                          background: 'rgba(100, 181, 246, 0.15)',
                                          border: '1px solid rgba(100, 181, 246, 0.3)',
                                          borderRadius: '12px',
                                          padding: '2px 6px',
                                          cursor: 'pointer',
                                          transition: 'all 0.2s ease'
                                        }}
                                        title={reaction.users?.map((u: any) => u.login).join(', ') || 'No users'}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.background = 'rgba(100, 181, 246, 0.25)';
                                          e.currentTarget.style.borderColor = 'rgba(100, 181, 246, 0.5)';
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.background = 'rgba(100, 181, 246, 0.15)';
                                          e.currentTarget.style.borderColor = 'rgba(100, 181, 246, 0.3)';
                                        }}
                                      >
                                        {/* Emoji */}
                                        <span 
                                          onClick={() => {
                                            const reactionKey = `${msg.id}-${reaction.emoji}`;
                                            // Mark as removing for animation
                                            setRemovingReactions(prev => new Set([...prev, reactionKey]));
                                            
                                            // Optimistic update - remove immediately
                                            setMessages(prev => prev.map(m => 
                                              m.id === msg.id 
                                                ? { ...m, reactions: (m.reactions || []).filter(r => r.emoji !== reaction.emoji) }
                                                : m
                                            ));
                                            
                                            fetch('/api/messages/reactions', {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              credentials: 'include',
                                              body: JSON.stringify({ messageId: msg.id, emoji: reaction.emoji })
                                            }).then(r => r.json()).then((data) => {
                                              setMessages(prev => prev.map(m => 
                                                m.id === msg.id 
                                                  ? { ...m, reactions: data.reactions || [] }
                                                  : m
                                              ));
                                              setTimeout(() => {
                                                setRemovingReactions(prev => {
                                                  const next = new Set(prev);
                                                  next.delete(reactionKey);
                                                  return next;
                                                });
                                              }, 300);
                                            }).catch(err => {
                                              console.error('Reaction error:', err);
                                              // Revert on error
                                              setMessages(prev => prev.map(m => 
                                                m.id === msg.id 
                                                  ? { ...m, reactions: [...(m.reactions || []), reaction] }
                                                  : m
                                              ));
                                              setRemovingReactions(prev => {
                                                const next = new Set(prev);
                                                next.delete(reactionKey);
                                                return next;
                                              });
                                            });
                                          }}
                                          style={{
                                            cursor: 'pointer',
                                            fontSize: '16px',
                                            display: 'flex',
                                            alignItems: 'center'
                                          }}
                                        >
                                          {reaction.emoji}
                                        </span>

                                        {/* User avatars or count */}
                                        <span
                                          style={{
                                            fontSize: '11px',
                                            color: '#64b5f6',
                                            fontWeight: 'bold'
                                          }}
                                          title={reaction.users?.map((u: any) => u.login).join(', ')}
                                        >
                                          {reaction.count}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Action menu with reactions - TOP */}
                            {openActionMsgId === msg.id && (
                              <div
                                className="action-menu"
                                onClick={(e) => { e.stopPropagation(); }}
                                role="menu"
                                style={{
                                  position: 'absolute',
                                  top: isMobile ? -80 : -70,
                                  right: isOwn ? (isMobile ? -8 : -12) : 'auto',
                                  left: isOwn ? 'auto' : (isMobile ? -8 : -12),
                                  background: 'rgba(15, 17, 19, 0.95)',
                                  backdropFilter: 'blur(8px)',
                                  border: '1px solid rgba(255,255,255,0.08)',
                                  padding: isMobile ? '8px 12px' : '8px 14px',
                                  borderRadius: 20,
                                  display: 'flex',
                                  flexDirection: 'row',
                                  gap: isMobile ? 2 : 4,
                                  alignItems: 'center',
                                  boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
                                  zIndex: 110,
                                  transformOrigin: isOwn ? 'right bottom' : 'left bottom',
                                  width: 'fit-content',
                                }}
                                data-action-container={msg.id}
                              >
                                {/* Reactions picker - horizontal bar style */}
                                <div style={{
                                  display: 'flex',
                                  gap: '2px',
                                  alignItems: 'center',
                                  width: 'fit-content'
                                }}>
                                  {['❤️', '👍', '👎', '💩'].map((emoji) => (
                                    <button
                                      key={emoji}
                                      onClick={(e) => {
                                        try { e.stopPropagation(); } catch {}
                                        // Mark reaction for animation
                                        const reactionKey = `${msg.id}-${emoji}`;
                                        setRecentReactions(prev => ({ ...prev, [reactionKey]: Date.now() }));
                                        setTimeout(() => {
                                          setRecentReactions(prev => {
                                            const next = { ...prev };
                                            delete next[reactionKey];
                                            return next;
                                          });
                                        }, 500);
                                        
                                        fetch('/api/messages/reactions', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          credentials: 'include',
                                          body: JSON.stringify({ messageId: msg.id, emoji })
                                        }).then(r => r.json()).then((data) => {
                                          setMessages(prev => prev.map(m => 
                                            m.id === msg.id 
                                              ? { ...m, reactions: data.reactions || [] }
                                              : m
                                          ));
                                          setOpenActionMsgId(null);
                                        }).catch(err => console.error('Reaction error:', err));
                                      }}
                                      title={emoji}
                                      style={{
                                        background: 'transparent',
                                        border: 'none',
                                        borderRadius: '8px',
                                        padding: '4px 6px',
                                        cursor: 'pointer',
                                        fontSize: '20px',
                                        transition: 'all 0.15s ease',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        minWidth: '32px',
                                        height: '32px'
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                                        e.currentTarget.style.transform = 'scale(1.15)';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.transform = 'scale(1)';
                                      }}
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Action menu with copy/delete - BOTTOM (only for own messages) */}
                            {openActionMsgId === msg.id && isOwn && (
                              <div
                                className="action-menu action-menu-bottom"
                                onClick={(e) => { e.stopPropagation(); }}
                                role="menu"
                                style={{
                                  position: 'absolute',
                                  bottom: isMobile ? -80 : -70,
                                  right: isMobile ? -8 : -12,
                                  left: 'auto',
                                  background: 'rgba(15, 17, 19, 0.95)',
                                  backdropFilter: 'blur(8px)',
                                  border: '1px solid rgba(255,255,255,0.08)',
                                  padding: isMobile ? '8px 12px' : '10px 12px',
                                  borderRadius: 20,
                                  display: 'flex',
                                  flexDirection: 'row',
                                  gap: isMobile ? 4 : 8,
                                  alignItems: 'center',
                                  boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
                                  zIndex: 110,
                                  transformOrigin: 'right top',
                                  width: 'fit-content',
                                }}
                                data-action-container={msg.id}
                              >
                                {/* Copy button */}
                                <button
                                  onClick={(e) => { try { e.stopPropagation(); } catch {} handleCopy(msg.text); }}
                                  title="Копировать"
                                  aria-label="Копировать"
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                                    e.currentTarget.style.transform = 'scale(1.1)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.transform = 'scale(1)';
                                  }}
                                  style={{ 
                                    background: 'transparent', 
                                    border: 'none', 
                                    padding: '8px 12px', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    cursor: 'pointer', 
                                    color: '#a8b5c4', 
                                    borderRadius: 12, 
                                    transition: 'all .15s ease',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{ display: 'block', color: 'inherit', marginRight: 6 }}>
                                    <path d="M16 1H4a2 2 0 00-2 2v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                    <rect x="8" y="5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                  <span style={{ fontSize: '12px', fontWeight: 500 }}>Копировать</span>
                                </button>

                                {/* Delete button */}
                                <button
                                  onClick={(e) => { try { e.stopPropagation(); } catch {} handleDeleteMessage(msg); }}
                                  title="Удалить"
                                  aria-label="Удалить"
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(255,107,107,0.1)';
                                    e.currentTarget.style.transform = 'scale(1.1)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.transform = 'scale(1)';
                                  }}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    padding: '8px 12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: '#ff7b7b',
                                    borderRadius: 12,
                                    transition: 'all .15s ease',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{ display: 'block', color: 'inherit', marginRight: 6 }}>
                                    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                  <span style={{ fontSize: '12px', fontWeight: 500 }}>Удалить</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Avatar на правой стороне для собственных сообщений */}
                        {isOwn && session?.user && (
                          <img
                            src={session.user.avatar || session.user.image || '/default-avatar.png'}
                            alt={session.user.name || 'You'}
                            className={styles.messageAvatar}
                            style={{ display: 'block' }}
                          />
                        )}
                      </div>
                    </>
                    );
                  })}
                </React.Fragment>
              ));
            })()
          )}
          {/* typing indicator removed from messages area — moved to header */}
        </div>
        <form
          onSubmit={handleSendMessage}
          className={styles.inputArea}
          style={{ 
            opacity: !chatId ? 0.5 : 1, 
            pointerEvents: !chatId ? 'none' : 'auto',
            ...(chatBgUrl && {
              background: 'rgba(20, 21, 26, 0.6)',
              backdropFilter: 'blur(8px)',
              borderTop: 'none',
              boxShadow: 'none'
            })
          }}
        >
          {/* Кнопка скрепки слева */}
          <button
            type="button"
            className={styles.inputButton}
            title="Отправить фото или файл"
            aria-label="Отправить фото или файл"
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <img src="/file.svg" alt="Файл" style={{ display: 'block', width: 18, height: 18 }} />
          </button>
          {/* Центрированный кружок поверх чата с затемнением */}
          {showVideoPreview && (
            <div style={{
              position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', zIndex: 2000,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(20,22,30,0.85)',
              animation: 'fadeInOverlay 0.25s',
            }}>
              <style>{`
                @keyframes fadeInOverlay { from { opacity: 0; } to { opacity: 1; } }
                @keyframes popInCircle { from { transform: scale(0.7); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                .circle-anim { animation: popInCircle 0.32s cubic-bezier(.23,1.02,.36,1) both; }
              `}</style>
              {/* Кружок и кнопки */}
              <div style={{
                position: 'relative', zIndex: 2001, display: 'flex', flexDirection: 'column', alignItems: 'center',
              }}>
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="circle-anim"
                  style={{
                    width: 240,
                    height: 240,
                    borderRadius: '50%',
                    background: '#111',
                    objectFit: 'cover',
                    border: '3px solid #64b5f6',
                    boxShadow: '0 0 24px rgba(100, 181, 246, 0.3), 0 8px 32px rgba(0, 0, 0, 0.4)',
                    transition: 'transform 0.35s ease',
                    transform: videoRecording ? 'rotate(90deg)' : 'none'
                  }}
                />
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 16, 
                  marginTop: 32,
                  background: 'rgba(20, 20, 24, 0.95)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 24,
                  padding: '10px 20px',
                  backdropFilter: 'blur(8px)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                }}>
                  {videoRecording && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444aa', animation: 'pulse 1.5s infinite' }} />
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#f0f3f8', fontSize: 13, minWidth: '32px' }}>
                        {String(Math.floor(videoTime / 60)).padStart(2, '0')}:{String(videoTime % 60).padStart(2, '0')}
                      </span>
                    </div>
                  )}
                  {videoRecording && (
                    <button onClick={stopVideoRecording} style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#64b5f6',
                      cursor: 'pointer',
                      padding: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s',
                    }} title="Остановить запись" aria-label="Остановить запись"
                      onMouseEnter={(e) => {e.currentTarget.style.color = '#64b5f6'; e.currentTarget.style.transform = 'scale(1.1)'}}
                      onMouseLeave={(e) => {e.currentTarget.style.color = '#64b5f6'; e.currentTarget.style.transform = 'scale(1)'}}
                    >
                      <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M16.6915026,12.4744748 L3.50612381,13.2599618 C3.19218622,13.2599618 3.03521743,13.4170592 3.03521743,13.5741566 L1.15159189,20.0151496 C0.8376543,20.8006365 0.99,21.89 1.77946707,22.52 C2.41,22.99 3.50612381,23.1 4.13399899,22.8429026 L21.714504,14.0454487 C22.6563168,13.5741566 23.1272231,12.6315722 22.9702544,11.6889879 L4.13399899,1.16346272 C3.34915502,0.9 2.40734225,0.9 1.77946707,1.4705957 C0.994623095,2.0411913 0.837654326,3.1302744 1.15159189,3.9157613 L3.03521743,10.3567542 C3.03521743,10.5138516 3.19218622,10.671149 3.50612381,10.671149 L16.6915026,11.4566365 C16.6915026,11.4566365 17.1624089,11.4566365 17.1624089,12.0272321 C17.1624089,12.5978278 16.6915026,12.4744748 16.6915026,12.4744748 Z" />
                      </svg>
                    </button>
                  )}
                  <button onClick={cancelVideo} style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#a8b5c4',
                    cursor: 'pointer',
                    padding: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'color 0.2s',
                    fontSize: 16,
                    fontWeight: 600,
                  }} title="Отмена" aria-label="Отмена"
                    onMouseEnter={(e) => e.currentTarget.style.color = '#d0d8e0'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#a8b5c4'}
                  >
                    ×
                  </button>
                </div>
              </div>
            {/* Chat background button (right-aligned) */}
            <div style={{ marginLeft: 'auto' }}>
              <button
                onClick={() => {
                  try {
                    const key = `chat-bg-${chatId}`;
                    const current = chatBgUrl || '';
                    const url = prompt('Вставьте URL фонового изображения для этого чата (оставьте пустым для удаления):', current);
                    if (url === null) return; // cancelled
                    const trimmed = String(url || '').trim();
                    if (!trimmed) {
                      localStorage.removeItem(key);
                      setChatBgUrl(null);
                    } else {
                      localStorage.setItem(key, trimmed);
                      setChatBgUrl(trimmed);
                    }
                  } catch (e) {
                    console.error('[CHAT BG] set background error', e);
                    alert('Не удалось сохранить фон: ' + String(e));
                  }
                }}
                title="Установить фон чата"
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: '#e6e6e6', padding: '8px 10px', borderRadius: 10, cursor: 'pointer' }}
              >
                Фон
              </button>
            </div>
            </div>
          )}
          {/* Скрытый input для выбора файла/медиа */}
          <input
            id="file-input"
            type="file"
            accept={isMobile ? 'image/*,video/*,audio/*,.pdf,.doc,.docx,.txt' : '*'}
            style={{ display: 'none' }}
            onChange={(e) => {
              // Пока что заглушка
              const file = e.target.files?.[0];
              if (file) {
                alert(`Выбран файл: ${file.name}`);
              }
            }}
          />
          {/* Always render the input and controls so the layout doesn't shift; the recording UI will overlay when active */}
          <>
            {!isGroup && isUserBlocked ? (
              // If user blocked the contact - show unblock button instead of input
              <button
                onClick={() => blockUser()}
                disabled={blockingUser}
                style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 16px', background: 'transparent', border: 'none', color: '#64b5f6', cursor: blockingUser ? 'not-allowed' : 'pointer', fontSize: 13, opacity: blockingUser ? 0.6 : 1, transition: 'all 0.2s'}}
                onMouseEnter={(e) => {if (!blockingUser) e.currentTarget.style.opacity = '0.8'}}
                onMouseLeave={(e) => {if (!blockingUser) e.currentTarget.style.opacity = '1'}}
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                </svg>
                <span>{blockingUser ? 'Разблокирование...' : 'Разблокировать'}</span>
              </button>
            ) : (
              <>
                <input
                  value={newMessage}
                  onChange={(e) => {
                    const v = e.target.value;
                    setNewMessage(v);
                    maybeStartTyping(v);
                  }}
                  placeholder="Сообщение..."
                  className={styles.inputField}
                />

                {/* Video button */}
                <button
                  type="button"
                  className={styles.inputButton}
                  title="Видео сообщение"
                  aria-label="Видео сообщение"
                  onClick={() => setShowVideoPreview(true)}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                </button>
                {newMessage.trim() ? (
                  <button
                    type="submit"
                    className={styles.inputButton}
                    aria-label="Отправить"
                    title="Отправить"
                    style={{ color: 'rgba(100, 181, 246, 1)' }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                      <path d="M16.6915026,12.4744748 L3.50612381,13.2599618 C3.19218622,13.2599618 3.03521743,13.4170592 3.03521743,13.5741566 L1.15159189,20.0151496 C0.8376543,20.8006365 0.99,21.89 1.77946707,22.52 C2.41,22.99 3.50612381,23.1 4.13399899,22.8429026 L21.714504,14.0454487 C22.6563168,13.5741566 23.1272231,12.6315722 22.9702544,11.6889879 L4.13399899,1.16346272 C3.34915502,0.9 2.40734225,0.9 1.77946707,1.4705957 C0.994623095,2.0411913 0.837654326,3.1302744 1.15159189,3.9157613 L3.03521743,10.3567542 C3.03521743,10.5138516 3.19218622,10.671149 3.50612381,10.671149 L16.6915026,11.4566365 C16.6915026,11.4566365 17.1624089,11.4566365 17.1624089,12.0272321 C17.1624089,12.5978278 16.6915026,12.4744748 16.6915026,12.4744748 Z" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.inputButton}
                    aria-label="Голосовое сообщение"
                    title="Голосовое сообщение"
                    style={{ color: isRecording ? '#ef4444' : 'rgba(100, 181, 246, 0.7)' }}
                    onClick={async () => {
                      if (!isRecording) {
                        // Начать запись
                        try {
                          if (!navigator.mediaDevices) {
                            alert('Your browser does not support audio recording');
                            return;
                          }
                          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                          // Используем audio/webm если поддерживается
                          let mimeType = 'audio/webm';
                          if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = '';
                          const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
                          
                          audioChunksRef.current = [];
                          
                          recorder.ondataavailable = (e) => {
                            audioChunksRef.current.push(e.data);
                          };
                          
                          recorder.onstop = async () => {
                            if (recordInterval.current) clearInterval(recordInterval.current);
                            setIsRecording(false);
                            setRecordTime(0);
                            
                            console.log('[VOICE] Recording stopped, chunks:', audioChunksRef.current.length);
                            
                            const audioBlob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
                            console.log('[VOICE] Blob created, size:', audioBlob.size);
                            audioChunksRef.current = [];
                        
                        // Stop all tracks after data is collected
                        stream.getTracks().forEach(track => track.stop());
                        console.log('[VOICE] Tracks stopped');
                        
                        // Optimistic UI: create a temporary message so user sees upload in progress
                        const tempId = 'temp-audio-' + Date.now();
                        const tempObjUrl = URL.createObjectURL(audioBlob);
                        const tempMsg: Message = {
                          id: tempId,
                          sender: (session?.user as any)?.id || '',
                          text: '',
                          createdAt: new Date().toISOString(),
                          audioUrl: tempObjUrl,
                          videoUrl: undefined,
                          _key: tempId,
                          _persisted: false,
                          _failed: false,
                        };
                        setMessages(prev => [...prev, tempMsg]);
                        console.log('[VOICE] Temp message added');

                        const formData = new FormData();
                        formData.append('chatId', chatId || '');
                        formData.append('audio', audioBlob, 'voice.webm');
                        console.log('[VOICE] FormData prepared, sending to /api/messages/voice-upload');
                        
                        try {
                          const res = await fetch('/api/messages/voice-upload', {
                            method: 'POST',
                            credentials: 'include',
                            body: formData,
                          });
                          console.log('[VOICE] Response status:', res.status);
                          
                          if (!res.ok) {
                            const txt = await res.text();
                            console.log('[VOICE] Error response:', txt);
                            // mark temp message as failed
                            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _failed: true } : m));
                            try { URL.revokeObjectURL(tempObjUrl); } catch (e) {}
                            alert('Ошибка отправки голосового: ' + txt);
                          } else {
                            const data = await res.json();
                            console.log('[VOICE] Success response:', data);
                            if (data && data.message && data.message.id) {
                              // replace temp message with server message
                              setMessages(prev => prev.map(m => m.id === tempId ? {
                                ...m,
                                id: data.message.id,
                                createdAt: data.message.createdAt || m.createdAt,
                                audioUrl: data.audioUrl,
                                _persisted: data.persisted !== false,
                              } : m));
                              try { URL.revokeObjectURL(tempObjUrl); } catch (e) {}
                            } else {
                              console.log('[VOICE] No message returned');
                              // no message returned: mark failed
                              setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _failed: true } : m));
                              try { URL.revokeObjectURL(tempObjUrl); } catch (e) {}
                            }
                          }
                        } catch (err) {
                          console.log('[VOICE] Fetch error:', err);
                          setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _failed: true } : m));
                          alert('Ошибка отправки голосового: ' + err);
                        }
                      };
                      
                      setMediaRecorder(recorder);
                      setIsRecording(true);
                      setRecordTime(0);
                      if (recordInterval.current) clearInterval(recordInterval.current);
                      recordInterval.current = setInterval(() => setRecordTime(t => t + 1), 1000);
                      recorder.start();
                    } catch (error: any) {
                      if (error.name === 'NotAllowedError') {
                        alert('Microphone access denied. Please enable microphone permissions in browser settings.');
                      } else if (error.name === 'NotFoundError') {
                        alert('No microphone found. Please connect a microphone.');
                      } else {
                        alert('Error accessing microphone: ' + error.message);
                      }
                      return;
                    }
                  } else {
                    // Остановить запись (tracks будут остановлены в onstop)
                    if (mediaRecorder && isRecording) {
                      mediaRecorder.stop();
                    }
                  }
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>
            )}
              </>
            )}
          </>
        </form>
        {/* Overlay recording bar so it doesn't push the input */}
        {isRecording && (
          <div style={{
            position: 'absolute',
            left: isMobile ? 12 : 18,
            right: isMobile ? 12 : 18,
            bottom: isMobile ? 12 : 14,
            zIndex: 140,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'auto',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              color: '#e6eef8',
              fontSize: isMobile ? 12 : 13,
              fontWeight: 600,
              background: 'rgba(20, 20, 24, 0.95)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 24,
              padding: isMobile ? '8px 16px' : '10px 20px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              gap: isMobile ? 14 : 18,
              alignSelf: 'center',
              backdropFilter: 'blur(8px)',
            }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: isMobile ? 6 : 8 }}>
                <span style={{ width: isMobile ? 8 : 8, height: isMobile ? 8 : 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444aa', animation: 'pulse 1.5s infinite' }} />
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#f0f3f8', fontSize: isMobile ? 12 : 13, minWidth: '32px' }}>
                  {String(Math.floor(recordTime / 60)).padStart(2, '0')}:{String(recordTime % 60).padStart(2, '0')}
                </span>
              </div>
              <div>
                <button type="button" onClick={cancelRecording} style={{ background: 'transparent', border: 'none', color: '#a8b5c4', fontSize: isMobile ? 13 : 14, fontWeight: 600, cursor: 'pointer', padding: '4px 8px', transition: 'color 0.2s' }} aria-label="Отмена" title="Отмена" onMouseEnter={(e) => e.currentTarget.style.color = '#d0d8e0'} onMouseLeave={(e) => e.currentTarget.style.color = '#a8b5c4'}>Отмена</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <button
                  type="button"
                  title="Отправить голосовое сообщение"
                  aria-label="Отправить голосовое сообщение"
                  style={{
                    border: 'none',
                    padding: '6px',
                    background: 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#64b5f6',
                    transition: 'all 0.2s',
                  }}
                  onClick={() => { if (mediaRecorder && isRecording) { mediaRecorder.stop(); mediaRecorder.stream.getTracks().forEach(track => track.stop()); } }}
                  onMouseEnter={(e) => {e.currentTarget.style.color = '#64b5f6'; e.currentTarget.style.transform = 'scale(1.1)'}}
                  onMouseLeave={(e) => {e.currentTarget.style.color = '#64b5f6'; e.currentTarget.style.transform = 'scale(1)'}}
                >
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16.6915026,12.4744748 L3.50612381,13.2599618 C3.19218622,13.2599618 3.03521743,13.4170592 3.03521743,13.5741566 L1.15159189,20.0151496 C0.8376543,20.8006365 0.99,21.89 1.77946707,22.52 C2.41,22.99 3.50612381,23.1 4.13399899,22.8429026 L21.714504,14.0454487 C22.6563168,13.5741566 23.1272231,12.6315722 22.9702544,11.6889879 L4.13399899,1.16346272 C3.34915502,0.9 2.40734225,0.9 1.77946707,1.4705957 C0.994623095,2.0411913 0.837654326,3.1302744 1.15159189,3.9157613 L3.03521743,10.3567542 C3.03521743,10.5138516 3.19218622,10.671149 3.50612381,10.671149 L16.6915026,11.4566365 C16.6915026,11.4566365 17.1624089,11.4566365 17.1624089,12.0272321 C17.1624089,12.5978278 16.6915026,12.4744748 16.6915026,12.4744748 Z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Video recording circle overlay */}
        {showVideoPreview && (
          <div style={{
            position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(20,22,30,0.85)',
            animation: 'fadeInOverlay 0.25s',
          }}>
            <style>{`
              @keyframes fadeInOverlay { from { opacity: 0; } to { opacity: 1; } }
              @keyframes popInCircle { from { transform: scale(0.7); opacity: 0; } to { transform: scale(1); opacity: 1; } }
              @keyframes pulse {
                0% { box-shadow: 0 0 8px #ef4444aa, 0 0 12px #ef4444aa; }
                50% { box-shadow: 0 0 12px #ef4444, 0 0 20px #ef4444; }
                100% { box-shadow: 0 0 8px #ef4444aa, 0 0 12px #ef4444aa; }
              }
              .circle-anim { animation: popInCircle 0.32s cubic-bezier(.23,1.02,.36,1) both; }
            `}</style>
            <div style={{
              position: 'relative', zIndex: 2001, display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="circle-anim"
                style={{
                  width: 240,
                  height: 240,
                  borderRadius: '50%',
                  background: '#111',
                  objectFit: 'cover',
                  border: '3px solid #64b5f6',
                  boxShadow: '0 0 24px rgba(100, 181, 246, 0.3), 0 8px 32px rgba(0, 0, 0, 0.4)',
                  transition: 'transform 0.35s ease',
                }}
              />
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 16, 
                marginTop: 32,
                background: 'rgba(20, 20, 24, 0.95)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 24,
                padding: '10px 20px',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              }}>
                <button onClick={cancelVideo} style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#a8b5c4',
                  cursor: 'pointer',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  fontWeight: 600,
                }} title="Отмена" aria-label="Отмена"
                  onMouseEnter={(e) => e.currentTarget.style.color = '#d0d8e0'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#a8b5c4'}
                >
                  ×
                </button>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  {videoRecording ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444aa', animation: 'pulse 1.5s infinite' }} />
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#f0f3f8', fontSize: 13, minWidth: '32px' }}>
                          {String(Math.floor(videoTime / 60)).padStart(2, '0')}:{String(videoTime % 60).padStart(2, '0')}
                        </span>
                      </div>
                      <button onClick={stopVideoRecording} style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#64b5f6',
                        cursor: 'pointer',
                        padding: '6px',
                        marginLeft: 16,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                      }} title="Остановить запись" aria-label="Остановить запись"
                        onMouseEnter={(e) => {e.currentTarget.style.color = '#64b5f6'; e.currentTarget.style.transform = 'scale(1.1)'}}
                        onMouseLeave={(e) => {e.currentTarget.style.color = '#64b5f6'; e.currentTarget.style.transform = 'scale(1)'}}
                      >
                        <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor">
                          <path d="M16.6915026,12.4744748 L3.50612381,13.2599618 C3.19218622,13.2599618 3.03521743,13.4170592 3.03521743,13.5741566 L1.15159189,20.0151496 C0.8376543,20.8006365 0.99,21.89 1.77946707,22.52 C2.41,22.99 3.50612381,23.1 4.13399899,22.8429026 L21.714504,14.0454487 C22.6563168,13.5741566 23.1272231,12.6315722 22.9702544,11.6889879 L4.13399899,1.16346272 C3.34915502,0.9 2.40734225,0.9 1.77946707,1.4705957 C0.994623095,2.0411913 0.837654326,3.1302744 1.15159189,3.9157613 L3.03521743,10.3567542 C3.03521743,10.5138516 3.19218622,10.671149 3.50612381,10.671149 L16.6915026,11.4566365 C16.6915026,11.4566365 17.1624089,11.4566365 17.1624089,12.0272321 C17.1624089,12.5978278 16.6915026,12.4744748 16.6915026,12.4744748 Z" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <></>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {/* (удалено дублирующееся отображение индикатора записи) */}

        {/* Modal: Edit group name */}
        {editingGroupName && (
          <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100vh', background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'}} onClick={() => setEditingGroupName(false)}>
            <div style={{background: 'rgba(20, 21, 26, 0.95)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: 24, minWidth: 320, maxWidth: '90vw', backdropFilter: 'blur(8px)', boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'}} onClick={(e) => e.stopPropagation()}>
              <h3 style={{color: '#e6eef8', marginBottom: 16, fontSize: 16}}>Изменить название группы</h3>
              <input 
                type="text" 
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Новое название"
                autoFocus
                style={{width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(100, 181, 246, 0.3)', background: 'rgba(30, 32, 42, 0.8)', color: '#fff', fontSize: 14, boxSizing: 'border-box', marginBottom: 16}}
              />
              <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
                <button 
                  onClick={() => setEditingGroupName(false)}
                  style={{padding: '8px 16px', border: 'none', background: 'transparent', color: '#e6eef8', cursor: 'pointer', transition: 'all 0.2s'}}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#64b5f6'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#e6eef8'}
                >
                  Отмена
                </button>
                <button 
                  onClick={updateGroupName}
                  disabled={savingGroupName}
                  style={{padding: '8px 16px', border: 'none', background: 'transparent', color: '#64b5f6', cursor: savingGroupName ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: savingGroupName ? 0.6 : 1}}
                  onMouseEnter={(e) => {if (!savingGroupName) e.currentTarget.style.color = '#3399ff'}}
                  onMouseLeave={(e) => {if (!savingGroupName) e.currentTarget.style.color = '#64b5f6'}}
                >
                  {savingGroupName ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Edit group avatar */}
        {editingGroupAvatar && (
          <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100vh', background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'}} onClick={() => setEditingGroupAvatar(false)}>
            <div style={{background: 'rgba(20, 21, 26, 0.95)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: 24, minWidth: 320, maxWidth: '90vw', backdropFilter: 'blur(8px)', boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'}} onClick={(e) => e.stopPropagation()}>
              <h3 style={{color: '#e6eef8', marginBottom: 24, fontSize: 16, fontWeight: 600}}>Изменить аватар группы</h3>
              <input 
                id="groupAvatarInput"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  if (file) {
                    updateGroupAvatar(file);
                  }
                }}
                style={{display: 'none'}}
              />
              <label htmlFor="groupAvatarInput" style={{display: 'block', width: '100%', padding: '16px', borderRadius: 0, border: '1px solid rgba(100, 181, 246, 0.3)', background: 'rgba(30, 32, 42, 0.8)', color: '#64b5f6', cursor: 'pointer', textAlign: 'center', marginBottom: 24, transition: 'all 0.2s', fontSize: 14, boxSizing: 'border-box'}} onMouseEnter={(e) => {e.currentTarget.style.background = 'rgba(30, 32, 42, 0.95)'; e.currentTarget.style.borderColor = 'rgba(100, 181, 246, 0.6)'}} onMouseLeave={(e) => {e.currentTarget.style.background = 'rgba(30, 32, 42, 0.8)'; e.currentTarget.style.borderColor = 'rgba(100, 181, 246, 0.3)'}}>
                Выберите файл
              </label>
              <div style={{display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 8}}>
                <button 
                  onClick={() => setEditingGroupAvatar(false)}
                  style={{padding: '10px 20px', border: 'none', background: 'transparent', color: '#e6eef8', cursor: 'pointer', transition: 'all 0.2s', fontSize: 14}}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#64b5f6'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#e6eef8'}
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Edit chat background */}
        {editingChatBg && (
          <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100vh', background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'}} onClick={() => setEditingChatBg(false)}>
            <div style={{background: 'rgba(20, 21, 26, 0.95)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: 24, minWidth: 320, maxWidth: '90vw', backdropFilter: 'blur(8px)', boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'}} onClick={(e) => e.stopPropagation()}>
              <h3 style={{color: '#e6eef8', marginBottom: 16, fontSize: 16, fontWeight: 600}}>Установить фон чата</h3>
              <p style={{color: '#888', fontSize: 13, marginBottom: 16}}>Введите URL изображения</p>
              <input 
                type="text" 
                value={chatBgInput}
                onChange={(e) => setChatBgInput(e.target.value)}
                placeholder="https://example.com/image.jpg"
                autoFocus
                style={{width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(100, 181, 246, 0.3)', background: 'rgba(30, 32, 42, 0.8)', color: '#fff', fontSize: 14, boxSizing: 'border-box', marginBottom: 16}}
              />
              <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8}}>
                <button 
                  onClick={() => setEditingChatBg(false)}
                  style={{padding: '8px 16px', border: 'none', background: 'transparent', color: '#e6eef8', cursor: 'pointer', transition: 'all 0.2s'}}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#64b5f6'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#e6eef8'}
                >
                  Отмена
                </button>
                <button 
                  onClick={saveChatBackground}
                  disabled={savingChatBg}
                  style={{padding: '8px 16px', border: 'none', background: 'transparent', color: '#64b5f6', cursor: savingChatBg ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: savingChatBg ? 0.6 : 1}}
                  onMouseEnter={(e) => {if (!savingChatBg) e.currentTarget.style.color = '#3399ff'}}
                  onMouseLeave={(e) => {if (!savingChatBg) e.currentTarget.style.color = '#64b5f6'}}
                >
                  {savingChatBg ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

// VideoCircle component with custom play/pause controls and progress overlay
const VideoCircle: React.FC<{ src: string; poster?: string }> = ({ src, poster }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setProgress(0);
    };
    const onTimeUpdate = () => {
      if (video.duration) {
        setProgress(video.currentTime / video.duration);
      }
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('timeupdate', onTimeUpdate);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, []);

  return (
    <div style={{ 
      position: 'relative',
      width: 120,
      height: 120,
      transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      transform: isPlaying ? 'scale(1.1)' : 'scale(0.95)',
      cursor: 'pointer'
    }}>
      <video 
        ref={videoRef}
        src={src} 
        poster={poster} 
        style={{ 
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          objectFit: 'cover'
        }}
      />
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isPlaying ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.3)',
          borderRadius: '50%',
          transition: 'background 0.3s'
        }}
        onClick={togglePlay}
      >
        {!isPlaying ? (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="#fff">
            <path d="M8 5v14l11-7z"/>
          </svg>
        ) : (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="#fff">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
          </svg>
        )}
      </div>
      {isPlaying && (
        <div style={{
          position: 'absolute',
          top: -3,
          left: -3,
          right: -3,
          bottom: -3,
          borderRadius: '50%',
          border: '2px solid #229ed9',
          borderTopColor: 'transparent',
          transform: `rotate(${progress * 360}deg)`,
          transition: 'transform 0.1s linear',
          animation: 'spin 1s linear infinite',
          opacity: 0.9,
          pointerEvents: 'none'
        }} />
      )}
      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default ChatWithFriend;