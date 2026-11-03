export interface Frame { x: number; y: number; w: number; h: number; ox: number; oy: number }
export interface Atlas { frames: Frame[]; animations: Record<string, number[]> }
export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}assets/${path}`;
export async function loadImage(path: string): Promise<HTMLImageElement> {
  const image = new Image(); image.src = assetUrl(path);
  await image.decode(); return image;
}
export async function loadJson<T>(path: string): Promise<T> {
  const response = await fetch(assetUrl(path));
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
  return response.json() as Promise<T>;
}
