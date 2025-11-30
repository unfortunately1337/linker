import bcrypt from "bcryptjs";
import prisma from "./prisma";
import { forbiddenPasswords } from "./forbidden-passwords";

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
