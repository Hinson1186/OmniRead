/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, 
  Brain, 
  ChevronLeft,
  ChevronRight, 
  FileUp, 
  History, 
  MessageSquare, 
  Plus, 
  Rocket,
  Code,
  StickyNote,
  Search, 
  Settings, 
  Sparkles, 
  Tag,
  Upload,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { PDFViewer, PDFViewerRef } from './components/PDFViewer';
import { getSupabase, KnowledgeTag } from './lib/supabase';
import { generateAiResponse, extractConcept, extractTopics } from './lib/gemini';

// --- Types ---
interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

// --- Dummy Data ---
const DUMMY_TAGS: KnowledgeTag[] = [
  { id: '1', tag_name: 'Linear Algebra', category: 'Mathematics', mastery_score: 85 },
  { id: '2', tag_name: 'Calculus II', category: 'Mathematics', mastery_score: 70 },
  { id: '3', tag_name: 'Data Structures', category: 'Computer Science', mastery_score: 90 },
  { id: '4', tag_name: 'React Hooks', category: 'Web Development', mastery_score: 95 },
  { id: '5', tag_name: 'Quantum Mechanics', category: 'Physics', mastery_score: 60 },
];

const CATEGORIES = ['Mathematics', 'Computer Science', 'Web Development', 'Physics', 'History'];

