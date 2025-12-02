import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import prisma from '../../../lib/prisma';
import type { NextApiRequest, NextApiResponse } from 'next';

// Функция для генерации аватара на основе первой буквы линка
function generateAvatarFromLink(link: string): string {
  const letter = link.charAt(0).toUpperCase();
  
  // Палитра темных полупрозрачных цветов для аватаров
  const colors = [
    "#8B4545", // темно-красный
    "#800000", // бордо
    "#406991", // темно-синий
    "#468DB4", // стальной синий
    "#B87333", // темно-оранжевый
    "#BA913B", // тёмный охра
    "#A9845E", // темно-коричневый
    "#6A5ACD", // slate blue
    "#2F4F93", // темно-небесный
    "#228B22", // темно-зелёный
    "#556B2F", // оливково-зелёный
    "#696969", // тёмный серый
    "#191B70", // полуночный синий
    "#4B0082", // индиго
    "#8B4513"  // коричневый
  ];
  
  // Выбираем цвет на основе первой буквы
  const charCode = letter.charCodeAt(0);
  const colorIndex = charCode % colors.length;
  const color = colors[colorIndex];
  
  // Создаём SVG аватар с сплошным цветом
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
    <defs>
      <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.3" />
      </filter>
    </defs>
    <!-- Фоновый сплошной цвет с закруглением -->
    <rect width="200" height="200" rx="12" fill="${color}"/>
    <!-- Верхняя тонкая линия для объёма -->
    <rect width="200" height="2" fill="white" opacity="0.15"/>
    <!-- Буква с мягкой тенью и сглаживанием -->
    <text x="100" y="105" font-size="100" font-weight="700" font-family="'Segoe UI', 'Helvetica Neue', sans-serif" fill="white" text-anchor="middle" dominant-baseline="central" filter="url(#shadow)" shape-rendering="crispEdges" style="text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased; letter-spacing: -2px;">${letter}</text>
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
