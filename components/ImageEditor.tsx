import React, { useState } from 'react';
import { X, Sliders, RefreshCw, Download, Wand2, MessageSquarePlus } from 'lucide-react';
import { GeneratedImage, ImageAdjustments } from '../types';
import { getCssFilterString, downloadEditedImage } from '../utils/imageUtils';

interface ImageEditorProps {
  image: GeneratedImage;
  isOpen: boolean;
  onClose: () => void;
  onUpdateAdjustments: (id: string, adj: ImageAdjustments) => void;
  onRedesign: (id: string, instruction: string) => Promise<void>;
  onGenerateSimilar: (id: string) => Promise<void>;
  isRegenerating: boolean;
}

export const ImageEditor: React.FC<ImageEditorProps> = ({ 
  image, isOpen, onClose, onUpdateAdjustments, onRedesign, onGenerateSimilar, isRegenerating 
}) => {
  const [instruction, setInstruction] = useState("");
  const [activeTab, setActiveTab] = useState<'adjust' | 'auto' | 'prompt'>('adjust');

  if (!isOpen) return null;

  const updateAdj = (key: keyof ImageAdjustments, value: number) => {
    onUpdateAdjustments(image.id, {
      ...image.adjustments,
      [key]: value
    });
  };

  const handleDownload = () => {
    downloadEditedImage(image.url, image.adjustments, `edited-${image.originalObject}.png`);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex overflow-hidden">
        
        {/* Left: Canvas Area */}
        <div className="flex-1 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-gray-50 flex items-center justify-center relative p-8">
            <img 
              src={image.url} 
              alt="Editing" 
              className="max-w-full max-h-full object-contain shadow-xl transition-all duration-200"
              style={{ filter: getCssFilterString(image.adjustments) }}
            />
            
            {/* Download Button on Canvas */}
            <div className="absolute top-4 right-4 flex gap-2">
                <button 
                  onClick={handleDownload}
                  className="bg-white/90 backdrop-blur hover:bg-white text-gray-800 p-2 rounded-lg shadow-sm border border-gray-200 transition-all flex items-center gap-2 text-sm font-medium"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
            </div>
        </div>

        {/* Right: Controls */}
        <div className="w-96 bg-white border-l border-gray-100 flex flex-col">
          
          {/* Header */}
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 truncate max-w-[200px]" title={image.originalObject}>
                {image.originalObject}
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            <button 
              onClick={() => setActiveTab('adjust')}
              className={`flex-1 py-3 text-xs font-medium flex flex-col items-center justify-center gap-1 transition-colors ${activeTab === 'adjust' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
            >
              <Sliders className="w-4 h-4" /> Adjust
            </button>
            <button 
              onClick={() => setActiveTab('auto')}
              className={`flex-1 py-3 text-xs font-medium flex flex-col items-center justify-center gap-1 transition-colors ${activeTab === 'auto' ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50/50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
            >
              <RefreshCw className="w-4 h-4" /> Enhance & Polish
            </button>
            <button 
              onClick={() => setActiveTab('prompt')}
              className={`flex-1 py-3 text-xs font-medium flex flex-col items-center justify-center gap-1 transition-colors ${activeTab === 'prompt' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
            >
              <MessageSquarePlus className="w-4 h-4" /> Custom Prompt
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6">
            
            {activeTab === 'adjust' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-3">
                  <div className="flex justify-between text-xs font-medium text-gray-500">
                    <span>Brightness</span>
                    <span>{image.adjustments.brightness}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="200" 
                    value={image.adjustments.brightness}
                    onChange={(e) => updateAdj('brightness', Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-xs font-medium text-gray-500">
                    <span>Contrast</span>
                    <span>{image.adjustments.contrast}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="200" 
                    value={image.adjustments.contrast}
                    onChange={(e) => updateAdj('contrast', Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-xs font-medium text-gray-500">
                    <span>Saturation</span>
                    <span>{image.adjustments.saturation}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="200" 
                    value={image.adjustments.saturation}
                    onChange={(e) => updateAdj('saturation', Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-xs font-medium text-gray-500">
                    <span>Warmth (Sepia)</span>
                    <span>{image.adjustments.sepia}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="100" 
                    value={image.adjustments.sepia}
                    onChange={(e) => updateAdj('sepia', Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-xs font-medium text-gray-500">
                    <span>Hue</span>
                    <span>{image.adjustments.hue}°</span>
                  </div>
                  <input 
                    type="range" min="-180" max="180" 
                    value={image.adjustments.hue}
                    onChange={(e) => updateAdj('hue', Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                </div>

                <button 
                  onClick={() => onUpdateAdjustments(image.id, { brightness: 100, contrast: 100, saturation: 100, hue: 0, sepia: 0 })}
                  className="w-full py-2 text-xs font-medium text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg hover:bg-gray-50 mt-4"
                >
                  Reset Adjustments
                </button>
              </div>
            )}

            {activeTab === 'auto' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                 <div className="bg-purple-50 p-4 rounded-xl text-xs text-purple-800 leading-relaxed border border-purple-100">
                    <strong>Enhance & Optimize:</strong> 
                    <p className="mt-1 opacity-80">
                        Uses the <span className="font-semibold">current image</span> as a strict reference. <br/>
                        Enhances clarity, fixes colors, cleans lines, and optimizes for printing while keeping the exact design, layout, and subject.
                    </p>
                </div>
                
                <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                    <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center">
                        <RefreshCw className={`w-8 h-8 ${isRegenerating ? 'animate-spin' : ''}`} />
                    </div>
                    <p className="text-sm text-gray-500 px-4">
                        Click below to enhance this image for print.
                    </p>
                </div>

                <button
                    onClick={() => onGenerateSimilar(image.id)}
                    disabled={isRegenerating}
                    className={`w-full py-4 rounded-xl font-semibold text-white flex items-center justify-center gap-3 shadow-lg transition-all
                        ${isRegenerating ? 'bg-gray-300 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 hover:shadow-purple-200 active:scale-[0.98]'}
                    `}
                >
                    {isRegenerating ? 'Enhancing...' : 'Run Enhance & Optimize'}
                </button>
              </div>
            )}

            {activeTab === 'prompt' && (
               <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="bg-blue-50 p-4 rounded-xl text-xs text-blue-800 leading-relaxed border border-blue-100">
                    <strong>Custom Prompt:</strong> 
                    <p className="mt-1 opacity-80">
                        Regenerate this object from scratch using <span className="font-semibold">text instructions</span>. This ignores the current image pixels and builds a new one based on the original object name + your prompt.
                    </p>
                  </div>
                    
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Your Instructions</label>
                        <textarea 
                            className="w-full p-4 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none h-32 shadow-sm"
                            placeholder="E.g. Make it cuter, add a thick white outline, change color to red..."
                            value={instruction}
                            onChange={(e) => setInstruction(e.target.value)}
                        />
                    </div>

                    <button
                        onClick={() => onRedesign(image.id, instruction)}
                        disabled={isRegenerating || !instruction.trim()}
                        className={`w-full py-3 rounded-xl font-medium text-white flex items-center justify-center gap-2 shadow-lg transition-all mt-4
                            ${isRegenerating || !instruction.trim() ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-blue-200 active:scale-[0.98]'}
                        `}
                    >
                        {isRegenerating ? (
                            <>
                            <RefreshCw className="w-4 h-4 animate-spin" /> Generating...
                            </>
                        ) : (
                            <>
                            <Wand2 className="w-4 h-4" /> Generate with Prompt
                            </>
                        )}
                    </button>
               </div>
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
};