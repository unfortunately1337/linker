import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fs from 'fs';
import os from 'os';

import prisma from '../../../lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getStoragePath, ensureDir } from '../../../lib/storage';
import { uploadLimiter } from '../../../lib/rateLimiter';
// No encryption for voice files anymore — store raw files under pages/api/.private_media/voice
import { getSocket } from '../../../lib/socket';

export const config = {
	api: {
		bodyParser: false,
	},
};

function parseForm(req: NextApiRequest): Promise<{ fields: any; files: any }> {
	return new Promise((resolve, reject) => {
		// Robustly support several possible `formidable` shapes
		try {
			const formidableLib = require('formidable');
			let createForm: any = null;
			if (typeof formidableLib === 'function') {
				createForm = formidableLib;
			} else if (formidableLib && typeof formidableLib.default === 'function') {
				createForm = formidableLib.default;
			} else if (formidableLib && typeof formidableLib.IncomingForm === 'function') {
				createForm = (opts: any) => new formidableLib.IncomingForm(opts);
			}
			if (!createForm) return reject(new Error('Formidable module has unexpected shape'));
			const form = createForm({
				multiples: false,
				allowEmptyFiles: false,
				keepExtensions: true,
				maxFileSize: 10 * 1024 * 1024, // 10MB
			});
			if (typeof form.parse === 'function') {
				form.parse(req, (err: any, fields: any, files: any) => {
					if (err) reject(err);
					else resolve({ fields, files });
				});
			} else if (typeof (form as any).then === 'function') {
				(form as any).then((parsed: any) => resolve(parsed)).catch(reject);
			} else {
				reject(new Error('Formidable parse method not available'));
			}
		} catch (err) {
			reject(err);
		}
	});
}

