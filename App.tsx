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
import { ShieldCheck, Upload, LogIn, RefreshCw, AlertCircle, XCircle, Copy, Menu } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  
  // Initialize access token from sessionStorage to persist across refreshes
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    return sessionStorage.getItem('drive_access_token');
  });
  
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState<{title: string, message: string, code?: string} | null>(null);
  
  // Navigation State
  const [currentView, setCurrentView] = useState<'dashboard' | 'browser' | 'viewer'>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // File State
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [localFile, setLocalFile] = useState<{blob: Blob, meta: DriveFile} | null>(null);

  // Monitor Firebase Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setAccessToken(null);
        sessionStorage.removeItem('drive_access_token');
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
    setAuthError(null);
    try {
      const result = await signInWithGoogleDrive();
      setAccessToken(result.accessToken);
      // Persist token
      sessionStorage.setItem('drive_access_token', result.accessToken);
    } catch (e: any) {
      console.error("Login error full:", e);
      
      let errorData = {
        title: "Falha no Login",
        message: "Ocorreu um erro inesperado. Tente novamente.",
        code: e.code
      };

      if (e.code === 'auth/unauthorized-domain') {
        errorData = {
          title: "Domínio Não Autorizado",
          message: `O domínio atual (${window.location.hostname}) não está autorizado no Firebase Console. Adicione-o em Authentication > Settings > Authorized Domains.`,
          code: e.code
        };
      } else if (e.code === 'auth/popup-closed-by-user') {
        return; // Ignore user closing popup
      } else if (e.message) {
         errorData.message = e.message;
      }

      setAuthError(errorData);
    }
  };

  const handleLogout = async () => {
    setAuthError(null);
    await logout();
    setAccessToken(null);
    sessionStorage.removeItem('drive_access_token');
    setLocalFile(null);
    setSelectedFile(null);
    setCurrentView('dashboard');
    setIsMobileMenuOpen(false);
  };

  // Called when Drive API returns 401 (Unauthorized)
  const handleAuthError = () => {
    setAccessToken(null);
    sessionStorage.removeItem('drive_access_token');
  };

  const handleOpenFile = (file: DriveFile) => {
    setSelectedFile(file);
    addRecentFile(file); // Track history
    setCurrentView('viewer');
    setIsMobileMenuOpen(false);
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
      setIsMobileMenuOpen(false);
    }
  };

  const handleChangeView = (view: 'dashboard' | 'browser') => {
    setCurrentView(view);
    setIsMobileMenuOpen(false);
  }

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
          fileParents={selectedFile.parents}
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
          onChangeView={handleChangeView}
          user={user}
          onLogout={handleLogout}
          isOpen={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
        />
        
        <main className="flex-1 relative overflow-hidden flex flex-col">
          {/* Mobile Header Placeholder for spacing if needed, though implemented inside components */}
          
          {/* Guest User trying to access Drive Browser */}
          {!user && currentView === 'browser' && (
            <div className="flex-1 flex flex-col p-6 text-text animate-in fade-in zoom-in duration-300">
               {/* Mobile Header for Guest Browser */}
               <div className="md:hidden mb-6">
                 <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 -ml-2 text-text-sec hover:text-text">
                   <Menu size={24} />
                 </button>
               </div>

               <div className="flex-1 flex flex-col items-center justify-center text-center">
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
            </div>
          )}

          {/* Logged in User but Token Expired/Missing for Drive Browser */}
          {user && currentView === 'browser' && !accessToken && (
             <div className="flex-1 flex flex-col p-6 text-text animate-in fade-in zoom-in duration-300">
                 {/* Mobile Header for Auth Error */}
                 <div className="md:hidden mb-6">
                   <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 -ml-2 text-text-sec hover:text-text">
                     <Menu size={24} />
                   </button>
                 </div>

                 <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex items-center justify-center mb-6 text-yellow-500">
                      <AlertCircle size={32} />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Sessão do Drive Expirou</h2>
                    <p className="text-text-sec mb-6 max-w-sm">Sua conexão de segurança com o Google Drive precisa ser renovada para listar os arquivos.</p>
                    <button 
                      onClick={handleLogin}
                      className="flex items-center gap-2 py-3 px-6 bg-brand text-bg rounded-full hover:brightness-110 transition-colors font-medium shadow-lg shadow-brand/20 btn-primary"
                    >
                      <RefreshCw size={18} />
                      Reconectar Drive
                    </button>
                 </div>
             </div>
          )}

          {/* Valid Views */}
          {currentView === 'dashboard' && (
            <Dashboard 
              userName={user?.displayName}
              onOpenFile={handleOpenFile}
              onUploadLocal={handleLocalUpload}
              onChangeView={(v) => handleChangeView(v)}
              onToggleMenu={() => setIsMobileMenuOpen(true)}
            />
          )}

          {currentView === 'browser' && user && accessToken && (
            <DriveBrowser 
              accessToken={accessToken}
              onSelectFile={handleOpenFile}
              onLogout={handleLogout}
              onAuthError={handleAuthError}
              onToggleMenu={() => setIsMobileMenuOpen(true)}
            />
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
      
      {/* Error Toast / Banner */}
      {authError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md p-4 animate-in slide-in-from-top-4">
          <div className="bg-surface border border-red-500/50 rounded-xl shadow-2xl p-4 flex gap-4 text-text relative">
            <div className="bg-red-500/10 p-2 rounded-full h-fit text-red-500">
              <AlertCircle size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-red-500 mb-1">{authError.title}</h3>
              <p className="text-sm text-text-sec mb-2 break-words">{authError.message}</p>
              
              {authError.code === 'auth/unauthorized-domain' && (
                <div className="bg-bg p-2 rounded border border-border flex items-center justify-between gap-2 mt-2">
                  <code className="text-xs text-brand truncate flex-1">{window.location.hostname}</code>
                  <button 
                    onClick={() => navigator.clipboard.writeText(window.location.hostname)}
                    className="p-1 hover:bg-white/10 rounded text-text-sec hover:text-text transition"
                    title="Copiar domínio"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              )}
            </div>
            <button 
              onClick={() => setAuthError(null)}
              className="absolute top-2 right-2 text-text-sec hover:text-text p-1"
            >
              <XCircle size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Persistent Components */}
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