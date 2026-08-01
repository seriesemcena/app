import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getFirebaseStorage } from './firebase';
import { dataCostDebug } from './devDataMetrics';

const AVATAR_TYPES = new Set(['image/jpeg', 'image/webp']);
const PRO_AVATAR_TYPES = new Set([...AVATAR_TYPES, 'image/gif']);
const COVER_TYPES = new Set(['image/jpeg', 'image/webp']);

export const PROFILE_IMAGE_LIMITS = {
  avatar: 400 * 1024,
  proAvatarGif: 600 * 1024,
  proCover: 5 * 1024 * 1024,
} as const;

type ProfileImageKind = 'avatar' | 'cover';

type RenderedImage = {
  blob: Blob;
  width: number;
  height: number;
};

type ProfileImageOptions = {
  isPro?: boolean;
};

export type UploadedProfileImage = {
  url: string;
  thumbUrl?: string;
  path: string;
  thumbPath?: string;
};

function normalizedContentType(file: File) {
  const type = file.type.toLowerCase();
  if (type === 'image/jpg') return 'image/jpeg';
  if (type) return type;
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  return '';
}

export function validateProfileImage(
  file: File,
  kind: ProfileImageKind,
  options: ProfileImageOptions = {},
) {
  const contentType = normalizedContentType(file);
  if (file.size <= 0) throw new Error('O arquivo selecionado está vazio.');

  if (kind === 'cover') {
    if (!COVER_TYPES.has(contentType)) throw new Error('Formato inválido. Use JPG, JPEG ou WebP.');
    if (file.size > PROFILE_IMAGE_LIMITS.proCover) throw new Error('A capa deve ter no máximo 5 MB.');
    return { contentType, animated: false };
  }

  const allowedTypes = options.isPro ? PRO_AVATAR_TYPES : AVATAR_TYPES;
  if (!allowedTypes.has(contentType)) {
    throw new Error(options.isPro
      ? 'Formato inválido. Use JPG, JPEG, WebP ou GIF.'
      : 'Formato inválido. Use JPG, JPEG ou WebP.');
  }

  if (contentType === 'image/gif') {
    if (!options.isPro) throw new Error('Fotos de perfil em GIF são exclusivas para membros PRO.');
    if (file.size > PROFILE_IMAGE_LIMITS.proAvatarGif) {
      throw new Error('O GIF da foto de perfil deve ter no máximo 600 KB.');
    }
    return { contentType, animated: true };
  }

  if (file.size > PROFILE_IMAGE_LIMITS.avatar) {
    throw new Error('A foto de perfil deve ter no máximo 400 KB.');
  }
  return { contentType, animated: false };
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

export async function createProfileImagePreview(
  file: File,
  kind: ProfileImageKind,
  options: ProfileImageOptions = {},
): Promise<string> {
  const validation = validateProfileImage(file, kind, options);
  if (validation.animated) return URL.createObjectURL(file);
  const output = await render(file, kind === 'avatar' ? 512 : 1280, kind === 'avatar' ? 512 : 720, 0.78);
  if (kind === 'avatar' && output.blob.size > PROFILE_IMAGE_LIMITS.avatar) {
    throw new Error('Não foi possível manter a foto processada abaixo de 400 KB.');
  }
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
  options: ProfileImageOptions = {},
): Promise<UploadedProfileImage> {
  const validation = validateProfileImage(file, kind, options);
  const storage = getFirebaseStorage();
  const version = Date.now();
  const folder = `users/${uid}/${kind}`;

  if (validation.animated) {
    const mainPath = `${folder}/${version}.gif`;
    const mainRef = ref(storage, mainPath);
    await uploadBytes(mainRef, file, {
      contentType: 'image/gif',
      cacheControl: 'public,max-age=31536000,immutable',
      customMetadata: { ownerUid: uid, animated: 'true' },
    });
    try {
      const url = await getDownloadURL(mainRef);
      dataCostDebug.image(kind, file.size, file.size);
      await Promise.all([removeByUrl(previous.url), removeByUrl(previous.thumbUrl)]);
      return { url, thumbUrl: url, path: mainPath, thumbPath: mainPath };
    } catch (error) {
      await deleteObject(mainRef).catch(() => {});
      throw error;
    }
  }

  const main = await render(file, kind === 'avatar' ? 512 : 1600, kind === 'avatar' ? 512 : 1000, 0.8);
  if (kind === 'avatar' && main.blob.size > PROFILE_IMAGE_LIMITS.avatar) {
    throw new Error('Não foi possível manter a foto processada abaixo de 400 KB.');
  }
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
      if (thumb.blob.size > PROFILE_IMAGE_LIMITS.avatar) {
        throw new Error('Não foi possível manter a miniatura abaixo de 400 KB.');
      }
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