async function voiceUploadHandler(req: NextApiRequest, res: NextApiResponse) {
		// CORS: prefer echoing request origin when present so credentialed requests work.
		const origin = (req.headers.origin as string) || '';
		if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
		res.setHeader('Access-Control-Allow-Credentials', 'true');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
		res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
		// Handle preflight quickly
		if (req.method === 'OPTIONS') {
			res.status(200).end();
			return;
		}
	
	if (req.method !== 'POST') {
		res.status(405).json({ error: 'Method not allowed' });
		return;
	}
	try {
		// Require authenticated user early so that saved filenames include owner info
		let sessionEarly;
		try {
			sessionEarly = await getServerSession(req, res, authOptions);
		} catch (se) {
			console.error('[VOICE UPLOAD] getServerSession error:', se);
		}
		console.log('[VOICE UPLOAD] Session user:', sessionEarly?.user?.id);
		if (!sessionEarly || !sessionEarly.user?.id) {
			console.log('[VOICE UPLOAD] Unauthorized - no session');
			return res.status(401).json({ error: 'Unauthorized: login required to upload audio' });
		}

		let fields: any, files: any;
		try {
			({ fields, files } = await parseForm(req));
			console.log('[VOICE UPLOAD] Form parsed, files:', Object.keys(files || {}));
		} catch (pfErr: any) {
			console.error('[VOICE UPLOAD] Parse error:', pfErr);
			const isDev = process.env.NODE_ENV === 'development';
			res.status(500).json({
				error: 'Failed to parse multipart form',
				...(isDev && { details: String(pfErr) })
			});
			return;
		}
		
		const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10 MB
		const ALLOWED_AUDIO_TYPES = ['audio/webm', 'audio/mpeg', 'audio/wav', 'audio/ogg'];
		
		let audio = files.audio;
		if (Array.isArray(audio)) audio = audio[0];
		
		// Validate file size
		if (audio && audio.size && audio.size > MAX_AUDIO_SIZE) {
			return res.status(413).json({
				error: 'Audio file too large',
				maxSize: '10 MB'
			});
		}
		
		// Validate MIME type
		if (audio && audio.mimetype && !ALLOWED_AUDIO_TYPES.includes(audio.mimetype)) {
			return res.status(400).json({
				error: 'Invalid audio format',
				allowed: ALLOWED_AUDIO_TYPES
			});
		}
		
		let file: any, fileType: string | undefined, fileExt: string | undefined;
		let uploadDir: string, fileName: string, filePath: string, urlField: string, urlValue: string;
		let chatId = fields.chatId;
		if (Array.isArray(chatId)) chatId = chatId[0];

           if (!chatId) {
               throw new Error('No chatId provided');
           }

		   if (audio) {
			   file = audio;
			   fileType = 'audio';
			   // choose extension from original name when possible
			   const orig = (file as any)?.originalFilename || (file as any)?.name || '';
			   fileExt = path.extname(orig) || '.webm';
			   // Save media under writable storage path (supports serverless /tmp fallback)
			   uploadDir = getStoragePath('voice');
			   if (!ensureDir(uploadDir)) throw new Error(`Unable to create upload dir: ${uploadDir}`);
			   // include owner id in filename for easier owner-only access when DB missing
			   const userId = sessionEarly.user.id as string;
			   fileName = `${userId}-${Date.now()}-${Math.floor(Math.random() * 10000)}${fileExt}`;
			   
				   try {
					   // Read temp file into buffer and store as base64 in DB (safer on serverless platforms)
					   const tmpPath = (file as any)?.filepath || (file as any)?.path || (file as any)?.tempFilePath || (file as any)?.file?.path;
					   console.log('[VOICE UPLOAD] tmpPath candidates, using:', tmpPath);
					   console.log('[VOICE UPLOAD] file props:', {
						   originalFilename: (file as any)?.originalFilename || (file as any)?.name || null,
						   mimetype: (file as any)?.mimetype || (file as any)?.type || null,
						   size: (file as any)?.size || null,
					   });

					   if (!tmpPath) throw new Error('Temporary upload path is missing on parsed file');
					   try {
						   await fs.promises.access(tmpPath, fs.constants.R_OK);
					   } catch (accessErr) {
						   console.error('[VOICE UPLOAD] Temp file is not accessible:', accessErr);
						   throw accessErr;
					   }

					   const fileBuffer = await fs.promises.readFile(tmpPath);
					   if (!fileBuffer || fileBuffer.length === 0) throw new Error('Uploaded audio is empty');
					   // Prefer storing raw audio file in storage and reference it by URL
					   try {
						   const uploadDirPrimary = getStoragePath('voice');
						   if (!ensureDir(uploadDirPrimary)) throw new Error(`Unable to create upload dir: ${uploadDirPrimary}`);
						   const extFromName = (file as any)?.originalFilename ? path.extname((file as any).originalFilename) : '';
						   const ext = extFromName || '.webm';
						   const fileNameSaved = `${Date.now()}-${Math.floor(Math.random() * 10000)}${ext}`;
						   const finalPath = path.join(uploadDirPrimary, fileNameSaved);
						   const tempWrite = `${finalPath}.tmp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
						   await fs.promises.writeFile(tempWrite, fileBuffer);
						   await fs.promises.rename(tempWrite, finalPath);
						   // Expose via API streaming route so files are accessible regardless of storage base
						   urlField = 'audioUrl';
						   // Serve via our API endpoint which will locate the file in storage
						   urlValue = `/api/media/voice/${fileNameSaved}`;
						   // keep raw buffer in fields for potential fallback
						   (fields as any).__rawBuffer = fileBuffer;
						   (fields as any).__audioMime = (file as any)?.mimetype || (file as any)?.type || 'audio/webm';
						   console.log('[VOICE UPLOAD] Audio saved to storage:', finalPath);
					   } catch (errSave: any) {
						   console.error('[VOICE UPLOAD] Failed to save audio to storage primary path:', errSave);
						   throw errSave;
					   }
				   } catch (error: any) {
					   console.error('[VOICE UPLOAD] File processing error:', error);
					   throw new Error(`File processing failed: ${error.message || 'Unknown error'}`);
				   }
		   } else {
			   res.status(400).json({ error: 'No audio file', fields, files });
			   return;
		   }
		   // (Проверка минимального размера файла отключена)
		   // We already validated sessionEarly above
		   const session = sessionEarly;
		   const userId = session?.user?.id;
		   if (!chatId) {
			   res.status(400).json({ error: 'No chatId provided', fields });
			   return;
		   }
		   if (!userId) {
			   res.status(401).json({ error: 'Unauthorized: no userId from session', session });
			   return;
		   }
		   // If we prepared base64 payload, include it in the DB create
		   const createData: any = {
			   chatId,
			   senderId: userId,
			   text: '',
		   };
		   if ((fields as any).__audioBase64) {
			   createData.audioBase64 = (fields as any).__audioBase64;
			   createData.audioMime = (fields as any).__audioMime || 'audio/mpeg';
		   } else if (urlValue && urlValue !== '__DB_BASE64_PLACEHOLDER__') {
			   createData[urlField] = urlValue;
		   }

					 let message: any = null;
		   let dbError: any = null;
		   let persisted = false;
		   try {
			   message = await prisma.message.create({ data: createData });
			   persisted = !!(message && message.id);
			   // If we stored base64 in DB, set audioUrl to DB-serving endpoint for convenience
			   if (createData.audioBase64) {
				   const dbUrl = `/api/media/db/${message.id}/audio`;
				   await prisma.message.update({ where: { id: message.id }, data: { audioUrl: dbUrl } });
				   urlValue = dbUrl;
			   }
		   } catch (err: any) {
			   console.error('[VOICE UPLOAD] Prisma create failed', err);
			   dbError = { message: err?.message || String(err), stack: err?.stack };
			   // Fallback ephemeral message object
							 // Try fallback: write raw buffer to disk and create DB record with audioUrl
							 const tempId = `temp-${Date.now()}`;
							 message = { id: tempId, chatId, senderId: userId, text: '', createdAt: new Date().toISOString() };
							 persisted = false;
							 try {
								 const rawBuffer: Buffer | undefined = (fields as any).__rawBuffer;
								 const uploadDirFallback = getStoragePath('voice');
								 if (rawBuffer && uploadDirFallback) {
									 // ensure dir exists (already ensured earlier)
									 const fallbackFileName = `${Date.now()}-fallback-voice.webm`;
									 const fallbackPath = path.join(uploadDirFallback, fallbackFileName);
								// Atomic write for fallback: write to temp then rename
								const tempFallback = `${fallbackPath}.tmp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
								await fs.promises.writeFile(tempFallback, rawBuffer);
								await fs.promises.rename(tempFallback, fallbackPath);
								console.log('[VOICE UPLOAD] Fallback file written to:', fallbackPath, 'host:', os.hostname(), 'pid:', process.pid);
								// If fallbackPath is in public/, expose it as static /media URL, otherwise use API path
										   let publicUrl = `/api/media/voice/${fallbackFileName}`;
								try {
									const publicPrefix = path.join(process.cwd(), 'public');
									const normalizedFallback = path.normalize(fallbackPath);
									const normalizedPublic = path.normalize(publicPrefix);
									if (normalizedFallback.startsWith(normalizedPublic)) {
										let webPath = normalizedFallback.slice(normalizedPublic.length).replace(/\\\\/g, '/');
										if (!webPath.startsWith('/')) webPath = '/' + webPath;
										publicUrl = webPath;
									}
								} catch (e) {
									// keep default
								}
								 urlValue = publicUrl;
									 // attempt to persist message referencing file URL
									 try {
										 const persistedMsg = await prisma.message.create({ data: { chatId, senderId: userId, text: '', audioUrl: publicUrl } });
										 message = persistedMsg;
										 persisted = true;
									 } catch (createErr) {
										 console.error('[VOICE UPLOAD] Fallback DB create failed', createErr);
									 }
								 }
							 } catch (fbErr) {
								 console.error('[VOICE UPLOAD] Fallback file write failed', fbErr);
							 }
		   }
		// Отправляем событие в Pusher
		try {
			const payload = { id: message.id, sender: userId, text: '', createdAt: message.createdAt, audioUrl: urlValue, persisted, dbError };
			const pusher = getSocket();
			if (pusher) {
				await pusher.trigger(`chat-${chatId}`, 'new-message', payload);
			}
		} catch (pErr) {
			console.error('[VOICE UPLOAD] Pusher trigger failed:', pErr);
		}
		// Include debug info so client/dev can verify the file on disk
		try {
			const savedPath = path.join(getStoragePath('voice'), path.basename(urlValue));
			const fileSaved = fs.existsSync(savedPath);
			console.log('[VOICE UPLOAD] Sending response:', { [urlField]: urlValue, messageId: message.id, persisted, dbError, fileSaved });
			res.status(200).json({ [urlField]: urlValue, message, persisted, dbError, fileName: path.basename(savedPath), fileSaved });
		} catch (err) {
			console.error('[VOICE UPLOAD] Error checking saved file existence:', err);
			console.log('[VOICE UPLOAD] Sending fallback response');
			res.status(200).json({ [urlField]: urlValue, message, persisted, dbError });
		}
	} catch (e) {
		console.error('Voice upload error:', e);
		res.status(500).json({ error: 'Upload failed', details: String(e) });
	}
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
	return uploadLimiter(req, res, () => voiceUploadHandler(req, res));
}
