import React, { useState, useEffect } from 'react';
import { Layers, Key, Sparkles, Plus, Settings, CheckCircle2, Link, Unlock, Loader2, ArrowRight } from 'lucide-react';
import { SessionPanel } from './components/SessionPanel';
import { fetchSheetNameByGid } from './services/googleService';

export default function App() {
  const [hasApiKey, setHasApiKey] = useState(false);
  const [panels, setPanels] = useState<number[]>([1]);
  const [nextId, setNextId] = useState(2);
  
  // Google Settings State
  const [accessToken, setAccessToken] = useState<string>(() => {
      return localStorage.getItem('sticker_split_access_token') || "";
  });
  
  // Unified Sheet URL Input
  const [sheetUrl, setSheetUrl] = useState<string>(() => {
      return localStorage.getItem('sticker_split_sheet_url') || "";
  });

  // Derived Values
  const [spreadsheetId, setSpreadsheetId] = useState<string>(() => {
      return localStorage.getItem('sticker_split_sheet_id') || "";
  });
  const [sheetName, setSheetName] = useState<string>(() => {
      return localStorage.getItem('sticker_split_sheet_name') || "";
  });
  
  const [showSettings, setShowSettings] = useState(false);
  const [isResolvingSheet, setIsResolvingSheet] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Check for API key on mount
  useEffect(() => {
    const checkKey = async () => {
      if ((window as any).aistudio) {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      } else {
        setHasApiKey(true);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if ((window as any).aistudio) {
      await (window as any).aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const parseAndResolveSheetUrl = async (url: string) => {
    setResolveError(null);
    if (!url) return;
    if (!accessToken) {
        setResolveError("Please enter an Access Token first.");
        return;
    }

    // Regex to extract ID
    const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    // Regex to extract GID (supports ?gid=, #gid=, &gid=)
    const gidMatch = url.match(/[#&?]gid=([0-9]+)/);
    
    if (!idMatch) {
        setResolveError("Invalid Google Sheet URL. Could not find Spreadsheet ID.");
        return;
    }

    const extractedId = idMatch[1];
    const extractedGid = gidMatch ? gidMatch[1] : "0";

    setSpreadsheetId(extractedId);
    setIsResolvingSheet(true);

    try {
        const name = await fetchSheetNameByGid(accessToken, extractedId, extractedGid);
        setSheetName(name);
        setResolveError(null);
    } catch (e: any) {
        console.error(e);
        setResolveError("Could not verify access. Check Token or Sheet URL.");
        // We still set the ID even if fetch fails, user might correct token later
    } finally {
        setIsResolvingSheet(false);
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setSheetUrl(e.target.value);
  };
  
  const handleUrlBlur = () => {
      if (sheetUrl && accessToken && (!spreadsheetId || !sheetName)) {
          parseAndResolveSheetUrl(sheetUrl);
      }
  };

  const saveSettings = () => {
      localStorage.setItem('sticker_split_access_token', accessToken);
      localStorage.setItem('sticker_split_sheet_url', sheetUrl);
      localStorage.setItem('sticker_split_sheet_id', spreadsheetId);
      localStorage.setItem('sticker_split_sheet_name', sheetName);
      setShowSettings(false);
  };

  const handleSessionExpired = () => {
      setHasApiKey(false);
  };

  const addPanel = () => {
    setPanels(prev => [...prev, nextId]);
    setNextId(prev => prev + 1);
    setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  const removePanel = (idToRemove: number) => {
    setPanels(prev => prev.filter(id => id !== idToRemove));
  };

  if (!hasApiKey && (window as any).aistudio) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-gray-100">
          <div className="bg-indigo-100 p-4 rounded-full w-20 h-20 mx-auto flex items-center justify-center mb-6">
            <Key className="w-10 h-10 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">API Key Required</h1>
          <p className="text-gray-600 mb-8 leading-relaxed">
             To use the advanced <strong>Gemini 3 Pro</strong> image generation features, you need to select a billing-enabled Google Cloud API key.
          </p>
          <button 
            onClick={handleSelectKey}
            className="w-full py-3.5 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Sparkles className="w-5 h-5" />
            Select API Key to Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
              Han 30/1/2026
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
             {/* Google Settings */}
             <div className="flex items-center gap-2">
                 {accessToken && spreadsheetId && (
                     <div className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full border border-green-100">
                         <CheckCircle2 className="w-3 h-3" />
                         <span>Ready</span>
                     </div>
                 )}
                 <button 
                    onClick={() => setShowSettings(!showSettings)}
                    className={`p-2 rounded-full transition-colors ${(!accessToken || !spreadsheetId) ? 'bg-indigo-50 text-indigo-600 animate-pulse' : 'text-gray-400 hover:bg-gray-100'}`}
                    title="Configure Google Access"
                 >
                     <Settings className="w-4 h-4" />
                 </button>
             </div>

             {(window as any).aistudio && (
                <button 
                  onClick={handleSelectKey}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-full transition-colors"
                >
                  Change API Key
                </button>
             )}
          </div>
        </div>

        {/* Settings Dropdown */}
        {showSettings && (
            <div className="absolute top-16 right-4 z-50 w-[450px] bg-white rounded-xl shadow-xl border border-gray-100 p-5 animate-in slide-in-from-top-2">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                        <Unlock className="w-4 h-4" /> Google Access Configuration
                    </h3>
                    <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600">
                        <Settings className="w-4 h-4" />
                    </button>
                </div>
                <div className="space-y-4">
                    <div className="bg-amber-50 p-4 rounded-lg text-xs text-amber-900 leading-relaxed border border-amber-100">
                        <strong>Direct Access Mode:</strong> 
                        <br/>1. Paste your <strong>Access Token</strong>.
                        <br/>2. Paste your <strong>Google Sheet URL</strong>.
                        <br/><span className="opacity-80">The app will automatically find the correct Sheet Name.</span>
                    </div>
                    
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Access Token</label>
                        <input 
                            type="password" 
                            value={accessToken}
                            onChange={(e) => setAccessToken(e.target.value)}
                            placeholder="ya29.a0..."
                            className="w-full text-sm p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Google Sheet URL</label>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={sheetUrl}
                                onChange={handleUrlChange}
                                onBlur={handleUrlBlur}
                                placeholder="https://docs.google.com/spreadsheets/d/..."
                                className="w-full text-sm p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                            />
                            <button 
                                onClick={() => parseAndResolveSheetUrl(sheetUrl)}
                                className="p-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors"
                                title="Check URL"
                            >
                                {isResolvingSheet ? <Loader2 className="w-4 h-4 animate-spin"/> : <ArrowRight className="w-4 h-4"/>}
                            </button>
                        </div>
                        {resolveError ? (
                            <p className="text-[10px] text-red-500 mt-1.5 flex items-center gap-1">
                                <span className="w-1 h-1 bg-red-500 rounded-full"/> {resolveError}
                            </p>
                        ) : spreadsheetId && sheetName ? (
                            <div className="mt-2 p-2 bg-green-50 border border-green-100 rounded text-[10px] text-green-800 space-y-0.5">
                                <div className="flex gap-2">
                                    <span className="font-semibold text-green-900 w-16">ID:</span> 
                                    <span className="font-mono truncate">{spreadsheetId.substring(0, 15)}...</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="font-semibold text-green-900 w-16">Sheet:</span> 
                                    <span className="font-bold">{sheetName}</span>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <button 
                        onClick={saveSettings}
                        disabled={!spreadsheetId || !sheetName}
                        className={`w-full py-2.5 text-white text-sm font-medium rounded-lg transition-colors
                            ${(!spreadsheetId || !sheetName) 
                                ? 'bg-gray-300 cursor-not-allowed' 
                                : 'bg-indigo-600 hover:bg-indigo-700'}
                        `}
                    >
                        Save Configuration
                    </button>
                </div>
            </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {panels.map((id) => (
            <SessionPanel 
                key={id} 
                id={id} 
                onRemove={removePanel} 
                showRemove={panels.length > 1}
                onSessionExpired={handleSessionExpired}
                accessToken={accessToken}
                spreadsheetId={spreadsheetId}
                sheetName={sheetName}
                onOpenSettings={() => setShowSettings(true)}
            />
        ))}

        {/* Add Panel Button */}
        <div className="flex justify-center pt-4">
            <button 
                onClick={addPanel}
                className="group flex flex-col items-center gap-3 text-gray-400 hover:text-indigo-600 transition-colors"
            >
                <div className="w-12 h-12 rounded-full border-2 border-dashed border-current flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Plus className="w-6 h-6" />
                </div>
                <span className="text-sm font-medium">Add another workspace</span>
            </button>
        </div>
      </main>
    </div>
  );
}