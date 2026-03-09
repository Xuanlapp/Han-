export interface AnalysisResult {
  theme: string;
  style: string;
  objects: string[];
  colorPalette: string[];
}

export interface ImageAdjustments {
  brightness: number; // 100 default
  contrast: number; // 100 default
  saturation: number; // 100 default
  hue: number; // 0 default
  sepia: number; // 0 default (Warmth)
}

export interface GeneratedImage {
  id: string;
  url: string; // Base64 data URL
  prompt: string;
  originalObject: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  adjustments: ImageAdjustments;
  // Google Drive Metadata
  driveFileId?: string;
  driveViewLink?: string;
}

export type ProcessingState = 'idle' | 'analyzing' | 'generating' | 'complete';

export interface PanelState {
  id: number;
  file: File | null;
  previewUrl: string | null;
  targetCount: number;
  keyword: string; // User defined keyword/context
  processingState: ProcessingState;
  analysis: AnalysisResult | null;
  generatedImages: GeneratedImage[];
  progress: number;
  error: string | null;
  // Google Sync State
  sheetRowIndex?: number; // 1-based index of the row in the sheet
  isSyncingToGoogle?: boolean;
  lastSyncTime?: number;
}