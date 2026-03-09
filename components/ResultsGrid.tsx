import React from 'react';
import { Download, Loader2, CheckCircle2, Edit2, X, RefreshCw, Plus } from 'lucide-react';
import { GeneratedImage, AnalysisResult } from '../types';
import { getCssFilterString, downloadEditedImage } from '../utils/imageUtils';

interface ResultsGridProps {
  images: GeneratedImage[];
  analysis: AnalysisResult | null;
  processingState: string;
  onImageClick: (img: GeneratedImage) => void;
  onRemoveImage: (id: string) => void;
  onGenerateSimilar: (id: string) => void;
  onAddMore: () => void;
  regeneratingIds: Set<string>;
}

export const ResultsGrid: React.FC<ResultsGridProps> = ({ 
    images, analysis, processingState, onImageClick, onRemoveImage, onGenerateSimilar, onAddMore, regeneratingIds 
}) => {
  
  const handleDownload = (e: React.MouseEvent, img: GeneratedImage) => {
    e.stopPropagation();
    downloadEditedImage(img.url, img.adjustments, `sticker-${img.id}.png`);
  };

  const handleRemove = (e: React.MouseEvent, imgId: string) => {
      e.stopPropagation();
      onRemoveImage(imgId);
  };

  const handleGenerateSimilar = (e: React.MouseEvent, imgId: string) => {
      e.stopPropagation();
      if (!regeneratingIds.has(imgId)) {
          onGenerateSimilar(imgId);
      }
  };

  const downloadAll = () => {
    images.forEach((img, idx) => {
      if (img.status === 'completed') {
        downloadEditedImage(img.url, img.adjustments, `redesigned-${idx + 1}.png`);
      }
    });
  };

  if (processingState === 'idle' && !analysis) {
    return null;
  }

  return (
    <div className="w-full animate-in fade-in duration-500 slide-in-from-bottom-4">
      {/* Analysis Header */}
      {analysis && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span className="bg-indigo-100 text-indigo-700 p-1 rounded">✨</span> 
                Analysis Complete
              </h2>
              <div className="mt-2 space-y-1">
                <p className="text-sm text-gray-600"><span className="font-semibold">Theme:</span> {analysis.theme}</p>
                <p className="text-sm text-gray-600"><span className="font-semibold">Style:</span> {analysis.style}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                    {analysis.colorPalette.slice(0, 5).map((color, idx) => (
                        <span key={idx} className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full border border-gray-200">
                            {color}
                        </span>
                    ))}
                </div>
              </div>
            </div>
            {processingState === 'complete' && images.length > 0 && (
                <button 
                    onClick={downloadAll}
                    className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                    <Download className="w-4 h-4" />
                    Download All
                </button>
            )}
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {images.map((img) => {
          const isRegenerating = regeneratingIds.has(img.id);

          return (
            <div 
              key={img.id} 
              onClick={() => img.status === 'completed' && onImageClick(img)}
              className={`
                  group relative bg-white rounded-xl border border-gray-200 shadow-sm transition-all duration-200 overflow-hidden aspect-square flex flex-col
                  ${img.status === 'completed' ? 'cursor-pointer hover:shadow-md hover:ring-2 hover:ring-indigo-500/50' : ''}
              `}
            >
              {/* Delete Button (X) */}
              <button
                  onClick={(e) => handleRemove(e, img.id)}
                  className="absolute top-2 right-2 z-10 bg-white text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-full shadow-sm border border-gray-100 opacity-0 group-hover:opacity-100 transition-all duration-200"
                  title="Remove Image"
              >
                  <X className="w-3.5 h-3.5" />
              </button>

              {/* Image Area */}
              <div className="flex-1 relative w-full h-full flex items-center justify-center bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-gray-50">
                {img.status === 'completed' ? (
                  <>
                    <img 
                      src={img.url} 
                      alt={img.originalObject} 
                      className={`w-full h-full object-contain p-4 transition-all duration-200 ${isRegenerating ? 'opacity-50 blur-[1px]' : ''}`}
                      style={{ filter: getCssFilterString(img.adjustments) }}
                    />
                    
                    {/* Regenerating Spinner Overlay */}
                    {isRegenerating && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                        </div>
                    )}

                    {/* Hover Overlay */}
                    {!isRegenerating && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[1px]">
                        {/* Edit Button */}
                        <div className="bg-white/90 text-indigo-600 p-2 rounded-full shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-all duration-300 hover:bg-white cursor-pointer">
                            <Edit2 className="w-5 h-5" />
                        </div>

                        {/* Redesign / Variation Button */}
                        <button
                            onClick={(e) => handleGenerateSimilar(e, img.id)}
                            className="bg-purple-600 text-white p-2 rounded-full shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-all duration-300 delay-75 hover:bg-purple-700"
                            title="Redesign based on this image"
                          >
                            <RefreshCw className="w-5 h-5" />
                          </button>

                        {/* Download Button */}
                        <button
                            onClick={(e) => handleDownload(e, img)}
                            className="bg-white/90 text-gray-900 p-2 rounded-full shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-all duration-300 delay-100 hover:bg-white"
                            title="Download PNG"
                          >
                            <Download className="w-5 h-5" />
                          </button>
                      </div>
                    )}
                  </>
                ) : img.status === 'failed' ? (
                  <div className="text-center p-4">
                      <p className="text-red-500 text-sm font-medium">Generation Failed</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                      <span className="text-xs text-indigo-600 font-medium animate-pulse">
                          {img.status === 'pending' ? 'Queued' : 'Designing...'}
                      </span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-3 border-t border-gray-100 bg-white">
                  <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-gray-700 truncate max-w-[80%]">
                          {img.originalObject}
                      </p>
                      {img.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                  </div>
              </div>
            </div>
          );
        })}

        {/* Add More Button */}
        {(processingState === 'complete' || (processingState === 'idle' && images.length > 0)) && (
            <button
                onClick={onAddMore}
                className="group relative bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 hover:border-indigo-500 hover:bg-indigo-50 transition-all duration-200 aspect-square flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-indigo-600"
                title="Generate Another Image"
            >
                <div className="p-3 rounded-full bg-white shadow-sm group-hover:scale-110 transition-transform duration-200">
                    <Plus className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium">Add Image</span>
            </button>
        )}
      </div>
    </div>
  );
};