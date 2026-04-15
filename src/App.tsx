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
  Type,
  Quote,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Palette,
  Eye,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Maximize,
  Minimize,
  Trash2,
  Moon,
  Sun,
  Zap,
  Cloud,
  Leaf,
  Snowflake,
  Square,
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

// --- Helper Functions ---
const normalizeString = (s: string) => s.toLowerCase().trim().replace(/[^\w\s]/g, '');

const getContrastColor = (hex: string) => {
  if (!hex || !hex.startsWith('#')) return '#ffffff';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 128) ? '#111827' : '#ffffff';
};

const isSmartMatch = (s1: string, s2: string) => {
  const n1 = normalizeString(s1);
  const n2 = normalizeString(s2);
  
  if (n1 === n2) return true;
  if (n1.length > 3 && n2.length > 3 && (n1.includes(n2) || n2.includes(n1))) return true;
  
  const checkPlural = (a: string, b: string) => {
    const sa = a.endsWith('s') ? a.slice(0, -1) : a;
    const sb = b.endsWith('s') ? b.slice(0, -1) : b;
    if (sa === sb && sa.length > 3) return true;

    const esa = a.endsWith('es') ? a.slice(0, -2) : a;
    const esb = b.endsWith('es') ? b.slice(0, -2) : b;
    if (esa === esb && esa.length > 3) return true;

    const iesa = a.endsWith('ies') ? a.slice(0, -3) + 'y' : a;
    const iesb = b.endsWith('ies') ? b.slice(0, -3) + 'y' : b;
    if (iesa === iesb && iesa.length > 3) return true;
    
    return false;
  };

  return checkPlural(n1, n2);
};

const isDuplicateTag = (newName: string, existingTags: KnowledgeTag[]) => {
  return existingTags.some(t => isSmartMatch(newName, t.tag_name));
};

