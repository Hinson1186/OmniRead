import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import * as pdfjs from 'pdfjs-dist';

// Set up the worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

interface PDFViewerProps {
  file: File;
  pageNumber: number;
  onDocumentLoad: (numPages: number) => void;
}

export interface PDFViewerRef {
  extractText: (maxPages?: number) => Promise<string>;
}

export const PDFViewer = forwardRef<PDFViewerRef, PDFViewerProps>(({ file, pageNumber, onDocumentLoad }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);

  useImperativeHandle(ref, () => ({
    extractText: async (maxPages = 5) => {
      if (!pdf) return '';
      let fullText = '';
      const pagesToExtract = Math.min(pdf.numPages, maxPages);
      for (let i = 1; i <= pagesToExtract; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => (item as any).str).join(' ');
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
    let renderTask: any = null;

    const renderPage = async () => {
      if (!pdf || !canvasRef.current || !textLayerRef.current) return;

      try {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.5 });
        
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Render PDF page into canvas context
        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };
        
        renderTask = page.render(renderContext);
        await renderTask.promise;

        // Render text layer
        const textContent = await page.getTextContent();
        
        // Clear existing text layer
        textLayerRef.current.innerHTML = '';
        textLayerRef.current.style.height = `${viewport.height}px`;
        textLayerRef.current.style.width = `${viewport.width}px`;

        // In pdfjs-dist v4, renderTextLayer might be a standalone function or part of the bundle
        // We'll try to find it on the pdfjs object or use the TextLayer class if needed
        const renderTextLayerFn = (pdfjs as any).renderTextLayer;
        
        if (typeof renderTextLayerFn === 'function') {
          await renderTextLayerFn({
            textContentSource: textContent,
            container: textLayerRef.current,
            viewport: viewport,
          }).promise;
        } else {
          console.warn('renderTextLayer not found on pdfjs object, attempting fallback');
          // Fallback for some versions/builds of pdfjs
          const textLayer = new (pdfjs as any).TextLayer({
            textContentSource: textContent,
            container: textLayerRef.current,
            viewport: viewport,
          });
          await textLayer.render();
        }

      } catch (error: any) {
        if (error.name === 'RenderingCancelledException') {
          console.log('Rendering cancelled');
        } else {
          console.error('Error rendering page:', error);
        }
      }
    };

    renderPage();

    return () => {
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdf, pageNumber]);

  return (
    <div className="relative flex justify-center bg-[#1A1A1A] p-8 min-h-full overflow-auto">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0A0A0A]/50 backdrop-blur-sm z-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      )}
      <div className="relative shadow-2xl shadow-black/50">
        <canvas ref={canvasRef} className="block" />
        <div 
          ref={textLayerRef} 
          className="absolute top-0 left-0 textLayer"
          style={{ 
            lineHeight: 1,
            opacity: 0.2, // Make it subtle but selectable
          }}
        />
      </div>
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
        }
        ::selection {
          background: rgba(59, 130, 246, 0.4);
        }
      `}</style>
    </div>
  );
});
