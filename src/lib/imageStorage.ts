import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getFirebaseStorage } from './firebase';
import { dataCostDebug } from './devDataMetrics';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

type ProfileImageKind = 'avatar' | 'cover';

type RenderedImage = {
  blob: Blob;
  width: number;
  height: number;
};

export type UploadedProfileImage = {
  url: string;
  thumbUrl?: string;
  path: string;
  thumbPath?: string;
};

function validateImage(file: File) {
  if (!ALLOWED_TYPES.has(file.type)) throw new Error('Formato inválido. Use JPG, PNG ou WebP.');
  if (file.size <= 0 || file.size > MAX_SOURCE_BYTES) throw new Error('Arquivo muito grande (máximo de 15 MB).');
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem.')); };
    image.src = url;
  });
}

async function render(file: File, maxWidth: number, maxHeight: number, quality: number): Promise<RenderedImage> {
  validateImage(file);
  const source = await decode(file);
  const sourceWidth = source.width;
  const sourceHeight = source.height;
  if (!sourceWidth || !sourceHeight || sourceWidth > 12_000 || sourceHeight > 12_000) {
    if ('close' in source) source.close();
    throw new Error('Dimensões da imagem não são válidas.');
  }
  const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('O navegador não conseguiu processar a imagem.');
  context.drawImage(source, 0, 0, width, height);
  if ('close' in source) source.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Falha ao comprimir a imagem.')), 'image/webp', quality);
  });
  return { blob, width, height };
}

export async function createProfileImagePreview(file: File, kind: ProfileImageKind): Promise<string> {
  const output = await render(file, kind === 'avatar' ? 512 : 1280, kind === 'avatar' ? 512 : 720, 0.78);
  dataCostDebug.image(`${kind}:preview`, file.size, output.blob.size);
  return URL.createObjectURL(output.blob);
}

async function removeByUrl(url?: string) {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return;
  try { await deleteObject(ref(getFirebaseStorage(), url)); } catch {}
}

export async function uploadProfileImage(
  uid: string,
  kind: ProfileImageKind,
  file: File,
  previous: { url?: string; thumbUrl?: string } = {},
): Promise<UploadedProfileImage> {
  validateImage(file);
  const storage = getFirebaseStorage();
  const version = Date.now();
  const folder = `users/${uid}/${kind}`;
  const main = await render(file, kind === 'avatar' ? 512 : 1600, kind === 'avatar' ? 512 : 1000, 0.8);
  const mainPath = `${folder}/${version}.webp`;
  const mainRef = ref(storage, mainPath);
  await uploadBytes(mainRef, main.blob, {
    contentType: 'image/webp',
    cacheControl: 'public,max-age=31536000,immutable',
    customMetadata: { ownerUid: uid, width: String(main.width), height: String(main.height) },
  });

  let thumbPath: string | undefined;
  let thumbUrl: string | undefined;
  try {
    if (kind === 'avatar') {
      const thumb = await render(file, 256, 256, 0.76);
      thumbPath = `${folder}/${version}-thumb.webp`;
      const thumbRef = ref(storage, thumbPath);
      await uploadBytes(thumbRef, thumb.blob, {
        contentType: 'image/webp',
        cacheControl: 'public,max-age=31536000,immutable',
        customMetadata: { ownerUid: uid, width: String(thumb.width), height: String(thumb.height) },
      });
      thumbUrl = await getDownloadURL(thumbRef);
      dataCostDebug.image(`${kind}:thumb`, file.size, thumb.blob.size);
    }
    const url = await getDownloadURL(mainRef);
    dataCostDebug.image(kind, file.size, main.blob.size);
    await Promise.all([removeByUrl(previous.url), removeByUrl(previous.thumbUrl)]);
    return { url, thumbUrl, path: mainPath, thumbPath };
  } catch (error) {
    await deleteObject(mainRef).catch(() => {});
    if (thumbPath) await deleteObject(ref(storage, thumbPath)).catch(() => {});
    throw error;
  }
}

export async function removeProfileImages(url?: string, thumbUrl?: string) {
  await Promise.all([removeByUrl(url), removeByUrl(thumbUrl)]);
}

