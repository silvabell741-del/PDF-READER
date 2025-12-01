import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Annotation } from '../types';
import { saveAnnotation, loadAnnotations } from '../services/storageService';
import { downloadDriveFile } from '../services/driveService';
import { ArrowLeft, Highlighter, Loader2, Settings, X, Type, List, MousePointer2, Trash2, MapPin } from 'lucide-react';

// Explicitly set worker to specific version to avoid mismatches
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.449/build/pdf.worker.min.mjs`;

interface Props {
  accessToken?: string | null;
  fileId: string;
  fileName: string;
  uid: string;
  onBack: () => void;
  fileBlob?: Blob;
}

interface SelectionState {
  page: number;
  x: number;
  y: number;
  text: string;
  rects: DOMRect[];
}

// --- Sub-Component: Individual Page Renderer ---
interface PdfPageProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  filterValues: string;
  annotations: Annotation[];
  activeTool: 'cursor' | 'text';
  onPageClick: (page: number, x: number, y: number) => void;
  onDeleteAnnotation: (id: string) => void;
}

const PdfPage: React.FC<PdfPageProps> = ({ 
  pdfDoc, 
  pageNumber, 
  scale, 
  filterValues, 
  annotations,
  activeTool,
  onPageClick,
  onDeleteAnnotation
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let active = true;

    const render = async () => {
      if (!canvasRef.current || !textLayerRef.current) return;
      
      try {
        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        
        // 1. Setup Canvas
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Only render if dimensions change or not rendered yet
        if (canvas.width !== viewport.width || !rendered) {
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          await page.render({ canvasContext: ctx, viewport }).promise;
          
          // 2. Setup Text Layer
          const textContent = await page.getTextContent();
          const textLayerDiv = textLayerRef.current;
          textLayerDiv.innerHTML = '';
          textLayerDiv.style.width = `${viewport.width}px`;
          textLayerDiv.style.height = `${viewport.height}px`;
          textLayerDiv.style.setProperty('--scale-factor', `${scale}`);

          const lib = pdfjsLib as any;
          const TextLayerClass = lib.TextLayer || lib.pdfjsLib?.TextLayer;
          
          if (TextLayerClass) {
             const textLayer = new TextLayerClass({
              textContentSource: textContent,
              container: textLayerDiv,
              viewport: viewport,
            });
            await textLayer.render();
          } else {
             await lib.renderTextLayer({
              textContentSource: textContent,
              container: textLayerDiv,
              viewport: viewport,
              textDivs: []
            }).promise;
          }

          if (active) setRendered(true);
        }
      } catch (err) {
        console.error(`Error rendering page ${pageNumber}`, err);
      }
    };

    render();
    return () => { active = false; };
  }, [pdfDoc, pageNumber, scale]);

  const handleContainerClick = (e: React.MouseEvent) => {
    if (activeTool !== 'text' || !pageContainerRef.current) return;
    
    // Prevent triggering if clicking on an existing annotation
    if ((e.target as HTMLElement).closest('.annotation-item')) return;

    const rect = pageContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    onPageClick(pageNumber, x, y);
  };

  return (
    <div 
      ref={pageContainerRef}
      className={`pdf-page relative shadow-lg bg-white mb-8 mx-auto transition-cursor ${activeTool === 'text' ? 'cursor-text' : ''}`}
      data-page-number={pageNumber}
      style={{ width: 'fit-content', height: 'fit-content' }}
      onClick={handleContainerClick}
    >
      {/* 1. PDF Canvas with Color Filter */}
      <canvas 
        ref={canvasRef}
        style={{ 
          filter: 'url(#pdf-recolor)',
          display: 'block' 
        }}
      />

      {/* 2. Annotations Layer */}
      <div className="absolute inset-0">
        {annotations.map((ann, i) => {
          const isHighlight = ann.type === 'highlight';
          
          if (isHighlight) {
            return (
              <div 
                key={ann.id || i}
                id={`ann-${ann.id}`}
                className="annotation-item absolute mix-blend-multiply group"
                style={{
                  left: ann.bbox[0],
                  top: ann.bbox[1],
                  width: ann.bbox[2],
                  height: ann.bbox[3],
                  backgroundColor: ann.color || '#facc15',
                  opacity: ann.opacity ?? 0.4,
                  pointerEvents: activeTool === 'cursor' ? 'none' : 'auto'
                }}
              />
            );
          } else {
            // Text Note
            return (
              <div
                key={ann.id || i}
                id={`ann-${ann.id}`}
                className="annotation-item absolute z-20 group"
                style={{
                  left: ann.bbox[0],
                  top: ann.bbox[1],
                  maxWidth: '200px'
                }}
              >
                <div 
                  className="bg-yellow-100 text-gray-900 text-sm p-2 rounded shadow-md border border-yellow-300 relative hover:scale-105 transition-transform"
                  style={{ backgroundColor: ann.color || '#fef9c3' }}
                >
                  <p className="whitespace-pre-wrap break-words font-medium leading-tight">{ann.text}</p>
                  
                  {/* Delete Button (Visible on Hover) */}
                  {ann.id && !ann.id.startsWith('temp') && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteAnnotation(ann.id!);
                      }}
                      className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              </div>
            );
          }
        })}
      </div>

      {/* 3. Text Selection Layer */}
      <div 
        ref={textLayerRef} 
        className={`textLayer ${activeTool === 'text' ? 'pointer-events-none' : ''}`}
        style={{ zIndex: 10 }}
      />
    </div>
  );
};

// --- Main Component ---

export const PdfViewer: React.FC<Props> = ({ accessToken, fileId, fileName, uid, onBack, fileBlob }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [scale, setScale] = useState(1.3);
  
  // Selection & Tools State
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [activeTool, setActiveTool] = useState<'cursor' | 'text'>('cursor');
  const [showSidebar, setShowSidebar] = useState(false);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [pageColor, setPageColor] = useState("#ffffff");
  const [textColor, setTextColor] = useState("#000000");
  const [highlightColor, setHighlightColor] = useState("#facc15"); 
  const [highlightOpacity, setHighlightOpacity] = useState(0.4);

  // Load PDF
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        setLoading(true);
        let blob: Blob;

        if (fileBlob) {
          blob = fileBlob;
        } else if (accessToken) {
          blob = await downloadDriveFile(accessToken, fileId);
        } else {
          throw new Error("No file source provided");
        }

        const arrayBuffer = await blob.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        if (mounted) {
          setPdfDoc(pdf);
          setNumPages(pdf.numPages);
          const existingAnns = await loadAnnotations(uid, fileId);
          setAnnotations(existingAnns);
        }
      } catch (err) {
        console.error("Error loading PDF:", err);
        alert("Falha ao carregar PDF. Verifique o console.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();
    return () => { mounted = false; };
  }, [accessToken, fileId, uid, fileBlob]);


  // Global Selection Handler (For Highlight)
  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      // If using text tool, ignore selection
      if (activeTool === 'text') return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelection(null);
        return;
      }

      let node = sel.anchorNode;
      if (node && node.nodeType === 3) node = node.parentNode; 
      
      const pageElement = (node as Element)?.closest('.pdf-page');
      if (!pageElement) {
        setSelection(null);
        return;
      }

      const pageNumAttr = pageElement.getAttribute('data-page-number');
      if (!pageNumAttr) return;
      const pageNum = parseInt(pageNumAttr);

      const range = sel.getRangeAt(0);
      const rects = Array.from(range.getClientRects());
      if (rects.length === 0) return;

      const containerRect = pageElement.getBoundingClientRect();
      const firstRect = rects[0];
      
      const tooltipX = firstRect.left - containerRect.left + (firstRect.width / 2);
      const tooltipY = firstRect.top - containerRect.top - 10;

      setSelection({
        page: pageNum,
        x: tooltipX,
        y: tooltipY,
        text: sel.toString(),
        rects: rects as DOMRect[]
      });
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [activeTool]);


  const createHighlight = async () => {
    if (!selection) return;

    const pageElement = document.querySelector(`.pdf-page[data-page-number="${selection.page}"]`);
    const canvas = pageElement?.querySelector('canvas');
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();
    
    const newAnns: Annotation[] = selection.rects.map(rect => {
      return {
        page: selection.page,
        bbox: [
          rect.left - canvasRect.left, 
          rect.top - canvasRect.top, 
          rect.width, 
          rect.height
        ],
        type: 'highlight',
        text: selection.text,
        color: highlightColor,
        opacity: highlightOpacity
      };
    });

    setAnnotations(prev => [...prev, ...newAnns]);
    setSelection(null);
    window.getSelection()?.removeAllRanges();

    saveAnnotationsList(newAnns);
  };

  const createTextNote = async (page: number, x: number, y: number) => {
    const text = window.prompt("Digite sua nota:");
    if (!text || !text.trim()) return;

    // Reset to cursor mode after adding text for better UX
    setActiveTool('cursor');

    const newAnn: Annotation = {
      page,
      bbox: [x, y, 0, 0], // Width/Height ignored for text type in this render model
      type: 'note',
      text: text,
      color: '#fef9c3', // Sticky note yellow
      opacity: 1
    };

    setAnnotations(prev => [...prev, newAnn]);
    saveAnnotationsList([newAnn]);
  };

  const saveAnnotationsList = async (anns: Annotation[]) => {
    setIsSaving(true);
    try {
      for (const ann of anns) {
         await saveAnnotation(uid, fileId, ann);
      }
    } catch (err) {
      console.error("Failed to save annotation", err);
    } finally {
      setIsSaving(false);
    }
  };

  const scrollToAnnotation = (ann: Annotation) => {
    const pageEl = document.querySelector(`.pdf-page[data-page-number="${ann.page}"]`);
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Flash effect logic could go here, but simple scroll is good for now
      // If it has an ID (loaded from DB), we can try to find the specific element
      if (ann.id) {
        setTimeout(() => {
          const el = document.getElementById(`ann-${ann.id}`);
          if (el) {
            el.style.outline = '2px solid red';
            setTimeout(() => el.style.outline = 'none', 1000);
          }
        }, 500);
      }
    }
  };

  // Color Filter Matrix
  const filterValues = useMemo(() => {
    const hexToRgb = (hex: string) => {
      const bigint = parseInt(hex.slice(1), 16);
      return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
    };

    const [tr, tg, tb] = hexToRgb(textColor);
    const [br, bg, bb] = hexToRgb(pageColor);

    const rScale = (br - tr) / 255;
    const gScale = (bg - tg) / 255;
    const bScale = (bb - tb) / 255;

    const rOffset = tr / 255;
    const gOffset = tg / 255;
    const bOffset = tb / 255;

    return `
      ${rScale} 0 0 0 ${rOffset}
      0 ${gScale} 0 0 ${gOffset}
      0 0 ${bScale} 0 ${bOffset}
      0 0 0 1 0
    `;
  }, [textColor, pageColor]);


  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-bg text-text">
        <Loader2 className="animate-spin h-10 w-10 text-brand mx-auto mb-4" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-bg text-text relative transition-colors duration-300">
      <svg className="hidden">
        <filter id="pdf-recolor">
          <feColorMatrix type="matrix" values={filterValues} />
        </filter>
      </svg>

      {/* Toolbar */}
      <div className="h-16 bg-surface border-b border-border flex items-center justify-between px-4 sticky top-0 z-30 shadow-lg">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition text-text">
            <ArrowLeft />
          </button>
          <div className="flex flex-col">
             <h1 className="text-text font-medium truncate max-w-[150px] md:max-w-xs text-sm md:text-base">{fileName}</h1>
             <span className="text-xs text-text-sec">{numPages} páginas</span>
          </div>
        </div>
        
        {/* Tools */}
        <div className="flex items-center bg-bg border border-border rounded-lg p-1 gap-1">
          <button 
            onClick={() => setActiveTool('cursor')}
            className={`p-2 rounded-md transition ${activeTool === 'cursor' ? 'bg-brand text-bg' : 'text-text-sec hover:text-text'}`}
            title="Modo Seleção"
          >
            <MousePointer2 size={18} />
          </button>
          <button 
            onClick={() => setActiveTool('text')}
            className={`p-2 rounded-md transition ${activeTool === 'text' ? 'bg-brand text-bg' : 'text-text-sec hover:text-text'}`}
            title="Adicionar Nota"
          >
            <Type size={18} />
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          {isSaving && <span className="hidden md:flex text-xs text-brand items-center gap-1"><Loader2 size={12} className="animate-spin"/> Salvando</span>}
          
          <button 
            onClick={() => setShowSidebar(!showSidebar)}
            className={`p-2 rounded-lg transition ${showSidebar ? 'bg-brand/10 text-brand' : 'text-text-sec hover:text-text hover:bg-white/5'}`}
            title="Lista de Anotações"
          >
            <List size={20} />
          </button>

          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-lg transition ${showSettings ? 'bg-brand/10 text-brand' : 'text-text-sec hover:text-text hover:bg-white/5'}`}
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Main Content Area: Sidebar + Viewer */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Sidebar */}
        <div className={`${showSidebar ? 'w-80 translate-x-0' : 'w-0 -translate-x-full opacity-0'} transition-all duration-300 bg-surface border-r border-border flex flex-col z-20 absolute md:relative h-full`}>
          <div className="p-4 border-b border-border bg-surface/95 backdrop-blur font-semibold text-text flex justify-between">
            <span>Anotações ({annotations.length})</span>
            <button onClick={() => setShowSidebar(false)} className="md:hidden text-text"><X size={16}/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {annotations.length === 0 && (
              <div className="text-center text-text-sec mt-10 text-sm p-4">
                Nenhuma anotação. <br/> Selecione texto para destacar ou use a ferramenta "Texto".
              </div>
            )}
            {annotations.map((ann, idx) => (
              <div 
                key={ann.id || idx}
                onClick={() => scrollToAnnotation(ann)}
                className="bg-bg p-3 rounded-lg border border-border hover:border-brand cursor-pointer group transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: ann.color || ann.type === 'highlight' ? highlightColor : '#fef9c3' }} />
                  <span className="text-xs text-text-sec uppercase font-bold tracking-wider">{ann.type === 'highlight' ? 'Destaque' : 'Nota'} &bull; Pág {ann.page}</span>
                </div>
                <p className="text-sm text-text line-clamp-3 leading-relaxed">
                  {ann.text || "Sem conteúdo"}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Settings Panel (Absolute Overlay) */}
        {showSettings && (
          <div className="absolute top-4 right-4 z-40 bg-surface border border-border p-4 rounded-xl shadow-2xl w-72 space-y-5 animate-in slide-in-from-top-2 max-h-[80vh] overflow-y-auto">
             <div className="flex justify-between items-center pb-2 border-b border-border">
              <h3 className="font-semibold text-text">Configurações</h3>
              <button onClick={() => setShowSettings(false)} className="text-text-sec hover:text-text"><X size={16}/></button>
            </div>
            {/* Reading Theme */}
            <div className="space-y-3">
              <h4 className="text-xs text-text-sec uppercase font-bold tracking-wider">Modo de Leitura (Cores do PDF)</h4>
              <div className="flex justify-between items-center">
                <label className="text-sm text-text">Fundo</label>
                <input type="color" value={pageColor} onChange={(e) => setPageColor(e.target.value)} className="h-6 w-8 rounded cursor-pointer bg-transparent border-none"/>
              </div>
              <div className="flex justify-between items-center">
                <label className="text-sm text-text">Texto</label>
                <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="h-6 w-8 rounded cursor-pointer bg-transparent border-none"/>
              </div>
              <button onClick={() => { setPageColor("#ffffff"); setTextColor("#000000"); }} className="w-full py-1.5 text-xs bg-bg hover:brightness-110 border border-border rounded text-text mt-2">Resetar Cores</button>
            </div>
            {/* Highlighter Style */}
            <div className="space-y-3 pt-2 border-t border-border">
              <h4 className="text-xs text-text-sec uppercase font-bold tracking-wider flex items-center gap-2"><Highlighter size={12} /> Estilo do Destaque</h4>
              <div className="flex justify-between items-center">
                <label className="text-sm text-text">Cor</label>
                <input type="color" value={highlightColor} onChange={(e) => setHighlightColor(e.target.value)} className="h-6 w-8 rounded cursor-pointer bg-transparent border-none"/>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-text-sec">
                  <span>Opacidade</span>
                  <span>{Math.round(highlightOpacity * 100)}%</span>
                </div>
                <input type="range" min="0.1" max="0.8" step="0.1" value={highlightOpacity} onChange={(e) => setHighlightOpacity(parseFloat(e.target.value))} className="w-full h-2 bg-bg rounded-lg appearance-none cursor-pointer accent-brand"/>
              </div>
            </div>
          </div>
        )}

        {/* Viewer Area */}
        <div 
          className="flex-1 overflow-y-auto bg-bg p-4 md:p-8 relative scroll-smooth" 
          ref={containerRef}
        >
          {pdfDoc && Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
            <div key={pageNum} className="relative group flex justify-center">
              <PdfPage 
                pdfDoc={pdfDoc}
                pageNumber={pageNum}
                scale={scale}
                filterValues={filterValues}
                annotations={annotations.filter(a => a.page === pageNum)}
                activeTool={activeTool}
                onPageClick={createTextNote}
                onDeleteAnnotation={(id) => {
                  setAnnotations(prev => prev.filter(a => a.id !== id));
                  // Note: Real deletion sync to DB would go here
                }}
              />
              
              {/* Highlight Popover */}
              {selection && selection.page === pageNum && (
                <div 
                  className="absolute z-50 transform -translate-x-1/2 -translate-y-full"
                  style={{ left: selection.x, top: selection.y }}
                >
                  <button
                    onClick={createHighlight}
                    className="flex items-center gap-2 bg-surface text-text px-3 py-2 rounded-lg shadow-xl hover:brightness-110 transition border border-brand animate-in zoom-in duration-200"
                  >
                    <div className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: highlightColor, opacity: highlightOpacity + 0.4 }} />
                    <span className="text-sm font-medium">Destacar</span>
                  </button>
                  <div className="w-3 h-3 bg-surface border-r border-b border-brand transform rotate-45 absolute left-1/2 -bottom-1.5 -translate-x-1/2"></div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};