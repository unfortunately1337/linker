export const config = { api: { bodyParser: false } };

import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import prisma from '../../../lib/prisma';
import { randomUUID } from 'crypto';
import fs from 'fs';
import formidable, { IncomingForm } from 'formidable';
import { uploadLimiter } from '../../../lib/rateLimiter';

// --- FIXED parseForm ---
async function parseForm(req: any): Promise<{ fields: any; files: any }> {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({
      multiples: false,
      keepExtensions: true,
      maxFileSize: Number(process.env.MAX_FILE_BYTES || 25 * 1024 * 1024),
    });

    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

export async function postCreateHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session || !session.user)
    return res.status(401).json({ error: 'Unauthorized' });

  let mediaId: string | undefined = undefined;
  let title: string | undefined = undefined;
  let description: string | undefined = undefined;
  let fileAny: any = undefined;

  const contentType = (req.headers['content-type'] || '').toLowerCase();

  // --- FIXED multipart/form-data detection ---
  if (contentType.includes('multipart/form-data')) {
    const parsed = await parseForm(req);
    const { fields, files } = parsed;

    title =
      Array.isArray(fields.title) ? fields.title[0] :
      typeof fields.title === 'string' ? fields.title : undefined;

    description =
      Array.isArray(fields.description) ? fields.description[0] :
      typeof fields.description === 'string' ? fields.description : undefined;

    const fAny = files?.file;
    fileAny = Array.isArray(fAny) ? fAny[0] : fAny;

    // --- allowed formats ---
    const allowed = ['image/png', 'image/jpg', 'image/jpeg', 'image/webp'];
    const forbidden = ['image/gif', 'image/avif'];

    if (fileAny) {
      const mime = fileAny.mimetype || fileAny.type || '';
      if (forbidden.includes(mime)) {
        return res.status(400).json({ error: 'GIF and AVIF are not allowed' });
      }
      if (!allowed.includes(mime)) {
        return res.status(400).json({ error: 'Unsupported file format' });
      }
    }
  }

  // --- JSON fallback ---
  else if (contentType.includes('application/json')) {
    const raw = await new Promise<string>((resolve) => {
      let data = '';
      req.on('data', (chunk) => (data += chunk));
      req.on('end', () => resolve(data));
    }).catch(() => '');

    if (raw) {
      try {
        const parsedBody = JSON.parse(raw);
        mediaId = parsedBody?.mediaId;
        title = typeof parsedBody?.title === 'string' ? parsedBody.title : undefined;
        description = typeof parsedBody?.description === 'string' ? parsedBody.description : undefined;
      } catch {}
    }
  }

  // --- CORE LOGIC ---
  try {
    let mediaConnect = undefined;
    let postImageCreate: any = undefined;

    // FILE → MEDIA
    if (fileAny) {
      const filepath = fileAny?.filepath || fileAny?.path;

      if (filepath) {
        try {
          let sharpLib: any = null;
          try { sharpLib = require('sharp'); } catch {}

          let optimized: Buffer | Uint8Array | null = null;
          let meta2: any = {};
          let optimizedMime = fileAny.mimetype || fileAny.type || 'application/octet-stream';

          if (sharpLib) {
            optimized = await sharpLib(filepath)
              .resize({ width: 1600, withoutEnlargement: true })
              .toFormat('webp', { quality: 80 })
              .toBuffer();

            meta2 = await sharpLib(optimized).metadata();
            optimizedMime = 'image/webp';
          } else {
            optimized = fs.readFileSync(filepath);
          }

          try {
            if (optimized) {
              const dataForPrisma =
                optimized instanceof Buffer ? optimized : Buffer.from(optimized as Uint8Array);

              const media = await prisma.media.create({
                data: {
                  ownerId: session.user.id,
                  data: dataForPrisma,
                  mime: optimizedMime,
                  size: optimized.length,
                  width: meta2.width ?? undefined,
                  height: meta2.height ?? undefined,
                  provider: 'db',
                },
              });

              mediaConnect = { connect: { id: media.id } };
            }
          } catch (err) {
            postImageCreate = {
              imageData: optimized ?? undefined,
              imageMime: optimizedMime,
              imageSize: optimized ? optimized.length : undefined,
              imageWidth: meta2.width ?? undefined,
              imageHeight: meta2.height ?? undefined,
            };
          }

          try { fs.unlinkSync(filepath); } catch {}
        } catch (err) {}
      }
    }

    // existing mediaId
    if (mediaId && typeof mediaId === 'string') {
      try {
        const exists = await prisma.media.findUnique({ where: { id: mediaId } });
        if (exists) mediaConnect = { connect: { id: mediaId } };
      } catch {}
    }

    // --- CREATE POST ---
    let post: any;

    try {
      const createData: any = { author: { connect: { id: session.user.id } } };

      if (title) createData.title = title;
      if (description) createData.description = description;
      if (mediaConnect) createData.media = mediaConnect;

      post = await prisma.post.create({
        data: createData,
        select: {
          id: true,
          authorId: true,
          title: true,
          description: true,
          media: { select: { id: true, mime: true, size: true, width: true, height: true, provider: true, key: true } },
          author: { select: { id: true, login: true, avatar: true, link: true } },
          createdAt: true,
        }
      });
    } catch (err: any) {
      console.warn('post.create failed, fallback → raw SQL');

      try {
        const cols: any[] = await prisma.$queryRaw`
          SELECT column_name FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = 'Post'
        `;

        const existing = new Set(cols.map(c => c.column_name));

        const insertCols = ['id', '"authorId"'];
        const insertVals: any[] = [randomUUID(), session.user.id];

        if (existing.has('title') && title) {
          insertCols.push('title');
          insertVals.push(title);
        }

        if (existing.has('description') && description) {
          insertCols.push('description');
          insertVals.push(description);
        }

        if (existing.has('mediaId') && mediaConnect) {
          insertCols.push('"mediaId"');
          insertVals.push(mediaConnect.connect.id);
        }

        if (existing.has('createdAt')) {
          insertCols.push('"createdAt"');
          insertVals.push(new Date());
        }

        const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(',');
        const sql = `INSERT INTO "Post" (${insertCols.join(',')}) VALUES (${placeholders}) RETURNING *`;

        const created: any[] = await prisma.$queryRawUnsafe(sql, ...insertVals);
        post = created[0];
      } catch (err2) {
        post = await prisma.post.create({
          data: {
            author: { connect: { id: session.user.id } },
            title: title,
            description: description,
            media: mediaConnect,
          },
          select: {
            id: true,
            authorId: true,
            title: true,
            description: true,
            media: { select: { id: true, mime: true, size: true, width: true, height: true, provider: true, key: true } },
            author: { select: { id: true, login: true, avatar: true, link: true } },
            createdAt: true,
          }
        });

        if (postImageCreate && post) {
          try {
            const media = await prisma.media.create({
              data: {
                ownerId: session.user.id,
                data: postImageCreate.imageData,
                mime: postImageCreate.imageMime,
                size: postImageCreate.imageSize,
                width: postImageCreate.imageWidth,
                height: postImageCreate.imageHeight,
                provider: 'db',
              },
            });

            await prisma.post.update({
              where: { id: post.id },
              data: { media: { connect: { id: media.id } } },
            });
          } catch (e) {}
        }
      }
    }

    return res.status(200).json({ post });
  } catch (e) {
    return res.status(500).json({
      error: 'Internal server error',
      detail: String((e as any)?.message || e),
    });
  }
}

// --- SINGLE DEFAULT EXPORT ---
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return uploadLimiter(req, res, () => postCreateHandler(req, res));
}
