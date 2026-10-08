/** Achica la foto en el navegador (lado mayor `maxSide`, JPEG 85%) antes de
 * subirla: la tienda carga rápido y el servidor no necesita procesar nada.
 * Si el navegador no puede (formato raro), sube el archivo tal cual. */
export async function shrinkImage(file: File, maxSide = 1600): Promise<{ blob: Blob; name: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 900_000) return { blob: file, name: file.name };
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return { blob: file, name: file.name };
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob ? { blob, name: file.name.replace(/\.[^.]+$/, '') + '.jpg' } : { blob: file, name: file.name };
  } catch {
    return { blob: file, name: file.name };
  }
}
