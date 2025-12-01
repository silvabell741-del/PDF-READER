import React from 'react';
import { Home, FolderOpen, LogOut, User as UserIcon } from 'lucide-react';
import { User } from 'firebase/auth';

interface SidebarProps {
  currentView: 'dashboard' | 'browser';
  onChangeView: (view: 'dashboard' | 'browser') => void;
  user: User | null;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, user, onLogout }) => {
  return (
    <div className="w-20 md:w-64 flex flex-col h-full bg-sidebar border-r border-border transition-all duration-300">
      {/* App Logo Area */}
      <div className="h-16 flex items-center px-4 md:px-6 border-b border-border">
        <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center shadow-lg shadow-brand/20 shrink-0">
          <FolderOpen className="text-bg font-bold" size={20} />
        </div>
        <span className="ml-3 font-bold text-xl text-text hidden md:block tracking-tight sidebar-text">Annotator</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-6 px-2 md:px-4 space-y-2">
        <button
          onClick={() => onChangeView('dashboard')}
          className={`w-full flex items-center gap-4 px-3 py-3 rounded-full transition-all duration-200 group sidebar-text ${
            currentView === 'dashboard' 
              ? 'bg-brand/10 text-brand' 
              : 'text-text-sec hover:bg-white/5 hover:text-text'
          }`}
        >
          <Home size={24} className={currentView === 'dashboard' ? "fill-brand/20" : ""} />
          <span className="hidden md:block font-medium">Início</span>
        </button>

        <button
          onClick={() => onChangeView('browser')}
          className={`w-full flex items-center gap-4 px-3 py-3 rounded-full transition-all duration-200 group sidebar-text ${
            currentView === 'browser' 
              ? 'bg-brand/10 text-brand' 
              : 'text-text-sec hover:bg-white/5 hover:text-text'
          }`}
        >
          <FolderOpen size={24} className={currentView === 'browser' ? "fill-brand/20" : ""} />
          <span className="hidden md:block font-medium">Meus Arquivos</span>
        </button>
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-border">
        {user ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 overflow-hidden">
              {user.photoURL ? (
                <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full border border-border" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center border border-border">
                  <UserIcon size={16} className="text-text-sec" />
                </div>
              )}
              <div className="hidden md:flex flex-col min-w-0">
                <span className="text-sm font-medium text-text truncate sidebar-text">{user.displayName}</span>
                <span className="text-xs text-text-sec truncate sidebar-text">{user.email}</span>
              </div>
            </div>
            <button 
              onClick={onLogout}
              className="flex items-center gap-2 text-red-400 hover:text-red-300 text-sm mt-2 md:pl-1 transition-colors sidebar-text"
            >
              <LogOut size={16} />
              <span className="hidden md:inline">Sair</span>
            </button>
          </div>
        ) : (
          <div className="text-center text-xs text-text-sec hidden md:block sidebar-text">Modo Visitante</div>
        )}
      </div>
    </div>
  );
};