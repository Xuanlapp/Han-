import React, { useCallback, useState } from 'react';
import { Upload, FileImage, AlertCircle } from 'lucide-react';

interface DropzoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

export const Dropzone: React.FC<DropzoneProps> = ({ onFileSelect, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      validateAndProcess(files[0]);
    }
  }, [disabled]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndProcess(e.target.files[0]);
    }
  };

  const validateAndProcess = (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file (JPG, PNG).');
      return;
    }
    // Simple size check (e.g., 10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setError('File is too large. Max size is 10MB.');
      return;
    }
    onFileSelect(file);
  };

  return (
    <div className="w-full">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-xl p-8 transition-all duration-200 ease-in-out flex flex-col items-center justify-center text-center cursor-pointer
          ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-200' : ''}
          ${isDragging 
            ? 'border-indigo-500 bg-indigo-50 scale-[1.01]' 
            : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-20 bg-white'
          }
        `}
      >
        <input
          type="file"
          accept="image/png, image/jpeg, image/webp"
          onChange={handleFileInput}
          disabled={disabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />
        
        <div className="bg-indigo-100 p-3 rounded-full mb-4">
          <Upload className={`w-8 h-8 ${isDragging ? 'text-indigo-600' : 'text-indigo-500'}`} />
        </div>
        
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          {isDragging ? 'Drop it here!' : 'Upload Combo Image'}
        </h3>
        <p className="text-sm text-gray-500 mb-4 max-w-xs mx-auto">
          Drag & drop a sticker sheet, clipart bundle, or product combo.
        </p>
        <p className="text-xs text-gray-400">Supported: JPG, PNG (Max 10MB)</p>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded-lg border border-red-100">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
    </div>
  );
};