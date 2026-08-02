import { FileSystem } from '@/types/system';
import { getFilename } from '@/utils/path';
import { uniqueId } from '@/utils/misc';
import { CustomFont, CustomFontInfo } from '@/styles/fonts';
import { parseFontInfo } from '@/utils/font';

export async function importFont(
  fs: FileSystem,
  file?: string | File,
): Promise<CustomFontInfo | null> {
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

  const fontPath = `${uniqueId()}-${filename}`;
  await fs.writeFile(fontPath, 'Fonts', bytes);

  return {
    path: fontPath,
    ...parseFontInfo(bytes, filename),
  };
}

export async function deleteFont(fs: FileSystem, font: CustomFont): Promise<void> {
  await fs.removeFile(font.path, 'Fonts');
  const separator = Math.max(font.path.lastIndexOf('/'), font.path.lastIndexOf('\\'));
  if (separator > 0) {
    const legacyDirectory = font.path.slice(0, separator);
    try {
      await fs.removeDir(legacyDirectory, 'Fonts', true);
    } catch (err) {
      console.warn('Failed to remove empty font directory', legacyDirectory, err);
    }
  }
}
