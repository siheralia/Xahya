/**
 * Keep property images below Vercel's 1 MB request-body limit, including multipart overhead.
 * Work on the client so full-size photos never cross the network.
 */
export const PROPERTY_IMAGE_UPLOAD_LIMIT = 850 * 1024;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function preparePropertyImage(file: File): Promise<File> {
  if (!SUPPORTED_TYPES.has(file.type)) throw new Error("Selecciona una imagen JPG, PNG, WebP o GIF.");
  if (file.size <= 0) throw new Error("La imagen está vacía.");
  if (file.size <= PROPERTY_IMAGE_UPLOAD_LIMIT) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("No se pudo procesar la imagen. Usa una imagen JPG, PNG o WebP.");
  }

  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Tu navegador no permite comprimir imágenes.");

    for (const maximumEdge of [1600, 1200, 900, 640, 420]) {
      const scale = Math.min(1, maximumEdge / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.86, 0.72, 0.56, 0.4, 0.3]) {
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", quality));
        if (!blob || blob.type !== "image/webp") throw new Error("Tu navegador no pudo convertir la imagen a WebP.");
        if (blob.size <= PROPERTY_IMAGE_UPLOAD_LIMIT) {
          return new File([blob], "propiedad.webp", { type: "image/webp" });
        }
      }
    }
    throw new Error("La imagen no se pudo reducir lo suficiente. Prueba con otra foto.");
  } finally {
    bitmap.close();
  }
}
