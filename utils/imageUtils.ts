import { ImageAdjustments } from '../types';
import { removeBackgroundSmart } from './backgroundRemoval';

export const getCssFilterString = (adj: ImageAdjustments) => {
  return `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%) hue-rotate(${adj.hue}deg) sepia(${adj.sepia}%)`;
};

/**
 * Processes a Base64 image string to remove its background.
 * Uses AI-powered imgly removal with pixel-threshold fallback.
 * Returns a new Base64 string (PNG).
 */
export const processBase64Transparency = async (base64Url: string): Promise<string> => {
    try {
        return await removeBackgroundSmart(base64Url);
    } catch (error) {
        console.warn('⚠️ [imageUtils] Background removal failed, returning original:', error);
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