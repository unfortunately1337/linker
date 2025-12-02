import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import prisma from '../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session || !session.user || !session.user.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { phoneNumber } = req.body;

    // Validate phone number format
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return res.status(400).json({ error: 'Invalid phone number' });
    }

    // Allow empty string (will be stored as "0" - hidden), or strings starting with "+"
    const normalizedPhone = phoneNumber.trim() === '' ? '0' : phoneNumber.trim();
    
    if (normalizedPhone !== '0' && !normalizedPhone.startsWith('+')) {
      return res.status(400).json({ error: 'Phone number must start with + or be empty' });
    }

    // Update user's phone number
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { phoneNumber: normalizedPhone }
    });

    return res.status(200).json({ 
      success: true,
      phoneNumber: user.phoneNumber
    });
  } catch (error) {
    console.error('Error updating phone number:', error);
    return res.status(500).json({ error: 'Failed to update phone number' });
  }
}
