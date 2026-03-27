import { removeBackground } from '@imgly/background-removal';

export const REMOVAL_MODES = {
  IMGLY: 'imgly',
  PIXEL_THRESHOLD: 'pixel_threshold',
} as const;

export type RemovalMode = (typeof REMOVAL_MODES)[keyof typeof REMOVAL_MODES];

const toDataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read result blob'));
    reader.readAsDataURL(blob);
  });
};

const normalizeDataUrlInput = (base64OrDataUrl: string, mimeType: string): string => {
  if (base64OrDataUrl.startsWith('data:')) {
    return base64OrDataUrl;
  }
  return `data:${mimeType};base64,${base64OrDataUrl}`;
};

const dataUrlToBlob = (dataUrl: string, mimeType: string): Blob => {
  const payload = dataUrl.split(',')[1] || dataUrl;
  const byteCharacters = atob(payload);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
};

export async function removeBackgroundImgly(base64OrDataUrl: string, mimeType = 'image/png'): Promise<string> {
  const normalizedDataUrl = normalizeDataUrlInput(base64OrDataUrl, mimeType);
  const inputBlob = dataUrlToBlob(normalizedDataUrl, mimeType);
  const resultBlob = await removeBackground(inputBlob);
  return toDataUrl(resultBlob);
}

export function removeBackgroundPixelThreshold(base64OrDataUrl: string, mimeType = 'image/png'): Promise<string> {
  return new Promise((resolve) => {
    const sourceDataUrl = normalizeDataUrlInput(base64OrDataUrl, mimeType);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve(sourceDataUrl);
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data } = imageData;
      const width = canvas.width;
      const height = canvas.height;
      const totalPixels = width * height;
      const visited = new Uint8Array(totalPixels);
      const queue: number[] = [];
      let queueHead = 0;

      const colorDistance = (
        a: { r: number; g: number; b: number },
        b: { r: number; g: number; b: number }
      ) => {
        const dr = a.r - b.r;
        const dg = a.g - b.g;
        const db = a.b - b.b;
        return Math.sqrt(dr * dr + dg * dg + db * db);
      };

      const getPixelRgb = (pixelIndex: number) => {
        const offset = pixelIndex * 4;
        return {
          r: data[offset],
          g: data[offset + 1],
          b: data[offset + 2],
          a: data[offset + 3],
        };
      };

      const edgeColorBuckets = new Map<string, { count: number; sumR: number; sumG: number; sumB: number }>();
      const edgeSamples: Array<{ r: number; g: number; b: number; a: number }> = [];

      const sampleEdgePixel = (x: number, y: number) => {
        const idx = y * width + x;
        const px = getPixelRgb(idx);
        if (px.a === 0) return;

        edgeSamples.push(px);

        const qR = Math.floor(px.r / 32);
        const qG = Math.floor(px.g / 32);
        const qB = Math.floor(px.b / 32);
        const key = `${qR}-${qG}-${qB}`;
        const bucket = edgeColorBuckets.get(key) || {
          count: 0,
          sumR: 0,
          sumG: 0,
          sumB: 0,
        };
        bucket.count += 1;
        bucket.sumR += px.r;
        bucket.sumG += px.g;
        bucket.sumB += px.b;
        edgeColorBuckets.set(key, bucket);
      };

      for (let x = 0; x < width; x++) {
        sampleEdgePixel(x, 0);
        sampleEdgePixel(x, height - 1);
      }
      for (let y = 1; y < height - 1; y++) {
        sampleEdgePixel(0, y);
        sampleEdgePixel(width - 1, y);
      }

      const dominantBgColors = [...edgeColorBuckets.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map((bucket) => ({
          r: bucket.sumR / bucket.count,
          g: bucket.sumG / bucket.count,
          b: bucket.sumB / bucket.count,
        }));

      const bgColors = dominantBgColors.length
        ? dominantBgColors
        : [
            { r: 255, g: 255, b: 255 },
            { r: 0, g: 0, b: 0 },
          ];

      let edgeSpread = 0;
      if (edgeSamples.length) {
        const totalSpread = edgeSamples.reduce((acc, sample) => {
          const nearest = bgColors.reduce((best, bg) => {
            const d = colorDistance(sample, bg);
            return d < best ? d : best;
          }, Number.POSITIVE_INFINITY);
          return acc + nearest;
        }, 0);
        edgeSpread = totalSpread / edgeSamples.length;
      }

      const bgTolerance = Math.max(34, Math.min(85, Math.round(42 + edgeSpread * 0.7)));

      const isBackgroundLike = (pixelIndex: number) => {
        const offset = pixelIndex * 4;
        const alpha = data[offset + 3];
        if (alpha === 0) return true;

        const sample = {
          r: data[offset],
          g: data[offset + 1],
          b: data[offset + 2],
        };

        const minDistance = bgColors.reduce((best, bg) => {
          const d = colorDistance(sample, bg);
          return d < best ? d : best;
        }, Number.POSITIVE_INFINITY);

        return minDistance <= bgTolerance;
      };

      const enqueueIfEligible = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const index = y * width + x;
        if (visited[index]) return;
        if (!isBackgroundLike(index)) return;
        visited[index] = 1;
        queue.push(index);
      };

      for (let x = 0; x < width; x++) {
        enqueueIfEligible(x, 0);
        enqueueIfEligible(x, height - 1);
      }
      for (let y = 0; y < height; y++) {
        enqueueIfEligible(0, y);
        enqueueIfEligible(width - 1, y);
      }

      while (queueHead < queue.length) {
        const index = queue[queueHead++];
        const x = index % width;
        const y = Math.floor(index / width);
        const offset = index * 4;
        data[offset + 3] = 0;

        enqueueIfEligible(x + 1, y);
        enqueueIfEligible(x - 1, y);
        enqueueIfEligible(x, y + 1);
        enqueueIfEligible(x, y - 1);
      }

      const componentVisited = new Uint8Array(totalPixels);
      let largestComponent: number[] | null = null;

      for (let pixelIndex = 0; pixelIndex < totalPixels; pixelIndex++) {
        if (componentVisited[pixelIndex]) continue;

        const alpha = data[pixelIndex * 4 + 3];
        if (alpha === 0) {
          componentVisited[pixelIndex] = 1;
          continue;
        }

        const componentQueue = [pixelIndex];
        let componentHead = 0;
        componentVisited[pixelIndex] = 1;
        const componentPixels: number[] = [];

        while (componentHead < componentQueue.length) {
          const current = componentQueue[componentHead++];
          componentPixels.push(current);

          const cx = current % width;
          const cy = Math.floor(current / width);
          const neighbors: Array<[number, number]> = [
            [cx + 1, cy],
            [cx - 1, cy],
            [cx, cy + 1],
            [cx, cy - 1],
          ];

          for (const [nx, ny] of neighbors) {
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const neighborIndex = ny * width + nx;
            if (componentVisited[neighborIndex]) continue;
            componentVisited[neighborIndex] = 1;
            const neighborAlpha = data[neighborIndex * 4 + 3];
            if (neighborAlpha > 0) {
              componentQueue.push(neighborIndex);
            }
          }
        }

        if (!largestComponent || componentPixels.length > largestComponent.length) {
          largestComponent = componentPixels;
        }
      }

      if (largestComponent && largestComponent.length > 0) {
        const keepMask = new Uint8Array(totalPixels);
        largestComponent.forEach((idx) => {
          keepMask[idx] = 1;
        });

        for (let pixelIndex = 0; pixelIndex < totalPixels; pixelIndex++) {
          const offset = pixelIndex * 4;
          if (data[offset + 3] > 0 && !keepMask[pixelIndex]) {
            data[offset + 3] = 0;
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => {
      resolve(sourceDataUrl);
    };

    img.src = sourceDataUrl;
  });
}

export async function removeBackgroundSmart(
  base64OrDataUrl: string,
  mimeType = 'image/png',
  preferredMode: RemovalMode = REMOVAL_MODES.IMGLY
): Promise<string> {
  if (preferredMode === REMOVAL_MODES.IMGLY) {
    try {
      return await removeBackgroundImgly(base64OrDataUrl, mimeType);
    } catch (error) {
      console.warn('[BackgroundRemoval] imgly failed, fallback pixel threshold.', error);
      return removeBackgroundPixelThreshold(base64OrDataUrl, mimeType);
    }
  }

  return removeBackgroundPixelThreshold(base64OrDataUrl, mimeType);
}
