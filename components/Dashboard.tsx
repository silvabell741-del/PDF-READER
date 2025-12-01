import React, { useEffect, useState } from 'react';
import { DriveFile } from '../types';
import { getRecentFiles } from '../services/storageService';
import { FileText, Clock, ArrowRight, Upload, Menu } from 'lucide-react';

interface DashboardProps {
  userName?: string | null;
  onOpenFile: (file: DriveFile) => void;
  onUploadLocal: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onChangeView: (view: 'browser') => void;
  onToggleMenu: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ userName, onOpenFile, onUploadLocal, onChangeView, onToggleMenu }) => {
  const [recents, setRecents] = useState<(DriveFile & { lastOpened: Date })[]>([]);
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    getRecentFiles().then(setRecents);
    
    const hr = new Date().getHours();
    if (hr < 12) setGreeting('Bom dia');
    else if (hr < 18) setGreeting('Boa tarde');
    else setGreeting('Boa noite');
  }, []);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-bg text-text p-4 md:p-10">
      
      {/* Mobile Menu Button */}
      <div className="md:hidden mb-4">
        <button onClick={onToggleMenu} className="custom-menu-btn p-2 -ml-2 text-text-sec hover:text-text rounded-full hover:bg-surface transition">
          <Menu size={24} />
        </button>
      </div>

      {/* Hero Header */}
      <header className="mb-8 md:mb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h1 className="text-3xl md:text-5xl font-normal text-text mb-2 tracking-tight">
          {greeting}, <br className="md:hidden" />
          <span className="text-brand font-medium">{userName?.split(' ')[0] || 'Visitante'}</span>
        </h1>
        <p className="text-base md:text-lg text-text-sec">Pronto para continuar de onde parou?</p>
      </header>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <button 
          onClick={() => onChangeView('browser')}
          className="p-5 md:p-6 rounded-3xl bg-surface hover:brightness-110 transition-all group text-left border border-border hover:border-brand/50 flex items-center md:block gap-4 md:gap-0"
        >
          <div className="w-12 h-12 rounded-full bg-brand/10 text-brand flex items-center justify-center md:mb-4 group-hover:scale-110 transition-transform shrink-0">
            <FileText size={24} />
          </div>
          <div>
             <h3 className="text-lg md:text-xl font-medium mb-0.5 text-text">Navegar no Drive</h3>
             <p className="text-xs md:text-sm text-text-sec">Acesse sua biblioteca de PDFs</p>
          </div>
        </button>

        <label className="p-5 md:p-6 rounded-3xl bg-surface hover:brightness-110 transition-all group text-left border border-border hover:border-brand/50 cursor-pointer flex items-center md:block gap-4 md:gap-0">
           <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center md:mb-4 group-hover:scale-110 transition-transform shrink-0">
            <Upload size={24} />
          </div>
          <div>
             <h3 className="text-lg md:text-xl font-medium mb-0.5 text-text">Arquivo Local</h3>
             <p className="text-xs md:text-sm text-text-sec">Abra um PDF do seu dispositivo</p>
          </div>
          <input 
              type="file" 
              accept="application/pdf" 
              className="hidden" 
              id="local-upload-dash"
              onChange={onUploadLocal}
            />
        </label>
      </div>

      {/* Recent Files Section */}
      <div className="mb-20 md:mb-8">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <h2 className="text-xl md:text-2xl font-normal text-text">Arquivos Recentes</h2>
          {recents.length > 0 && (
            <button onClick={() => onChangeView('browser')} className="text-sm text-brand hover:text-brand/80 flex items-center gap-1">
              Ver todos <ArrowRight size={14} />
            </button>
          )}
        </div>

        {recents.length === 0 ? (
          <div className="h-40 md:h-48 rounded-3xl border-2 border-dashed border-border flex flex-col items-center justify-center text-text-sec text-center p-4">
            <Clock size={32} className="mb-3 opacity-50" />
            <p className="text-sm md:text-base">Nenhum arquivo aberto recentemente</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
            {recents.map((file) => (
              <div 
                key={file.id}
                onClick={() => onOpenFile(file)}
                className="group relative bg-surface rounded-2xl p-3 md:p-4 hover:brightness-110 transition-all cursor-pointer border border-border hover:border-brand/50 flex md:block items-center gap-4 md:gap-0"
              >
                <div className="w-16 h-20 md:w-full md:aspect-[3/4] bg-bg rounded-lg md:rounded-xl md:mb-4 overflow-hidden relative shadow-inner shrink-0">
                  {file.thumbnailLink ? (
                    <img src={file.thumbnailLink} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-bg">
                      <FileText size={24} className="md:hidden text-text-sec" />
                      <FileText size={40} className="hidden md:block text-text-sec" />
                    </div>
                  )}
                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center hidden md:flex">
                    <span className="bg-white/10 backdrop-blur text-white px-4 py-2 rounded-full text-sm font-medium">Abrir</span>
                  </div>
                </div>
                
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-text truncate mb-1 text-sm md:text-base" title={file.name}>{file.name}</h3>
                  <div className="flex items-center text-xs text-text-sec gap-2">
                    <Clock size={12} />
                    <span>{new Date(file.lastOpened).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};