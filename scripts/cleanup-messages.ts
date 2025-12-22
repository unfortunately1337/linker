import prisma from '../lib/prisma';

/**
 * Очистить все сообщения из базы данных
 * Используйте этот скрипт если сообщения некорректно зашифрованы
 * 
 * Запуск: npx ts-node scripts/cleanup-messages.ts
 */
async function cleanupMessages() {
  try {
    console.log('Начинаю удаление всех сообщений...');
    
    const result = await prisma.message.deleteMany({});
    
    console.log(`✅ Удалено ${result.count} сообщений`);
    console.log('Теперь все сообщения будут зашифрованы с корректным алгоритмом');
    
  } catch (error) {
    console.error('❌ Ошибка при удалении сообщений:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupMessages();
