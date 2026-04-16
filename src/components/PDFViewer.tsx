import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { Bookmark, Loader2, Search, ZoomIn, ZoomOut, ScanText } from 'lucide-react';
import { createWorker } from 'tesseract.js';

// Set up the worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

interface PDFPageProps {
  pdf: pdfjs.PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  isDarkMode: boolean;
  onVisible?: (pageNumber: number) => void;
  isBookmarked: boolean;
  onToggleBookmark: (pageNumber: number) => void;
}

const PDFPage = ({ pdf, pageNumber, scale, isDarkMode, onVisible, isBookmarked, onToggleBookmark }: PDFPageProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && onVisible) {
          onVisible(pageNumber);
        }
      },
      { threshold: 0.5 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [pageNumber, onVisible]);

  const renderTaskRef = useRef<any>(null);
  const [hasText, setHasText] = useState(true);

  const performOcr = async () => {
    if (!canvasRef.current || !textLayerRef.current || !pdf) return;
    
    console.log(`Starting OCR for page ${pageNumber}...`);
    setIsOcrRunning(true);
    setOcrProgress(0);
    
    try {
      const page = await pdf.getPage(pageNumber);
      const cssViewport = page.getViewport({ scale: scale });
      const viewport = page.getViewport({ scale: scale * Math.max(window.devicePixelRatio || 1, 2.5) });

      const worker = await createWorker(['eng'], 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round(m.progress * 100));
          }
        }
      });
      
      const { data } = await worker.recognize(canvasRef.current);
      await worker.terminate();
      
      // Create a custom text layer from OCR results
      textLayerRef.current.innerHTML = '';
      
      const ocrScaleX = cssViewport.width / viewport.width;
      const ocrScaleY = cssViewport.height / viewport.height;

      (data as any).words.forEach((word: any) => {
        const span = document.createElement('span');
        span.textContent = word.text + ' ';
        span.style.left = `${word.bbox.x0 * ocrScaleX}px`;
        span.style.top = `${word.bbox.y0 * ocrScaleY}px`;
        span.style.fontSize = `${(word.bbox.y1 - word.bbox.y0) * ocrScaleY}px`;
        span.style.position = 'absolute';
        span.style.whiteSpace = 'pre';
        span.style.color = 'transparent';
        span.style.cursor = 'text';
        span.style.transformOrigin = '0% 0%';
        textLayerRef.current?.appendChild(span);
      });
      setHasText(true);
    } catch (ocrError) {
      console.error('OCR failed:', ocrError);
    } finally {
      setIsOcrRunning(false);
    }
  };

  useEffect(() => {
    let isCancelled = false;

    const renderPage = async () => {
      if (!pdf || !canvasRef.current || !textLayerRef.current) return;

      // Cancel any existing render task
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      let task: any = null;
      try {
        setLoading(true);
        const page = await pdf.getPage(pageNumber);
        if (isCancelled) return;

        const outputScale = Math.max(window.devicePixelRatio || 1, 2.5); // Slightly lower for performance in list
        
        const viewport = page.getViewport({ scale: scale * outputScale });
        const cssViewport = page.getViewport({ scale: scale });
        
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.style.height = `${cssViewport.height}px`;
        canvas.style.width = `${cssViewport.width}px`;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };
        
        task = page.render(renderContext);
        renderTaskRef.current = task;
        
        await task.promise;
        
        if (isCancelled) return;

        const textContent = await page.getTextContent();
        if (isCancelled) return;

        textLayerRef.current.innerHTML = '';
        textLayerRef.current.style.height = `${cssViewport.height}px`;
        textLayerRef.current.style.width = `${cssViewport.width}px`;

        if (textContent.items.length > 0) {
          setHasText(true);
          const renderTextLayerFn = (pdfjs as any).renderTextLayer;
          if (typeof renderTextLayerFn === 'function') {
            await renderTextLayerFn({
              textContentSource: textContent,
              container: textLayerRef.current,
              viewport: cssViewport,
            }).promise;
          } else {
            const textLayer = new (pdfjs as any).TextLayer({
              textContentSource: textContent,
              container: textLayerRef.current,
              viewport: cssViewport,
            });
            await textLayer.render();
          }
        } else {
          // No text found, try OCR
          setHasText(false);
          performOcr();
        }
        setLoading(false);
      } catch (error: any) {
        if (error.name !== 'RenderingCancelledException' && !isCancelled) {
          console.error('Error rendering page:', error);
        }
      } finally {
        if (renderTaskRef.current === task) {
          renderTaskRef.current = null;
        }
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [pdf, pageNumber, scale]);

  return (
    <div 
      ref={containerRef}
      className={`relative mb-8 shadow-2xl transition-opacity duration-300 group ${loading ? 'opacity-50' : 'opacity-100'} ${isDarkMode ? 'shadow-black/50' : 'shadow-gray-400/30'}`}
      id={`page-${pageNumber}`}
    >
      <canvas ref={canvasRef} className="block" />
      <div 
        ref={textLayerRef} 
        className="absolute top-0 left-0 textLayer z-10"
        style={{ lineHeight: 1 }}
      />
      
      {/* OCR Loading Overlay */}
      {isOcrRunning && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/20 backdrop-blur-[2px]">
          <div className={`p-4 rounded-2xl flex flex-col items-center gap-3 shadow-2xl ${isDarkMode ? 'bg-[#141414] border border-white/10' : 'bg-white border border-gray-200'}`}>
            <div className="relative">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
              <Search className="w-4 h-4 text-accent absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="text-center">
              <p className={`text-xs font-bold uppercase tracking-widest ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Running OCR
              </p>
              <p className={`text-[10px] font-medium mt-1 ${isDarkMode ? 'text-white/40' : 'text-gray-500'}`}>
                Making text selectable... {ocrProgress}%
              </p>
            </div>
            <div className={`w-32 h-1 rounded-full overflow-hidden ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'}`}>
              <div 
                className="h-full bg-accent transition-all duration-300" 
                style={{ width: `${ocrProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Bookmark Button */}
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity transform">
        <button
          onClick={() => onToggleBookmark(pageNumber)}
          className={`p-2 rounded-full transition-all transform hover:scale-110 ${
            isBookmarked 
              ? 'bg-accent text-accent-foreground shadow-lg opacity-100' 
              : 'bg-white/10 text-white/50 backdrop-blur-md hover:bg-white/20'
          }`}
          style={{ opacity: isBookmarked ? 1 : undefined }}
          title={isBookmarked ? "Remove Bookmark" : "Bookmark Page"}
        >
          <Bookmark className={`w-5 h-5 ${isBookmarked ? 'fill-current' : ''}`} />
        </button>

        <button
          onClick={performOcr}
          disabled={isOcrRunning}
          className={`p-2 rounded-full transition-all transform hover:scale-110 bg-white/10 text-white/50 backdrop-blur-md hover:bg-white/20 disabled:opacity-50`}
          title="Run OCR (Manual Text Extraction)"
        >
          <ScanText className="w-5 h-5" />
        </button>
      </div>

      {/* Page Number Indicator */}
      <div className={`absolute top-4 left-4 z-20 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase backdrop-blur-md border flex items-center gap-2 ${
        isDarkMode ? 'bg-black/40 border-white/10 text-white/40' : 'bg-white/40 border-black/10 text-black/40'
      }`}>
        {isBookmarked && <Bookmark className="w-3 h-3 fill-current text-accent" />}
        Page {pageNumber}
      </div>
    </div>
  );
};

interface PDFViewerProps {
  file: File;
  scale: number;
  isDarkMode: boolean;
  onDocumentLoad: (numPages: number) => void;
  onPageChange: (pageNumber: number) => void;
  jumpToPage?: number;
  bookmarks: number[];
  onToggleBookmark: (pageNumber: number) => void;
}

export interface PDFViewerRef {
  extractText: (maxPages?: number) => Promise<string>;
}

export const PDFViewer = forwardRef<PDFViewerRef, PDFViewerProps>(({ file, scale, isDarkMode, onDocumentLoad, onPageChange, jumpToPage, bookmarks, onToggleBookmark }, ref) => {
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    extractText: async (maxPages = 5) => {
      if (!pdf) return '';
      let fullText = '';
      const pagesToExtract = Math.min(pdf.numPages, maxPages);
      
      for (let i = 1; i <= pagesToExtract; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        let pageText = textContent.items.map((item: any) => (item as any).str).join(' ');
        
        if (pageText.trim().length === 0) {
          // Try OCR for extraction if no text found
          console.log(`Extracting text via OCR for page ${i}...`);
          try {
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (context) {
              canvas.height = viewport.height;
              canvas.width = viewport.width;
              await page.render({ canvasContext: context, viewport }).promise;
              
              const worker = await createWorker(['eng']);
              const { data } = await worker.recognize(canvas);
              await worker.terminate();
              pageText = data.text;
            }
          } catch (ocrError) {
            console.error(`OCR extraction failed for page ${i}:`, ocrError);
          }
        }
        
        fullText += pageText + '\n';
      }
      return fullText;
    }
  }));

  useEffect(() => {
    const loadDocument = async () => {
      setLoading(true);
      try {
        const url = URL.createObjectURL(file);
        const loadingTask = pdfjs.getDocument(url);
        const pdfDoc = await loadingTask.promise;
        setPdf(pdfDoc);
        onDocumentLoad(pdfDoc.numPages);
      } catch (error) {
        console.error('Error loading PDF:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDocument();
  }, [file]);

  useEffect(() => {
    if (jumpToPage && pdf) {
      const pageElement = document.getElementById(`page-${jumpToPage}`);
      if (pageElement) {
        pageElement.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [jumpToPage, pdf]);

  return (
    <div 
      ref={containerRef}
      className={`relative flex flex-col items-center p-8 min-h-full ${isDarkMode ? 'bg-[#1A1A1A]' : 'bg-gray-100'}`}
    >
      {loading && (
        <div className={`fixed inset-0 flex items-center justify-center backdrop-blur-sm z-50 ${isDarkMode ? 'bg-[#0A0A0A]/50' : 'bg-white/50'}`}>
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
        </div>
      )}
      
      {pdf && Array.from({ length: pdf.numPages }, (_, i) => (
        <PDFPage 
          key={`${file.name}-${i + 1}`}
          pdf={pdf}
          pageNumber={i + 1}
          scale={scale}
          isDarkMode={isDarkMode}
          onVisible={onPageChange}
          isBookmarked={bookmarks.includes(i + 1)}
          onToggleBookmark={onToggleBookmark}
        />
      ))}

      <style>{`
        .textLayer {
          position: absolute;
          text-align: initial;
          inset: 0;
          overflow: hidden;
          line-height: 1;
          text-wrap: nowrap;
          color: transparent;
          user-select: text;
          pointer-events: auto;
        }
        .textLayer > span {
          color: transparent;
          position: absolute;
          white-space: pre;
          cursor: text;
          transform-origin: 0% 0%;
          pointer-events: auto;
        }
        .textLayer ::selection {
          background: color-mix(in srgb, var(--accent-color, #3b82f6), transparent 70%);
        }
        ::selection {
          background: color-mix(in srgb, var(--accent-color, #3b82f6), transparent 70%);
        }
      `}</style>
    </div>
  );
});
