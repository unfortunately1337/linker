import rateLimit from 'express-rate-limit';

// Жесткое ограничение для логина (5 попыток за 15 минут)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts, please try again in 15 minutes',
  standardHeaders: false,
  legacyHeaders: false,
});

// Ограничение для 2FA (10 попыток за 10 минут)
export const twoFALimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: 'Too many 2FA attempts, please try again in 10 minutes',
  standardHeaders: false,
  legacyHeaders: false,
});

// Общее ограничение для API (100 запросов за 1 минуту)
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later',
  standardHeaders: false,
  legacyHeaders: false,
});

// Ограничение для загрузки файлов (10 за час)
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many uploads, please try again later',
  standardHeaders: false,
  legacyHeaders: false,
});
