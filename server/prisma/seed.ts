import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client.js';
import bcrypt from 'bcryptjs';
import { v7 as uuidv7 } from 'uuid';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cm_media',
  connectionLimit: 5,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('开始初始化数据...');

  // 创建管理员账号
  const adminPassword = await bcrypt.hash('admin123456', 12);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      uuid: uuidv7(),
      username: 'admin',
      passwordHash: adminPassword,
      nickname: '管理员',
      role: 'ADMIN',
    },
  });
  console.log('管理员账号已创建:', admin.username);

  // 创建默认分类
  const categories = [
    { name: '默认分类', slug: 'default', sortOrder: 0 },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
  }
  console.log('默认分类已创建');

  // 创建系统配置（如果需要）
  console.log('初始化完成！');
}

main()
  .catch((e) => {
    console.error('初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
