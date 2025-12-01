import React, { useEffect, useRef, useState, useMemo } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import { PDFDocument, rgb } from 'pdf-lib';
import { Annotation, DriveFile } from '../types';
import { saveAnnotation, loadAnnotations } from '../services/storageService';
import { downloadDriveFile, uploadFileToDrive } from '../services/driveService';
import { ArrowLeft, Highlighter, Loader2, Settings, X, Type, List, MousePointer2, Save, ScanLine, AlertCircle } from 'lucide-react';

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
  x: number;
  y: number;
  text: string;
  rects: DOMRect[];
}

// --- Custom Text Renderer ---
// Renders invisible text over the canvas to enable native browser selection
const renderCustomTextLayer = (textContent: any, container: HTMLElement, viewport: any) => {
  container.innerHTML = '';
  
  textContent.items.forEach((item: any) => {
    // Skip empty or purely whitespace items
    if (!item.str || item.str.trim().length === 0) return;

    // item.transform is [scaleX, skewX, skewY, scaleY, x, y]
    const tx = item.transform;
    
    // Calculate font size based on the scaling factor (hypotenuse of scaleX/skewX)
    const fontHeight = Math.sqrt(tx[3] * tx[3] + tx[2] * tx[2]);
    const fontSize = fontHeight * viewport.scale;

    // Convert PDF point (bottom-left origin) to Viewport point (top-left origin)
    // transform[4] is X, transform[5] is Y in PDF space
    const [x, y] = viewport.convertToViewportPoint(tx[4], tx[5]);

    const span = document.createElement('span');
    span.textContent = item.str;
    
    // Styles to position text correctly over the image
    span.style.left = `${x}px`;
    // Adjust Y: PDF coords are baseline, DOM coords are top-left. 
    // Subtracting fontSize aligns the top roughly with the text.
    span.style.top = `${y - fontSize}px`; 
    span.style.fontSize = `${fontSize}px`;
    span.style.fontFamily = 'sans-serif'; // Generic font is usually sufficient for selection
    span.style.position = 'absolute';
    span.style.color = 'transparent'; // Invisible text
    span.style.whiteSpace = 'pre';
    span.style.cursor = 'text';
    span.style.transformOrigin = '0% 0%';
    span.style.lineHeight = '1';
    span.style.pointerEvents = 'all';

    // Handle Rotation (if needed)
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
  // New props for selection highlight
  selection?: SelectionState | null;
  onHighlight?: () => void;
  highlightColor?: string;
  highlightOpacity?: number;
}

const PdfPage: React.FC<PdfPageProps> = ({ 
  pdfDoc, 
  pageNumber, 
  scale, 
  filterValues, 
  annotations,
  activeTool,
  onPageClick,
  onDeleteAnnotation,
  selection,
  onHighlight,
  highlightColor,
  highlightOpacity
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
        
        // 1. Setup Canvas
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Only render if dimensions change or not rendered yet
        if (canvas.width !== viewport.width || !rendered) {
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          const renderContext = {
            canvasContext: ctx,
            viewport: viewport,
          };

          await page.render(renderContext).promise;
          
          // 2. Setup Text Layer (Custom Implementation)
          const textContent = await page.getTextContent();
          
          if (active) {
             setHasText(textContent.items.length > 0);
          }

          const textLayerDiv = textLayerRef.current;
          textLayerDiv.style.width = `${viewport.width}px`;
          textLayerDiv.style.height = `${viewport.height}px`;

          // Use our custom renderer instead of library one to avoid export errors
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
      {/* 0. No Text Warning (Scanned PDF) */}
      {!hasText && rendered && (
         <div className="absolute -top-6 left-0 flex items-center gap-1 text-xs text-text-sec opacity-70">
            <ScanLine size={12} />
            <span>Imagem (sem texto selecionável)</span>
         </div>
      )}

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
      {/* pointer-events-none added ONLY when using text tool to allow clicking through to canvas */}
      <div 
        ref={textLayerRef} 
        className={`textLayer ${activeTool === 'text' ? 'pointer-events-none' : ''}`}
        style={{ zIndex: 10 }}
      />

      {/* 4. Highlight Popover (Rendered inside the page for correct relative positioning) */}
      {selection && (
        <div 
          className="absolute z-50 transform -translate-x-1/2 -translate-y-full pb-3 animate-in zoom-in slide-in-from-bottom-2 duration-200"
          style={{ left: selection.x, top: selection.y }}
          onMouseDown={(e) => e.preventDefault()} // Prevent focus loss and selection clearing
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onHighlight?.();
            }}
            className="flex items-center gap-2 bg-surface text-text px-3 py-1.5 rounded-full shadow-xl hover:scale-105 transition border border-brand/50 ring-1 ring-black/20"
          >
            <Highlighter size={14} className="text-brand" />
            <div className="w-3 h-3 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: highlightColor, opacity: highlightOpacity ? highlightOpacity + 0.4 : 1 }} />
            <span className="text-xs font-bold whitespace-nowrap">Destacar</span>
          </button>
          <div className="absolute left-1/2 bottom-1 w-3 h-3 bg-surface border-r border-b border-brand/50 transform rotate-45 -translate-x-1/2"></div>
        </div>
      )}
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
  const [isExporting, setIsExporting] = useState(false); // State for saving to Drive
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
        // More descriptive error for users
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
    const handleMouseUp = (e: MouseEvent) => {
      // If using text tool, ignore selection
      if (activeTool === 'text') return;

      // Critical: Prevent clearing selection if clicking UI elements (like the highlight button)
      if ((e.target as HTMLElement).closest('button, input, select, .annotation-item')) return;

      const sel = window.getSelection();
      // If no selection or collapsed (just a click), clear state
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelection(null);
        return;
      }

      // Check if text is actually selected
      const text = sel.toString().trim();
      if (text.length === 0) {
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
      
      // Calculate position relative to the PAGE element, not the viewport
      const tooltipX = firstRect.left - containerRect.left + (firstRect.width / 2);
      const tooltipY = firstRect.top - containerRect.top - 5; // Slightly above text

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
    
    // Convert viewport clientRects to canvas-relative coordinates
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

  // --- PDF Export Logic using pdf-lib ---
  const handleSaveToDrive = async () => {
    if (!accessToken || !originalBlob) {
      alert("Erro: Arquivo ou sessão inválida.");
      return;
    }

    const confirmSave = window.confirm(
      "Isso criará uma cópia do arquivo no seu Google Drive com todas as anotações visíveis em outros leitores (Adobe, Drive Preview, etc). Deseja continuar?"
    );

    if (!confirmSave) return;

    setIsExporting(true);

    try {
      // 1. Load original PDF into pdf-lib
      const existingPdfBytes = await originalBlob.arrayBuffer();
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const pages = pdfDoc.getPages();

      // 2. Helper to convert Hex to RGB
      const hexToRgb = (hex: string) => {
        const bigint = parseInt(hex.replace('#', ''), 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return rgb(r / 255, g / 255, b / 255);
      };

      // 3. Draw annotations
      for (const ann of annotations) {
        if (ann.page > pages.length) continue;
        const page = pages[ann.page - 1]; // Pages are 0-indexed in pdf-lib
        const { height } = page.getSize();
        
        // --- Coordinate Conversion ---
        // App coordinates are pixels relative to rendered canvas at `scale` (default 1.3)
        // PDF coordinates are points (72 DPI) usually at scale 1.0 (unless internally scaled)
        // Y-axis in PDF starts at bottom, Y-axis in Browser starts at top.
        
        const rectX = ann.bbox[0] / scale;
        const rectY = ann.bbox[1] / scale;
        const rectW = ann.bbox[2] / scale;
        const rectH = ann.bbox[3] / scale;

        // Flip Y axis
        // PDF Y = PageHeight - BrowserY - BrowserHeight
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
          // Drawing text notes is more complex (font embedding etc), 
          // For now, we will draw a small sticky note icon or box with text
          const noteColor = hexToRgb(ann.color || '#fef9c3');
          
          // Draw a small "sticky note" box
          page.drawRectangle({
            x: rectX,
            y: height - rectY - 20, // Adjust Y slightly
            width: 150,
            height: 50, // Fixed size for simplicity in this version
            color: noteColor,
          });
        }
      }

      // 4. Save Modified PDF
      const pdfBytes = await pdfDoc.save();
      const newPdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });

      // 5. Upload to Drive
      const newFileName = `${fileName.replace('.pdf', '')} (Anotado).pdf`;
      await uploadFileToDrive(accessToken, newPdfBlob, newFileName, fileParents);

      alert(`Sucesso! Arquivo "${newFileName}" salvo no seu Google Drive.`);

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
          {/* Export Button */}
          {accessToken && (
            <button
              onClick={handleSaveToDrive}
              disabled={isExporting}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-brand/10 text-brand rounded-lg hover:bg-brand/20 transition disabled:opacity-50"
              title="Salvar cópia no Drive com anotações fixas"
            >
              {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              <span className="text-sm font-medium">Salvar Cópia</span>
            </button>
          )}

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
          
          {/* Mobile Export Button (Sidebar Footer) */}
          {accessToken && (
            <div className="p-4 border-t border-border md:hidden">
              <button
                onClick={handleSaveToDrive}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-brand text-bg rounded-lg font-medium shadow-lg hover:brightness-110 disabled:opacity-50"
              >
                {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                Salvar Cópia no Drive
              </button>
            </div>
          )}
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
                selection={selection?.page === pageNum ? selection : null}
                onHighlight={createHighlight}
                highlightColor={highlightColor}
                highlightOpacity={highlightOpacity}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};