import React, { useState } from 'react';
import { Sparkles, AlertTriangle, X, ImageIcon, Cloud, RefreshCw, Database } from 'lucide-react';
import { Dropzone } from './Dropzone';
import { ResultsGrid } from './ResultsGrid';
import { ImageEditor } from './ImageEditor';
import { PanelState, GeneratedImage, ImageAdjustments } from '../types';
import { analyzeComboImage, generateRedesignedObject, regenerateRedesignedObject, generateSimilarObject } from '../services/geminiService';
import { syncPanelToGoogle } from '../services/googleService';
import { getCssFilterString, processBase64Transparency } from '../utils/imageUtils';

interface SessionPanelProps {
  id: number;
  onRemove: (id: number) => void;
  showRemove: boolean;
  onSessionExpired: () => void;
  accessToken: string;
  spreadsheetId: string;
  sheetName: string;
  onOpenSettings: () => void;
}

export const SessionPanel: React.FC<SessionPanelProps> = ({ 
    id, onRemove, showRemove, onSessionExpired, accessToken, spreadsheetId, sheetName, onOpenSettings 
}) => {
  const [state, setState] = useState<PanelState>({
    id,
    file: null,
    previewUrl: null,
    targetCount: 9,
    keyword: "",
    processingState: 'idle',
    analysis: null,
    generatedImages: [],
    progress: 0,
    error: null,
    isSyncingToGoogle: false
  });

  const [editingImage, setEditingImage] = useState<GeneratedImage | null>(null);
  // Replaced single boolean with a Set of IDs
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set());
  const [statusText, setStatusText] = useState("");
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');

  const handleFileSelect = (file: File) => {
    const url = URL.createObjectURL(file);
    setState(prev => ({
      ...prev,
      file,
      previewUrl: url,
      processingState: 'idle',
      analysis: null,
      generatedImages: [],
      error: null
    }));
    setUploadStatus('idle');
  };

  const handleCountChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setState(prev => ({ ...prev, targetCount: parseInt(e.target.value, 10) }));
  };

  const handleKeywordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setState(prev => ({ ...prev, keyword: e.target.value }));
  };

  const handleRemoveImage = (imgId: string) => {
    setState(prev => ({
        ...prev,
        generatedImages: prev.generatedImages.filter(img => img.id !== imgId)
    }));
    // Close editor if the removed image was being edited
    if (editingImage?.id === imgId) {
        setEditingImage(null);
    }
  };

  const runAnalysisAndRedesign = async () => {
    if (!state.file) return;

    setState(prev => ({ ...prev, processingState: 'analyzing', error: null, progress: 10 }));
    setUploadStatus('idle');

    try {
      // Pass the keyword to analysis
      const analysis = await analyzeComboImage(state.file, state.keyword);
      setState(prev => ({ 
        ...prev, 
        analysis, 
        processingState: 'generating', 
        progress: 30 
      }));

      // --- LOGIC UPDATE: Force Exact Target Count ---
      let objectsToProcess = [...analysis.objects];

      // 1. If analysis failed to find objects, fallback to Keyword or Theme
      if (objectsToProcess.length === 0) {
          const fallbackSubject = state.keyword || analysis.theme || "Sticker Illustration";
          objectsToProcess.push(fallbackSubject);
      }

      // 2. Pad the list if we have fewer objects than Target Count
      // We cycle through existing objects and create variations
      const sourceLength = objectsToProcess.length;
      let padIndex = 0;
      
      while (objectsToProcess.length < state.targetCount) {
          const originalObj = objectsToProcess[padIndex % sourceLength];
          // Remove existing parenthesis to avoid "Apple (Var 1) (Var 2)"
          const cleanName = originalObj.replace(/\s\(Variation \d+\)$/, ''); 
          
          // Calculate variation number based on how many times we've looped
          const variationNum = Math.floor(objectsToProcess.length / sourceLength) + 1;
          
          objectsToProcess.push(`${cleanName} (Variation ${variationNum})`);
          padIndex++;
      }

      // 3. Trim the list if we somehow have more than Target Count (from analysis)
      if (objectsToProcess.length > state.targetCount) {
          objectsToProcess = objectsToProcess.slice(0, state.targetCount);
      }
      
      // Now objectsToProcess.length is EXACTLY equal to state.targetCount
      // ----------------------------------------------

      const initialImages: GeneratedImage[] = objectsToProcess.map((obj, idx) => ({
        id: `gen-${id}-${idx}-${Date.now()}`,
        url: '',
        prompt: obj,
        originalObject: obj,
        status: 'pending',
        adjustments: { brightness: 100, contrast: 100, saturation: 100, hue: 0, sepia: 0 }
      }));

      setState(prev => ({ ...prev, generatedImages: initialImages }));

      let completedCount = 0;
      const updatedImages = [...initialImages];

      for (let i = 0; i < initialImages.length; i++) {
        // Throttle requests: Wait 5 seconds between starts to avoid hitting rate limits
        if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        updatedImages[i] = { ...updatedImages[i], status: 'generating' };
        setState(prev => ({ ...prev, generatedImages: [...updatedImages] }));

        try {
          // Pass the keyword to generation
          const base64Image = await generateRedesignedObject(
            initialImages[i].originalObject,
            analysis.style,
            analysis.theme,
            state.keyword
          );

          // Process for Transparency (Remove White BG)
          const transparentImage = await processBase64Transparency(base64Image);

          updatedImages[i] = { 
            ...updatedImages[i], 
            url: transparentImage, 
            status: 'completed' 
          };
        } catch (err: any) {
            console.error(err);
            updatedImages[i] = { ...updatedImages[i], status: 'failed' };
            
            const errorMessage = err.message || "";
            
            // Check for API Key validity (Session Expired)
            if (errorMessage.includes("Requested entity was not found")) {
                onSessionExpired();
                return;
            }

            // Check for Quota Exhaustion (The specific error thrown by geminiService)
            if (errorMessage.includes("quota exhausted") || errorMessage.includes("billing required")) {
                 setState(prev => ({ 
                    ...prev, 
                    generatedImages: [...updatedImages],
                    processingState: 'idle', // Stop spinning
                    error: "Daily Quota Exhausted. Generation stopped. Please check Google Cloud billing." 
                }));
                return; // Stop the loop
            }
        }

        completedCount++;
        const progressPerStep = 70 / initialImages.length; 
        
        setState(prev => ({ 
          ...prev, 
          generatedImages: [...updatedImages],
          progress: 30 + (completedCount * progressPerStep)
        }));
      }

      setState(prev => ({ ...prev, processingState: 'complete', progress: 100 }));

    } catch (error: any) {
      console.error(error);
      setState(prev => ({ 
        ...prev, 
        processingState: 'idle', 
        error: error.message || "An unexpected error occurred." 
      }));
    }
  };

  const handleUpdateAdjustments = (imgId: string, adj: ImageAdjustments) => {
    setState(prev => ({
      ...prev,
      generatedImages: prev.generatedImages.map(img => 
        img.id === imgId ? { ...img, adjustments: adj } : img
      )
    }));
    if (editingImage && editingImage.id === imgId) {
        setEditingImage(prev => prev ? ({ ...prev, adjustments: adj }) : null);
    }
  };

  const handleRedesign = async (imgId: string, instruction: string) => {
    if (!state.analysis) return;
    setRegeneratingIds(prev => new Set(prev).add(imgId));
    
    // Find the current image to get its data
    const sourceImageIndex = state.generatedImages.findIndex(img => img.id === imgId);
    if (sourceImageIndex === -1) {
        setRegeneratingIds(prev => { const n = new Set(prev); n.delete(imgId); return n; });
        return;
    }
    
    const sourceImage = state.generatedImages[sourceImageIndex];

    try {
        // Pass keyword and CURRENT IMAGE URL to regeneration for "Edit in place"
        const newUrl = await regenerateRedesignedObject(
            sourceImage.originalObject,
            state.analysis.style,
            state.analysis.theme,
            state.keyword,
            instruction,
            sourceImage.url // PASS THE REFERENCE IMAGE
        );

        // Process for Transparency
        const transparentUrl = await processBase64Transparency(newUrl);

        // Create a NEW image object instead of replacing the old one
        const newImage: GeneratedImage = {
            ...sourceImage,
            id: `gen-${id}-${Date.now()}`,
            url: transparentUrl,
            prompt: instruction ? `${sourceImage.originalObject} (${instruction})` : sourceImage.originalObject,
            adjustments: { brightness: 100, contrast: 100, saturation: 100, hue: 0, sepia: 0 }, // Reset adjustments
            status: 'completed'
        };

        setState(prev => {
            const newImages = [...prev.generatedImages];
            const index = newImages.findIndex(img => img.id === imgId);
            if (index !== -1) {
                // Insert the new image immediately after the source image
                newImages.splice(index + 1, 0, newImage);
            }
            return {
                ...prev,
                generatedImages: newImages
            };
        });
        
        setEditingImage(newImage);

    } catch (err: any) {
        const msg = err.message || "";
        if (msg.includes("Requested entity was not found")) {
            onSessionExpired();
        } else if (msg.includes("quota exhausted") || msg.includes("billing required")) {
            alert("Quota Exhausted: Please check your Google Cloud Billing.");
        } else {
            alert("Redesign failed: " + msg);
        }
    } finally {
        setRegeneratingIds(prev => { const n = new Set(prev); n.delete(imgId); return n; });
    }
  };
  
  const handleGenerateSimilar = async (imgId: string) => {
    if (!state.analysis) return;
    setRegeneratingIds(prev => new Set(prev).add(imgId));
    
    // Find the current image to get its data
    const sourceImageIndex = state.generatedImages.findIndex(img => img.id === imgId);
    if (sourceImageIndex === -1) {
        setRegeneratingIds(prev => { const n = new Set(prev); n.delete(imgId); return n; });
        return;
    }
    
    const sourceImage = state.generatedImages[sourceImageIndex];

    try {
        // Pass keyword to variation generation
        const newUrl = await generateSimilarObject(
            sourceImage.originalObject,
            state.analysis.style,
            state.analysis.theme,
            state.keyword,
            sourceImage.url
        );

        // Process for Transparency
        const transparentUrl = await processBase64Transparency(newUrl);

        // Create a NEW image object instead of replacing the old one
        const newImage: GeneratedImage = {
            ...sourceImage,
            id: `gen-${id}-${Date.now()}`,
            url: transparentUrl,
            prompt: `${sourceImage.originalObject} (Redesigned)`,
            adjustments: { brightness: 100, contrast: 100, saturation: 100, hue: 0, sepia: 0 }, // Reset adjustments
            status: 'completed'
        };

        setState(prev => {
            const newImages = [...prev.generatedImages];
            const index = newImages.findIndex(img => img.id === imgId);
            if (index !== -1) {
                // Insert the new image immediately after the source image
                newImages.splice(index + 1, 0, newImage);
            }
            return {
                ...prev,
                generatedImages: newImages
            };
        });
        
        // Open the editor for the new image so user sees the result
        setEditingImage(newImage);

    } catch (err: any) {
        const msg = err.message || "";
        if (msg.includes("Requested entity was not found")) {
            onSessionExpired();
        } else if (msg.includes("quota exhausted") || msg.includes("billing required")) {
            alert("Quota Exhausted: Please check your Google Cloud Billing.");
        } else {
            alert("Variation failed: " + msg);
        }
    } finally {
        setRegeneratingIds(prev => { const n = new Set(prev); n.delete(imgId); return n; });
    }
  };

  const handleAddMoreImage = async () => {
    if (!state.analysis) return;

    // Determine prompt for the new image
    // Pick a random object from the analysis list or use keyword
    const randomObj = state.analysis.objects.length > 0 
        ? state.analysis.objects[Math.floor(Math.random() * state.analysis.objects.length)] 
        : (state.keyword || "Sticker Illustration");
        
    const newId = `gen-${id}-add-${Date.now()}`;
    
    const newImage: GeneratedImage = {
        id: newId,
        url: '',
        prompt: randomObj,
        originalObject: randomObj,
        status: 'generating',
        adjustments: { brightness: 100, contrast: 100, saturation: 100, hue: 0, sepia: 0 }
    };

    setState(prev => ({
        ...prev,
        generatedImages: [...prev.generatedImages, newImage]
    }));

    try {
        const base64Image = await generateRedesignedObject(
            newImage.originalObject,
            state.analysis.style,
            state.analysis.theme,
            state.keyword
        );
        const transparentImage = await processBase64Transparency(base64Image);

        setState(prev => ({
            ...prev,
            generatedImages: prev.generatedImages.map(img => 
                img.id === newId ? { ...img, url: transparentImage, status: 'completed' } : img
            )
        }));
    } catch (err: any) {
        console.error(err);
        setState(prev => ({
            ...prev,
            generatedImages: prev.generatedImages.map(img => 
                img.id === newId ? { ...img, status: 'failed' } : img
            )
        }));
        
        const msg = err.message || "";
        if (msg.includes("Requested entity was not found")) {
            onSessionExpired();
        } else if (msg.includes("quota exhausted") || msg.includes("billing required")) {
             alert("Quota Exhausted: Please check your Google Cloud Billing.");
        }
    }
  };

  // --- Upload Logic ---
  const convertImageToBlob = async (url: string, adjustments: ImageAdjustments): Promise<Blob> => {
       return new Promise((resolve, reject) => {
           const canvas = document.createElement('canvas');
           const ctx = canvas.getContext('2d');
           const img = new Image();
           img.crossOrigin = "anonymous";
           img.src = url;
           img.onload = () => {
               canvas.width = img.width;
               canvas.height = img.height;
               if(ctx) {
                   ctx.filter = getCssFilterString(adjustments);
                   ctx.drawImage(img, 0, 0);
                   canvas.toBlob(blob => {
                       if(blob) resolve(blob);
                       else reject(new Error("Canvas to Blob failed"));
                   }, 'image/png');
               } else {
                   reject(new Error("Canvas Error"));
               }
           };
           img.onerror = reject;
       });
  };

  const handleUpload = async () => {
      if (!accessToken || !spreadsheetId) {
          onOpenSettings();
          return;
      }
      if (!state.file) return;

      setUploadStatus('uploading');

      try {
          const generatedBlobs = [];
          for (const img of state.generatedImages) {
              if (img.status === 'completed') {
                  const blob = await convertImageToBlob(img.url, img.adjustments);
                  generatedBlobs.push({ 
                      blob, 
                      name: `split_img_${img.id}.png` 
                  });
              }
          }

          await syncPanelToGoogle(
              accessToken,
              spreadsheetId,
              sheetName,
              state.file,
              `original_panel_${id}.png`,
              generatedBlobs,
              statusText,
              state.keyword // Pass keyword to sync
          );

          setUploadStatus('success');
      } catch (e: any) {
          console.error(e);
          setUploadStatus('error');
          alert("Upload failed: " + e.message);
      }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-8 animate-in fade-in duration-300">
      {/* Panel Header */}
      <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="bg-white border border-gray-200 text-gray-500 font-mono text-xs px-2 py-1 rounded">
            PANEL #{id}
          </span>
          <h2 className="text-sm font-semibold text-gray-700">Image Analysis Session</h2>
        </div>
        <div className="flex items-center gap-2">
            
            {/* Upload Button */}
            <button
                onClick={handleUpload}
                disabled={uploadStatus === 'uploading' || state.processingState !== 'complete'}
                className={`
                    text-xs font-medium px-4 py-2 rounded-full flex items-center gap-2 transition-colors shadow-sm
                    ${uploadStatus === 'uploading'
                        ? 'bg-blue-100 text-blue-700' 
                        : uploadStatus === 'success'
                            ? 'bg-green-100 text-green-700 hover:bg-green-200 ring-1 ring-green-500'
                            : uploadStatus === 'error'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'
                    }
                    ${(state.processingState !== 'complete') ? 'opacity-50 cursor-not-allowed bg-gray-200 text-gray-500 shadow-none' : ''}
                `}
                title="Save Original & Generated Images to Google Sheet"
            >
                {uploadStatus === 'uploading' ? (
                    <>
                        <RefreshCw className="w-3 h-3 animate-spin" /> Uploading...
                    </>
                ) : uploadStatus === 'success' ? (
                    <>
                        <Database className="w-3 h-3" /> Uploaded Successfully!
                    </>
                ) : uploadStatus === 'error' ? (
                    <>
                        <AlertTriangle className="w-3 h-3" /> Retry Upload
                    </>
                ) : (
                    <>
                        <Cloud className="w-4 h-4" /> Upload to Sheet
                    </>
                )}
            </button>

            {showRemove && (
                <button 
                    onClick={() => onRemove(id)}
                    className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"
                    title="Remove Panel"
                >
                    <X className="w-5 h-5" />
                </button>
            )}
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Controls */}
          <div className="lg:col-span-4 space-y-6">
            <div className="space-y-4">
               <Dropzone 
                 onFileSelect={handleFileSelect} 
                 disabled={state.processingState === 'analyzing' || state.processingState === 'generating'} 
               />
               
               {state.previewUrl && (
                <div className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50 aspect-video flex items-center justify-center">
                  <img src={state.previewUrl} alt="Preview" className="max-h-full max-w-full object-contain" />
                </div>
               )}

               <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Target Output
                    </label>
                    <select 
                      value={state.targetCount} 
                      onChange={handleCountChange}
                      disabled={state.processingState !== 'idle' && state.processingState !== 'complete'}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
                    >
                      <option value={1}>1 image</option>
                      <option value={2}>2 images</option>
                      <option value={3}>3 images</option>
                      <option value={4}>4 images</option>
                      <option value={5}>5 images</option>
                      <option value={6}>Up to 6 images</option>
                      <option value={9}>Up to 9 images</option>
                      <option value={12}>Up to 12 images</option>
                      <option value={18}>Up to 18 images</option>
                      <option value={24}>Up to 24 images</option>
                      <option value={30}>Up to 30 images</option>
                    </select>
                  </div>
               </div>

               {/* Keyword Input */}
               <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Keyword / Context (Idea for Output)
                  </label>
                  <input
                      type="text" 
                      value={state.keyword}
                      onChange={handleKeywordChange}
                      placeholder="E.g., Vintage style, Christmas theme, watercolor..."
                      disabled={state.processingState !== 'idle' && state.processingState !== 'complete'}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                      Provides ideas/context for the output stickers. <br/>
                      <span className="text-amber-600/80">Note: This is for style inspiration, not a logo request.</span>
                  </p>
               </div>

               {/* Status for Sheet */}
               <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Status / Note (Column 2)
                  </label>
                  <input
                      type="text" 
                      value={statusText}
                      onChange={(e) => setStatusText(e.target.value)}
                      placeholder="Enter status (e.g. Ready, Review)..."
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
               </div>

               <button
                  onClick={runAnalysisAndRedesign}
                  disabled={!state.file || (state.processingState !== 'idle' && state.processingState !== 'complete')}
                  className={`
                    w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-semibold text-white transition-all
                    ${!state.file || (state.processingState !== 'idle' && state.processingState !== 'complete')
                      ? 'bg-gray-300 cursor-not-allowed' 
                      : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg hover:shadow-indigo-200 active:scale-[0.98]'
                    }
                  `}
               >
                  {state.processingState === 'idle' || state.processingState === 'complete' ? (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Run Analysis & Split
                    </>
                  ) : (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Processing... {Math.round(state.progress)}%
                    </>
                  )}
               </button>
            </div>
            
            {state.error && (
              <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{state.error}</p>
              </div>
            )}
          </div>

          {/* Results */}
          <div className="lg:col-span-8">
             {state.processingState === 'idle' && !state.analysis ? (
               <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-gray-300 border-2 border-dashed border-gray-100 rounded-2xl">
                 <ImageIcon className="w-12 h-12 mb-2 opacity-50" />
                 <p className="text-sm">Ready for image</p>
               </div>
             ) : (
                <ResultsGrid 
                  images={state.generatedImages} 
                  analysis={state.analysis}
                  processingState={state.processingState}
                  onImageClick={setEditingImage}
                  onRemoveImage={handleRemoveImage}
                  onGenerateSimilar={handleGenerateSimilar}
                  onAddMore={handleAddMoreImage}
                  regeneratingIds={regeneratingIds}
                />
             )}
          </div>
        </div>
      </div>

      {editingImage && (
        <ImageEditor 
            image={editingImage} 
            isOpen={!!editingImage}
            onClose={() => setEditingImage(null)}
            onUpdateAdjustments={handleUpdateAdjustments}
            onRedesign={handleRedesign}
            onGenerateSimilar={handleGenerateSimilar}
            isRegenerating={regeneratingIds.has(editingImage.id)}
        />
      )}
    </div>
  );
};