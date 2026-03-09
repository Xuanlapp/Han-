import { ImageAdjustments } from '../types';

export const getCssFilterString = (adj: ImageAdjustments) => {
  return `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%) hue-rotate(${adj.hue}deg) sepia(${adj.sepia}%)`;
};

/**
 * Processes a Base64 image string to:
 * 1. Remove its Black background (#000000) using Flood Fill.
 * 2. Add a thick White Outline (Sticker Border) around the subject.
 * Returns a new Base64 string (PNG).
 */
export const processBase64Transparency = async (base64Url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = base64Url;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(base64Url); // Fallback
                return;
            }
            
            // Step 1: Draw original image
            ctx.drawImage(img, 0, 0);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const width = canvas.width;
            const height = canvas.height;
            
            // --- FLOOD FILL: Remove Black Background ---
            // Visited array to keep track of checked pixels
            const visited = new Uint8Array(width * height);
            
            // Queue for BFS (Start from corners)
            const queue = [
                0, // Top Left
                width - 1, // Top Right
                (height - 1) * width, // Bottom Left
                (height * width) - 1 // Bottom Right
            ];
            
            // Tolerance for black pixels (0-255)
            // Increased slightly to catch compressed black artifacts
            const tolerance = 50; 

            const isBackground = (r: number, g: number, b: number) => {
                return r <= tolerance && g <= tolerance && b <= tolerance;
            };

            let head = 0;
            while(head < queue.length) {
                const idx = queue[head++];
                if (visited[idx]) continue;
                visited[idx] = 1;

                const r = data[idx * 4];
                const g = data[idx * 4 + 1];
                const b = data[idx * 4 + 2];

                if (isBackground(r, g, b)) {
                    // Make transparent
                    data[idx * 4 + 3] = 0; 

                    // Check neighbors
                    const x = idx % width;
                    const y = Math.floor(idx / width);

                    if (x > 0) {
                        const nIdx = idx - 1;
                        if (!visited[nIdx]) queue.push(nIdx);
                    }
                    if (x < width - 1) {
                        const nIdx = idx + 1;
                        if (!visited[nIdx]) queue.push(nIdx);
                    }
                    if (y > 0) {
                        const nIdx = idx - width;
                        if (!visited[nIdx]) queue.push(nIdx);
                    }
                    if (y < height - 1) {
                        const nIdx = idx + width;
                        if (!visited[nIdx]) queue.push(nIdx);
                    }
                }
            }
            
            ctx.putImageData(imageData, 0, 0);

            // --- POST-PROCESSING: Add White Sticker Outline ---
            // We create a new composition canvas to add the stroke
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = width;
            finalCanvas.height = height;
            const fCtx = finalCanvas.getContext('2d');

            if (fCtx) {
                // A. Create a pure white silhouette of the object
                // We create a HARD silhouette by thresholding alpha to avoid "glowing" borders around fuzzy edges
                const silCanvas = document.createElement('canvas');
                silCanvas.width = width;
                silCanvas.height = height;
                const sCtx = silCanvas.getContext('2d');
                if (sCtx) {
                    sCtx.drawImage(canvas, 0, 0);
                    
                    const silData = sCtx.getImageData(0, 0, width, height);
                    const sData = silData.data;
                    
                    for (let i = 0; i < sData.length; i += 4) {
                        // Alpha threshold: Only treat pixels with substantial opacity as part of the sticker body
                        // This tightens the border significantly
                        if (sData[i + 3] > 100) {
                            sData[i] = 255;     // R
                            sData[i+1] = 255;   // G
                            sData[i+2] = 255;   // B
                            sData[i+3] = 255;   // Full Alpha
                        } else {
                            sData[i+3] = 0;     // Transparent
                        }
                    }
                    sCtx.putImageData(silData, 0, 0);
                }

                // B. Draw the white silhouette repeatedly to create a thick stroke
                const strokeThickness = 1; // Tight border (approx 2px)
                const density = 24; // Number of copies for smoothness

                for (let i = 0; i < density; i++) {
                    const angle = (i * 2 * Math.PI) / density;
                    const dx = Math.cos(angle) * strokeThickness;
                    const dy = Math.sin(angle) * strokeThickness;
                    fCtx.drawImage(silCanvas, dx, dy);
                }
                
                // Fill the center of the silhouette to be solid white
                fCtx.drawImage(silCanvas, 0, 0);

                // C. Draw the original (cleaned) image on top
                fCtx.globalCompositeOperation = 'source-over';
                fCtx.drawImage(canvas, 0, 0);

                resolve(finalCanvas.toDataURL('image/png'));
            } else {
                resolve(canvas.toDataURL('image/png'));
            }
        };
        img.onerror = () => resolve(base64Url);
    });
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