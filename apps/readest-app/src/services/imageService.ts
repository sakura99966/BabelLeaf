import { FileSystem } from '@/types/system';
import { getFilename } from '@/utils/path';
import { uniqueId } from '@/utils/misc';
import { CustomTextureInfo, getTextureName } from '@/styles/textures';

export async function importImage(
  fs: FileSystem,
  file?: string | File,
): Promise<CustomTextureInfo | null> {
  let filename: string;
  let bytes: ArrayBuffer;

  if (typeof file === 'string') {
    const filePath = file;
    const fileobj = await fs.openFile(filePath, 'None');
    filename = fileobj.name || getFilename(filePath);
    bytes = await fileobj.arrayBuffer();
  } else if (file) {
    filename = getFilename(file.name);
    bytes = await file.arrayBuffer();
  } else {
    return null;
  }

  const texturePath = `${uniqueId()}-${filename}`;
  await fs.writeFile(texturePath, 'Images', bytes);

  return {
    name: getTextureName(filename),
    path: texturePath,
  };
}

export async function deleteImage(fs: FileSystem, texture: CustomTextureInfo): Promise<void> {
  await fs.removeFile(texture.path, 'Images');
  const separator = Math.max(texture.path.lastIndexOf('/'), texture.path.lastIndexOf('\\'));
  if (separator > 0) {
    const legacyDirectory = texture.path.slice(0, separator);
    try {
      await fs.removeDir(legacyDirectory, 'Images', true);
    } catch (err) {
      console.warn('Failed to remove empty image directory', legacyDirectory, err);
    }
  }
}
