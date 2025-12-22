import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm'; // Используем GCM вместо CTR для лучшей безопасности
const IV_LENGTH = 12; // Для GCM рекомендуется 12 байт
const AUTH_TAG_LENGTH = 16; // Длина тега аутентификации для GCM
const SALT_LENGTH = 16;

function deriveKey(chatId: string, salt: Buffer): { key: Buffer, salt: Buffer } {
    // Используем PBKDF2 для получения ключа из chatId
    const iterations = 100000;
    const keyLength = 32;
    const secret = process.env.MESSAGE_ENCRYPTION_KEY;
    if (!secret || typeof secret !== 'string' || secret.length < 16) {
        throw new Error('MESSAGE_ENCRYPTION_KEY environment variable is required and must be a sufficiently long secret');
    }
    const derivedKey = crypto.pbkdf2Sync(
        secret + chatId,
        salt,
        iterations,
        keyLength,
        'sha256'
    );
    return { key: derivedKey, salt };
}

export function encryptMessage(message: string, chatId: string): string {
    try {
        const salt = crypto.randomBytes(SALT_LENGTH);
        const { key } = deriveKey(chatId, salt);
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        
        const encrypted = Buffer.concat([cipher.update(message, 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();

        // Формат: salt:iv:encrypted:authTag
        const result = Buffer.concat([
            salt,
            iv,
            encrypted,
            authTag
        ]).toString('base64');
        
        console.log('[ENCRYPT] Message encrypted successfully for chat:', chatId.substring(0, 8));
        return result;
    } catch (e) {
        console.error('[ENCRYPT] Encryption error:', e);
        throw e;
    }
}

export function decryptMessage(encryptedMessage: string, chatId: string): string {
    try {
        const buffer = Buffer.from(encryptedMessage, 'base64');
        
        // Проверяем минимальный размер буфера
        const minSize = SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH;
        if (buffer.length < minSize) {
            throw new Error(`Buffer too small: ${buffer.length} bytes, expected at least ${minSize}`);
        }
        
        const salt = buffer.slice(0, SALT_LENGTH);
        const iv = buffer.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const authTag = buffer.slice(-AUTH_TAG_LENGTH);
        const encrypted = buffer.slice(SALT_LENGTH + IV_LENGTH, buffer.length - AUTH_TAG_LENGTH);
        
        const { key } = deriveKey(chatId, salt);
        
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        
        console.log('[DECRYPT] Message decrypted successfully for chat:', chatId.substring(0, 8));
        return decrypted.toString('utf8');
    } catch (e) {
        console.error('[DECRYPT] Decryption error for chat', chatId.substring(0, 8), ':', e instanceof Error ? e.message : String(e));
        return '[Ошибка шифрования]';
    }
}

// Шифрование файлов с улучшенной безопасностью
export function encryptFileBuffer(buffer: Buffer, chatId: string): Buffer {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const { key } = deriveKey(chatId, salt);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Формат: salt + iv + authTag + encrypted
    return Buffer.concat([salt, iv, authTag, encrypted]);
}

export function decryptFileBuffer(buffer: Buffer, chatId: string): Buffer {
    try {
        const salt = buffer.slice(0, SALT_LENGTH);
        const iv = buffer.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const authTag = buffer.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
        const encrypted = buffer.slice(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

        const { key } = deriveKey(chatId, salt);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    } catch (e) {
        console.error('File decryption error:', e);
        throw new Error('Failed to decrypt file');
    }
}

// Функция для безопасного хеширования userId
export function hashUserId(userId: string): string {
    return crypto
        .createHmac('sha256', process.env.USER_HASH_SECRET || '')
        .update(userId)
        .digest('hex');
}
