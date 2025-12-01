import React, { useEffect, useState } from 'react';
import { listPdfFiles } from '../services/driveService';
import { DriveFile } from '../types';
import { FileText, Loader2, Search, LayoutGrid, List as ListIcon, AlertTriangle, RefreshCw, Menu } from 'lucide-react';

interface Props {
  accessToken: string;
  onSelectFile: (file: DriveFile) => void;
  onLogout: () => void;
  onAuthError: () => void; // Callback para quando o token expirar
  onToggleMenu: () => void;
}

export const DriveBrowser: React.FC<Props> = ({ accessToken, onSelectFile, onAuthError, onToggleMenu }) => {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    
    listPdfFiles(accessToken)
      .then(data => {
        if (mounted) {
          setFiles(data);
          setFilteredFiles(data);
        }
      })
      .catch(err => {
        if (mounted) {
          console.error(err);
          if (err.message === "Unauthorized" || err.message.includes("401")) {
            onAuthError(); // Avisa o App que o token expirou
          } else {
            setError(err.message);
          }
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [accessToken, onAuthError]);

  useEffect(() => {
    const results = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));
    setFilteredFiles(results);
  }, [search, files]);

  if (error) {
    return (
      <div className="flex flex-col h-full bg-bg text-text p-10 items-center justify-center text-center">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mb-4">
          <AlertTriangle size={32} />
        </div>
        <h3 className="text-xl font-semibold mb-2">Erro ao carregar arquivos</h3>
        <p className="text-text-sec mb-6 max-w-md">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-surface border border-border rounded-full hover:bg-white/5 transition"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-bg text-text p-4 md:p-10 overflow-hidden">
      
      {/* Header & Tools */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 md:mb-8 gap-4">
        <div className="flex items-center gap-3">
          <button onClick={onToggleMenu} className="md:hidden p-2 -ml-2 text-text-sec hover:text-text rounded-full hover:bg-surface transition">
            <Menu size={24} />
          </button>
          <h2 className="text-2xl md:text-3xl font-normal tracking-tight">Meus Arquivos</h2>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Search Bar */}
          <div className="relative flex-1 md:w-80 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-sec group-focus-within:text-brand transition-colors" size={20} />
            <input 
              type="text" 
              placeholder="Pesquisar no Drive..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-surface border border-border focus:border-brand rounded-full py-2.5 pl-10 pr-4 text-sm outline-none transition-all placeholder:text-text-sec text-text"
            />
          </div>

          {/* View Toggle */}
          <div className="bg-surface border border-border p-1 rounded-full flex shrink-0">
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-full transition-all ${viewMode === 'grid' ? 'bg-bg text-brand shadow-sm' : 'text-text-sec hover:text-text'}`}
            >
              <LayoutGrid size={18} />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-full transition-all ${viewMode === 'list' ? 'bg-bg text-brand shadow-sm' : 'text-text-sec hover:text-text'}`}
            >
              <ListIcon size={18} />
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex flex-1 items-center justify-center flex-col gap-3">
          <Loader2 className="animate-spin h-8 w-8 text-brand" />
          <span className="text-text-sec text-sm">Carregando do Google Drive...</span>
        </div>
      )}

      {!loading && !error && (
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4 pb-20 md:pb-10">
              {filteredFiles.map(file => (
                <button
                  key={file.id}
                  onClick={() => onSelectFile(file)}
                  className="group flex flex-col p-4 rounded-2xl bg-surface hover:brightness-110 transition-all border border-border hover:border-brand/30 text-left"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-full bg-brand/10 flex items-center justify-center text-brand shrink-0">
                      <FileText size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate text-text group-hover:text-brand transition-colors">{file.name}</p>
                      <p className="text-xs text-text-sec">Documento PDF</p>
                    </div>
                  </div>
                  {file.thumbnailLink && (
                    <div className="w-full aspect-video bg-black/20 rounded-lg overflow-hidden mt-auto">
                      <img src={file.thumbnailLink} alt="" className="w-full h-full object-cover opacity-60 group-hover:opacity-90 transition-opacity" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2 pb-20 md:pb-10">
              {filteredFiles.map(file => (
                <button
                  key={file.id}
                  onClick={() => onSelectFile(file)}
                  className="group flex items-center gap-4 p-3 rounded-xl bg-surface hover:brightness-110 transition-all text-left border border-border hover:border-brand/30"
                >
                  <div className="h-10 w-10 rounded-full bg-brand/10 flex items-center justify-center text-brand shrink-0">
                    <FileText size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-text">{file.name}</p>
                  </div>
                  <span className="text-sm text-text-sec hidden sm:block">PDF</span>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 bg-bg">
                    <LayoutGrid size={14} className="text-text-sec"/>
                  </div>
                </button>
              ))}
            </div>
          )}
          
          {filteredFiles.length === 0 && (
            <div className="text-center py-20 opacity-50 text-text-sec">
              <p>Nenhum arquivo encontrado na pesquisa.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};