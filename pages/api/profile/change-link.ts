import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import prisma from '../../../lib/prisma';
import type { NextApiRequest, NextApiResponse } from 'next';

// Функция для генерации аватара на основе первой буквы линка
function generateAvatarFromLink(link: string): string {
  const letter = link.charAt(0).toUpperCase();
  
  // Палитра градиентов для аватаров (основной цвет и похожий светлый)
  const gradients = [
    { start: "#FF6B6B", end: "#FF8E8E" }, // красный градиент
    { start: "#4ECDC4", end: "#7EDDD9" }, // бирюзовый градиент
    { start: "#45B7D1", end: "#7ECDE0" }, // голубой градиент
    { start: "#FFA07A", end: "#FFBFA0" }, // оранжевый градиент
    { start: "#98D8C8", end: "#B8E5DD" }, // мятный градиент
    { start: "#F7DC6F", end: "#FCE5A0" }, // жёлтый градиент
    { start: "#BB8FCE", end: "#D4B0E0" }, // фиолетовый градиент
    { start: "#85C1E2", end: "#A8D5F0" }, // небесный градиент
    { start: "#F8B88B", end: "#FDD0AA" }, // абрикосовый градиент
    { start: "#82E0AA", end: "#A8F0C8" }  // зелёный градиент
  ];
  
  // Выбираем градиент на основе первой буквы
  const charCode = letter.charCodeAt(0);
  const gradientIndex = charCode % gradients.length;
  const gradient = gradients[gradientIndex];
  
  // Создаём SVG аватар с буквой и градиентным фоном
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${gradient.start};stop-opacity:1" />
        <stop offset="100%" style="stop-color:${gradient.end};stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="200" height="200" fill="url(#grad)"/>
    <text x="100" y="110" font-size="90" font-weight="bold" font-family="Arial, sans-serif" fill="white" text-anchor="middle" dominant-baseline="central">${letter}</text>
  </svg>`;
  
  // Кодируем SVG в data URL
  const encoded = encodeURIComponent(svg);
  return `data:image/svg+xml,${encoded}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session || !session.user || !(session.user as any).id) return res.status(401).json({ error: 'Unauthorized' });
  const userId = (session.user as any).id;
  const { newLink } = req.body as { newLink?: string };
  if (!newLink || typeof newLink !== 'string') return res.status(400).json({ error: 'Invalid link' });
  const re = /^[A-Za-z0-9_]{3,32}$/;
  if (!re.test(newLink)) return res.status(400).json({ error: 'Invalid link format' });
  try {
    const existing = await prisma.user.findFirst({ where: { link: newLink } });
    if (existing && existing.id !== userId) return res.status(409).json({ error: 'Link is already taken' });
    // Генерируем новый аватар на основе первой буквы нового линка
    const newAvatar = generateAvatarFromLink(newLink);
    const user = await prisma.user.update({ where: { id: userId }, data: { link: newLink, avatar: newAvatar } });
    const returned = {
      id: user.id,
      login: user.login,
      link: user.link || null,
      avatar: user.avatar || null,
      role: user.role || null,
      description: user.description || null,
      backgroundUrl: user.backgroundUrl || null,
      createdAt: user.createdAt,
    };
    return res.status(200).json({ user: returned });
  } catch (e: any) {
    console.error('/api/profile/change-link error', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
