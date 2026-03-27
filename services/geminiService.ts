import { GoogleGenAI } from "@google/genai";
import { AnalysisResult } from '../types';

// NOTE: We instantiate the client inside functions to ensure we use the latest 
// process.env.API_KEY, especially after a user selects a specific key for high-end models.

/**
 * Utility to wait for a specified duration.
 */
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Executes a function with retry logic for rate limit errors (429) and transient failures.
 */
const runWithRetry = async <T>(
  operation: () => Promise<T>, 
  retries = 3, 
  delay = 2000
): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    const msg = error?.message || JSON.stringify(error);

    // If the error specifically mentions "limit: 0", it often means the daily quota is 
    // exhausted or the project lacks billing for this model. Retrying won't fix this.
    if (msg.includes('limit: 0')) {
        console.error("Quota exhausted (limit: 0) detected.");
        throw new Error("Daily API quota exhausted or billing required. Please check your Google Cloud Console billing details.");
    }

    const isRateLimit = 
      error?.status === 429 || 
      error?.code === 429 || 
      msg.includes('429') || 
      msg.includes('quota') || 
      msg.includes('RESOURCE_EXHAUSTED');
      
    // Also retry on generic "No image data" errors as they might be transient generation glitches
    const isTransient = msg.includes('No image data') || msg.includes('503') || msg.includes('Internal');

    if ((isRateLimit || isTransient) && retries > 0) {
      console.warn(`Retryable error hit (${msg}). Retrying in ${delay}ms... (Attempts left: ${retries})`);
      await wait(delay);
      return runWithRetry(operation, retries - 1, delay * 2);
    }
    throw error;
  }
};

/**
 * Converts a File object to a Base64 string suitable for the Gemini API.
 */
export const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Analyzes the uploaded combo image to extract objects, style, and theme.
 */
