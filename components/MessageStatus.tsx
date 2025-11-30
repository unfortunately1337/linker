import React from 'react';

interface MessageStatusProps {
  status: 'sent' | 'read';
  isOwnMessage?: boolean;
}

/**
 * Компонент для отображения статуса сообщения в виде галочек
 * - 1 серая галочка - сообщение отправлено (status: "sent")
 * - 2 синие галочки - сообщение прочитано (status: "read")
 */
export const MessageStatus: React.FC<MessageStatusProps> = ({ status, isOwnMessage = false }) => {
  if (!isOwnMessage) {
    return null; // Статус показываем только для собственных сообщений
  }

  const isRead = status === 'read';
  
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 4, gap: 2 }}>
      {/* Первая галочка */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          display: 'block',
          color: isRead ? '#4fc3f7' : '#888888',
          transition: 'color 0.3s ease',
          flexShrink: 0
        }}
      >
        <path
          d="M20 6L9 17l-5-5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>

      {/* Вторая галочка (только если прочитано) */}
      {isRead && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            display: 'block',
            color: '#4fc3f7',
            transition: 'color 0.3s ease',
            marginLeft: '-6px',
            flexShrink: 0
          }}
        >
          <path
            d="M20 6L9 17l-5-5"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      )}
    </div>
  );
};

export default MessageStatus;
