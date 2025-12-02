import bcrypt from "bcryptjs";
import prisma from "./prisma";
import { forbiddenPasswords } from "./forbidden-passwords";

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

export async function registerUser(login: string, password: string, link?: string) {
  if (!login || !password) throw new Error("Login and password required");
  // link is required during registration in this implementation
  if (!link || typeof link !== 'string') throw new Error('Link required');
  // validate link format: only letters, numbers and underscore, 3..32 chars
  const re = /^[A-Za-z0-9_]{3,32}$/;
  if (!re.test(link)) throw new Error('Invalid link format');
  const existing = await prisma.user.findFirst({ where: { OR: [{ login }, { link }] } });
  if (existing) {
    if (existing.login === login) throw new Error("Логин уже занят");
    throw new Error('Линк уже занят');
  }
  if (forbiddenPasswords.includes(password)) {
    const err: any = new Error("Слишком простой пароль");
    err.code = "FORBIDDEN_PASSWORD";
    throw err;
  }
  const hash = await bcrypt.hash(password, 8); // ускоряем регистрацию
  // Генерируем аватар на основе первой буквы линка
  const avatar = generateAvatarFromLink(link);
  const user = await prisma.user.create({ data: { login, password: hash, avatar, link } });
  return { id: user.id, login: user.login, avatar: user.avatar, link: user.link };
}