export const analyzeComboImage = async (file: File, keyword: string): Promise<AnalysisResult> => {
  return runWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const base64Data = await fileToGenerativePart(file);

    const contextInstruction = keyword 
      ? `CONTEXT provided by user: "${keyword}". Use this to help identify the theme and objects more accurately.` 
      : "";

    const prompt = `
      ${contextInstruction}

      🧠 ROLE
      You are a creative visual-intelligence AI assistant whose main function is to craft one clear, vivid, and well-structured image-generation prompt for producing a single sticker design. This prompt must be based on a thorough visual and emotional analysis of the provided images.

      🎯 OBJECTIVE
      Analyze the uploaded image and return a structured JSON object containing the style analysis and object list.

      STEP 1 – Analyze Visuals
      Examine the input image. Identify design traits, color trends, emotional cues, and visual language that resonate with potential buyers.

      STEP 2 – Craft Style Prompt (for the "style" field)
      Compose a single natural-language prompt that clearly instructs an image model to create a sticker with this style.
      This description MUST include:
      - Vector art style (clean, scalable lines)
      - Bold, thick outlines
      - Sharp resolution and clarity
      - Square layout, fully visible (no cropping)
      - The specific artistic theme, motifs, and moods of the input.

      STEP 3 – Extract Objects
      List all distinct objects found in the image (e.g. separate stickers on the sheet).

      🧾 OUTPUT FORMAT
      Return ONLY valid JSON. Do not include markdown formatting (like \`\`\`json). Use this schema:
      {
        "theme": "string",
        "style": "string", // The prompt composed in Step 2
        "objects": ["string", "string", ...],
        "colorPalette": ["string", "string", ...]
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image', // Fast model for analysis
      contents: {
        parts: [
          { inlineData: { mimeType: file.type, data: base64Data } },
          { text: prompt }
        ]
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    // Clean up markdown code blocks if the model includes them despite instructions
    let cleanText = text.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    return JSON.parse(cleanText) as AnalysisResult;
  });
};

/**
 * Generates a redesigned, isolated version of a specific object based on the style.
 * Uses Gemini 3 Pro for high-quality image generation.
 */
export const generateRedesignedObject = async (
  objectName: string,
  styleDescription: string,
  theme: string,
  keyword: string
): Promise<string> => {
  return regenerateRedesignedObject(objectName, styleDescription, theme, keyword, "");
};

/**
 * Regenerates an object. 
 * If referenceImageUrl is provided, it edits that specific image (Img2Img).
 * If not, it generates from scratch (Text2Img).
 */
export const regenerateRedesignedObject = async (
  objectName: string,
  styleDescription: string,
  theme: string,
  keyword: string,
  userInstruction: string,
  referenceImageUrl?: string
): Promise<string> => {
  return runWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    let userConstraint = "";
    if (userInstruction) {
      userConstraint = `
      IMPORTANT - USER OVERRIDE INSTRUCTION: "${userInstruction}"
      `;
    }

    const keywordContext = keyword ? `User specified Context/Keyword (Idea for output): "${keyword}". Incorporate this context if relevant to the object.` : "";

    let prompt = "";
    const parts: any[] = [];

    if (referenceImageUrl) {
        // Image-to-Image editing mode
        const base64Data = referenceImageUrl.split(',')[1];
        const mimeType = referenceImageUrl.split(';')[0].split(':')[1] || 'image/png';
        
        parts.push({ inlineData: { mimeType, data: base64Data } });
        
        prompt = `
          ROLE: Professional sticker design AI.
          
          OBJECTIVE: EDIT this image based on the instruction: ${userInstruction}
          Subject: ${objectName}.
          Theme: ${theme}.
          Style: ${styleDescription}.
          ${keywordContext}
          
          Rules:
          - EDIT ON TOP OF THE PROVIDED IMAGE.
          - Preserve composition/shape if possible.
          
          DESIGN REQUIREMENTS:
          - ONLY ONE OUTLINE: THICK WHITE OUTLINE.
          - NO black outline.
          - NO double outline.
          - NO shadow border.
          
          TECHNICAL REQUIREMENT:
          - Generate on a SOLID BLACK BACKGROUND (HEX #000000).
          - This ensures the white outline is clean and extractable.
          
          SAFETY & COPYRIGHT RULES:
          - DO NOT generate any trademarked logos, characters, brand names.
          - Create original artwork.
        `;
    } else {
        // Text-to-Image generation mode (Initial creation)
        prompt = `
          ROLE: You are a professional sticker design AI specialized in e-commerce and print-on-demand products.

          OBJECTIVE: Generate exactly one sticker design of a ${objectName}.
          Theme: ${theme}.
          Style: ${styleDescription}.
          ${keywordContext}
          
          ${userConstraint}

          DESIGN REQUIREMENTS:
          - A single, complete illustration.
          - Centered and fully visible.
          - ONLY ONE OUTLINE: THICK WHITE OUTLINE (Sticker Die-Cut).
          - NO black outline.
          - NO double outline.
          - NO shadow border.
          - NO stroke outside the white outline.
          - White outline must be smooth, even thickness, and clean vector edge.
          - Surround the entire sticker shape clearly.

          STYLE & VISUAL:
          - Vector-style illustration.
          - Bold, clean shapes.
          - High contrast colors.
          - Smooth curves.
          - Crisp edges.
          - Cute / trendy / expressive.
          - Print-ready quality (No blur, no noise).

          STRICTLY AVOID:
          - Black outline.
          - Dark stroke outside the sticker.
          - Glow effects.
          - Drop shadows.
          - Background elements.
          - Text / Watermarks.

          TECHNICAL REQUIREMENT:
          - Generate on a SOLID BLACK BACKGROUND (HEX #000000).
          - The white outline must contrast clearly against the black background for automatic removal.
          - Do NOT generate a checkerboard or transparent background. Use PURE BLACK.

          SAFETY & COPYRIGHT RULES:
          - DO NOT generate any trademarked logos, characters, brand names, or copyrighted imagery.
          - Create original artwork.
        `;
    }
    
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash',
      contents: { parts },
      config: {
        imageConfig: {
            aspectRatio: "1:1",
            imageSize: "1K"
        }
      }
    });

    const candidate = response.candidates?.[0];
    const part = candidate?.content?.parts?.find(p => p.inlineData);
    
    if (part && part.inlineData && part.inlineData.data) {
        return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
    }

    // Improve error reporting
    const refusalText = candidate?.content?.parts?.find(p => p.text)?.text;
    if (refusalText) {
         throw new Error(`AI Refusal: ${refusalText}`);
    }
    if (candidate?.finishReason) {
        throw new Error(`AI Finished with status: ${candidate.finishReason}`);
    }

    throw new Error("No image data in response");
  });
};

/**
 * Generates an Enhanced / Polished version of the provided image (Auto Redesign).
 * Focuses on clarity, color correction, and print optimization.
 */
export const generateSimilarObject = async (
  objectName: string,
  styleDescription: string,
  theme: string,
  keyword: string,
  referenceImageUrl: string
): Promise<string> => {
  return runWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Extract base64 from data URL
    const base64Data = referenceImageUrl.split(',')[1];
    const mimeType = referenceImageUrl.split(';')[0].split(':')[1] || 'image/png';

    const prompt = `
      ROLE: Professional Image Editor & Pre-press Specialist.

      OBJECTIVE: Edit and enhance the provided image only.
      
      STRICT CONSTRAINTS:
      - Keep the same design, layout, subject, and idea.
      - Do NOT create a new image or a new concept.
      - Do NOT change the pose or composition.
      
      TASKS:
      - Clean lines: Make edges sharp, remove artifacts.
      - Improve colors: Fix lighting, vibrancy, and contrast.
      - Increase clarity: Sharpen details, remove noise/blur.
      - Optimize for printing: Ensure high resolution appearance suitable for: ${keyword || "Sticker / Ornament / T-Shirt"}.

      CONTEXT:
      Subject: ${objectName}
      Theme: ${theme}
      Style: ${styleDescription}

      SAFETY & COPYRIGHT RULES:
      - DO NOT generate any trademarked logos, characters, brand names.
      - Create original artwork.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash',
      contents: {
        parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64Data } }
        ]
      },
      config: {
        imageConfig: {
            aspectRatio: "1:1",
            imageSize: "1K"
        }
      }
    });

    const candidate = response.candidates?.[0];
    const part = candidate?.content?.parts?.find(p => p.inlineData);
    
    if (part && part.inlineData && part.inlineData.data) {
        return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
    }

    // Improve error reporting
    const refusalText = candidate?.content?.parts?.find(p => p.text)?.text;
    if (refusalText) {
         throw new Error(`AI Refusal: ${refusalText}`);
    }
    if (candidate?.finishReason) {
        throw new Error(`AI Finished with status: ${candidate.finishReason}`);
    }

    throw new Error("No image data in response");
  });
};
