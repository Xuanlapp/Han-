import { ImageAdjustments } from '../types';
import { removeBackgroundSmart } from './backgroundRemoval';

export const getCssFilterString = (adj: ImageAdjustments) => {
  return `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%) hue-rotate(${adj.hue}deg) sepia(${adj.sepia}%)`;
};

/**
 * Processes an image Data URL and returns a transparent PNG Data URL.
 * Uses imgly AI background removal and falls back automatically when needed.
 * Returns a new Base64 string (PNG).
 */
export const processBase64Transparency = async (base64Url: string): Promise<string> => {
    try {
      return await removeBackgroundSmart(base64Url, 'image/png');
    } catch (error) {
      console.warn('[BackgroundRemoval] process failed, returning original image', error);
      return base64Url;
    }
};

export const downloadEditedImage = (url: string, adjustments: ImageAdjustments, filename: string) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();

  img.crossOrigin = "anonymous";
  img.src = url;

  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;

    if (ctx) {
      // Apply filters
      ctx.filter = getCssFilterString(adjustments);
      ctx.drawImage(img, 0, 0);
      
      // Export
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };
};