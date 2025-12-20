import bcrypt from "bcryptjs";
import prisma from "./prisma";
import { forbiddenPasswords } from "./forbidden-passwords";

// Функция для генерации аватара на основе первой буквы линка с градиентом
function generateAvatarFromLink(link: string): string {
  const letter = link.charAt(0).toUpperCase();
  
  // Палитра градиентов (от темного к более яркому)
  const gradients = [
    { id: "grad1", from: "#FF6B6B", to: "#EE5A6F" },      // красный
    { id: "grad2", from: "#4ECDC4", to: "#44A0C4" },      // бирюзовый
    { id: "grad3", from: "#FFE66D", to: "#FFA500" },      // оранжевый
    { id: "grad4", from: "#95E1D3", to: "#38ADA9" },      // мятный
    { id: "grad5", from: "#C7CEEA", to: "#6A5ACD" },      // сиреневый
    { id: "grad6", from: "#FF8A65", to: "#D84315" },      // коралловый
    { id: "grad7", from: "#64B5F6", to: "#1976D2" },      // синий
    { id: "grad8", from: "#81C784", to: "#2E7D32" },      // зелёный
    { id: "grad9", from: "#FFB74D", to: "#F57C00" },      // золотой
    { id: "grad10", from: "#F48FB1", to: "#E91E63" },     // розовый
    { id: "grad11", from: "#B39DDB", to: "#512DA8" },     // фиолетовый
    { id: "grad12", from: "#80DEEA", to: "#00838F" },     // голубой
    { id: "grad13", from: "#A1887F", to: "#5D4037" },     // коричневый
    { id: "grad14", from: "#CE93D8", to: "#7B1FA2" },     // малиновый
    { id: "grad15", from: "#FFAB91", to: "#D84315" }      // персиковый
  ];
  
  // Выбираем градиент на основе кода буквы
  const charCode = letter.charCodeAt(0);
  const gradientIndex = charCode % gradients.length;
  const gradient = gradients[gradientIndex];
  
  // Создаём SVG аватар с градиентом
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
    <defs>
      <linearGradient id="${gradient.id}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${gradient.from};stop-opacity:1" />
        <stop offset="100%" style="stop-color:${gradient.to};stop-opacity:1" />
      </linearGradient>
      <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.2" />
      </filter>
    </defs>
    <!-- Фоновый градиент с закруглением -->
    <rect width="200" height="200" rx="12" fill="url(#${gradient.id})"/>
    <!-- Верхняя тонкая линия для объёма -->
    <rect width="200" height="2" fill="white" opacity="0.2"/>
    <!-- Буква с мягкой тенью -->
    <text x="100" y="115" font-size="100" font-weight="700" font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif" fill="white" text-anchor="middle" dominant-baseline="middle" filter="url(#shadow)" style="text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased; letter-spacing: -2px;">${letter}</text>
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
