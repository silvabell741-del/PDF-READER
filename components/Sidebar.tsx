import React, { useState } from 'react';
import { Home, FolderOpen, LogOut, User as UserIcon, X, Palette, ChevronDown, ChevronRight } from 'lucide-react';
import { User } from 'firebase/auth';
import { ThemeSwitcher } from './ThemeSwitcher';

interface SidebarProps {
  currentView: 'dashboard' | 'browser';
  onChangeView: (view: 'dashboard' | 'browser') => void;
  user: User | null;
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, user, onLogout, isOpen, onClose }) => {
  const [isThemesOpen, setIsThemesOpen] = useState(false);

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-72 bg-sidebar border-r border-border transition-transform duration-300 shadow-2xl md:shadow-none
        md:relative md:translate-x-0 md:w-64
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          
          {/* App Logo Area */}
          <div className="h-16 flex items-center justify-between px-6 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center shadow-lg shadow-brand/20 shrink-0">
                <FolderOpen className="text-bg font-bold" size={20} />
              </div>
              <span className="font-bold text-xl text-text tracking-tight sidebar-text">Annotator</span>
            </div>
            <button onClick={onClose} className="md:hidden p-1 text-text-sec hover:text-text">
              <X size={24} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-6 px-4 space-y-2 overflow-y-auto custom-scrollbar">
            <button
              onClick={() => { onChangeView('dashboard'); onClose(); }}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-200 group sidebar-text ${
                currentView === 'dashboard' 
                  ? 'bg-brand/10 text-brand font-medium' 
                  : 'text-text-sec hover:bg-white/5 hover:text-text'
              }`}
            >
              <Home size={22} className={currentView === 'dashboard' ? "fill-brand/20" : ""} />
              <span className="text-base">Início</span>
            </button>

            <button
              onClick={() => { onChangeView('browser'); onClose(); }}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-200 group sidebar-text ${
                currentView === 'browser' 
                  ? 'bg-brand/10 text-brand font-medium' 
                  : 'text-text-sec hover:bg-white/5 hover:text-text'
              }`}
            >
              <FolderOpen size={22} className={currentView === 'browser' ? "fill-brand/20" : ""} />
              <span className="text-base">Meus Arquivos</span>
            </button>

            {/* Theme Accordion */}
            <div className="pt-4 mt-4 border-t border-border">
              <button 
                onClick={() => setIsThemesOpen(!isThemesOpen)}
                className="w-full flex items-center justify-between px-4 py-3 text-text-sec hover:text-text rounded-2xl hover:bg-white/5 transition-colors sidebar-text"
              >
                <div className="flex items-center gap-4">
                  <Palette size={22} />
                  <span className="text-base">Temas</span>
                </div>
                {isThemesOpen ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
              </button>
              
              {isThemesOpen && (
                <div className="pl-12 pr-2 py-2 animate-in slide-in-from-top-2">
                   <ThemeSwitcher />
                </div>
              )}
            </div>
          </nav>

          {/* User Profile */}
          <div className="p-4 border-t border-border mt-auto">
            {user ? (
              <div className="flex flex-col gap-3 bg-surface/50 rounded-xl p-3">
                <div className="flex items-center gap-3 overflow-hidden">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="User" className="w-10 h-10 rounded-full border border-border" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center border border-border">
                      <UserIcon size={18} className="text-text-sec" />
                    </div>
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-text truncate sidebar-text">{user.displayName}</span>
                    <span className="text-xs text-text-sec truncate sidebar-text">{user.email}</span>
                  </div>
                </div>
                <button 
                  onClick={onLogout}
                  className="w-full flex items-center justify-center gap-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 text-sm py-2 rounded-lg transition-all sidebar-text"
                >
                  <LogOut size={16} />
                  <span>Sair</span>
                </button>
              </div>
            ) : (
              <div className="text-center text-xs text-text-sec p-2 sidebar-text">Modo Visitante</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};