export default function App() {
  const [isDragging, setIsDragging] = useState(false);
  const [tags, setTags] = useState<KnowledgeTag[]>(DUMMY_TAGS);
  
  // PDF State
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [selectedText, setSelectedText] = useState('');
  const pdfViewerRef = useRef<PDFViewerRef>(null);

  // AI State
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [customQuestion, setCustomQuestion] = useState('');

  // Supabase connection check (skeleton)
  useEffect(() => {
    const checkSupabase = async () => {
      const supabase = getSupabase();
      if (!supabase) {
        console.warn('Supabase credentials not found. Using dummy data.');
        return;
      }

      try {
        const { data, error } = await supabase.from('knowledge_tags').select('*').limit(1);
        if (error) {
          console.warn('Supabase connection check failed (expected if table not created yet):', error.message);
        } else {
          console.log('Supabase connected successfully');
        }
      } catch (err) {
        console.error('Unexpected error connecting to Supabase:', err);
      }
    };
    checkSupabase();
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0 && files[0].type === 'application/pdf') {
      setPdfFile(files[0]);
      setCurrentPage(1);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && files[0].type === 'application/pdf') {
      setPdfFile(files[0]);
      setCurrentPage(1);
    }
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';
    if (text) {
      setSelectedText(text);
    }
  };

  const clearSelection = () => {
    setSelectedText('');
    window.getSelection()?.removeAllRanges();
  };

  const handleAction = async (action: string) => {
    if (!selectedText) return;

    setIsAiLoading(true);
    const userMsg: ChatMessage = { role: 'user', text: `${action}: "${selectedText}"` };
    setChatHistory(prev => [...prev, userMsg]);

    let prompt = "";
    switch (action) {
      case 'Summarize/Explain':
        prompt = `Explain the following text in simple, easy-to-understand terms. Keep it concise: ${selectedText}`;
        break;
      case 'More Examples':
        prompt = `Provide 2 or 3 real-world, practical examples to illustrate the concept discussed in this text: ${selectedText}`;
        break;
      case 'Extra Knowledge':
        prompt = `Dive deeper into the topic mentioned in this text. Provide advanced context, historical background, or related concepts that go beyond what is written: ${selectedText}`;
        break;
      case 'Explain Code':
        prompt = `Act as a senior developer/mathematician. Break down this code snippet or mathematical formula step-by-step: ${selectedText}`;
        break;
      case 'Save to Knowledge Base':
        try {
          const concept = await extractConcept(selectedText);
          const supabase = getSupabase();
          if (supabase) {
            const { error } = await supabase.from('knowledge_tags').insert({
              category: concept.category,
              tag_name: concept.tag_name,
              mastery_score: 10
            });
            if (error) throw error;
            toast.success("Tag saved to your Knowledge Base!");
            // Refresh tags
            const { data } = await supabase.from('knowledge_tags').select('*');
            if (data) setTags(data);
          } else {
            toast.info("Supabase not connected. Tag simulated.");
            setTags(prev => [...prev, { id: Date.now().toString(), ...concept, mastery_score: 10 }]);
          }
        } catch (err) {
          console.error("Save error:", err);
          toast.error("Failed to save tag.");
        } finally {
          setIsAiLoading(false);
          setSelectedText('');
        }
        return;
      default:
        setIsAiLoading(false);
        return;
    }

    try {
      const response = await generateAiResponse(prompt);
      setChatHistory(prev => [...prev, { role: 'model', text: response }]);
    } catch (err) {
      toast.error("AI failed to respond.");
    } finally {
      setIsAiLoading(false);
      setSelectedText('');
    }
  };

  const handleWorthIt = async () => {
    if (!pdfViewerRef.current) return;

    setIsAiLoading(true);
    setChatHistory(prev => [...prev, { role: 'user', text: "Is this PDF Worth It?" }]);

    try {
      const extractedText = await pdfViewerRef.current.extractText(5);
      const topics = await extractTopics(extractedText);
      
      const supabase = getSupabase();
      let userTags: string[] = tags.map(t => t.tag_name.toLowerCase());
      
      if (supabase) {
        const { data } = await supabase.from('knowledge_tags').select('tag_name');
        if (data) userTags = data.map(t => t.tag_name.toLowerCase());
      }

      const X = topics.length;
      const matchedTopics = topics.filter(topic => 
        userTags.some(tag => topic.toLowerCase().includes(tag) || tag.includes(topic.toLowerCase()))
      );
      const Y = matchedTopics.length;
      const overlapPercentage = Math.round((Y / X) * 100);

      let resultMsg = "";
      if (overlapPercentage >= 70) {
        resultMsg = `🛑 **NOT WORTH IT:** You already know ${overlapPercentage}% of these topics (e.g., ${matchedTopics.slice(0, 3).join(', ')}). Skim or skip this PDF.`;
      } else {
        resultMsg = `✅ **WORTH IT:** Only ${overlapPercentage}% overlap with your Knowledge Base. This contains highly new information. Priority Reading!`;
      }

      setChatHistory(prev => [...prev, { role: 'model', text: resultMsg }]);
    } catch (err) {
      console.error("Worth It error:", err);
      toast.error("Failed to calculate 'Worth It' status.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleCustomQuestion = async () => {
    if (!customQuestion.trim()) return;
    
    const text = customQuestion;
    setCustomQuestion('');
    setIsAiLoading(true);
    setChatHistory(prev => [...prev, { role: 'user', text }]);

    try {
      const response = await generateAiResponse(text);
      setChatHistory(prev => [...prev, { role: 'model', text: response }]);
    } catch (err) {
      toast.error("AI failed to respond.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const closeDocument = () => {
    setPdfFile(null);
    setNumPages(0);
    setCurrentPage(1);
  };

  return (
    <div className="flex h-screen w-full bg-[#0A0A0A] text-[#EDEDED] font-sans selection:bg-blue-500/30">
      
      {/* --- Left Panel: Knowledge Base Dashboard --- */}
      <aside className="w-72 border-r border-white/5 flex flex-col bg-[#0F0F0F] shrink-0">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-semibold text-lg tracking-tight">OmniRead AI</h1>
        </div>

        <div className="px-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input 
              type="text" 
              placeholder="Search knowledge..." 
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 space-y-8">
          <div>
            <div className="flex items-center justify-between mb-3 px-2">
              <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider">Knowledge Base</h2>
              <button className="p-1 hover:bg-white/5 rounded-md transition-colors">
                <Plus className="w-3.5 h-3.5 text-white/40" />
              </button>
            </div>
            <div className="space-y-1">
              {CATEGORIES.map(cat => (
                <div key={cat} className="group">
                  <button className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/5 text-sm transition-colors text-white/70 hover:text-white">
                    <div className="flex items-center gap-2">
                      <ChevronRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/40 transition-colors" />
                      <span>{cat}</span>
                    </div>
                    <span className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-white/30">
                      {tags.filter(t => t.category === cat).length}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3 px-2">Recent Tags</h2>
            <div className="flex flex-wrap gap-2 px-2">
              {tags.map(tag => (
                <div 
                  key={tag.id} 
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/60 hover:border-blue-500/30 hover:text-blue-400 transition-all cursor-default group"
                >
                  <Tag className="w-3 h-3 opacity-40 group-hover:opacity-100" />
                  {tag.tag_name}
                </div>
              ))}
            </div>
          </div>
        </nav>

        <div className="p-4 border-t border-white/5 space-y-1">
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 text-sm text-white/60 transition-colors">
            <History className="w-4 h-4" />
            Study History
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 text-sm text-white/60 transition-colors">
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </aside>

      {/* --- Center Panel: PDF Dropzone / Viewer --- */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-[#0A0A0A]">
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-[#0A0A0A]/80 backdrop-blur-md z-10 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-white/40">
              <BookOpen className="w-4 h-4" />
              <span className="max-w-[200px] truncate">
                {pdfFile ? pdfFile.name : 'No document loaded'}
              </span>
            </div>
            {pdfFile && (
              <button 
                onClick={closeDocument}
                className="p-1 hover:bg-white/5 rounded-md text-white/20 hover:text-white/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleWorthIt}
              disabled={!pdfFile || isAiLoading}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-4 h-4 text-blue-400" />
              Worth It?
            </button>
          </div>
        </header>

        <div 
          className="flex-1 overflow-hidden relative"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onMouseUp={handleTextSelection}
        >
          {/* --- Fixed Action Bar --- */}
          <AnimatePresence>
            {selectedText && (
              <motion.div 
                initial={{ y: -100, opacity: 0, x: '-50%' }}
                animate={{ y: 0, opacity: 1, x: '-50%' }}
                exit={{ y: -100, opacity: 0, x: '-50%' }}
                className="absolute top-4 left-1/2 z-50 flex items-center gap-1 p-1.5 bg-[#1A1A1A]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/50"
              >
                <div className="flex items-center gap-1 border-r border-white/10 pr-1 mr-1">
                  <button 
                    onClick={() => handleAction('Summarize/Explain')}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/5 text-xs font-medium transition-colors group"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform" />
                    Summarize
                  </button>
                  <button 
                    onClick={() => handleAction('More Examples')}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/5 text-xs font-medium transition-colors group"
                  >
                    <Plus className="w-3.5 h-3.5 text-green-400 group-hover:scale-110 transition-transform" />
                    Examples
                  </button>
                  <button 
                    onClick={() => handleAction('Extra Knowledge')}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/5 text-xs font-medium transition-colors group"
                  >
                    <Rocket className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform" />
                    Deep Dive
                  </button>
                  <button 
                    onClick={() => handleAction('Explain Code')}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/5 text-xs font-medium transition-colors group"
                  >
                    <Code className="w-3.5 h-3.5 text-orange-400 group-hover:scale-110 transition-transform" />
                    Code
                  </button>
                </div>
                
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => handleAction('Add Note')}
                    className="p-2 rounded-xl hover:bg-white/5 text-white/40 hover:text-white transition-colors"
                    title="Add Note"
                  >
                    <StickyNote className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleAction('Save to Knowledge Base')}
                    className="p-2 rounded-xl hover:bg-white/5 text-white/40 hover:text-blue-400 transition-colors"
                    title="Save to Knowledge Base"
                  >
                    <Brain className="w-4 h-4" />
                  </button>
                  <div className="w-px h-4 bg-white/10 mx-1" />
                  <button 
                    onClick={clearSelection}
                    className="p-2 rounded-xl hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-colors"
                    title="Clear Selection"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {!pdfFile ? (
              <motion.div 
                key="empty-state"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="h-full flex items-center justify-center p-12"
              >
                {!isDragging ? (
                  <div className="max-w-md w-full text-center space-y-6">
                    <div className="relative inline-block">
                      <div className="w-24 h-24 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6 relative z-10">
                        <FileUp className="w-10 h-10 text-white/20" />
                      </div>
                      <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full -z-0 opacity-50" />
                    </div>
                    
                    <div className="space-y-2">
                      <h3 className="text-2xl font-semibold tracking-tight">Upload a Lecture PDF</h3>
                      <p className="text-white/40 text-sm leading-relaxed">
                        Drag and drop your study materials here. OmniRead will analyze them against your Knowledge Base.
                      </p>
                    </div>

                    <div className="flex flex-col gap-3">
                      <label className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white text-black font-semibold hover:bg-white/90 transition-all active:scale-[0.98] cursor-pointer">
                        <Upload className="w-4 h-4" />
                        Choose File
                        <input type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
                      </label>
                      <p className="text-[10px] text-white/20 uppercase tracking-widest font-medium">
                        Supports PDF up to 50MB
                      </p>
                    </div>
                  </div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full h-full border-2 border-dashed border-blue-500/50 rounded-3xl bg-blue-500/5 flex flex-col items-center justify-center space-y-4"
                  >
                    <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/40">
                      <Plus className="w-8 h-8 text-white" />
                    </div>
                    <p className="text-blue-400 font-medium text-lg">Drop to start reading</p>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div 
                key="pdf-viewer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col"
              >
                <div className="flex-1 overflow-auto bg-[#1A1A1A]">
                  <PDFViewer 
                    ref={pdfViewerRef}
                    file={pdfFile} 
                    pageNumber={currentPage} 
                    onDocumentLoad={(pages) => setNumPages(pages)} 
                  />
                </div>
                
                {/* Pagination Controls */}
                <div className="h-14 border-t border-white/5 bg-[#0A0A0A] flex items-center justify-center gap-6 shrink-0">
                  <button 
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm font-medium text-white/60">
                    Page <span className="text-white">{currentPage}</span> of {numPages}
                  </span>
                  <button 
                    onClick={() => setCurrentPage(prev => Math.min(numPages, prev + 1))}
                    disabled={currentPage === numPages}
                    className="p-2 rounded-lg hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* --- Right Panel: Sidebar Chat --- */}
      <aside className="w-80 border-l border-white/5 flex flex-col bg-[#0F0F0F] shrink-0">
        <header className="p-6 border-b border-white/5 flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-blue-500" />
          <h2 className="font-semibold">Study Assistant</h2>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {chatHistory.length === 0 && !isAiLoading && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white/20" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Ready to help</p>
                <p className="text-xs leading-relaxed">
                  Highlight text in your PDF to summarize, explain, or get examples.
                </p>
              </div>
            </div>
          )}

          {chatHistory.map((msg, i) => (
            <div 
              key={i} 
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div 
                className={`max-w-[90%] px-4 py-2.5 rounded-2xl text-sm ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : 'bg-white/5 text-white/80 border border-white/10 rounded-tl-none'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {isAiLoading && (
            <div className="flex items-start">
              <div className="bg-white/5 border border-white/10 px-4 py-2.5 rounded-2xl rounded-tl-none flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-1 h-1 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1 h-1 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/5">
          <div className="relative">
            <textarea 
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCustomQuestion();
                }
              }}
              placeholder="Ask a question..."
              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-blue-500/50 transition-colors resize-none h-24"
            />
            <button 
              onClick={handleCustomQuestion}
              disabled={isAiLoading || !customQuestion.trim()}
              className="absolute bottom-3 right-3 p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <Toaster position="top-center" theme="dark" />

    </div>
  );
}
