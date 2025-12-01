import React, { useEffect, useState } from 'react';
import { Palette, Check } from 'lucide-react';

const themes = [
  { id: 'midnight', name: 'Meia-noite' },
  { id: 'slate', name: 'Slate (Clássico)' },
  { id: 'high-contrast', name: 'Alto Contraste' },
  { id: 'mn', name: 'MN (Dark Moderno)' },
  { id: 'emerald-sovereignty', name: 'Soberania Esmeralda' },
  { id: 'galactic-aurora', name: 'Aurora Galática' },
  { id: 'dragon-year', name: 'Ano do Dragão (Padrão)' },
  { id: 'morning-tide', name: 'Maré do Amanhecer' },
  { id: 'akebono-dawn', name: 'Akebono (Amanhecer)' },
  { id: 'itoshi-sae', name: 'Itoshi Sae (Void)' },
  { id: 'sorcerer-supreme', name: 'Feiticeiro Supremo' },
];

export const ThemeSwitcher: React.FC = () => {
  // Initialize state from localStorage directly to avoid flicker/reset on mount
  const [currentTheme, setCurrentTheme] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('app-theme') || 'dragon-year';
    }
    return 'dragon-year';
  });

  const applyTheme = (themeId: string) => {
    const root = document.documentElement;
    // Remove all theme classes
    themes.forEach(t => root.classList.remove(t.id));
    
    // Add selected theme class
    if (themeId !== 'midnight') {
      root.classList.add(themeId);
    }
    
    setCurrentTheme(themeId);
    localStorage.setItem('app-theme', themeId);
  };

  useEffect(() => {
    // Sync DOM on mount without triggering state update
    const root = document.documentElement;
    themes.forEach(t => root.classList.remove(t.id));
    
    if (currentTheme !== 'midnight') {
      root.classList.add(currentTheme);
    }
  }, []); // Run once on mount

  return (
    <div className="fixed bottom-4 right-4 z-50 group">
      <button className="bg-surface text-brand p-3 rounded-full shadow-lg border border-border hover:scale-110 transition hover:shadow-brand/20">
        <Palette />
      </button>
      <div className="absolute bottom-full right-0 mb-2 bg-surface border border-border rounded-lg p-2 hidden group-hover:flex flex-col gap-1 min-w-[180px] shadow-2xl max-h-[60vh] overflow-y-auto">
        <div className="px-3 py-2 text-xs font-bold text-text-sec uppercase tracking-wider border-b border-border mb-1">
          Selecionar Tema
        </div>
        {themes.map(t => (
          <button 
            key={t.id}
            onClick={() => applyTheme(t.id)}
            className={`text-left px-3 py-2 hover:bg-white/5 rounded text-sm text-text flex items-center justify-between group/item ${currentTheme === t.id ? 'bg-brand/10 text-brand' : ''}`}
          >
            <span>{t.name}</span>
            {currentTheme === t.id && <Check size={14} className="text-brand"/>}
          </button>
        ))}
      </div>
    </div>
  );
};