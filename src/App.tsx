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
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Maximize,
  Minimize,
  Trash2,
  Moon,
  Sun,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { PDFViewer, PDFViewerRef } from './components/PDFViewer';
import { getSupabase, KnowledgeTag } from './lib/supabase';
import { generateAiResponse, extractConcept, extractTopics } from './lib/gemini';

// --- Types ---
interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export default function App() {
  const [isDragging, setIsDragging] = useState(false);
  const [knowledgeTags, setKnowledgeTags] = useState<KnowledgeTag[]>([]);
  const [isKbLoading, setIsKbLoading] = useState(true);
  const [showAddTopic, setShowAddTopic] = useState(false);
  const [newTopic, setNewTopic] = useState({ category: '', tag_name: '' });
  const [isAddingTopic, setIsAddingTopic] = useState(false);
  
  // PDF State
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.5);
  const [selectedText, setSelectedText] = useState('');
  const pdfViewerRef = useRef<PDFViewerRef>(null);

  // Sidebar State
  const [leftWidth, setLeftWidth] = useState(288); // 72 * 4
  const [rightWidth, setRightWidth] = useState(320); // 80 * 4
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  // Modals State
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Dark Mode Effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Fetch Knowledge Tags
  const fetchKnowledgeTags = async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setIsKbLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('knowledge_tags')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setKnowledgeTags(data || []);
    } catch (err) {
      console.error('Error fetching knowledge tags:', err);
      toast.error('Failed to load knowledge base');
    } finally {
      setIsKbLoading(false);
    }
  };

  useEffect(() => {
    fetchKnowledgeTags();
  }, []);

  // Grouping Logic
  const groupedKnowledge = React.useMemo(() => {
    const groups: Record<string, { tags: KnowledgeTag[], averageMastery: number }> = {};
    
    knowledgeTags.forEach(tag => {
      if (!groups[tag.category]) {
        groups[tag.category] = { tags: [], averageMastery: 0 };
      }
      groups[tag.category].tags.push(tag);
    });

    Object.keys(groups).forEach(category => {
      const categoryTags = groups[category].tags;
      const totalMastery = categoryTags.reduce((sum, t) => sum + (t.mastery_score || 0), 0);
      groups[category].averageMastery = Math.round(totalMastery / categoryTags.length);
    });

    return groups;
  }, [knowledgeTags]);

  // CRUD Operations
  const handleDeleteTag = async (id: string) => {
    const supabase = getSupabase();
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from('knowledge_tags')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setKnowledgeTags(prev => prev.filter(t => t.id !== id));
      toast.success('Topic removed');
    } catch (err) {
      console.error('Error deleting tag:', err);
      toast.error('Failed to delete topic');
    }
  };

  const handleAddTopic = async () => {
    if (!newTopic.category.trim() || !newTopic.tag_name.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    const supabase = getSupabase();
    if (!supabase) return;

    setIsAddingTopic(true);
    try {
      const { data, error } = await supabase
        .from('knowledge_tags')
        .insert([{
          category: newTopic.category.trim(),
          tag_name: newTopic.tag_name.trim(),
          mastery_score: 0
        }])
        .select()
        .single();

      if (error) throw error;
      setKnowledgeTags(prev => [data, ...prev]);
      setNewTopic({ category: '', tag_name: '' });
      setShowAddTopic(false);
      toast.success('Topic added to knowledge base');
    } catch (err) {
      console.error('Error adding topic:', err);
      toast.error('Failed to add topic');
    } finally {
      setIsAddingTopic(false);
    }
  };

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

  // Sidebar Resizing Logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingLeft) {
        const newWidth = Math.max(200, Math.min(500, e.clientX));
        setLeftWidth(newWidth);
      }
      if (isResizingRight) {
        const newWidth = Math.max(250, Math.min(600, window.innerWidth - e.clientX));
        setRightWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingLeft(false);
      setIsResizingRight(false);
    };

    if (isResizingLeft || isResizingRight) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingLeft, isResizingRight]);

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
            fetchKnowledgeTags();
          } else {
            toast.info("Supabase not connected. Tag simulated.");
            setKnowledgeTags(prev => [...prev, { id: Date.now().toString(), ...concept, mastery_score: 10 }]);
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
      let userTags: string[] = knowledgeTags.map(t => t.tag_name.toLowerCase());
      
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

  const toggleFocusMode = () => {
    const shouldCollapse = !isLeftCollapsed || !isRightCollapsed;
    setIsLeftCollapsed(shouldCollapse);
    setIsRightCollapsed(shouldCollapse);
  };

  return (
    <div className={`flex h-screen w-full ${isDarkMode ? 'bg-[#0A0A0A] text-[#EDEDED]' : 'bg-gray-50 text-gray-900'} font-sans selection:bg-blue-500/30 overflow-hidden transition-colors duration-300`}>
      
      {/* --- Left Panel: Knowledge Base Dashboard --- */}
      <aside 
        style={{ width: isLeftCollapsed ? 0 : leftWidth }}
        className={`relative border-r ${isDarkMode ? 'border-white/5 bg-[#0F0F0F]' : 'border-gray-200 bg-white'} flex flex-col shrink-0 ${!isResizingLeft ? 'transition-[width] duration-300 ease-in-out' : ''} ${isLeftCollapsed ? 'overflow-hidden border-none' : ''}`}
      >
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <h1 className={`font-semibold text-lg tracking-tight whitespace-nowrap ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>OmniRead AI</h1>
          </div>
          <button 
            onClick={() => setIsLeftCollapsed(true)}
            className={`p-1.5 rounded-md transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white/40 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'}`}
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 mb-6">
          <div className="relative">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDarkMode ? 'text-white/30' : 'text-gray-400'}`} />
            <input 
              type="text" 
              placeholder="Search knowledge..." 
              className={`w-full border rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500/50 transition-colors ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 space-y-6">
          {isKbLoading ? (
            <div className="space-y-6 px-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="space-y-3 animate-pulse">
                  <div className={`h-4 w-24 rounded ${isDarkMode ? 'bg-white/10' : 'bg-gray-200'}`} />
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3, 4].map(j => (
                      <div key={j} className={`h-7 w-20 rounded-full ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'}`} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : Object.keys(groupedKnowledge).length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12 space-y-4">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'}`}>
                <Brain className={`w-8 h-8 ${isDarkMode ? 'text-white/20' : 'text-gray-300'}`} />
              </div>
              <div className="space-y-2">
                <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Your second brain is empty!</p>
                <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-white/40' : 'text-gray-500'}`}>
                  Highlight text in your PDF and click "Save to Knowledge Base" to start building your knowledge.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedKnowledge).map(([category, { tags, averageMastery }]) => (
                <div key={category} className="space-y-3">
                  <div className="px-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <h3 className={`text-[11px] font-bold uppercase tracking-widest ${isDarkMode ? 'text-white/40' : 'text-gray-400'}`}>
                        {category}
                      </h3>
                      <span className={`text-[10px] font-medium ${isDarkMode ? 'text-white/30' : 'text-gray-400'}`}>
                        {averageMastery}% Mastery
                      </span>
                    </div>
                    <div className={`h-1 w-full rounded-full overflow-hidden ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'}`}>
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${averageMastery}%` }}
                        className="h-full bg-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 px-1">
                    {tags.map(tag => (
                      <div 
                        key={tag.id}
                        className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-all hover:-translate-y-0.5 hover:shadow-sm cursor-default ${
                          isDarkMode 
                            ? 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10' 
                            : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          tag.mastery_score < 50 ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]' :
                          tag.mastery_score < 80 ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.4)]' :
                          'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]'
                        }`} />
                        <span className="font-medium">{tag.tag_name}</span>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTag(tag.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 -mr-1 hover:text-red-500 transition-all"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </nav>

        <div className={`p-4 border-t space-y-3 ${isDarkMode ? 'border-white/5' : 'border-gray-200'}`}>
          {showAddTopic ? (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-3 rounded-xl border space-y-3 ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'}`}
            >
              <div className="space-y-2">
                <input 
                  type="text"
                  placeholder="Category (e.g. Physics)"
                  value={newTopic.category}
                  onChange={e => setNewTopic(prev => ({ ...prev, category: e.target.value }))}
                  className={`w-full px-3 py-1.5 text-xs rounded-lg border focus:outline-none focus:border-blue-500/50 ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                />
                <input 
                  type="text"
                  placeholder="Topic Name"
                  value={newTopic.tag_name}
                  onChange={e => setNewTopic(prev => ({ ...prev, tag_name: e.target.value }))}
                  className={`w-full px-3 py-1.5 text-xs rounded-lg border focus:outline-none focus:border-blue-500/50 ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                />
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowAddTopic(false)}
                  className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white/40' : 'hover:bg-gray-200 text-gray-500'}`}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAddTopic}
                  disabled={isAddingTopic}
                  className="flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
                >
                  {isAddingTopic ? 'Adding...' : 'Add Topic'}
                </button>
              </div>
            </motion.div>
          ) : (
            <button 
              onClick={() => setShowAddTopic(true)}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed text-xs font-medium transition-all ${
                isDarkMode 
                  ? 'border-white/10 text-white/40 hover:border-blue-500/50 hover:text-blue-400 hover:bg-blue-500/5' 
                  : 'border-gray-300 text-gray-500 hover:border-blue-500/50 hover:text-blue-600 hover:bg-blue-50'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              Add Topic
            </button>
          )}

          <div className="space-y-1">
            <button 
              onClick={() => setShowHistory(true)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white/60' : 'hover:bg-gray-100 text-gray-600'}`}
            >
              <History className="w-4 h-4" />
              Study History
            </button>
            <button 
              onClick={() => setShowSettings(true)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white/60' : 'hover:bg-gray-100 text-gray-600'}`}
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </div>
        </div>
      </aside>

      {/* Left Resize Handle */}
      {!isLeftCollapsed && (
        <div 
          onMouseDown={() => setIsResizingLeft(true)}
          className="w-1 hover:w-1.5 bg-transparent hover:bg-blue-500/30 cursor-col-resize transition-all z-20"
        />
      )}

      {/* Left Expand Button */}
      {isLeftCollapsed && (
        <button 
          onClick={() => setIsLeftCollapsed(false)}
          className={`absolute left-4 top-4 z-30 p-2 ${isDarkMode ? 'bg-[#1A1A1A] border-white/10 text-white/40' : 'bg-white border-gray-200 text-gray-400'} border rounded-lg hover:text-blue-500 transition-all shadow-xl`}
        >
          <PanelLeftOpen className="w-5 h-5" />
        </button>
      )}

      {/* --- Center Panel: PDF Dropzone / Viewer --- */}
      <main className={`flex-1 flex flex-col relative overflow-hidden ${isDarkMode ? 'bg-[#0A0A0A]' : 'bg-gray-50'}`}>
        <header className={`h-16 border-b ${isDarkMode ? 'border-white/5 bg-[#0A0A0A]/80' : 'border-gray-200 bg-white/80'} flex items-center justify-between px-8 backdrop-blur-md z-10 shrink-0`}>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 text-sm ${isDarkMode ? 'text-white/40' : 'text-gray-400'}`}>
              <BookOpen className="w-4 h-4" />
              <span className="max-w-[200px] truncate">
                {pdfFile ? pdfFile.name : 'No document loaded'}
              </span>
            </div>
            {pdfFile && (
              <button 
                onClick={closeDocument}
                className={`p-1 rounded-md ${isDarkMode ? 'hover:bg-white/5 text-white/20 hover:text-white/60' : 'hover:bg-gray-100 text-gray-300 hover:text-gray-600'} transition-colors`}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={toggleFocusMode}
              className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/5 text-white/40 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'} transition-colors`}
              title={isLeftCollapsed && isRightCollapsed ? "Exit Focus Mode" : "Focus Mode (Collapse All)"}
            >
              {isLeftCollapsed && isRightCollapsed ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
            {pdfFile && (
              <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full px-2 py-1 mr-2">
                <button 
                  onClick={() => setScale(prev => Math.max(0.5, prev - 0.25))}
                  className="p-1 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-[10px] font-mono w-10 text-center text-white/40">
                  {Math.round(scale * 100)}%
                </span>
                <button 
                  onClick={() => setScale(prev => Math.min(3, prev + 0.25))}
                  className="p-1 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setScale(1.5)}
                  className="p-1 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors ml-1"
                  title="Reset Zoom"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
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
                <div className={`flex-1 overflow-auto ${isDarkMode ? 'bg-[#1A1A1A]' : 'bg-gray-100'}`}>
                  <PDFViewer 
                    ref={pdfViewerRef}
                    file={pdfFile} 
                    pageNumber={currentPage} 
                    scale={scale}
                    isDarkMode={isDarkMode}
                    onDocumentLoad={(pages) => setNumPages(pages)} 
                  />
                </div>
                
                {/* Pagination Controls */}
                <div className={`h-14 border-t ${isDarkMode ? 'border-white/5 bg-[#0A0A0A]' : 'border-gray-200 bg-white'} flex items-center justify-center gap-6 shrink-0`}>
                  <button 
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white' : 'hover:bg-gray-100 text-gray-900'} disabled:opacity-20 disabled:cursor-not-allowed`}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className={`text-sm font-medium ${isDarkMode ? 'text-white/60' : 'text-gray-500'}`}>
                    Page <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>{currentPage}</span> of {numPages}
                  </span>
                  <button 
                    onClick={() => setCurrentPage(prev => Math.min(numPages, prev + 1))}
                    disabled={currentPage === numPages}
                    className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white' : 'hover:bg-gray-100 text-gray-900'} disabled:opacity-20 disabled:cursor-not-allowed`}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>

                  <div className={`w-px h-6 mx-2 ${isDarkMode ? 'bg-white/10' : 'bg-gray-200'}`} />

                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => setScale(prev => Math.max(0.5, prev - 0.25))}
                      className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white' : 'hover:bg-gray-100 text-gray-900'}`}
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className={`text-xs font-medium w-12 text-center ${isDarkMode ? 'text-white/60' : 'text-gray-500'}`}>
                      {Math.round(scale * 100)}%
                    </span>
                    <button 
                      onClick={() => setScale(prev => Math.min(4, prev + 0.25))}
                      className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white' : 'hover:bg-gray-100 text-gray-900'}`}
                      title="Zoom In"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Right Resize Handle */}
      {!isRightCollapsed && (
        <div 
          onMouseDown={() => setIsResizingRight(true)}
          className="w-1 hover:w-1.5 bg-transparent hover:bg-blue-500/30 cursor-col-resize transition-all z-20"
        />
      )}

      {/* Right Expand Button */}
      {isRightCollapsed && (
        <button 
          onClick={() => setIsRightCollapsed(false)}
          className={`absolute right-4 top-4 z-30 p-2 ${isDarkMode ? 'bg-[#1A1A1A] border-white/10 text-white/40' : 'bg-white border-gray-200 text-gray-400'} border rounded-lg hover:text-blue-500 transition-all shadow-xl`}
        >
          <PanelRightOpen className="w-5 h-5" />
        </button>
      )}

      {/* --- Right Panel: Sidebar Chat --- */}
      <aside 
        style={{ width: isRightCollapsed ? 0 : rightWidth }}
        className={`relative border-l ${isDarkMode ? 'border-white/5 bg-[#0F0F0F]' : 'border-gray-200 bg-white'} flex flex-col shrink-0 ${!isResizingRight ? 'transition-[width] duration-300 ease-in-out' : ''} ${isRightCollapsed ? 'overflow-hidden border-none' : ''}`}
      >
        <header className={`p-6 border-b flex items-center justify-between ${isDarkMode ? 'border-white/5' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-blue-500" />
            <h2 className={`font-semibold whitespace-nowrap ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Study Assistant</h2>
          </div>
          <button 
            onClick={() => setIsRightCollapsed(true)}
            className={`p-1.5 rounded-md transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white/40 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'}`}
          >
            <PanelRightClose className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {chatHistory.length === 0 && !isAiLoading && (
            <div className={`h-full flex flex-col items-center justify-center text-center space-y-4 ${isDarkMode ? 'opacity-50' : 'opacity-70'}`}>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'}`}>
                <Sparkles className={`w-6 h-6 ${isDarkMode ? 'text-white/20' : 'text-gray-300'}`} />
              </div>
              <div className="space-y-1">
                <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Ready to help</p>
                <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-white/60' : 'text-gray-500'}`}>
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
                    : `${isDarkMode ? 'bg-white/5 text-white/80 border-white/10' : 'bg-gray-100 text-gray-800 border-gray-200'} border rounded-tl-none`
                }`}
              >
                <ReactMarkdown 
                  remarkPlugins={[remarkMath]} 
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    code: ({ children }) => <code className="bg-black/20 px-1 rounded font-mono text-xs">{children}</code>,
                  }}
                >
                  {msg.text}
                </ReactMarkdown>
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

        <div className={`p-4 border-t ${isDarkMode ? 'border-white/5' : 'border-gray-200'}`}>
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
              className={`w-full border rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-blue-500/50 transition-colors resize-none h-24 ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
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

      {/* --- History Modal --- */}
      <AnimatePresence>
        {showHistory && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`relative w-full max-w-2xl border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] ${isDarkMode ? 'bg-[#141414] border-white/10' : 'bg-white border-gray-200'}`}
            >
              <div className={`p-6 border-b flex items-center justify-between ${isDarkMode ? 'border-white/5' : 'border-gray-200'}`}>
                <div className="flex items-center gap-3">
                  <History className="w-5 h-5 text-blue-500" />
                  <h2 className={`text-xl font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Study History</h2>
                </div>
                <button 
                  onClick={() => setShowHistory(false)}
                  className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white/40 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {chatHistory.length === 0 ? (
                  <div className={`text-center py-12 ${isDarkMode ? 'text-white/40' : 'text-gray-400'}`}>
                    No history yet. Start studying to see your progress!
                  </div>
                ) : (
                  chatHistory.map((msg, i) => (
                    <div key={i} className={`p-4 rounded-xl border ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-[10px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded ${msg.role === 'user' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                          {msg.role}
                        </span>
                      </div>
                      <p className={`text-sm line-clamp-3 ${isDarkMode ? 'text-white/80' : 'text-gray-700'}`}>{msg.text}</p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Settings Modal --- */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`relative w-full max-w-md border rounded-2xl shadow-2xl overflow-hidden ${isDarkMode ? 'bg-[#141414] border-white/10' : 'bg-white border-gray-200'}`}
            >
              <div className={`p-6 border-b flex items-center justify-between ${isDarkMode ? 'border-white/5' : 'border-gray-200'}`}>
                <div className="flex items-center gap-3">
                  <Settings className="w-5 h-5 text-blue-500" />
                  <h2 className={`text-xl font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Settings</h2>
                </div>
                <button 
                  onClick={() => setShowSettings(false)}
                  className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white/40 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-4">
                  <h3 className={`text-sm font-medium ${isDarkMode ? 'text-white/40' : 'text-gray-400'} uppercase tracking-wider`}>Appearance</h3>
                  <div className={`flex items-center justify-between p-4 rounded-xl ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'} border`}>
                    <div className="flex items-center gap-3">
                      {isDarkMode ? <Moon className="w-4 h-4 text-blue-400" /> : <Sun className="w-4 h-4 text-orange-400" />}
                      <span className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Dark Mode</span>
                    </div>
                    <button 
                      onClick={() => setIsDarkMode(!isDarkMode)}
                      className={`w-10 h-5 rounded-full relative transition-colors ${isDarkMode ? 'bg-blue-600' : 'bg-gray-300'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isDarkMode ? 'right-1' : 'left-1'}`} />
                    </button>
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className={`text-sm font-medium ${isDarkMode ? 'text-white/40' : 'text-gray-400'} uppercase tracking-wider`}>Data</h3>
                  <button 
                    onClick={() => setShowClearConfirm(true)}
                    className="w-full flex items-center justify-between p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Trash2 className="w-4 h-4" />
                      <span className="text-sm">Clear Study History</span>
                    </div>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Clear Data Confirmation Modal --- */}
      <AnimatePresence>
        {showClearConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowClearConfirm(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`relative w-full max-w-sm ${isDarkMode ? 'bg-[#1A1A1A] border-white/10' : 'bg-white border-gray-200'} border rounded-2xl shadow-2xl p-6 text-center`}
            >
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className={`text-lg font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Clear Study History?</h3>
              <p className={`text-sm ${isDarkMode ? 'text-white/40' : 'text-gray-500'} mb-6`}>
                This action cannot be undone. All your chat history and AI summaries will be permanently removed.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowClearConfirm(false)}
                  className={`flex-1 px-4 py-2 rounded-xl ${isDarkMode ? 'bg-white/5 hover:bg-white/10 text-white/60' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'} transition-colors font-medium`}
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    setChatHistory([]);
                    setShowClearConfirm(false);
                    toast.success("History cleared successfully");
                  }}
                  className="flex-1 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white transition-colors font-medium"
                >
                  Clear All
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
