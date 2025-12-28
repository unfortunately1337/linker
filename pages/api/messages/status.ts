import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { publishMessageEvent } from '../../../lib/realtime';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await getServerSession(req, res, authOptions as any) as any;
  if (!session || !session.user || !session.user.id) return res.status(401).json({ error: 'Unauthorized' });
  const requesterId = session.user.id;

  const { messageId, status } = req.body || {};
  if (!messageId || typeof messageId !== 'string') return res.status(400).json({ error: 'messageId required' });
  if (!status || typeof status !== 'string' || !['sent', 'read'].includes(status)) {
    return res.status(400).json({ error: 'status must be "sent" or "read"' });
  }

  try {
    const msg = await prisma.message.findUnique({ 
      where: { id: messageId }, 
      include: { chat: { include: { users: true } } }
    });
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    // Ensure requester is participant of the chat
    const isParticipant = (msg.chat.users || []).some((u: any) => u.id === requesterId);
    if (!isParticipant) return res.status(403).json({ error: 'Forbidden' });

    // Only recipient can mark as read
    if (status === 'read' && msg.senderId === requesterId) {
      return res.status(403).json({ error: 'Cannot mark own message as read' });
    }

    // Update message status
    const updatedMsg = await prisma.message.update({
      where: { id: messageId },
      data: { status }
    });

    console.log('[MESSAGES/STATUS] Message updated:', {
      messageId: updatedMsg.id,
      status: updatedMsg.status,
      changedBy: requesterId,
      chatId: msg.chatId
    });

    // Broadcast status change via SSE/Pusher to all participants in the chat
    try {
      const pushPayload = {
        messageId: updatedMsg.id,
        status: updatedMsg.status,
        changedBy: requesterId
      };
      console.log('[MESSAGES/STATUS] Broadcasting:', pushPayload);
      await publishMessageEvent(msg.chatId, 'message-status-changed', pushPayload);
    } catch (e) {
      console.error('[MESSAGES/STATUS] Error:', e);
    }

    return res.status(200).json({ messageId: updatedMsg.id, status: updatedMsg.status });
  } catch (e: any) {
    console.error('[MESSAGES/STATUS] error:', e);
    return res.status(500).json({ error: 'Internal server error', details: e?.message });
  }
}
