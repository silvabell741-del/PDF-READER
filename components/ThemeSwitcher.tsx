import React, { useEffect, useState } from 'react';
import { Check, Palette } from 'lucide-react';

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

interface Props {
  className?: string;
  onThemeSelect?: () => void;
}

export const ThemeSwitcher: React.FC<Props> = ({ className = '', onThemeSelect }) => {
  const [currentTheme, setCurrentTheme] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('app-theme') || 'dragon-year';
    }
    return 'dragon-year';
  });

  const applyTheme = (themeId: string) => {
    const root = document.documentElement;
    themes.forEach(t => root.classList.remove(t.id));
    
    if (themeId !== 'midnight') {
      root.classList.add(themeId);
    }
    
    setCurrentTheme(themeId);
    localStorage.setItem('app-theme', themeId);
    
    if (onThemeSelect) onThemeSelect();
  };

  useEffect(() => {
    const root = document.documentElement;
    themes.forEach(t => root.classList.remove(t.id));
    if (currentTheme !== 'midnight') {
      root.classList.add(currentTheme);
    }
  }, []);

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {themes.map(t => (
        <button 
          key={t.id}
          onClick={() => applyTheme(t.id)}
          className={`
            text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors
            ${currentTheme === t.id 
              ? 'bg-brand/10 text-brand font-medium' 
              : 'text-text-sec hover:text-text hover:bg-white/5'}
          `}
        >
          <span>{t.name}</span>
          {currentTheme === t.id && <Check size={14} className="text-brand"/>}
        </button>
      ))}
    </div>
  );
};