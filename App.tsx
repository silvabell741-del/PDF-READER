import React, { useState, useEffect } from 'react';
import { auth } from './firebase';
import { User, onAuthStateChanged } from 'firebase/auth';
import { signInWithGoogleDrive, logout } from './services/authService';
import { syncPendingAnnotations, addRecentFile } from './services/storageService';
import { DriveBrowser } from './components/DriveBrowser';
import { PdfViewer } from './components/PdfViewer';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { AppState, DriveFile } from './types';
import { ShieldCheck, Upload, LogIn } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  
  // Navigation State
  const [currentView, setCurrentView] = useState<'dashboard' | 'browser' | 'viewer'>('dashboard');
  
  // File State
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [localFile, setLocalFile] = useState<{blob: Blob, meta: DriveFile} | null>(null);

  // Monitor Firebase Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setAccessToken(null);
        setSelectedFile(null);
        setCurrentView('dashboard'); // Redirect to dashboard (which handles guest view)
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // Monitor Online Status for Sync
  useEffect(() => {
    const handleOnline = () => syncPendingAnnotations();
    window.addEventListener('online', handleOnline);
    if (navigator.onLine) syncPendingAnnotations();
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const handleLogin = async () => {
    try {
      const result = await signInWithGoogleDrive();
      setAccessToken(result.accessToken);
    } catch (e) {
      alert("Falha no login. Veja o console.");
    }
  };

  const handleLogout = async () => {
    await logout();
    setLocalFile(null);
    setSelectedFile(null);
    setCurrentView('dashboard');
  };

  const handleOpenFile = (file: DriveFile) => {
    setSelectedFile(file);
    addRecentFile(file); // Track history
    setCurrentView('viewer');
  };

  const handleLocalUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const meta = {
        id: `local-${Date.now()}`,
        name: file.name,
        mimeType: file.type
      };
      
      setLocalFile({ blob: file, meta });
      addRecentFile(meta);
      setCurrentView('viewer');
    }
  };

  if (loadingAuth) {
    return <div className="h-screen w-full flex items-center justify-center bg-bg text-text">Carregando...</div>;
  }

  // Determine main content based on view
  let mainContent;

  if (currentView === 'viewer') {
    if (localFile) {
      mainContent = (
        <PdfViewer 
          accessToken={null}
          fileId={localFile.meta.id}
          fileName={localFile.meta.name}
          uid="guest"
          onBack={() => {
            setLocalFile(null);
            setCurrentView('dashboard');
          }}
          fileBlob={localFile.blob}
        />
      );
    } else if (selectedFile && accessToken && user) {
      mainContent = (
        <PdfViewer 
          accessToken={accessToken}
          fileId={selectedFile.id}
          fileName={selectedFile.name}
          uid={user.uid}
          onBack={() => {
            setSelectedFile(null);
            setCurrentView('dashboard');
          }}
        />
      );
    }
  } else {
    // Shell Layout (Sidebar + Main Content)
    mainContent = (
      <div className="flex h-screen w-full bg-bg overflow-hidden transition-colors duration-300">
        <Sidebar 
          currentView={currentView as 'dashboard'|'browser'} 
          onChangeView={(view) => setCurrentView(view)}
          user={user}
          onLogout={handleLogout}
        />
        
        <main className="flex-1 relative overflow-hidden flex flex-col">
          {!user && currentView === 'browser' ? (
            // Guest User trying to access Drive Browser
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-text">
               <div className="w-16 h-16 bg-surface border border-border rounded-2xl flex items-center justify-center mb-6">
                  <ShieldCheck size={32} className="text-text-sec" />
               </div>
               <h2 className="text-2xl font-bold mb-2">Login Necessário</h2>
               <p className="text-text-sec mb-6 max-w-sm">Para acessar seus arquivos do Google Drive, você precisa fazer login com segurança.</p>
               <button 
                  onClick={handleLogin}
                  className="flex items-center gap-2 py-3 px-6 bg-brand text-bg rounded-full hover:brightness-110 transition-colors font-medium shadow-lg shadow-brand/20 btn-primary"
                >
                  <LogIn size={18} />
                  Entrar com Google
                </button>
            </div>
          ) : (
            // Authenticated Views (Dashboard or Browser)
            <>
              {currentView === 'dashboard' && (
                <Dashboard 
                  userName={user?.displayName}
                  onOpenFile={handleOpenFile}
                  onUploadLocal={handleLocalUpload}
                  onChangeView={(v) => setCurrentView(v)}
                />
              )}

              {currentView === 'browser' && accessToken && (
                <DriveBrowser 
                  accessToken={accessToken}
                  onSelectFile={handleOpenFile}
                  onLogout={handleLogout}
                />
              )}
            </>
          )}
        </main>
      </div>
    );
  }

  return (
    <>
      {/* Wrapper to ensure content swaps don't affect siblings */}
      <div className="contents">
        {mainContent}
      </div>
      
      {/* Persistent Components: These stay mounted regardless of mainContent changes */}
      {/* Hidden input for global upload access */}
      <input 
        type="file" 
        id="local-upload-hidden"
        accept="application/pdf" 
        onChange={handleLocalUpload} 
        className="hidden" 
      />
      
      <ThemeSwitcher />
    </>
  );
}