export default function App() {
  const [isDragging, setIsDragging] = useState(false);
  const [knowledgeTags, setKnowledgeTags] = useState<KnowledgeTag[]>(() => {
    const saved = localStorage.getItem('omniread_knowledge');
    return saved ? JSON.parse(saved) : [];
  });
  const [isKbLoading, setIsKbLoading] = useState(true);
  const [showAddTopic, setShowAddTopic] = useState(false);
  const [newTopic, setNewTopic] = useState({ category: '', tag_name: '' });
  const [selectedBookmarkForView, setSelectedBookmarkForView] = useState<BookmarkItem | null>(null);
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
  const [theme, setTheme] = useState<'light' | 'dark' | 'sepia' | 'midnight' | 'ocean' | 'forest' | 'nord' | 'custom'>(() => {
    return (localStorage.getItem('omniread_theme') as any) || 'dark';
  });
  const [customBgColor, setCustomBgColor] = useState(() => {
    return localStorage.getItem('omniread_custom_bg') || '#ffffff';
  });

  const isDarkMode = theme === 'dark' || theme === 'midnight' || theme === 'ocean' || theme === 'forest' || theme === 'nord' || (theme === 'custom' && getContrastColor(customBgColor) === '#ffffff');
  const isSepiaMode = theme === 'sepia';
  const isLightMode = theme === 'light';

  const [accentColor, setAccentColor] = useState(() => {
    return localStorage.getItem('omniread_accent_color') || '#3b82f6';
  });
  const [currentPdfTopics, setCurrentPdfTopics] = useState<string[]>([]);
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

  useEffect(() => {
    localStorage.setItem('omniread_accent_color', accentColor);
    document.documentElement.style.setProperty('--accent-color', accentColor);
    
    // Simple heuristic for foreground color (white or black)
    const r = parseInt(accentColor.slice(1, 3), 16);
    const g = parseInt(accentColor.slice(3, 5), 16);
    const b = parseInt(accentColor.slice(5, 7), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    document.documentElement.style.setProperty('--accent-foreground', brightness > 128 ? '#000000' : '#ffffff');
  }, [accentColor]);

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

  const handleBookmarkClick = (bookmark: BookmarkItem) => {
    setSelectedBookmarkForView(bookmark);
  };

  const jumpToBookmark = (bookmark: BookmarkItem) => {
    const fileIndex = pdfFiles.findIndex(f => f.name === bookmark.fileName);
    if (fileIndex !== -1) {
      setActiveFileIndex(fileIndex);
      setJumpToPage(bookmark.pageNumber);
      setSelectedBookmarkForView(null);
    } else {
      toast.error(`Please upload "${bookmark.fileName}" to jump to this page.`);
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

  useEffect(() => {
    setCurrentPdfTopics([]);
  }, [activeFileIndex, pdfFiles.length]);

  // Theme Effect
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'sepia', 'midnight', 'ocean', 'forest', 'nord');
    
    // Reset custom styles
    root.style.removeProperty('--bg-app');
    root.style.removeProperty('--bg-sidebar');
    root.style.removeProperty('--bg-card');
    root.style.removeProperty('--bg-input');
    root.style.removeProperty('--text-main');
    root.style.removeProperty('--text-muted');
    root.style.removeProperty('--border-main');
    root.style.removeProperty('--border-muted');

    if (theme !== 'custom') {
      root.classList.add(theme);
    } else {
      const text = getContrastColor(customBgColor);
      const isDark = text === '#ffffff';
      
      root.style.setProperty('--bg-app', customBgColor);
      root.style.setProperty('--bg-sidebar', customBgColor);
      root.style.setProperty('--text-main', text);
      
      if (isDark) {
        root.style.setProperty('--bg-card', 'rgba(255, 255, 255, 0.05)');
        root.style.setProperty('--bg-input', 'rgba(255, 255, 255, 0.03)');
        root.style.setProperty('--text-muted', 'rgba(255, 255, 255, 0.5)');
        root.style.setProperty('--border-main', 'rgba(255, 255, 255, 0.1)');
        root.style.setProperty('--border-muted', 'rgba(255, 255, 255, 0.05)');
        root.classList.add('dark'); // For tailwind dark: classes
      } else {
        root.style.setProperty('--bg-card', 'rgba(0, 0, 0, 0.02)');
        root.style.setProperty('--bg-input', 'rgba(0, 0, 0, 0.03)');
        root.style.setProperty('--text-muted', 'rgba(0, 0, 0, 0.5)');
        root.style.setProperty('--border-main', 'rgba(0, 0, 0, 0.1)');
        root.style.setProperty('--border-muted', 'rgba(0, 0, 0, 0.05)');
      }
      localStorage.setItem('omniread_custom_bg', customBgColor);
    }
    localStorage.setItem('omniread_theme', theme);
  }, [theme, customBgColor]);

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
    const isDuplicate = isDuplicateTag(tagNameInput, knowledgeTags);
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

      if (finalCategory === 'Nonsense' || finalTagName === 'None') {
        toast.error('This looks like nonsense. Topic not added.');
        return;
      }

      // Final Duplicate Check after AI refinement
      const isRefinedDuplicate = isDuplicateTag(finalTagName, knowledgeTags);
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
  const [isAiFullScreen, setIsAiFullScreen] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stopAiGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsAiLoading(false);
      toast.info("AI generation stopped.");
    }
  };
  const [customQuestion, setCustomQuestion] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, isAiLoading]);

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
    setSelectedText(text);
  };

  const clearSelection = () => {
    setSelectedText('');
    window.getSelection()?.removeAllRanges();
  };

  const handleAction = async (action: string) => {
    if (!selectedText) return;
    if (isAiLoading) {
      toast.error("Please wait for the current AI response to finish.");
      return;
    }

    setIsAiLoading(true);
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
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
              concept = await extractConcept(selectedText, signal);
            } catch (e) {
              if (e instanceof Error && e.name === 'AbortError') throw e;
              concept = { category: 'General', tag_name: selectedText.slice(0, 30) + (selectedText.length > 30 ? '...' : '') };
            }

            if (!concept || !concept.tag_name) throw new Error("Could not extract concept");
            
            if (concept.category === 'Nonsense' || concept.tag_name === 'None') {
              throw new Error("This looks like nonsense. Concept not saved.");
            }
            
            const tagName = concept.tag_name.trim();
            const isValidTopic = tagName.length >= 2 && /[a-zA-Z]/.test(tagName);
            
            if (!isValidTopic) {
              throw new Error("This doesn't look like a meaningful topic. Try selecting more context.");
            }

            const isDuplicate = isDuplicateTag(tagName, knowledgeTags);
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
          abortControllerRef.current = null;
        }
        return;
      default:
        setIsAiLoading(false);
        return;
    }

    try {
      const response = await generateAiResponse(prompt, undefined, signal);
      setChatHistory(prev => [...prev, { role: 'model', text: response }]);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      toast.error("AI failed to respond.");
    } finally {
      setIsAiLoading(false);
      setSelectedText('');
      abortControllerRef.current = null;
    }
  };

  useEffect(() => {
    setPageInput(currentPage.toString());
  }, [currentPage]);

   const handleWorthIt = async () => {
    if (!pdfViewerRef.current) return;
    if (isAiLoading) {
      toast.error("Please wait for the current AI response to finish.");
      return;
    }

    setIsAiLoading(true);
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setChatHistory(prev => [...prev, { role: 'user', text: "Is this PDF Worth It?" }]);

    try {
      const extractedText = await pdfViewerRef.current.extractText(5);
      const topics = await extractTopics(extractedText, signal);
      setCurrentPdfTopics(topics);
      
      const userTags = knowledgeTags.map(t => t.tag_name);
      
      if (userTags.length === 0) {
        setChatHistory(prev => [...prev, { role: 'model', text: "Your Knowledge Base is empty! I can't calculate overlap yet. Add some topics to your Knowledge Base first so I can tell you if this PDF is worth your time." }]);
        return;
      }

      const X = topics.length;
      if (X === 0) {
        setChatHistory(prev => [...prev, { role: 'model', text: "I couldn't identify any specific topics in this document to compare with your Knowledge Base. Try a different section!" }]);
        return;
      }

      const matchedTopics = topics.filter(topic => 
        userTags.some(tag => isSmartMatch(topic, tag))
      );
      
      const Y = matchedTopics.length;
      const overlapPercentage = Math.round((Y / X) * 100);

      let resultMsg = "";
      if (overlapPercentage >= 70) {
        resultMsg = `🛑 **NOT WORTH IT:** You already know ${overlapPercentage}% of these topics (e.g., ${matchedTopics.slice(0, 3).join(', ')}). Skim or skip this PDF. I've highlighted the topics in your Knowledge tab!`;
      } else if (overlapPercentage >= 30) {
        resultMsg = `⚠️ **MODERATE OVERLAP:** About ${overlapPercentage}% overlap. You know some of this (like ${matchedTopics.slice(0, 2).join(', ')}), but there's plenty of new ground to cover. Worth a focused read.`;
      } else {
        resultMsg = `✅ **WORTH IT:** Only ${overlapPercentage}% overlap with your Knowledge Base. This contains highly new information. Priority Reading! Check the Knowledge tab to see the new topics.`;
      }

      setChatHistory(prev => [...prev, { role: 'model', text: resultMsg }]);
      setLeftTab('knowledge');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error("Worth It error:", err);
      toast.error("Failed to calculate 'Worth It' status.");
    } finally {
      setIsAiLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCustomQuestion = async () => {
    if (!customQuestion.trim()) return;
    if (isAiLoading) {
      toast.error("Please wait for the current AI response to finish.");
      return;
    }
    
    const text = customQuestion;
    setCustomQuestion('');
    setIsAiLoading(true);
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setChatHistory(prev => [...prev, { role: 'user', text }]);

    try {
      const response = await generateAiResponse(text, undefined, signal);
      setChatHistory(prev => [...prev, { role: 'model', text: response }]);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      toast.error("AI failed to respond.");
    } finally {
      setIsAiLoading(false);
      abortControllerRef.current = null;
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
    <div className={`flex h-screen w-full bg-[var(--bg-app)] text-[var(--text-main)] font-sans selection:bg-accent/30 overflow-hidden transition-colors duration-300`}>
      
      {/* --- Left Panel: Knowledge Base Dashboard --- */}
      <aside 
        style={{ width: isLeftCollapsed ? 0 : leftWidth }}
        className={`relative border-r border-[var(--border-main)] bg-gradient-to-b from-[var(--bg-sidebar)] to-[var(--bg-app)] flex flex-col shrink-0 ${!isResizingLeft ? 'transition-[width] duration-300 ease-in-out' : ''} ${isLeftCollapsed ? 'overflow-hidden border-none' : ''}`}
      >
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-indigo-600 flex items-center justify-center shadow-lg shadow-accent/20">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <h1 className={`font-semibold text-lg tracking-tight whitespace-nowrap text-[var(--text-main)]`}>OmniRead AI</h1>
          </div>
          <button 
            onClick={() => setIsLeftCollapsed(true)}
            className={`p-1.5 rounded-md transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white/40 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'}`}
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 mb-4">
          <div className={`flex p-1 rounded-xl bg-[var(--bg-input)]`}>
            <button 
              onClick={() => setLeftTab('knowledge')}
              className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-lg transition-all ${
                leftTab === 'knowledge' 
                  ? `bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm` 
                  : `text-[var(--text-muted)] hover:text-[var(--text-main)]`
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
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]`} />
            <input 
              type="text" 
              placeholder="Search knowledge..." 
              className={`w-full border rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-accent/50 transition-colors bg-[var(--bg-input)] border-[var(--border-main)] text-[var(--text-main)]`}
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 space-y-6">
          {leftTab === 'knowledge' ? (
            <>
              {currentPdfTopics.length > 0 && (
                <div className={`mb-8 p-4 rounded-2xl border ${isDarkMode ? 'bg-white/[0.02] border-white/5' : 'bg-gray-50 border-gray-100'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-3.5 h-3.5 text-accent" />
                    <h3 className={`text-[11px] font-bold uppercase tracking-widest ${isDarkMode ? 'text-white/60' : 'text-gray-600'}`}>
                      Topics in this PDF
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {currentPdfTopics.map((topic, i) => {
                      const isKnown = knowledgeTags.some(tag => isSmartMatch(topic, tag.tag_name));
                      return (
                        <div 
                          key={i} 
                          className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all ${
                            isKnown 
                              ? (isDarkMode ? 'bg-accent/20 border-accent/30 text-accent' : 'bg-accent/10 border-accent/20 text-accent')
                              : (isDarkMode ? 'bg-white/5 border-white/10 text-white/40' : 'bg-gray-50 border-gray-200 text-gray-500')
                          }`}
                        >
                          {topic}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

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
                            className="h-full bg-accent"
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
                <div className="grid grid-cols-1 gap-3">
                  {bookmarks.sort((a, b) => b.createdAt - a.createdAt).map(bookmark => (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={bookmark.id}
                      onClick={() => handleBookmarkClick(bookmark)}
                      className={`group relative overflow-hidden rounded-2xl border cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] ${
                        isDarkMode 
                          ? 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/20' 
                          : 'bg-white border-gray-200 hover:border-accent/20 hover:shadow-lg hover:shadow-accent/5 shadow-sm'
                      }`}
                    >
                      {/* Accent Bar */}
                      <div className={`absolute top-0 left-0 w-1 h-full ${bookmark.text ? 'bg-accent' : 'bg-amber-500'}`} />
                      
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <div className={`p-1.5 rounded-lg ${
                                bookmark.text 
                                  ? (isDarkMode ? 'bg-accent/20 text-accent' : 'bg-accent/10 text-accent')
                                  : (isDarkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-50 text-amber-600')
                              }`}>
                                {bookmark.text ? <Type className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                              </div>
                              <span className={`text-[10px] font-bold tracking-widest uppercase ${isDarkMode ? 'text-white/40' : 'text-gray-400'}`}>
                                {bookmark.text ? 'Selection' : 'Page'} • {bookmark.pageNumber}
                              </span>
                            </div>
                            <h4 className={`text-[11px] font-bold truncate max-w-[160px] ${isDarkMode ? 'text-white/60' : 'text-gray-600'}`}>
                              {bookmark.fileName}
                            </h4>
                          </div>
                          
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                editBookmarkNote(bookmark);
                              }}
                              className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-white/10 text-white/40 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'}`}
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteBookmark(bookmark.id);
                              }}
                              className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-red-500/20 text-white/40 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-600'}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        
                        {bookmark.text && (
                          <div className={`relative mb-3 p-3 rounded-xl border text-[11px] leading-relaxed ${
                            isDarkMode 
                              ? 'bg-white/[0.02] border-white/5 text-white/50' 
                              : 'bg-gray-50 border-gray-100 text-gray-600'
                          }`}>
                            <Quote className={`absolute -top-2 -left-1 w-4 h-4 ${isDarkMode ? 'text-accent/40' : 'text-accent/20'}`} />
                            <span className="line-clamp-3 relative z-10">
                              {bookmark.text}
                            </span>
                          </div>
                        )}

                        {bookmark.note && (
                          <div className={`p-2.5 rounded-lg text-[11px] font-medium ${
                            isDarkMode ? 'bg-white/5 text-accent' : 'bg-accent/10 text-accent'
                          }`}>
                            {bookmark.note}
                          </div>
                        )}
                        
                        <div className="mt-3 pt-3 border-t border-dashed flex items-center justify-between opacity-60 group-hover:opacity-100 transition-opacity">
                          <span className={`text-[9px] font-medium ${isDarkMode ? 'text-white/20' : 'text-gray-400'}`}>
                            {new Date(bookmark.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          <div className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-accent' : 'text-accent'}`}>
                            View Details
                            <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                          </div>
                        </div>
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
                  className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none focus:border-accent/50 ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
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
                  className="flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-accent text-accent-foreground hover:opacity-90 transition-colors disabled:opacity-50"
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
                  ? 'border-white/10 text-white/40 hover:border-accent/50 hover:text-accent hover:bg-accent/5' 
                  : 'border-gray-300 text-gray-500 hover:border-accent/50 hover:text-accent hover:bg-accent/5'
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
          className="w-1 hover:w-1.5 bg-transparent hover:bg-accent/30 cursor-col-resize transition-all z-20"
        />
      )}

      {/* Left Expand Button */}
      {isLeftCollapsed && (
        <button 
          onClick={() => setIsLeftCollapsed(false)}
          className={`absolute left-4 top-4 z-30 p-2 bg-[var(--bg-card)] border-[var(--border-main)] text-[var(--text-muted)] border rounded-lg hover:text-accent transition-all shadow-xl`}
        >
          <PanelLeftOpen className="w-5 h-5" />
        </button>
      )}

      {/* --- Center Panel: PDF Dropzone / Viewer --- */}
      <main className={`flex-1 flex flex-col relative overflow-hidden bg-[var(--bg-app)]`}>
        <header className={`h-16 border-b border-[var(--border-main)] bg-[var(--bg-app)]/80 flex items-center justify-between px-6 backdrop-blur-md z-10 shrink-0`}>
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {pdfFiles.length === 0 ? (
              <div className={`flex items-center gap-2 text-sm text-[var(--text-muted)]`}>
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
                        ? (isDarkMode ? 'bg-accent/20 text-accent border border-accent/30' : 'bg-accent/10 text-accent border border-accent/20')
                        : (isDarkMode ? 'text-white/40 hover:text-white/60 hover:bg-white/5' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50')
                    }`}
                    onClick={() => {
                      if (activeFileIndex !== idx) {
                        setActiveFileIndex(idx);
                        setCurrentPage(1);
                        setJumpToPage(undefined);
                        setCurrentPdfTopics([]);
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
                      className={`w-12 px-2 py-1 text-center text-xs rounded-lg border focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
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
              <Sparkles className="w-4 h-4 text-accent" />
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
                className="action-bar absolute top-4 left-1/2 z-50 flex items-center gap-1 p-1.5 bg-[#1A1A1A]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/50"
              >
                <div className="flex items-center gap-1 border-r border-white/10 pr-1 mr-1">
                  <button 
                    onClick={() => handleAction('Summarize/Explain')}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/5 text-xs font-medium transition-colors group"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-accent group-hover:scale-110 transition-transform" />
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
                    className="p-2 rounded-xl hover:bg-white/5 text-white/40 hover:text-accent transition-colors"
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
                      <div className="absolute inset-0 bg-accent/20 blur-3xl rounded-full -z-0 opacity-50" />
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
                    className="w-full h-full border-2 border-dashed border-accent/50 rounded-3xl bg-accent/5 flex flex-col items-center justify-center space-y-4"
                  >
                    <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center shadow-lg shadow-accent/40">
                      <Plus className="w-8 h-8 text-white" />
                    </div>
                    <p className="text-accent font-medium text-lg">Drop to start reading</p>
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
                  className={`flex-1 overflow-auto bg-[var(--bg-app)]`}
                  onMouseUp={handleTextSelection}
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
          className="w-1 hover:w-1.5 bg-transparent hover:bg-accent/30 cursor-col-resize transition-all z-20"
        />
      )}

      {/* Right Expand Button */}
      {isRightCollapsed && (
        <button 
          onClick={() => setIsRightCollapsed(false)}
          className={`absolute right-4 top-4 z-30 p-2 bg-[var(--bg-card)] border-[var(--border-main)] text-[var(--text-muted)] border rounded-lg hover:text-accent transition-all shadow-xl`}
        >
          <PanelRightOpen className="w-5 h-5" />
        </button>
      )}

      {/* --- Right Panel: Sidebar Chat --- */}
      <aside 
        style={{ width: isRightCollapsed ? 0 : rightWidth }}
        className={`relative border-l border-[var(--border-main)] bg-gradient-to-b from-[var(--bg-sidebar)] to-[var(--bg-app)] flex flex-col shrink-0 ${!isResizingRight ? 'transition-[width] duration-300 ease-in-out' : ''} ${isRightCollapsed ? 'overflow-hidden border-none' : ''}`}
      >
        <header className={`p-6 border-b flex items-center justify-between border-[var(--border-main)]`}>
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-accent" />
            <h2 className={`font-semibold whitespace-nowrap text-[var(--text-main)]`}>Study Assistant</h2>
          </div>
          <div className="flex items-center gap-2">
            {!isAiFullScreen && (
              <button 
                onClick={() => setIsAiFullScreen(true)}
                className={`p-1.5 rounded-md transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white/40 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'}`}
                title="Enter Full Screen"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )}
            <button 
              onClick={() => setIsRightCollapsed(true)}
              className={`p-1.5 rounded-md transition-colors ${isDarkMode ? 'hover:bg-white/5 text-white/40 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'}`}
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          </div>
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
                    ? 'bg-accent text-accent-foreground rounded-tr-none' 
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
          <div ref={chatEndRef} />
        </div>

        <div className={`p-4 border-t border-[var(--border-main)]`}>
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
              className={`w-full border rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-accent/50 transition-colors resize-none h-24 bg-[var(--bg-input)] border-[var(--border-main)] text-[var(--text-main)]`}
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              {isAiLoading && (
                <button 
                  onClick={stopAiGeneration}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                  title="Stop generation"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span className="text-[10px] font-bold">Stop</span>
                </button>
              )}
              <button 
                onClick={handleCustomQuestion}
                disabled={isAiLoading || !customQuestion.trim()}
                className="p-1.5 rounded-lg bg-accent text-accent-foreground hover:opacity-90 transition-colors shadow-lg shadow-accent/20 disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <Toaster position="top-center" theme={isDarkMode ? 'dark' : 'light'} />

      {/* --- Bookmark Note Modal --- */}
      <AnimatePresence>
        {showNoteModal && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
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
              className={`relative w-full max-w-md border rounded-2xl shadow-2xl overflow-hidden bg-[var(--bg-card)] border-[var(--border-main)]`}
            >
              <div className={`p-6 border-b flex items-center justify-between border-[var(--border-main)]`}>
                <div className="flex items-center gap-3">
                  <StickyNote className="w-5 h-5 text-yellow-500" />
                  <h2 className={`text-lg font-semibold text-[var(--text-main)]`}>
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
                    className={`w-full px-4 py-3 text-sm rounded-xl border focus:outline-none focus:border-accent/50 transition-colors h-24 resize-none ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
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
                    className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl bg-accent text-accent-foreground hover:opacity-90 transition-all shadow-lg shadow-accent/20"
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
              className={`relative w-full max-w-2xl border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] bg-[var(--bg-card)] border-[var(--border-main)]`}
            >
              <div className={`p-6 border-b flex items-center justify-between border-[var(--border-main)]`}>
                <div className="flex items-center gap-3">
                  <History className="w-5 h-5 text-accent" />
                  <h2 className={`text-xl font-semibold text-[var(--text-main)]`}>Study History</h2>
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
                        <span className={`text-[10px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded ${msg.role === 'user' ? 'bg-accent/20 text-accent' : 'bg-purple-500/20 text-purple-400'}`}>
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
              className={`relative w-full max-w-md border rounded-2xl shadow-2xl overflow-hidden bg-[var(--bg-card)] border-[var(--border-main)]`}
            >
              <div className={`p-6 border-b flex items-center justify-between border-[var(--border-main)]`}>
                <div className="flex items-center gap-3">
                  <Settings className="w-5 h-5 text-accent" />
                  <h2 className={`text-xl font-semibold text-[var(--text-main)]`}>Settings</h2>
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
                  <h3 className={`text-sm font-medium ${isDarkMode ? 'text-white/40' : isSepiaMode ? 'text-[#5f4b32]/60' : 'text-gray-400'} uppercase tracking-wider`}>Appearance</h3>
                  
                  {/* Theme Selection */}
                  <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-white/5 border-white/10' : isSepiaMode ? 'bg-[#e8dfc4] border-[#433422]/10' : 'bg-gray-50 border-gray-200'} border space-y-3`}>
                    <div className="flex items-center gap-3 mb-1">
                      <Palette className="w-4 h-4 text-accent" />
                      <span className={`text-sm font-medium ${isDarkMode ? 'text-white' : isSepiaMode ? 'text-[#433422]' : 'text-gray-900'}`}>Theme</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { id: 'light', label: 'Light', icon: Sun, color: 'bg-white border-gray-200 text-gray-900' },
                        { id: 'dark', label: 'Dark', icon: Moon, color: 'bg-[#0A0A0A] border-white/10 text-white' },
                        { id: 'sepia', label: 'Sepia', icon: Eye, color: 'bg-[#f4ecd8] border-[#433422]/20 text-[#433422]' },
                        { id: 'midnight', label: 'Midnight', icon: Zap, color: 'bg-black border-white/5 text-white' },
                        { id: 'ocean', label: 'Ocean', icon: Cloud, color: 'bg-[#0f172a] border-white/10 text-white' },
                        { id: 'forest', label: 'Forest', icon: Leaf, color: 'bg-[#064e3b] border-white/10 text-white' },
                        { id: 'nord', label: 'Nord', icon: Snowflake, color: 'bg-[#2e3440] border-white/10 text-white' },
                        { id: 'custom', label: 'Custom', icon: Palette, color: 'bg-gradient-to-br from-pink-500 to-orange-500 border-white/10 text-white' }
                      ].map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setTheme(t.id as any)}
                          className={`flex flex-col items-center gap-2 p-2 rounded-xl border-2 transition-all ${
                            theme === t.id 
                              ? 'border-accent bg-accent/5' 
                              : `border-transparent ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-black/5'}`
                          }`}
                        >
                          <div className={`w-full aspect-square rounded-lg border ${t.color} flex items-center justify-center`}>
                            <t.icon className="w-4 h-4" />
                          </div>
                          <span className={`text-[8px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-white/60' : isSepiaMode ? 'text-[#433422]/60' : 'text-gray-500'} truncate w-full`}>
                            {t.label}
                          </span>
                        </button>
                      ))}
                    </div>

                    {theme === 'custom' && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="pt-2 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-medium ${isDarkMode ? 'text-white/60' : 'text-gray-500'}`}>Background Color</span>
                          <input 
                            type="color" 
                            value={customBgColor}
                            onChange={(e) => setCustomBgColor(e.target.value)}
                            className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-none"
                          />
                        </div>
                        <div className="flex gap-2">
                          {['#ffffff', '#f3f4f6', '#1a1a1a', '#000000', '#2d3436', '#2c3e50', '#1e272e', '#4834d4'].map(color => (
                            <button
                              key={color}
                              onClick={() => setCustomBgColor(color)}
                              className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${customBgColor === color ? 'border-accent' : 'border-transparent'}`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </div>

                  <div className={`space-y-3 p-4 rounded-xl ${isDarkMode ? 'bg-white/5 border-white/10' : isSepiaMode ? 'bg-[#e8dfc4] border-[#433422]/10' : 'bg-gray-50 border-gray-200'} border`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Sparkles className="w-4 h-4 text-accent" />
                        <span className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Accent Color</span>
                      </div>
                      <input 
                        type="color" 
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      {['#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#10b981', '#f59e0b'].map(color => (
                        <button
                          key={color}
                          onClick={() => setAccentColor(color)}
                          className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${accentColor === color ? 'border-white' : 'border-transparent'}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
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
                      <span className="text-sm">Clear All Study Data</span>
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
              className={`relative w-full max-w-sm bg-[var(--bg-card)] border-[var(--border-main)] border rounded-2xl shadow-2xl p-6 text-center`}
            >
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className={`text-lg font-semibold mb-2 text-[var(--text-main)]`}>Clear All Study Data?</h3>
              <p className={`text-sm text-[var(--text-muted)] mb-6`}>
                This action cannot be undone. All your chat history, bookmarks, and knowledge base tags will be permanently removed.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowClearConfirm(false)}
                  className={`flex-1 px-4 py-2 rounded-xl bg-[var(--bg-input)] hover:opacity-80 text-[var(--text-muted)] transition-colors font-medium`}
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    setChatHistory([]);
                    setBookmarks([]);
                    setKnowledgeTags([]);
                    setShowClearConfirm(false);
                    toast.success("All study data cleared successfully");
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

      {/* --- AI Full Screen Mode --- */}
      <AnimatePresence>
        {isAiFullScreen && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAiFullScreen(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className={`relative w-full max-w-5xl h-full flex flex-col border rounded-3xl shadow-2xl overflow-hidden bg-[var(--bg-card)] border-[var(--border-main)]`}
            >
              <header className={`p-6 border-b flex items-center justify-between ${isDarkMode ? 'border-white/5 bg-white/[0.02]' : 'border-gray-100 bg-gray-50/50'}`}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-accent/20 flex items-center justify-center">
                    <MessageSquare className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <h2 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Study Discussion</h2>
                    <p className={`text-xs font-medium ${isDarkMode ? 'text-white/40' : 'text-gray-500'}`}>Full Screen Mode</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setShowClearConfirm(true)}
                    className={`p-2.5 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-red-500/10 text-white/40 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-600'}`}
                    title="Clear History"
                  >
                    <History className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => setIsAiFullScreen(false)}
                    className={`p-2.5 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-white/10 text-white/40 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'}`}
                  >
                    <Minimize className="w-6 h-6" />
                  </button>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                {chatHistory.length === 0 && !isAiLoading && (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-6 max-w-md mx-auto">
                    <div className="w-20 h-20 rounded-3xl bg-accent/10 flex items-center justify-center">
                      <Sparkles className="w-10 h-10 text-accent animate-pulse" />
                    </div>
                    <div className="space-y-2">
                      <h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Deep Study Session</h3>
                      <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-white/40' : 'text-gray-500'}`}>
                        Ask complex questions, explore theories, or dive deep into your study materials in this focused environment.
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
                      className={`max-w-[85%] px-6 py-4 rounded-3xl text-base shadow-sm ${
                        msg.role === 'user' 
                          ? 'bg-blue-600 text-white rounded-tr-none' 
                          : `${isDarkMode ? 'bg-white/[0.03] text-white/90 border-white/10' : 'bg-gray-50 text-gray-800 border-gray-200'} border rounded-tl-none`
                      }`}
                    >
                      <ReactMarkdown 
                        remarkPlugins={[remarkMath]} 
                        rehypePlugins={[rehypeKatex]}
                        components={{
                          p: ({ children }) => <p className="mb-4 last:mb-0 leading-relaxed">{children}</p>,
                          code: ({ children }) => (
                            <code className={`px-1.5 py-0.5 rounded font-mono text-sm ${isDarkMode ? 'bg-white/10 text-blue-300' : 'bg-gray-200 text-blue-700'}`}>
                              {children}
                            </code>
                          ),
                          pre: ({ children }) => (
                            <pre className={`p-6 rounded-2xl font-mono text-sm overflow-x-auto my-6 border ${isDarkMode ? 'bg-black/40 border-white/10' : 'bg-gray-100 border-gray-200'}`}>
                              {children}
                            </pre>
                          ),
                          ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-3">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-3">{children}</ol>,
                          li: ({ children }) => <li className="text-base">{children}</li>,
                          h1: ({ children }) => <h1 className="text-2xl font-bold mb-6 mt-8 first:mt-0">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-xl font-bold mb-4 mt-6 first:mt-0">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-lg font-bold mb-3 mt-5 first:mt-0">{children}</h3>,
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                  </div>
                ))}

                {isAiLoading && (
                  <div className="flex items-start">
                    <div className={`px-6 py-4 rounded-3xl rounded-tl-none flex items-center gap-3 ${isDarkMode ? 'bg-white/5 border border-white/10' : 'bg-gray-50 border border-gray-200'}`}>
                      <div className="flex gap-1.5">
                        <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className={`text-xs font-bold uppercase tracking-widest ${isDarkMode ? 'text-white/40' : 'text-gray-400'}`}>AI is thinking...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className={`p-8 border-t ${isDarkMode ? 'border-white/5 bg-white/[0.01]' : 'border-gray-100 bg-gray-50/30'}`}>
                <div className="max-w-4xl mx-auto relative">
                  <textarea 
                    value={customQuestion}
                    onChange={(e) => setCustomQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleCustomQuestion();
                      }
                    }}
                    placeholder="Ask anything about the topic..."
                    className={`w-full pl-6 pr-16 py-4 rounded-2xl border focus:outline-none focus:border-blue-500/50 transition-all resize-none h-16 max-h-32 ${
                      isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900 shadow-sm'
                    }`}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    {isAiLoading && (
                      <button 
                        onClick={stopAiGeneration}
                        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                        title="Stop generation"
                      >
                        <Square className="w-4 h-4 fill-current" />
                        <span className="text-sm font-bold">Stop Output</span>
                      </button>
                    )}
                    <button 
                      onClick={handleCustomQuestion}
                      disabled={!customQuestion.trim() || isAiLoading}
                      className="p-3 rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20"
                    >
                      <Rocket className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedBookmarkForView && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedBookmarkForView(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className={`relative w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col bg-[var(--bg-card)] border-[var(--border-main)] border rounded-3xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)]`}
            >
              {/* Header */}
              <div className={`p-6 border-b flex items-center justify-between ${isDarkMode ? 'border-white/5 bg-white/[0.02]' : 'border-gray-100 bg-gray-50/50'}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                    selectedBookmarkForView.text 
                      ? (isDarkMode ? 'bg-accent/20 text-accent' : 'bg-accent/10 text-accent')
                      : (isDarkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-50 text-amber-600')
                  }`}>
                    {selectedBookmarkForView.text ? <StickyNote className="w-6 h-6" /> : <Bookmark className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      {selectedBookmarkForView.text ? 'Saved Selection' : 'Page Bookmark'}
                    </h3>
                    <p className={`text-xs font-medium ${isDarkMode ? 'text-white/40' : 'text-gray-500'}`}>
                      {selectedBookmarkForView.fileName} • Page {selectedBookmarkForView.pageNumber}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedBookmarkForView(null)}
                  className={`p-2 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-white/10 text-white/40 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                {selectedBookmarkForView.text && (
                  <div className="space-y-3">
                    <h4 className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isDarkMode ? 'text-white/20' : 'text-gray-400'}`}>
                      Selected Content
                    </h4>
                    <div className={`relative p-6 rounded-2xl border-l-4 text-sm leading-relaxed ${
                      isDarkMode 
                        ? 'bg-white/[0.03] border-accent/50 text-white/80' 
                        : 'bg-accent/5 border-accent/20 text-gray-700'
                    }`}>
                      <div className="absolute -top-3 -left-2 opacity-10">
                        <MessageSquare className="w-12 h-12" />
                      </div>
                      <p className="relative z-10 whitespace-pre-wrap italic">
                        "{selectedBookmarkForView.text}"
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isDarkMode ? 'text-white/20' : 'text-gray-400'}`}>
                      Personal Note
                    </h4>
                    <button 
                      onClick={() => editBookmarkNote(selectedBookmarkForView)}
                      className="text-[10px] font-bold text-accent hover:underline"
                    >
                      Edit Note
                    </button>
                  </div>
                  <div className={`p-6 rounded-2xl border min-h-[100px] ${
                    isDarkMode 
                      ? 'bg-white/[0.02] border-white/5 text-white/70' 
                      : 'bg-gray-50 border-gray-100 text-gray-600'
                  }`}>
                    {selectedBookmarkForView.note ? (
                      <p className="text-sm leading-relaxed">{selectedBookmarkForView.note}</p>
                    ) : (
                      <p className="text-sm italic opacity-40">No note added to this bookmark yet.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className={`p-6 border-t flex items-center justify-between ${isDarkMode ? 'border-white/5 bg-white/[0.02]' : 'border-gray-100 bg-gray-50/50'}`}>
                <span className={`text-[10px] font-medium ${isDarkMode ? 'text-white/20' : 'text-gray-400'}`}>
                  Saved on {new Date(selectedBookmarkForView.createdAt).toLocaleString()}
                </span>
                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      deleteBookmark(selectedBookmarkForView.id);
                      setSelectedBookmarkForView(null);
                    }}
                    className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors ${isDarkMode ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                  >
                    Delete
                  </button>
                  <button 
                    onClick={() => jumpToBookmark(selectedBookmarkForView)}
                    className="px-6 py-2 text-xs font-bold rounded-xl bg-accent text-accent-foreground hover:opacity-90 transition-all shadow-lg shadow-accent/20 flex items-center gap-2"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    Open Original File
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
