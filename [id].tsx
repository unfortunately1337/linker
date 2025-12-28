import React, { useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import { FaPaperPlane } from 'react-icons/fa';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';

interface Message {
  id: string;
  sender: string;
  text: string;
  createdAt: string;
  reactions?: Array<{ emoji: string; count: number; userIds: string[]; users?: Array<{ id: string; login: string; avatar?: string }> }>;
}

const ChatWithFriend: React.FC = () => {
  const [isTyping, setIsTyping] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<string | null>(null);

  // Компонент анимации "печатает..."
  const TypingIndicator = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: '#bbb', fontSize: 14 }}>{isTyping} печатает</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', height: 16 }}>
        {[0, 0.3, 0.6].map((d, i) => (
          <span key={i} className="typing-dot" style={{
            width: 6, height: 6, borderRadius: '50%', background: '#229ed9', margin: '0 2px', opacity: 0.7,
            animation: 'typingDot 1.2s infinite', animationDelay: `${d}s`
          }} />
        ))}
      </span>
      <style>{`
        @keyframes typingDot {
          0% { transform: translateY(0); opacity: 0.7; }
          20% { transform: translateY(-4px); opacity: 1; }
          40% { transform: translateY(0); opacity: 0.7; }
        }
      `}</style>
    </div>
  );

  // Компонент анимации "говорит..."
  const SpeakingIndicator = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: '#bbb', fontSize: 14 }}>{isSpeaking} говорит</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', height: 16 }}>
        {[0, 0.3, 0.6].map((d, i) => (
          <span key={i} className="speaking-dot" style={{
            width: 6, height: 6, borderRadius: '50%', background: '#76e08a', margin: '0 2px', opacity: 0.7,
            animation: 'typingDot 1.2s infinite', animationDelay: `${d}s`
          }} />
        ))}
      </span>
    </div>
  );

  const router = useRouter();
  const { id } = router.query;
  const { data: session, status } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [friend, setFriend] = useState<{ id: string, name: string, avatar?: string | null, role?: string } | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);

  // Подключение к SSE
  useEffect(() => {
    if (!chatId || !session) return;
    const { getSocketClient } = require('@/lib/socketClient');
    const socketClient = getSocketClient();
    if (!socketClient) return;

    let typingTimeout: NodeJS.Timeout | null = null;
    let speakingTimeout: NodeJS.Timeout | null = null;

    const onTyping = (data: { userId: string, name: string }) => {
      if (data.userId !== (session.user as any).id) {
        setIsTyping(data.name || 'Друг');
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => setIsTyping(null), 2000);
      }
    };

    const onSpeaking = (data: { userId: string, name: string }) => {
      if (data.userId !== (session.user as any).id) {
        setIsSpeaking(data.name || 'Друг');
        if (speakingTimeout) clearTimeout(speakingTimeout);
        speakingTimeout = setTimeout(() => setIsSpeaking(null), 2000);
      }
    };

    socketClient.on('typing-indicator', onTyping);
    socketClient.on('speaking', onSpeaking);

    return () => {
      socketClient.off('typing-indicator', onTyping);
      socketClient.off('speaking', onSpeaking);
      if (typingTimeout) clearTimeout(typingTimeout);
      if (speakingTimeout) clearTimeout(speakingTimeout);
    };
  }, [chatId, session]);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    if (status === "loading" || !session) return;
    const userId = (session.user as any)?.id;
    if (!id || !userId) return;

    fetch(`/api/profile?userId=${id}`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => setFriend(data?.user ? {
        id: data.user.id,
        name: data.user.login,
        avatar: data.user.avatar || null,
        role: data.user.role || undefined
      } : null));

    fetch(`/api/chats?userIds=${userId},${id}`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data?.chat?.id) {
          setChatId(data.chat.id);
          fetch(`/api/messages?chatId=${data.chat.id}`, { credentials: 'include' })
            .then(res => res.json())
            .then(data => setMessages(Array.isArray(data.messages) ? data.messages : []));
        }
      });
  }, [id, session, status]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !chatId || !session) return;
    fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ chatId, text: newMessage })
    })
      .then(res => res.json())
      .then(data => {
        if (data.message) {
          setMessages([...messages, {
            id: data.message.id,
            sender: data.message.senderId,
            text: data.message.text,
            createdAt: data.message.createdAt
          }]);
        }
        setNewMessage('');
      });
  };

  if (status === "loading") return <div style={{ color: '#bbb', marginTop: 80 }}>Загрузка...</div>;
  if (!session) return <div style={{ color: '#bbb', marginTop: 80 }}>Нужно авторизоваться.</div>;
  if (!friend) return <div style={{ color: '#bbb', marginTop: 80 }}>Загрузка чата...</div>;

  const isMobile = typeof window !== 'undefined' ? window.innerWidth <= 600 : false;

  return (
    <>
      <Head>
        <style>{`
          @keyframes typingDot {
            0% { transform: translateY(0); opacity: 0.7; }
            20% { transform: translateY(-4px); opacity: 1; }
            40% { transform: translateY(0); opacity: 0.7; }
          }
        `}</style>
      </Head>
      <div style={{
        minHeight: '100vh',
        background: '#111',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          width: '100%',
          maxWidth: 480,
          background: 'linear-gradient(120deg,#18191c,#23242a)',
          borderRadius: 18,
          padding: 16,
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Верхняя панель */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => router.push('/chat')} style={{ background: 'none', border: 'none', color: '#bbb', cursor: 'pointer' }}>
                ←
              </button>
              <img src={friend.avatar || '/window.svg'} alt="avatar" style={{ width: 40, height: 40, borderRadius: '50%' }} />
              <span style={{ fontSize: 17, fontWeight: 600, color: '#e3e8f0' }}>{friend.name}</span>
            </div>

            {/* Статусы под никнеймом */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              marginLeft: isMobile ? 62 : 54,
              marginTop: 2,
              minHeight: 20,
            }}>
              {isTyping && <TypingIndicator />}
              {isSpeaking && <SpeakingIndicator />}
            </div>
          </div>

          {/* Сообщения */}
          <div ref={chatScrollRef} style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginBottom: 12,
          }}>
            {messages.length === 0
              ? <div style={{ color: '#bbb', textAlign: 'center' }}>Нет сообщений</div>
              : messages.map(msg => (
                <div key={msg.id} style={{
                  alignSelf: msg.sender === (session.user as any)?.id ? 'flex-end' : 'flex-start',
                  background: msg.sender === (session.user as any)?.id ? '#229ed9' : '#222',
                  color: '#fff',
                  borderRadius: 14,
                  padding: '8px 12px',
                  maxWidth: '80%',
                  wordBreak: 'break-word'
                }}>
                  {msg.text}
                </div>
              ))}
          </div>

          {/* Поле ввода */}
          <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: 8 }}>
            <input
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder="Сообщение..."
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 9,
                border: 'none',
                background: '#18191c',
                color: '#fff',
                outline: 'none'
              }}
            />
            <button type="submit" style={{
              background: '#229ed9',
              color: '#fff',
              border: 'none',
              borderRadius: '50%',
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}>
              <FaPaperPlane />
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

export default ChatWithFriend;
