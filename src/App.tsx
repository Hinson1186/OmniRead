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
  AlertTriangle,
  Bookmark,
  Pencil
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
import { STUDY_PROMPTS } from './lib/prompts';

// --- Types ---
interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface BookmarkItem {
  id: string;
  fileName: string;
  pageNumber: number;
  text?: string;
  note?: string;
  createdAt: number;
}

export default function App() {
  const [isDragging, setIsDragging] = useState(false);
  const [knowledgeTags, setKnowledgeTags] = useState<KnowledgeTag[]>(() => {
    const saved = localStorage.getItem('omniread_knowledge');
    return saved ? JSON.parse(saved) : [];
  });
  const [isKbLoading, setIsKbLoading] = useState(true);
  const [showAddTopic, setShowAddTopic] = useState(false);
  const [newTopic, setNewTopic] = useState({ category: '', tag_name: '' });
  const [isAddingTopic, setIsAddingTopic] = useState(false);
  
  // PDF State
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [jumpToPage, setJumpToPage] = useState<number | undefined>(undefined);
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
  const [leftTab, setLeftTab] = useState<'knowledge' | 'bookmarks'>('knowledge');
  
  // Bookmark Note Modal State
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [bookmarkNote, setBookmarkNote] = useState('');
  const [pendingBookmarkText, setPendingBookmarkText] = useState('');
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null);

  // Bookmarks State
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>(() => {
    const saved = localStorage.getItem('omniread_bookmarks');
    return saved ? JSON.parse(saved) : [];
  });
  const [isBookmarksLoading, setIsBookmarksLoading] = useState(true);

  useEffect(() => {
    localStorage.setItem('omniread_bookmarks', JSON.stringify(bookmarks));
  }, [bookmarks]);

  useEffect(() => {
    localStorage.setItem('omniread_knowledge', JSON.stringify(knowledgeTags));
  }, [knowledgeTags]);

  const toggleBookmark = async (pageNumber: number) => {
    const fileName = pdfFiles[activeFileIndex]?.name;
    if (!fileName) return;

    const supabase = getSupabase();
    const exists = bookmarks.find(b => b.fileName === fileName && b.pageNumber === pageNumber && !b.text);

    if (exists) {
      // Remove bookmark
      setBookmarks(prev => prev.filter(b => b.id !== exists.id));
      if (supabase) {
        await supabase.from('bookmarks').delete().eq('id', exists.id);
      }
    } else {
      // Add bookmark
      const newBookmark: BookmarkItem = {
        id: Math.random().toString(36).substr(2, 9),
        fileName,
        pageNumber,
        createdAt: Date.now()
      };
      setBookmarks(prev => [...prev, newBookmark]);
      if (supabase) {
        await supabase.from('bookmarks').insert([{
          id: newBookmark.id,
          file_name: newBookmark.fileName,
          page_number: newBookmark.pageNumber,
          created_at: new Date(newBookmark.createdAt).toISOString()
        }]);
      }
    }
  };

  const addSelectionBookmark = () => {
    if (!selectedText) return;
    setPendingBookmarkText(selectedText);
    setBookmarkNote('');
    setEditingBookmarkId(null);
    setShowNoteModal(true);
  };

  const editBookmarkNote = (bookmark: BookmarkItem) => {
    setEditingBookmarkId(bookmark.id);
    setBookmarkNote(bookmark.note || '');
    setPendingBookmarkText(bookmark.text || '');
    setShowNoteModal(true);
  };

  const confirmSelectionBookmark = async () => {
    const supabase = getSupabase();
    
    if (editingBookmarkId) {
      const updatedNote = bookmarkNote.trim() || undefined;
      setBookmarks(prev => prev.map(b => 
        b.id === editingBookmarkId ? { ...b, note: updatedNote } : b
      ));
      
      if (supabase) {
        await supabase.from('bookmarks').update({ note: updatedNote }).eq('id', editingBookmarkId);
      }
      toast.success("Bookmark updated!");
    } else {
      const fileName = pdfFiles[activeFileIndex]?.name;
      if (!fileName) return;

      const newBookmark: BookmarkItem = {
        id: Math.random().toString(36).substr(2, 9),
        fileName,
        pageNumber: currentPage,
        text: pendingBookmarkText,
        note: bookmarkNote.trim() || undefined,
        createdAt: Date.now()
      };

      setBookmarks(prev => [...prev, newBookmark]);
      
      if (supabase) {
        await supabase.from('bookmarks').insert([{
          id: newBookmark.id,
          file_name: newBookmark.fileName,
          page_number: newBookmark.pageNumber,
          text_selection: newBookmark.text,
          note: newBookmark.note,
          created_at: new Date(newBookmark.createdAt).toISOString()
        }]);
      }
      
      toast.success("Selection bookmarked!");
      clearSelection();
    }
    
    setShowNoteModal(false);
    setPendingBookmarkText('');
    setBookmarkNote('');
    setEditingBookmarkId(null);
  };

  const jumpToBookmark = (bookmark: BookmarkItem) => {
    const fileIndex = pdfFiles.findIndex(f => f.name === bookmark.fileName);
    if (fileIndex !== -1) {
      setActiveFileIndex(fileIndex);
      setJumpToPage(bookmark.pageNumber);
    } else {
      toast.error(`Please upload "${bookmark.fileName}" to view this bookmark.`);
    }
  };

  const deleteBookmark = async (id: string) => {
    setBookmarks(prev => prev.filter(b => b.id !== id));
    const supabase = getSupabase();
    if (supabase) {
      await supabase.from('bookmarks').delete().eq('id', id);
    }
    toast.success("Bookmark removed");
  };

  useEffect(() => {
    setPageInput(currentPage.toString());
  }, [currentPage]);

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

      if (error) {
        // If it's a permission error or table not found, log it but don't necessarily crash the UI experience
        console.error('Supabase fetch error:', error);
        if (error.code === 'PGRST116' || error.message.includes('relation "knowledge_tags" does not exist')) {
          console.warn('Knowledge tags table not found, using local storage.');
        } else {
          throw error;
        }
      } else if (data) {
        setKnowledgeTags(data);
      }
    } catch (err: any) {
      console.error('Error fetching knowledge tags:', err);
      // Only show toast if it's not a common initialization/network error
      if (err.message !== 'Failed to fetch') {
        toast.error(`Sync Error: ${err.message || 'Check your Supabase connection'}`);
      }
    } finally {
      setIsKbLoading(false);
    }
  };

  useEffect(() => {
    fetchKnowledgeTags();
    fetchBookmarks();
  }, []);

  // Fetch Bookmarks
  const fetchBookmarks = async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setIsBookmarksLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('bookmarks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase bookmarks error:', error);
        if (error.code === 'PGRST116' || error.message.includes('relation "bookmarks" does not exist')) {
          console.warn('Bookmarks table not found, using local storage.');
        } else {
          throw error;
        }
      } else if (data && data.length > 0) {
        const mappedBookmarks: BookmarkItem[] = data.map(b => ({
          id: b.id,
          fileName: b.file_name,
          pageNumber: b.page_number,
          text: b.text_selection,
          note: b.note,
          createdAt: new Date(b.created_at).getTime()
        }));
        setBookmarks(mappedBookmarks);
      }
    } catch (err: any) {
      console.error('Error fetching bookmarks:', err);
      if (err.message !== 'Failed to fetch') {
        toast.error(`Sync Error: ${err.message || 'Check your Supabase connection'}`);
      }
    } finally {
      setIsBookmarksLoading(false);
    }
  };

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
    
    setKnowledgeTags(prev => prev.filter(t => t.id !== id));
    toast.success('Topic removed');

    if (supabase) {
      try {
        const { error } = await supabase
          .from('knowledge_tags')
          .delete()
          .eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.error('Error deleting tag:', err);
      }
    }
  };

  const handleAddTopic = async () => {
    if (!newTopic.tag_name.trim()) {
      toast.error('Please enter a topic name');
      return;
    }

    const tagNameInput = newTopic.tag_name.trim();

    // Duplicate Check
    const isDuplicate = knowledgeTags.some(t => t.tag_name.toLowerCase() === tagNameInput.toLowerCase());
    if (isDuplicate) {
      toast.error(`"${tagNameInput}" is already in your Knowledge Base!`);
      return;
    }

    setIsAddingTopic(true);
    try {
      // Use AI to "think" of the actual topic name and category
      let concept;
      try {
        concept = await extractConcept(tagNameInput);
      } catch (e) {
        // Fallback
        concept = { category: 'General', tag_name: tagNameInput };
      }

      const finalTagName = concept.tag_name || tagNameInput;
      const finalCategory = concept.category || 'General';

      // Final Duplicate Check after AI refinement
      const isRefinedDuplicate = knowledgeTags.some(t => t.tag_name.toLowerCase() === finalTagName.toLowerCase());
      if (isRefinedDuplicate) {
        toast.error(`"${finalTagName}" is already in your Knowledge Base!`);
        return;
      }

      const supabase = getSupabase();
      if (supabase) {
        const { data, error } = await supabase
          .from('knowledge_tags')
          .insert([{
            category: finalCategory,
            tag_name: finalTagName,
            mastery_score: 0
          }])
          .select()
          .single();

        if (error) throw error;
        setKnowledgeTags(prev => [data, ...prev]);
      } else {
        const localTopic = {
          id: Date.now().toString(),
          category: finalCategory,
          tag_name: finalTagName,
          mastery_score: 0,
          created_at: new Date().toISOString()
        };
        setKnowledgeTags(prev => [localTopic, ...prev]);
      }

      setNewTopic({ category: '', tag_name: '' });
      setShowAddTopic(false);
      toast.success(`Added "${finalTagName}" to ${finalCategory}`);
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
    const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
    if (files.length > 0) {
      setPdfFiles(prev => [...prev, ...files]);
      if (pdfFiles.length === 0) {
        setActiveFileIndex(0);
        setCurrentPage(1);
        setJumpToPage(undefined);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files).filter(f => f.type === 'application/pdf') : [];
    if (files.length > 0) {
      setPdfFiles(prev => [...prev, ...files]);
      if (pdfFiles.length === 0) {
        setActiveFileIndex(0);
        setCurrentPage(1);
        setJumpToPage(undefined);
      }
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

    // Prompts are stored in src/lib/prompts.ts for easy editing
    let prompt = "";
    switch (action) {
      case 'Summarize/Explain':
        prompt = STUDY_PROMPTS.SUMMARIZE(selectedText);
        break;
      case 'More Examples':
        prompt = STUDY_PROMPTS.EXAMPLES(selectedText);
        break;
      case 'Extra Knowledge':
        prompt = STUDY_PROMPTS.DEEP_DIVE(selectedText);
        break;
      case 'Explain Code':
        prompt = STUDY_PROMPTS.EXPLAIN_CODE(selectedText);
        break;
      case 'Bookmark Selection':
        addSelectionBookmark();
        return;
      case 'Save to Knowledge Base':
        // Validation added
        try {
          const savePromise = (async () => {
            let concept;
            try {
              concept = await extractConcept(selectedText);
            } catch (e) {
              concept = { category: 'General', tag_name: selectedText.slice(0, 30) + (selectedText.length > 30 ? '...' : '') };
            }

            if (!concept || !concept.tag_name) throw new Error("Could not extract concept");
            
            const tagName = concept.tag_name.trim();
            const isValidTopic = tagName.length >= 2 && /[a-zA-Z]/.test(tagName);
            
            if (!isValidTopic) {
              throw new Error("This doesn't look like a meaningful topic. Try selecting more context.");
            }

            const isDuplicate = knowledgeTags.some(t => t.tag_name.toLowerCase() === tagName.toLowerCase());
            if (isDuplicate) {
              throw new Error(`"${tagName}" is already in your Knowledge Base!`);
            }
            
            const supabase = getSupabase();
            if (supabase) {
              const { error } = await supabase.from('knowledge_tags').insert({
                category: concept.category || 'General',
                tag_name: tagName,
                mastery_score: 10
              });
              if (error) throw error;
              await fetchKnowledgeTags();
            } else {
              setKnowledgeTags(prev => [{ 
                id: Date.now().toString(), 
                category: concept.category || 'General',
                tag_name: tagName,
                mastery_score: 10 
              }, ...prev]);
            }
            return tagName;
          })();

          toast.promise(savePromise, {
            loading: 'Extracting and saving concept...',
            success: (tagName) => `"${tagName}" saved to your Knowledge Base!`,
            error: (err) => err.message || 'Failed to save concept.'
          });

          await savePromise;
        } catch (err) {
          console.error("Save error:", err);
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

  useEffect(() => {
    setPageInput(currentPage.toString());
  }, [currentPage]);

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

  const closeDocument = (index: number) => {
    setPdfFiles(prev => {
      const newFiles = prev.filter((_, i) => i !== index);
      if (newFiles.length === 0) {
        setNumPages(0);
        setCurrentPage(1);
        setActiveFileIndex(0);
        setJumpToPage(undefined);
      } else {
        if (index === activeFileIndex) {
          setActiveFileIndex(Math.max(0, index - 1));
          setCurrentPage(1);
          setJumpToPage(undefined);
        } else if (index < activeFileIndex) {
          setActiveFileIndex(prevIdx => prevIdx - 1);
        }
      }
      return newFiles;
    });
  };

  const clearAllDocuments = () => {
    setPdfFiles([]);
    setActiveFileIndex(0);
    setNumPages(0);
    setCurrentPage(1);
    setJumpToPage(undefined);
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

        <div className="px-4 mb-4">
          <div className={`flex p-1 rounded-xl ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'}`}>
            <button 
              onClick={() => setLeftTab('knowledge')}
              className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-lg transition-all ${
                leftTab === 'knowledge' 
                  ? `${isDarkMode ? 'bg-white/10 text-white shadow-lg shadow-black/20' : 'bg-white text-gray-900 shadow-sm'}` 
                  : `${isDarkMode ? 'text-white/40 hover:text-white/60' : 'text-gray-500 hover:text-gray-700'}`
              }`}
            >
              <Brain className="w-3.5 h-3.5" />
              Knowledge
            </button>
            <button 
              onClick={() => setLeftTab('bookmarks')}
              className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-lg transition-all ${
                leftTab === 'bookmarks' 
                  ? `${isDarkMode ? 'bg-white/10 text-white shadow-lg shadow-black/20' : 'bg-white text-gray-900 shadow-sm'}` 
                  : `${isDarkMode ? 'text-white/40 hover:text-white/60' : 'text-gray-500 hover:text-gray-700'}`
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              Bookmarks
            </button>
          </div>
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
          {leftTab === 'knowledge' ? (
            <>
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
                    {!getSupabase() && (
                      <div className={`mt-4 p-3 rounded-xl border text-[10px] leading-relaxed ${
                        isDarkMode ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-200/60' : 'bg-yellow-50 border-yellow-200 text-yellow-700'
                      }`}>
                        <div className="flex items-center gap-2 mb-1 font-bold uppercase tracking-wider">
                          <AlertTriangle className="w-3 h-3" />
                          Backend Not Linked
                        </div>
                        Your knowledge base is currently stored locally in your browser. To sync across devices, please configure Supabase in the Secrets panel.
                      </div>
                    )}
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
            </>
          ) : (
            <div className="space-y-4">
              {isBookmarksLoading ? (
                <div className="space-y-4 px-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className={`h-24 w-full rounded-xl animate-pulse ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'}`} />
                  ))}
                </div>
              ) : bookmarks.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12 space-y-4">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'}`}>
                    <Bookmark className={`w-8 h-8 ${isDarkMode ? 'text-white/20' : 'text-gray-300'}`} />
                  </div>
                  <div className="space-y-2">
                    <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>No bookmarks yet</p>
                    <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-white/40' : 'text-gray-500'}`}>
                      Click the bookmark icon on any page or highlight text to save sections for later.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {bookmarks.sort((a, b) => b.createdAt - a.createdAt).map(bookmark => (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      key={bookmark.id}
                      onClick={() => jumpToBookmark(bookmark)}
                      className={`group relative p-3 rounded-xl border cursor-pointer transition-all hover:scale-[1.02] ${
                        isDarkMode 
                          ? 'bg-white/5 border-white/10 hover:bg-white/10' 
                          : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-lg ${isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                            {bookmark.text ? <StickyNote className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                          </div>
                          <span className={`text-[10px] font-bold tracking-widest uppercase flex items-center gap-1.5 ${isDarkMode ? 'text-white/40' : 'text-gray-400'}`}>
                            {bookmark.text ? <StickyNote className="w-2.5 h-2.5" /> : <Bookmark className="w-2.5 h-2.5 fill-current text-blue-400" />}
                            Page {bookmark.pageNumber}
                            {bookmarks.some(b => b.fileName === bookmark.fileName && b.pageNumber === bookmark.pageNumber && !b.text) && (
                              <span className="w-1 h-1 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.5)]" title="Page is bookmarked" />
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              editBookmarkNote(bookmark);
                            }}
                            className="p-1 hover:text-blue-500 transition-all"
                            title="Edit Note"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteBookmark(bookmark.id);
                            }}
                            className="p-1 hover:text-red-500 transition-all"
                            title="Delete Bookmark"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      
                      <p className={`text-xs font-medium line-clamp-1 mb-1 ${isDarkMode ? 'text-white/80' : 'text-gray-700'}`}>
                        {bookmark.fileName}
                      </p>
                      
                      {bookmark.text && (
                        <p className={`text-[11px] line-clamp-2 italic border-l-2 pl-2 overflow-hidden text-ellipsis ${isDarkMode ? 'text-white/40 border-white/10' : 'text-gray-500 border-gray-200'}`}>
                          "{bookmark.text.length > 120 ? bookmark.text.substring(0, 120) + '...' : bookmark.text}"
                        </p>
                      )}

                      {bookmark.note && (
                        <p className={`text-[11px] font-medium mt-2 p-2 rounded-lg ${isDarkMode ? 'bg-blue-500/10 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
                          {bookmark.note}
                        </p>
                      )}
                      
                      <div className="mt-2 flex items-center justify-between">
                        <span className={`text-[9px] ${isDarkMode ? 'text-white/20' : 'text-gray-400'}`}>
                          {new Date(bookmark.createdAt).toLocaleDateString()}
                        </span>
                        <ChevronRight className={`w-3 h-3 transition-transform group-hover:translate-x-1 ${isDarkMode ? 'text-white/20' : 'text-gray-300'}`} />
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
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
                  placeholder="What do you want to learn? (e.g. Photosynthesis)"
                  value={newTopic.tag_name}
                  onChange={e => setNewTopic(prev => ({ ...prev, tag_name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleAddTopic()}
                  className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none focus:border-blue-500/50 ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                />
                <p className={`text-[10px] px-1 ${isDarkMode ? 'text-white/40' : 'text-gray-500'}`}>
                  AI will automatically categorize and refine the topic name.
                </p>
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
        <header className={`h-16 border-b ${isDarkMode ? 'border-white/5 bg-[#0A0A0A]/80' : 'border-gray-200 bg-white/80'} flex items-center justify-between px-6 backdrop-blur-md z-10 shrink-0`}>
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {pdfFiles.length === 0 ? (
              <div className={`flex items-center gap-2 text-sm ${isDarkMode ? 'text-white/40' : 'text-gray-400'}`}>
                <BookOpen className="w-4 h-4" />
                <span>No document loaded</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
                {pdfFiles.map((file, idx) => (
                  <div 
                    key={idx}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer group shrink-0 ${
                      activeFileIndex === idx 
                        ? (isDarkMode ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-blue-50 text-blue-600 border border-blue-100')
                        : (isDarkMode ? 'text-white/40 hover:text-white/60 hover:bg-white/5' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50')
                    }`}
                    onClick={() => {
                      if (activeFileIndex !== idx) {
                        setActiveFileIndex(idx);
                        setCurrentPage(1);
                        setJumpToPage(undefined);
                      }
                    }}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span className="max-w-[100px] truncate">{file.name}</span>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        closeDocument(idx);
                      }}
                      className="p-0.5 rounded-md hover:bg-black/10 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-1 ml-2">
                  <label className={`flex items-center justify-center p-1.5 rounded-lg border border-dashed transition-all cursor-pointer ${isDarkMode ? 'border-white/10 text-white/20 hover:text-white/40 hover:border-white/20' : 'border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300'}`} title="Add more files">
                    <Plus className="w-4 h-4" />
                    <input type="file" accept="application/pdf" multiple className="hidden" onChange={handleFileChange} />
                  </label>
                  <button 
                    onClick={clearAllDocuments}
                    className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-red-500/10 text-white/20 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-600'}`}
                    title="Clear all documents"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 ml-4 shrink-0">
            {pdfFiles.length > 0 && (
              <>
                <div className="flex items-center gap-2 mr-2">
                  <button 
                    onClick={() => {
                      const prevPage = Math.max(1, currentPage - 1);
                      setJumpToPage(prevPage);
                    }}
                    disabled={currentPage <= 1}
                    className={`p-1 rounded-md transition-colors ${isDarkMode ? 'hover:bg-white/10 text-white/40 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'} disabled:opacity-20 disabled:cursor-not-allowed`}
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  
                  <div className="flex items-center gap-1.5">
                    <input 
                      type="text"
                      inputMode="numeric"
                      value={pageInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d+$/.test(val)) {
                          setPageInput(val);
                        }
                      }}
                      onBlur={() => {
                        const val = parseInt(pageInput);
                        if (!isNaN(val)) {
                          const targetPage = Math.max(1, Math.min(numPages, val));
                          setJumpToPage(targetPage);
                        } else {
                          setPageInput(currentPage.toString());
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = parseInt(pageInput);
                          if (!isNaN(val)) {
                            const targetPage = Math.max(1, Math.min(numPages, val));
                            setJumpToPage(targetPage);
                          }
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      className={`w-12 px-2 py-1 text-center text-xs rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                    />
                    <span className={`text-[10px] font-medium ${isDarkMode ? 'text-white/40' : 'text-gray-400'}`}>
                      / {numPages}
                    </span>
                  </div>

                  <button 
                    onClick={() => {
                      const nextPage = Math.min(numPages, currentPage + 1);
                      setJumpToPage(nextPage);
                    }}
                    disabled={currentPage >= numPages}
                    className={`p-1 rounded-md transition-colors ${isDarkMode ? 'hover:bg-white/10 text-white/40 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'} disabled:opacity-20 disabled:cursor-not-allowed`}
                    title="Next Page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

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
                </div>
              </>
            )}
            
            <button 
              onClick={toggleFocusMode}
              className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/5 text-white/40 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'} transition-colors`}
              title={isLeftCollapsed && isRightCollapsed ? "Exit Focus Mode" : "Focus Mode (Collapse All)"}
            >
              {isLeftCollapsed && isRightCollapsed ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
            
            <button 
              onClick={handleWorthIt}
              disabled={pdfFiles.length === 0 || isAiLoading}
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
                  <button 
                    onClick={() => handleAction('Bookmark Selection')}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/5 text-xs font-medium transition-colors group"
                  >
                    <Bookmark className="w-3.5 h-3.5 text-yellow-400 group-hover:scale-110 transition-transform" />
                    Bookmark
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
            {pdfFiles.length === 0 ? (
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
                      <h3 className="text-2xl font-semibold tracking-tight">Upload Lecture PDFs</h3>
                      <p className="text-white/40 text-sm leading-relaxed">
                        Drag and drop your study materials here. OmniRead will analyze them against your Knowledge Base.
                      </p>
                    </div>

                    <div className="flex flex-col gap-3">
                      <label className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white text-black font-semibold hover:bg-white/90 transition-all active:scale-[0.98] cursor-pointer">
                        <Upload className="w-4 h-4" />
                        Choose Files
                        <input type="file" accept="application/pdf" multiple className="hidden" onChange={handleFileChange} />
                      </label>
                      <p className="text-[10px] text-white/20 uppercase tracking-widest font-medium">
                        Supports multiple PDFs up to 50MB each
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
                <div 
                  className={`flex-1 overflow-auto ${isDarkMode ? 'bg-[#1A1A1A]' : 'bg-gray-100'}`}
                  onMouseUp={handleTextSelection}
                  onMouseDown={(e) => {
                    // Only clear if we're not clicking on the action bar
                    if (!(e.target as HTMLElement).closest('.action-bar')) {
                      clearSelection();
                    }
                  }}
                >
                  <PDFViewer 
                    ref={pdfViewerRef}
                    file={pdfFiles[activeFileIndex]} 
                    scale={scale}
                    isDarkMode={isDarkMode}
                    onDocumentLoad={(pages) => setNumPages(pages)} 
                    onPageChange={(page) => setCurrentPage(page)}
                    jumpToPage={jumpToPage}
                    bookmarks={bookmarks.filter(b => b.fileName === pdfFiles[activeFileIndex]?.name && !b.text).map(b => b.pageNumber)}
                    onToggleBookmark={toggleBookmark}
                  />
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

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
                    p: ({ children }) => <p className="mb-4 last:mb-0 leading-relaxed">{children}</p>,
                    code: ({ children }) => (
                      <code className={`px-1.5 py-0.5 rounded font-mono text-xs ${isDarkMode ? 'bg-white/10 text-blue-300' : 'bg-gray-200 text-blue-700'}`}>
                        {children}
                      </code>
                    ),
                    pre: ({ children }) => (
                      <pre className={`p-4 rounded-xl font-mono text-xs overflow-x-auto my-4 border ${isDarkMode ? 'bg-black/40 border-white/10' : 'bg-gray-50 border-gray-200'}`}>
                        {children}
                      </pre>
                    ),
                    ul: ({ children }) => <ul className="list-disc pl-5 mb-4 space-y-2">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 mb-4 space-y-2">{children}</ol>,
                    li: ({ children }) => <li className="text-sm">{children}</li>,
                    h1: ({ children }) => <h1 className="text-lg font-bold mb-4 mt-6 first:mt-0">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-md font-bold mb-3 mt-5 first:mt-0">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-bold mb-2 mt-4 first:mt-0">{children}</h3>,
                    blockquote: ({ children }) => (
                      <blockquote className={`border-l-4 pl-4 py-1 italic mb-4 ${isDarkMode ? 'border-white/20 text-white/60' : 'border-gray-300 text-gray-500'}`}>
                        {children}
                      </blockquote>
                    ),
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

      {/* --- Bookmark Note Modal --- */}
      <AnimatePresence>
        {showNoteModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNoteModal(false)}
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
                  <StickyNote className="w-5 h-5 text-yellow-500" />
                  <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {editingBookmarkId ? 'Edit Bookmark Note' : 'Add Note to Bookmark'}
                  </h2>
                </div>
                <button 
                  onClick={() => setShowNoteModal(false)}
                  className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white/40 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                {pendingBookmarkText && (
                  <div className={`p-3 rounded-xl border italic text-xs ${isDarkMode ? 'bg-white/5 border-white/10 text-white/40' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                    "{pendingBookmarkText.slice(0, 150)}{pendingBookmarkText.length > 150 ? '...' : ''}"
                  </div>
                )}
                <div className="space-y-2">
                  <label className={`text-[10px] font-bold uppercase tracking-widest ${isDarkMode ? 'text-white/40' : 'text-gray-400'}`}>
                    Your Note (Optional)
                  </label>
                  <textarea 
                    autoFocus
                    value={bookmarkNote}
                    onChange={(e) => setBookmarkNote(e.target.value)}
                    placeholder="Add a thought or reminder..."
                    className={`w-full px-4 py-3 text-sm rounded-xl border focus:outline-none focus:border-blue-500/50 transition-colors h-24 resize-none ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setShowNoteModal(false)}
                    className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white/40' : 'hover:bg-gray-100 text-gray-500'}`}
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={confirmSelectionBookmark}
                    className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20"
                  >
                    {editingBookmarkId ? 'Update Bookmark' : 'Save Bookmark'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
