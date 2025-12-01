import React, { useEffect, useRef, useState, useMemo } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import { PDFDocument, rgb } from 'pdf-lib';
import { Annotation, DriveFile } from '../types';
import { saveAnnotation, loadAnnotations } from '../services/storageService';
import { downloadDriveFile, uploadFileToDrive, deleteDriveFile } from '../services/driveService';
import { ArrowLeft, Highlighter, Loader2, X, Type, List, MousePointer2, Save, ScanLine, ZoomIn, ZoomOut, Menu, PaintBucket, Sliders } from 'lucide-react';

// Explicitly set worker to specific version to match package.json (5.4.449)
GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.449/build/pdf.worker.min.mjs`;

interface Props {
  accessToken?: string | null;
  fileId: string;
  fileName: string;
  fileParents?: string[];
  uid: string;
  onBack: () => void;
  fileBlob?: Blob;
}

interface SelectionState {
  page: number;
  text: string;
  // Position relative to the scrolling container
  popupX: number;
  popupY: number;
  // Rects relative to the page element (for saving)
  relativeRects: { x: number; y: number; width: number; height: number }[];
}

// --- Custom Text Renderer ---
const renderCustomTextLayer = (textContent: any, container: HTMLElement, viewport: any) => {
  container.innerHTML = '';
  
  textContent.items.forEach((item: any) => {
    if (!item.str || item.str.trim().length === 0) return;

    const tx = item.transform;
    const fontHeight = Math.sqrt(tx[3] * tx[3] + tx[2] * tx[2]);
    const fontSize = fontHeight * viewport.scale;

    const [x, y] = viewport.convertToViewportPoint(tx[4], tx[5]);

    const span = document.createElement('span');
    span.textContent = item.str;
    span.style.left = `${x}px`;
    span.style.top = `${y - fontSize}px`; 
    span.style.fontSize = `${fontSize}px`;
    span.style.fontFamily = 'sans-serif';
    span.style.position = 'absolute';
    span.style.color = 'transparent';
    span.style.whiteSpace = 'pre';
    span.style.cursor = 'text';
    span.style.transformOrigin = '0% 0%';
    span.style.lineHeight = '1';
    span.style.pointerEvents = 'all';

    const angle = Math.atan2(tx[1], tx[0]);
    if (angle !== 0) {
      span.style.transform = `rotate(${angle}rad)`;
    }

    container.appendChild(span);
  });
};

// --- Sub-Component: Individual Page Renderer ---
interface PdfPageProps {
  pdfDoc: PDFDocumentProxy;
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
  const [hasText, setHasText] = useState(true);

  useEffect(() => {
    let active = true;

    const render = async () => {
      if (!canvasRef.current || !textLayerRef.current) return;
      
      try {
        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (canvas.width !== viewport.width || !rendered) {
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          const renderContext = {
            canvasContext: ctx,
            viewport: viewport,
          };

          await page.render(renderContext as any).promise;
          
          const textContent = await page.getTextContent();
          
          if (active) {
             setHasText(textContent.items.length > 0);
          }

          const textLayerDiv = textLayerRef.current;
          textLayerDiv.style.width = `${viewport.width}px`;
          textLayerDiv.style.height = `${viewport.height}px`;

          if (active) {
            renderCustomTextLayer(textContent, textLayerDiv, viewport);
            setRendered(true);
          }
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
      {!hasText && rendered && (
         <div className="absolute -top-6 left-0 flex items-center gap-1 text-xs text-text-sec opacity-70">
            <ScanLine size={12} />
            <span>Imagem (sem texto selecionável)</span>
         </div>
      )}

      <canvas 
        ref={canvasRef}
        style={{ 
          filter: 'url(#pdf-recolor)',
          display: 'block' 
        }}
      />

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

      <div 
        ref={textLayerRef} 
        className={`textLayer ${activeTool === 'text' ? 'pointer-events-none' : ''}`}
        style={{ zIndex: 10 }}
      />
    </div>
  );
};

// --- Main Component ---

export const PdfViewer: React.FC<Props> = ({ accessToken, fileId, fileName, fileParents, uid, onBack, fileBlob }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [scale, setScale] = useState(1.3);
  
  // Selection & Tools State
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [activeTool, setActiveTool] = useState<'cursor' | 'text'>('cursor');
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'annotations' | 'settings'>('annotations');

  // Settings State
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

        if (mounted) setOriginalBlob(blob);

        const arrayBuffer = await blob.arrayBuffer();
        const pdf = await getDocument({ data: arrayBuffer }).promise;
        
        if (mounted) {
          setPdfDoc(pdf);
          setNumPages(pdf.numPages);
          const existingAnns = await loadAnnotations(uid, fileId);
          setAnnotations(existingAnns);
        }
      } catch (err) {
        console.error("Error loading PDF:", err);
        alert(`Falha ao carregar PDF. Verifique se o arquivo é válido. (Erro: ${err instanceof Error ? err.message : String(err)})`);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();
    return () => { mounted = false; };
  }, [accessToken, fileId, uid, fileBlob]);


  // Global Selection Handler (For Highlight)
  useEffect(() => {
    const handleSelectionEnd = (e: Event) => {
      if (activeTool === 'text') return;
      if (e.target instanceof Element && e.target.closest('button, input, select, .ui-panel')) return;

      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
          setSelection(null);
          return;
        }

        const text = sel.toString().trim();
        if (text.length === 0) {
          setSelection(null);
          return;
        }

        let node = sel.anchorNode;
        if (node && node.nodeType === 3) node = node.parentNode; 
        
        const pageElement = (node as Element)?.closest('.pdf-page');
        if (!pageElement || !containerRef.current) {
          setSelection(null);
          return;
        }

        const pageNumAttr = pageElement.getAttribute('data-page-number');
        if (!pageNumAttr) return;
        const pageNum = parseInt(pageNumAttr);

        const range = sel.getRangeAt(0);
        const rects = Array.from(range.getClientRects());
        if (rects.length === 0) return;

        const boundingRect = range.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        
        const popupX = boundingRect.left - containerRect.left + (boundingRect.width / 2) + containerRef.current.scrollLeft;
        const popupY = boundingRect.bottom - containerRect.top + containerRef.current.scrollTop + 10;

        const pageRect = pageElement.getBoundingClientRect();
        const relativeRects = rects.map(r => ({
          x: r.left - pageRect.left,
          y: r.top - pageRect.top,
          width: r.width,
          height: r.height
        }));

        setSelection({
          page: pageNum,
          text: text,
          popupX,
          popupY,
          relativeRects
        });
      }, 50);
    };

    document.addEventListener('mouseup', handleSelectionEnd);
    document.addEventListener('touchend', handleSelectionEnd);
    document.addEventListener('keyup', handleSelectionEnd);
    
    return () => {
      document.removeEventListener('mouseup', handleSelectionEnd);
      document.removeEventListener('touchend', handleSelectionEnd);
      document.removeEventListener('keyup', handleSelectionEnd);
    };
  }, [activeTool]);


  const createHighlight = async () => {
    if (!selection) return;

    const newAnns: Annotation[] = selection.relativeRects.map(rect => {
      return {
        page: selection.page,
        bbox: [
          rect.x, 
          rect.y, 
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

    setActiveTool('cursor');

    const newAnn: Annotation = {
      page,
      bbox: [x, y, 0, 0],
      type: 'note',
      text: text,
      color: '#fef9c3',
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

  const handleSaveToDrive = async () => {
    if (!accessToken || !originalBlob) {
      alert("Erro: Arquivo ou sessão inválida.");
      return;
    }

    const confirmSave = window.confirm(
      "Isso criará uma versão anotada e SUBSTITUIRÁ o arquivo original. As anotações ficarão permanentes no PDF. Deseja continuar?"
    );

    if (!confirmSave) return;

    setIsExporting(true);

    try {
      const existingPdfBytes = await originalBlob.arrayBuffer();
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const pages = pdfDoc.getPages();

      const hexToRgb = (hex: string) => {
        const bigint = parseInt(hex.replace('#', ''), 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return rgb(r / 255, g / 255, b / 255);
      };

      for (const ann of annotations) {
        if (ann.page > pages.length) continue;
        const page = pages[ann.page - 1]; 
        const { height } = page.getSize();
        
        const rectX = ann.bbox[0] / scale;
        const rectY = ann.bbox[1] / scale;
        const rectW = ann.bbox[2] / scale;
        const rectH = ann.bbox[3] / scale;

        const pdfY = height - rectY - rectH;

        if (ann.type === 'highlight') {
          page.drawRectangle({
            x: rectX,
            y: pdfY,
            width: rectW,
            height: rectH,
            color: hexToRgb(ann.color || '#facc15'),
            opacity: ann.opacity ?? 0.4,
          });
        } else if (ann.type === 'note' && ann.text) {
          const noteColor = hexToRgb(ann.color || '#fef9c3');
          page.drawRectangle({
            x: rectX,
            y: height - rectY - 20,
            width: 150,
            height: 50,
            color: noteColor,
          });
        }
      }

      const pdfBytes = await pdfDoc.save();
      const newPdfBlob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const newFileName = fileName; 
      await uploadFileToDrive(accessToken, newPdfBlob, newFileName, fileParents);
      await deleteDriveFile(accessToken, fileId);

      alert(`Sucesso! O arquivo original foi substituído pela versão anotada.`);
      onBack();

    } catch (err: any) {
      console.error("Export error:", err);
      alert("Falha ao salvar no Drive: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };


  const scrollToAnnotation = (ann: Annotation) => {
    const pageEl = document.querySelector(`.pdf-page[data-page-number="${ann.page}"]`);
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    // Close sidebar on mobile after clicking
    if (window.innerWidth < 768) setShowSidebar(false);
  };

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

      {/* Minimal Header */}
      <div className="h-14 bg-surface/80 backdrop-blur border-b border-border flex items-center justify-between px-4 sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack} className="p-2 -ml-2 hover:bg-white/10 rounded-full transition text-text">
            <ArrowLeft size={20} />
          </button>
          <div className="flex flex-col min-w-0">
             <h1 className="text-text font-medium truncate text-sm md:text-base">{fileName}</h1>
             <span className="text-xs text-text-sec">{numPages} páginas</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
            {isSaving && <Loader2 size={16} className="animate-spin text-brand" />}
            
            <button 
                onClick={() => setShowSidebar(true)} 
                className="p-2 hover:bg-white/10 rounded-full transition text-text"
            >
                <Menu size={20} />
            </button>
        </div>
      </div>

      {/* Main Content Area: Viewer + Sidebar */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Sidebar Overlay (Mobile & Desktop) */}
        {showSidebar && (
            <div className="absolute inset-0 z-40 flex justify-end">
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowSidebar(false)} />
                <div className="relative w-80 bg-surface h-full shadow-2xl flex flex-col animate-in slide-in-from-right-10 duration-200">
                    
                    {/* Sidebar Header */}
                    <div className="flex items-center justify-between p-4 border-b border-border">
                        <span className="font-semibold text-text">Menu</span>
                        <button onClick={() => setShowSidebar(false)} className="text-text-sec hover:text-text">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Sidebar Tabs */}
                    <div className="flex border-b border-border">
                        <button 
                            onClick={() => setSidebarTab('annotations')}
                            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${sidebarTab === 'annotations' ? 'border-brand text-brand' : 'border-transparent text-text-sec hover:text-text'}`}
                        >
                            Anotações
                        </button>
                        <button 
                            onClick={() => setSidebarTab('settings')}
                            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${sidebarTab === 'settings' ? 'border-brand text-brand' : 'border-transparent text-text-sec hover:text-text'}`}
                        >
                            Ajustes
                        </button>
                    </div>

                    {/* Sidebar Content */}
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        {sidebarTab === 'annotations' ? (
                            <div className="space-y-3">
                                {annotations.length === 0 && (
                                    <div className="text-center text-text-sec py-10 text-sm">
                                        Nenhuma anotação. <br/> Selecione texto para começar.
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
                                            <span className="text-xs text-text-sec uppercase font-bold tracking-wider">Pág {ann.page}</span>
                                        </div>
                                        <p className="text-sm text-text line-clamp-2 leading-relaxed">
                                            {ann.text || "Sem conteúdo"}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-6 animate-in fade-in">
                                {/* Color Settings */}
                                <div className="space-y-3">
                                    <h4 className="text-xs text-text-sec uppercase font-bold tracking-wider flex items-center gap-2">
                                        <PaintBucket size={14} /> Leitura
                                    </h4>
                                    <div className="flex justify-between items-center bg-bg p-2 rounded-lg border border-border">
                                        <label className="text-sm text-text">Fundo</label>
                                        <input type="color" value={pageColor} onChange={(e) => setPageColor(e.target.value)} className="h-6 w-8 rounded cursor-pointer bg-transparent border-none"/>
                                    </div>
                                    <div className="flex justify-between items-center bg-bg p-2 rounded-lg border border-border">
                                        <label className="text-sm text-text">Texto</label>
                                        <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="h-6 w-8 rounded cursor-pointer bg-transparent border-none"/>
                                    </div>
                                    <button onClick={() => { setPageColor("#ffffff"); setTextColor("#000000"); }} className="text-xs text-brand hover:underline w-full text-right">Resetar Cores</button>
                                </div>

                                <div className="space-y-3">
                                    <h4 className="text-xs text-text-sec uppercase font-bold tracking-wider flex items-center gap-2">
                                        <Highlighter size={14} /> Destaque
                                    </h4>
                                    <div className="flex justify-between items-center bg-bg p-2 rounded-lg border border-border">
                                        <label className="text-sm text-text">Cor</label>
                                        <input type="color" value={highlightColor} onChange={(e) => setHighlightColor(e.target.value)} className="h-6 w-8 rounded cursor-pointer bg-transparent border-none"/>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs text-text-sec">
                                            <span>Opacidade</span>
                                            <span>{Math.round(highlightOpacity * 100)}%</span>
                                        </div>
                                        <input type="range" min="0.1" max="0.8" step="0.1" value={highlightOpacity} onChange={(e) => setHighlightOpacity(parseFloat(e.target.value))} className="w-full h-2 bg-bg rounded-lg appearance-none cursor-pointer accent-brand"/>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-border">
                                     {accessToken ? (
                                        <button
                                            onClick={handleSaveToDrive}
                                            disabled={isExporting}
                                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand text-bg rounded-xl font-bold shadow-lg hover:brightness-110 disabled:opacity-50 transition-all"
                                        >
                                            {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                            Salvar e Substituir
                                        </button>
                                     ) : (
                                         <p className="text-xs text-text-sec text-center">Modo offline/local. Exportação desativada.</p>
                                     )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* Viewer Area */}
        <div 
          className="flex-1 overflow-y-auto bg-bg p-4 md:p-8 relative scroll-smooth pb-32" 
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
                }}
              />
            </div>
          ))}

          {/* Highlight Popover (Global for Viewer) */}
          {selection && (
            <div 
              className="absolute z-50 transform -translate-x-1/2 mt-2 animate-in fade-in zoom-in duration-150 origin-top"
              style={{ left: selection.popupX, top: selection.popupY }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-zinc-900 absolute left-1/2 -translate-x-1/2 -top-[6px]"></div>
              
              <button
                onClick={createHighlight}
                className="bg-zinc-900 text-white px-4 py-2 rounded-full shadow-xl flex items-center gap-2 hover:scale-105 transition-transform ring-1 ring-white/20"
              >
                <Highlighter size={16} className="text-yellow-400" />
                <span className="text-sm font-medium">Destacar</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Floating Toolbar "Island" */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-surface/90 backdrop-blur border border-border p-2 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-6 duration-300">
         
         {/* Zoom Controls */}
         <div className="flex items-center bg-bg/50 rounded-xl p-1">
             <button 
                onClick={() => setScale(s => Math.max(0.5, s - 0.1))} 
                className="p-2 hover:bg-white/10 rounded-lg text-text-sec hover:text-text transition"
             >
                <ZoomOut size={20} />
             </button>
             <span className="w-12 text-center text-xs font-mono text-text">{Math.round(scale * 100)}%</span>
             <button 
                onClick={() => setScale(s => Math.min(3.0, s + 0.1))} 
                className="p-2 hover:bg-white/10 rounded-lg text-text-sec hover:text-text transition"
             >
                <ZoomIn size={20} />
             </button>
         </div>

         <div className="w-px h-6 bg-border mx-1"></div>

         {/* Tool Toggle */}
         <div className="flex bg-bg/50 rounded-xl p-1">
             <button 
                 onClick={() => setActiveTool('cursor')}
                 className={`p-2 rounded-lg transition-all ${activeTool === 'cursor' ? 'bg-brand text-bg shadow-sm' : 'text-text-sec hover:text-text'}`}
                 title="Modo Seleção"
             >
                 <MousePointer2 size={20} />
             </button>
             <button 
                 onClick={() => setActiveTool('text')}
                 className={`p-2 rounded-lg transition-all ${activeTool === 'text' ? 'bg-brand text-bg shadow-sm' : 'text-text-sec hover:text-text'}`}
                 title="Adicionar Nota"
             >
                 <Type size={20} />
             </button>
         </div>
      </div>

    </div>
  );
};