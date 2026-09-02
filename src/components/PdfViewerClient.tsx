"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  Share2,
  Check,
  Sparkles,
  Bot,
  MessageSquare,
  FileText,
  RotateCw,
  Bookmark,
  CornerDownRight,
  Shield,
  User,
  RefreshCw,
  X,
  Copy
} from "lucide-react";
import { FormattedText } from "./FormattedText";
import PullStringThemeSwitch from "./PullStringThemeSwitch";
import Loader from "./Loader";
import Logo from "./Logo";

interface PdfData {
  id: string;
  filename: string;
  status: "PROCESSING" | "READY" | "FAILED";
  summary: string | null;
  createdAt: string;
  extractedText: string | null;
}

interface CommentData {
  id: string;
  content: string;
  pageNumber?: number | null;
  parentId?: string | null;
  createdAt: string;
  authorId?: string | null;
  author: { name: string; id: string } | null;
  guestName: string | null;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface PdfViewerClientProps {
  pdf: PdfData;
  initialComments?: CommentData[];
  initialChatMessages?: ChatMessage[];
  isOwner: boolean;
  shareToken?: string;
  viewUrl: string;
}

export default function PdfViewerClient({
  pdf,
  initialComments = [],
  initialChatMessages = [],
  isOwner,
  shareToken,
  viewUrl,
}: PdfViewerClientProps) {
  const [activeTab, setActiveTab] = useState<"summary" | "chat" | "comments">("summary");
  const [summary, setSummary] = useState(pdf.summary);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(pdf.status);

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(initialChatMessages);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");

  // Comments State
  const [comments, setComments] = useState<CommentData[]>(initialComments);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [commentPage, setCommentPage] = useState<number | "">("");
  const [pageFilter, setPageFilter] = useState<number | "all">("all");
  const [replyingTo, setReplyingTo] = useState<{ id: string; authorName: string } | null>(null);
  const [guestName, setGuestName] = useState("");
  const [isPosting, setIsPosting] = useState(false);

  // Active page target in PDF viewer iframe
  const [targetPage, setTargetPage] = useState<number | null>(null);

  // Sharing State
  const [isSharing, setIsSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [reprocessStatus, setReprocessStatus] = useState<string | null>(null);

  // Mobile Responsiveness State
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [viewerEngine, setViewerEngine] = useState<"google" | "native" | "reader">("native");

  // On mobile devices, default to Google Docs viewer to avoid Android Chrome iframe PDF block
  useEffect(() => {
    if (typeof window !== "undefined") {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        setViewerEngine("google");
      }
    }
  }, []);

  // Estimate total pages from extracted text or chunk data for page selector
  const estimatedPages = useMemo(() => {
    if (!pdf.extractedText) return 15;
    const matches = pdf.extractedText.match(/--- PAGE \d+ ---/g);
    return matches ? Math.max(matches.length, 5) : 30;
  }, [pdf.extractedText]);

  // Generate dynamic viewer URL with page jump support
  const viewerUrl = useMemo(() => {
    if (!viewUrl) return "";
    const separator = viewUrl.includes("#") ? "&" : "#";
    const pageParam = targetPage ? `page=${targetPage}&` : "";
    return `${viewUrl}${separator}${pageParam}toolbar=1&navpanes=0`;
  }, [viewUrl, targetPage]);

  // Embedded web viewer URL (Google Docs viewer renders PDF canvas on all mobile browsers)
  const googleDocsViewerUrl = useMemo(() => {
    if (!viewUrl) return "";
    return `https://docs.google.com/viewer?url=${encodeURIComponent(viewUrl)}&embedded=true`;
  }, [viewUrl]);

  const activeViewerUrl = viewerEngine === "google" ? googleDocsViewerUrl : viewerUrl;

  // Contextual suggestion chips for AI Chat
  const suggestionChips = [
    "What are the main risks outlined in this document?",
    "Summarize the key metrics and deadlines",
    "What are the core technical requirements?",
    "Extract all action items or conclusions",
  ];

  // Initialize session ID for conversational memory
  useEffect(() => {
    let sid = sessionStorage.getItem(`chat_session_${pdf.id}`);
    if (!sid) {
      sid = "sess_" + Math.random().toString(36).substring(2, 11);
      sessionStorage.setItem(`chat_session_${pdf.id}`, sid);
    }
    setSessionId(sid);
  }, [pdf.id]);

  // Periodic polling for background ingestion/status updates
  useEffect(() => {
    if (currentStatus !== "PROCESSING") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/pdfs/${pdf.id}`);
        if (res.ok) {
          const data = await res.json();
          setCurrentStatus(data.status);
          if (data.summary) setSummary(data.summary);
          if (data.status === "READY" || data.status === "FAILED") {
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [currentStatus, pdf.id]);

  // Polling comments when comments tab is open
  const fetchComments = useCallback(async () => {
    try {
      const url = `/api/pdfs/${pdf.id}/comments${shareToken ? `?shareToken=${shareToken}` : ""}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
        if (data.ownerId) setOwnerId(data.ownerId);
      }
    } catch (err) {
      console.error("Error fetching comments:", err);
    }
  }, [pdf.id, shareToken]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    if (activeTab !== "comments") return;
    const interval = setInterval(fetchComments, 5000);
    return () => clearInterval(interval);
  }, [activeTab, fetchComments]);

  // Robust clipboard copy with fallback to execCommand
  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (clipboardErr) {
      console.warn("navigator.clipboard failed, attempting fallback:", clipboardErr);
    }

    // Fallback to hidden textarea execCommand
    try {
      const input = document.createElement("textarea");
      input.value = text;
      input.style.position = "fixed";
      input.style.left = "-9999px";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.focus();
      input.select();
      const success = document.execCommand("copy");
      document.body.removeChild(input);
      return success;
    } catch (fallbackErr) {
      console.error("Fallback copy failed:", fallbackErr);
      return false;
    }
  };

  // Handle Share button click
  const handleShareClick = async () => {
    try {
      setIsSharing(true);
      let targetUrl = "";

      if (shareToken) {
        // If already viewing a shared link, re-share the active URL
        targetUrl = window.location.href;
      } else {
        const res = await fetch(`/api/pdfs/${pdf.id}/share`, {
          method: "POST",
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to create share link");
        }

        const data = await res.json();
        const token = data.token || data.shareToken;

        if (!token) {
          throw new Error("Invalid share token received from server");
        }

        targetUrl = `${window.location.origin}/shared/${token}`;
      }

      setShareUrl(targetUrl);
      setShowShareModal(true);

      const didCopy = await copyToClipboard(targetUrl);
      if (didCopy) {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }
    } catch (err: any) {
      console.error("Share error:", err);
      alert(err.message || "Failed to generate share link");
    } finally {
      setIsSharing(false);
    }
  };

  // Reprocess PDF with multimodal OCR pipeline
  const handleReprocessOcr = async () => {
    if (isReprocessing) return;
    try {
      setIsReprocessing(true);
      setReprocessStatus("Scanning images...");
      const res = await fetch(`/api/pdfs/${pdf.id}/reprocess`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to reprocess PDF");
      }
      setReprocessStatus(`Scanned ${data.ocrPages?.length || 0} pages! Reloading...`);
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (err: any) {
      console.error("Reprocess error:", err);
      setReprocessStatus("Error: " + (err.message || "Failed to scan"));
      setTimeout(() => setReprocessStatus(null), 3500);
    } finally {
      setIsReprocessing(false);
    }
  };

  // Regenerate Summary
  const handleRegenerateSummary = async () => {
    try {
      setIsRegenerating(true);
      const url = `/api/pdfs/${pdf.id}/summary${shareToken ? `?shareToken=${shareToken}` : ""}`;
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) throw new Error("Failed to regenerate summary");
      const data = await res.json();
      setSummary(data.pdf?.summary || data.summary);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to regenerate summary");
    } finally {
      setIsRegenerating(false);
    }
  };

  // Post Comment or Threaded Reply
  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || isPosting) return;

    try {
      setIsPosting(true);
      const url = `/api/pdfs/${pdf.id}/comments${shareToken ? `?shareToken=${shareToken}` : ""}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newComment.trim(),
          pageNumber: replyingTo ? null : (commentPage === "" ? null : commentPage),
          parentId: replyingTo ? replyingTo.id : null,
          guestName: !isOwner && guestName.trim() ? guestName.trim() : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to post comment");
      }

      const posted = await res.json();
      setComments((prev) => [...prev, posted]);
      setNewComment("");
      setReplyingTo(null);

      if (commentPage !== "") {
        setPageFilter(commentPage);
      }
    } catch (e: any) {
      console.error("Error posting comment:", e);
      alert(e.message || "Failed to post comment");
    } finally {
      setIsPosting(false);
    }
  };

  // Execute Chat Message with Real-Time Streaming
  const executeChatMessage = async (text: string) => {
    if (!text.trim() || !sessionId || isChatting) return;

    const userMessage = text.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsChatting(true);

    try {
      const url = `/api/pdfs/${pdf.id}/chat${shareToken ? `?shareToken=${shareToken}` : ""}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, sessionId }),
      });

      if (!res.ok) throw new Error("Failed to send chat message");

      // Add initial empty assistant bubble for live typing effect
      setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const reader = res.body?.getReader();
      if (!reader) {
        const responseText = await res.text();
        setChatMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: responseText };
          return updated;
        });
        return;
      }

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        accumulated += decoder.decode(value, { stream: true });

        setChatMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: accumulated };
          return updated;
        });
      }
    } catch (e) {
      console.error(e);
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error analyzing the document. Please try again.",
        },
      ]);
    } finally {
      setIsChatting(false);
    }
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeChatMessage(chatInput);
  };

  // Group comments into root comments and replies
  const { rootComments, replyMap, pageCommentCounts } = useMemo(() => {
    const roots: CommentData[] = [];
    const replies: Record<string, CommentData[]> = {};
    const pageCounts: Record<number, number> = {};

    for (const c of comments) {
      if (c.pageNumber) {
        pageCounts[c.pageNumber] = (pageCounts[c.pageNumber] || 0) + 1;
      }
      if (c.parentId) {
        if (!replies[c.parentId]) replies[c.parentId] = [];
        replies[c.parentId].push(c);
      } else {
        roots.push(c);
      }
    }

    return { rootComments: roots, replyMap: replies, pageCommentCounts: pageCounts };
  }, [comments]);

  // Filter root comments based on active page filter
  const filteredRootComments = useMemo(() => {
    if (pageFilter === "all") return rootComments;
    return rootComments.filter((c) => c.pageNumber === pageFilter);
  }, [rootComments, pageFilter]);

  const uniqueCommentPages = useMemo(() => {
    return Object.keys(pageCommentCounts)
      .map(Number)
      .sort((a, b) => a - b);
  }, [pageCommentCounts]);

  return (
    <div className="relative flex h-screen flex-col bg-[var(--bg-main)] text-[var(--text-main)] font-sans transition-colors duration-300 overflow-hidden">
      {/* Ambient background glow accents (matching Dashboard) */}
      <div className="sylven-ambient-glow -top-32 -left-32 h-80 w-80 md:h-96 md:w-96 bg-[#80e9ff] dark:bg-[#80e9ff]/10 pointer-events-none z-0" />
      <div className="sylven-ambient-glow -top-20 -right-20 h-80 w-80 md:h-[450px] md:w-[450px] bg-[#d4ff3a] dark:bg-[#d4ff3a]/10 pointer-events-none z-0" />

      {/* Hanging Pull-String Theme Switch (fixed top-right anchor, hides when mobile drawer is open) */}
      <div className={`fixed top-0 right-2 sm:right-6 md:right-10 z-[40] transition-opacity duration-200 ${isMobileSidebarOpen ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
        <PullStringThemeSwitch stringLength={36} />
      </div>

      {/* Top Studio Navigation Header */}
      <header className="flex h-16 w-full items-center justify-between border-b border-[var(--border-main)] bg-[var(--surface-header)] px-2 sm:px-6 backdrop-blur-md z-20">
        
        {/* Left: Dashboard Button */}
        <div className="flex items-center shrink-0 w-[45px] sm:w-[150px]">
          <Link
            href="/"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-[var(--border-main)] bg-[var(--surface-card)] h-10 w-10 sm:h-auto sm:w-auto sm:px-3 sm:py-1.5 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] transition-all shadow-sm"
          >
            <ArrowLeft className="h-5 w-5 sm:h-3.5 sm:w-3.5" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
        </div>

        {/* Center: Logo & File Name */}
        <div className="flex flex-1 items-center justify-center gap-1.5 sm:gap-2.5 min-w-0 px-2">
          <div className="shrink-0 flex items-center justify-center">
            <Logo size={24} />
          </div>
          <h1 className="max-w-[100px] sm:max-w-xs md:max-w-md truncate text-xs sm:text-sm font-bold tracking-tight text-[var(--text-main)]">
            {pdf.filename}
          </h1>
          <span className="shrink-0 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-mono font-bold text-emerald-600 dark:text-[#d4ff3a]">
            {currentStatus}
          </span>
          {!isOwner && (
            <span className="hidden sm:inline shrink-0 rounded-full bg-[var(--surface-subtle)] border border-[var(--border-main)] px-2 py-0.5 text-[10px] font-mono font-medium text-[var(--text-muted)]">
              Shared View
            </span>
          )}
        </div>

        {/* Right Actions (padded on right so pull-string bulb never overlaps) */}
        <div className="flex items-center justify-end gap-1.5 sm:gap-3 shrink-0 pr-16 sm:pr-18 md:pr-20">
          {reprocessStatus && (
            <span className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 text-[11px] font-mono text-cyan-600 dark:text-cyan-400">
              <RefreshCw className="h-3 w-3 animate-spin" />
              {reprocessStatus}
            </span>
          )}

          {isOwner && (
            <button
              onClick={handleReprocessOcr}
              disabled={isReprocessing}
              title="Re-Scan Images"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--border-main)] bg-[var(--surface-card)] h-10 w-10 sm:h-auto sm:w-auto sm:px-3.5 sm:py-2 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--surface-subtle)] shadow-sm transition-all disabled:opacity-50"
            >
              <RefreshCw className={`h-5 w-5 sm:h-4 sm:w-4 ${isReprocessing ? "animate-spin text-cyan-500" : ""}`} />
              <span className="hidden sm:inline">
                {isReprocessing ? "Scanning images..." : "Re-Scan Images"}
              </span>
            </button>
          )}

          <a
            href={viewUrl}
            download={pdf.filename}
            target="_blank"
            rel="noopener noreferrer"
            title="Download"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--border-main)] bg-[var(--surface-card)] h-10 w-10 sm:h-auto sm:w-auto sm:px-3.5 sm:py-2 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--surface-subtle)] shadow-sm transition-all"
          >
            <Download className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Download</span>
          </a>

          <button
            onClick={handleShareClick}
            disabled={isSharing}
            title="Share"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-action)] h-10 w-10 sm:h-auto sm:w-auto sm:px-4 sm:py-2 text-xs font-semibold text-[var(--accent-action-text)] hover:opacity-90 shadow-sm transition-all disabled:opacity-50"
          >
            {copied ? <Check className="h-5 w-5 sm:h-4 sm:w-4" /> : <Share2 className="h-5 w-5 sm:h-4 sm:w-4" />}
            <span className="hidden sm:inline">{isSharing ? "Generating..." : copied ? "Copied!" : isOwner ? "Share" : "Copy"}</span>
          </button>
        </div>
      </header>

      {/* Main Workspace (Split View) */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left: PDF Document Viewer & Mobile Multi-Engine Switcher */}
        <div className="flex-1 bg-[var(--surface-subtle)] p-1 sm:p-3 flex flex-col w-full min-h-0 overflow-hidden">
          <div className="flex-1 w-full rounded-2xl bg-[var(--surface-card)] shadow-xl ring-1 ring-[var(--border-main)] relative overflow-hidden flex flex-col">
            
            {/* Viewer Toolbar: Engine / Mode Toggle */}
            <div className="flex items-center justify-between border-b border-[var(--border-main)] bg-[var(--surface-subtle)]/70 px-2 sm:px-4 py-1.5 text-xs">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setViewerEngine("google")}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    viewerEngine === "google"
                      ? "bg-[var(--accent-action)] text-[var(--accent-action-text)] shadow-xs"
                      : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  }`}
                  title="Mobile-compatible web document viewer"
                >
                  Web Preview
                </button>
                <button
                  onClick={() => setViewerEngine("native")}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    viewerEngine === "native"
                      ? "bg-[var(--accent-action)] text-[var(--accent-action-text)] shadow-xs"
                      : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  }`}
                  title="Direct PDF view"
                >
                  Native PDF
                </button>
                {pdf.extractedText && (
                  <button
                    onClick={() => setViewerEngine("reader")}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                      viewerEngine === "reader"
                        ? "bg-[var(--accent-action)] text-[var(--accent-action-text)] shadow-xs"
                        : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                    }`}
                    title="Slide-by-slide text reading mode"
                  >
                    Text Reader
                  </button>
                )}
              </div>

              {/* Direct Open in New Window Link */}
              {viewUrl && (
                <a
                  href={viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-main)] bg-[var(--surface-card)] px-2 py-1 text-[10px] font-mono font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
                  title="Open PDF directly in a new browser tab"
                >
                  <span>Open Full PDF</span>
                  <CornerDownRight className="h-2.5 w-2.5" />
                </a>
              )}
            </div>

            {/* Document Body: Reader Mode or Embedded Iframe */}
            {viewerEngine === "reader" && pdf.extractedText ? (
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-4xl mx-auto w-full">
                <div className="rounded-xl border border-[var(--border-main)] bg-[var(--surface-subtle)] p-3 text-xs font-mono text-[var(--text-muted)] flex items-center gap-2">
                  <FileText className="h-4 w-4 text-emerald-500 dark:text-[#d4ff3a]" />
                  <span>Reader Mode — Clean, mobile-friendly text breakdown by slide/page</span>
                </div>
                <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--surface-card)] p-4 sm:p-6">
                  <FormattedText content={pdf.extractedText} />
                </div>
              </div>
            ) : (
              <iframe
                src={activeViewerUrl}
                className="w-full h-full border-0 flex-1 bg-white"
                title={pdf.filename}
                allow="fullscreen"
              />
            )}
          </div>
        </div>

        {/* Floating Action Button (Mobile Only) */}
        <button
          onClick={() => setIsMobileSidebarOpen(true)}
          className="lg:hidden absolute bottom-6 right-6 z-30 flex h-14 items-center gap-2 rounded-full bg-[var(--accent-action)] px-5 text-sm font-semibold text-[var(--accent-action-text)] shadow-xl hover:opacity-90 active:scale-95 transition-all"
        >
          <Bot className="h-5 w-5" />
          <span>AI Tools</span>
        </button>

        {/* Mobile Backdrop Overlay */}
        {isMobileSidebarOpen && (
          <div 
            className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}

        {/* Right: AI & Collaboration Sidebar */}
        <aside 
          className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm sm:max-w-[420px] lg:w-[450px] flex-col border-l border-[var(--border-main)] bg-[var(--surface-card)] shadow-2xl backdrop-blur-md transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
            isMobileSidebarOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {/* Mobile Header (Close Button) */}
          <div className="flex lg:hidden items-center justify-between border-b border-[var(--border-main)] p-3 bg-[var(--surface-subtle)]">
            <span className="font-bold text-[var(--text-main)] flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-[#d4ff3a]" /> AI Tools
            </span>
            <button
              onClick={() => setIsMobileSidebarOpen(false)}
              className="rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-card)] hover:text-[var(--text-main)] transition-colors border border-[var(--border-main)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Segmented Modern Studio Tabs */}
          <div className="flex border-b border-[var(--border-main)] p-2 gap-1.5 bg-[var(--surface-subtle)]">
            <button
              onClick={() => setActiveTab("summary")}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-all ${
                activeTab === "summary"
                  ? "bg-[var(--accent-action)] text-[var(--accent-action-text)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-card)]"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Summary</span>
            </button>
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-all ${
                activeTab === "chat"
                  ? "bg-[var(--accent-action)] text-[var(--accent-action-text)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-card)]"
              }`}
            >
              <Bot className="h-3.5 w-3.5" />
              <span>AI Chat</span>
            </button>
            <button
              onClick={() => setActiveTab("comments")}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-all ${
                activeTab === "comments"
                  ? "bg-[var(--accent-action)] text-[var(--accent-action-text)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-card)]"
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Comments</span>
              {comments.length > 0 && (
                <span className="ml-1 rounded-full bg-[var(--surface-subtle)] border border-[var(--border-main)] px-1.5 py-0.2 text-[10px] font-mono font-bold text-[var(--text-main)]">
                  {comments.length}
                </span>
              )}
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {/* 1. Summary Tab */}
            {activeTab === "summary" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-200/80 pb-3 dark:border-zinc-800/80">
                  <div>
                    <h3 className="text-sm font-bold tracking-tight text-zinc-900 dark:text-white uppercase">
                      Executive Summary
                    </h3>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 font-mono">
                      Overview and key highlights from this document
                    </p>
                  </div>
                  <button
                    onClick={handleRegenerateSummary}
                    disabled={isRegenerating}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-all disabled:opacity-50"
                  >
                    {isRegenerating ? (
                      <Loader size="xs" />
                    ) : (
                      <RotateCw className="h-3 w-3" />
                    )}
                    <span>{isRegenerating ? "Generating..." : "Regenerate"}</span>
                  </button>
                </div>

                {isRegenerating ? (
                  <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800/80 dark:bg-zinc-950/50 flex flex-col items-center justify-center shadow-sm">
                    <Loader size="md" label="Generating document summary..." />
                  </div>
                ) : summary ? (
                  <div className="py-1">
                    <FormattedText content={summary} />
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-950/30 flex flex-col items-center justify-center">
                    {currentStatus === "PROCESSING" ? (
                      <Loader size="md" label="Analyzing document and generating summary..." />
                    ) : (
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        No summary available for this file.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 2. AI Chat Tab */}
            {activeTab === "chat" && (
              <div className="flex h-full flex-col justify-between">
                <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-4">
                  {chatMessages.length === 0 && (
                    <div className="space-y-4 py-4">
                      <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center dark:border-zinc-800/80 dark:bg-zinc-950/60 shadow-sm">
                        <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-900 text-white text-xs font-black dark:bg-[#d4ff3a] dark:text-zinc-950 mb-2">
                          <Bot className="h-4 w-4" />
                        </div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white">
                          Document Intelligence
                        </h4>
                        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                          Ask questions, get explanations, or find specific details from this document.
                        </p>
                      </div>

                      <div>
                        <span className="text-[11px] font-mono font-medium text-zinc-600 dark:text-zinc-400 block mb-2">
                          Suggested questions:
                        </span>
                        <div className="flex flex-col gap-1.5">
                          {suggestionChips.map((chip, idx) => (
                            <button
                              key={`chip-${idx}-${chip.slice(0, 10)}`}
                              onClick={() => executeChatMessage(chip)}
                              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 hover:border-zinc-900 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-[#d4ff3a] dark:hover:text-[#d4ff3a] transition-all text-left flex items-start gap-2 shadow-xs"
                            >
                              <span className="text-zinc-400 font-mono">›</span>
                              <span>{chip}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Chat Messages */}
                  {chatMessages.map((msg, i) => (
                    <div
                      key={`msg-${i}-${msg.role}`}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`rounded-2xl px-4 py-3 text-xs sm:text-sm max-w-[90%] leading-relaxed shadow-sm ${
                          msg.role === "user"
                            ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 rounded-br-none font-medium"
                            : "bg-white border border-zinc-200 text-zinc-900 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 rounded-bl-none shadow-sm"
                        }`}
                      >
                        {msg.role === "assistant" && (
                          <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 dark:text-[#d4ff3a]">
                            <Sparkles className="h-3 w-3" />
                            <span>AI Assistant</span>
                          </div>
                        )}
                        {msg.role === "assistant" ? (
                          msg.content ? (
                            <FormattedText content={msg.content} />
                          ) : (
                            <div className="flex items-center gap-3 py-1.5 text-zinc-500 dark:text-zinc-400 font-mono text-xs">
                              <Loader size="xs" />
                              <span>Generating answer...</span>
                            </div>
                          )
                        ) : (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Thinking state (before stream starts) */}
                  {isChatting && chatMessages[chatMessages.length - 1]?.role !== "assistant" && (
                    <div className="flex justify-start">
                      <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 flex items-center gap-3 font-mono shadow-sm">
                        <Loader size="xs" />
                        <span>Searching document for answers...</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Glassmorphic Chat Input Bar */}
                <form onSubmit={handleChatSubmit} className="pt-2">
                  <div className="container_chat_bot">
                    <div className="container-chat-options">
                      <div className="chat">
                        <div className="chat-bot">
                          <textarea
                            id="chat_bot"
                            name="chat_bot"
                            placeholder="Ask a question about this document... ✦˚"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                if (chatInput.trim() && !isChatting) {
                                  handleChatSubmit(e as any);
                                }
                              }
                            }}
                            disabled={isChatting}
                            rows={2}
                            className="chat-bot-textarea"
                            required
                          />
                        </div>
                        <div className="chat-options-row">
                          <div className="btns-add flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[var(--text-muted)] px-2.5 py-1 rounded-full bg-[var(--surface-subtle)] border border-[var(--border-main)]/60">
                              <Sparkles className="h-2.5 w-2.5 text-emerald-500 dark:text-[#d4ff3a]" />
                              <span>Document Context</span>
                            </span>
                          </div>
                          <button
                            type="submit"
                            disabled={isChatting || !chatInput.trim()}
                            className="btn-submit-glass"
                            title="Send prompt (Enter)"
                          >
                            <svg viewBox="0 0 512 512" width="15" height="15" className="translate-x-[1px]">
                              <path
                                fill="currentColor"
                                d="M473 39.05a24 24 0 0 0-25.5-5.46L47.47 185h-.08a24 24 0 0 0 1 45.16l.41.13l137.3 58.63a16 16 0 0 0 15.54-3.59L422 80a7.07 7.07 0 0 1 10 10L226.66 310.26a16 16 0 0 0-3.59 15.54l58.65 137.38c.06.2.12.38.19.57c3.2 9.27 11.3 15.81 21.09 16.25h1a24.63 24.63 0 0 0 23-15.46L478.39 64.62A24 24 0 0 0 473 39.05"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Quick Tags / Suggested Prompts */}
                    <div className="tags-container">
                      <button
                        type="button"
                        onClick={() => executeChatMessage("Summarize the key metrics, risks, and deadlines in this document.")}
                        className="tag-pill"
                      >
                        <span>✦ Key Metrics</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => executeChatMessage("What are the core technical specifications and requirements?")}
                        className="tag-pill"
                      >
                        <span>✦ Tech Specs</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => executeChatMessage("Extract all action items, decisions, or executive conclusions.")}
                        className="tag-pill"
                      >
                        <span>✦ Action Items</span>
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}

            {/* 3. Comments Tab */}
            {activeTab === "comments" && (
              <div className="flex h-full flex-col justify-between">
                {/* Header & Page Filter */}
                <div className="border-b border-[var(--border-main)] pb-2.5 mb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-main)]">
                      Collaboration Notes ({comments.length})
                    </span>
                    <button
                      onClick={fetchComments}
                      className="text-[11px] font-mono text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors flex items-center gap-1"
                      title="Sync comments"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Sync</span>
                    </button>
                  </div>

                  {/* Filter by Page */}
                  {uniqueCommentPages.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto pb-1 text-xs">
                      <span className="text-zinc-400 text-[10px] font-mono uppercase font-bold mr-1">Filter:</span>
                      <button
                        onClick={() => setPageFilter("all")}
                        className={`px-2 py-0.5 rounded-lg text-xs font-mono font-semibold transition-colors ${
                          pageFilter === "all"
                            ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950"
                            : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        All ({comments.length})
                      </button>
                      {uniqueCommentPages.map((pg) => (
                        <button
                          key={pg}
                          onClick={() => setPageFilter(pg)}
                          className={`px-2 py-0.5 rounded-lg text-xs font-mono font-semibold transition-colors ${
                            pageFilter === pg
                              ? "bg-zinc-900 text-white dark:bg-[#d4ff3a] dark:text-zinc-950"
                              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}
                        >
                          Pg {pg} ({pageCommentCounts[pg]})
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Comments List with Threading */}
                <div className="flex-1 overflow-y-auto space-y-3 pb-3 pr-1">
                  {filteredRootComments.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-zinc-200 p-8 text-center bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-950/50">
                      <MessageSquare className="h-8 w-8 mx-auto text-zinc-400 mb-2" />
                      <p className="text-xs text-zinc-700 dark:text-zinc-300 font-semibold">
                        {pageFilter === "all"
                          ? "No comments yet. Start a discussion on this document."
                          : `No comments on Page ${pageFilter}.`}
                      </p>
                      <p className="text-[11px] text-zinc-500 font-mono mt-1">
                        Team members and reviewers can leave page-specific notes or feedback.
                      </p>
                    </div>
                  ) : (
                    filteredRootComments.map((c) => {
                      const replies = replyMap[c.id] || [];
                      const isPdfOwner = c.authorId && ownerId && c.authorId === ownerId;
                      const isRegisteredUser = c.author && !isPdfOwner;

                      return (
                        <div
                          key={c.id}
                          className="app-card rounded-2xl p-3.5 text-xs shadow-sm space-y-2"
                        >
                          {/* Comment Header */}
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-[var(--text-main)]">
                                {c.author?.name || c.guestName || "Anonymous"}
                              </span>

                              {/* Role Badges */}
                              {isPdfOwner ? (
                                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.2 text-[9px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 dark:bg-[#d4ff3a]/10 dark:text-[#d4ff3a]">
                                  <Shield className="h-2.5 w-2.5" />
                                  Owner
                                </span>
                              ) : isRegisteredUser ? (
                                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.2 text-[9px] font-mono font-bold uppercase bg-blue-500/10 text-blue-600 border border-blue-500/20">
                                  <User className="h-2.5 w-2.5" />
                                  Team
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.2 text-[9px] font-mono font-bold uppercase bg-[var(--surface-subtle)] text-[var(--text-muted)] border border-[var(--border-main)]">
                                  Guest
                                </span>
                              )}
                            </div>

                            <span className="text-[10px] font-mono text-[var(--text-muted)]">
                              {new Date(c.createdAt).toLocaleDateString()}
                            </span>
                          </div>

                          {/* Page association badge */}
                          {c.pageNumber && (
                            <button
                              onClick={() => setTargetPage(c.pageNumber!)}
                              className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-mono font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
                              title={`Jump viewer to Page ${c.pageNumber}`}
                            >
                              <Bookmark className="h-3 w-3" />
                              <span>Slide / Page {c.pageNumber}</span>
                            </button>
                          )}

                          {/* Comment Content */}
                          <p className="text-[var(--text-main)] whitespace-pre-wrap leading-relaxed">
                            {c.content}
                          </p>

                          {/* Action Bar */}
                          <div className="flex justify-between items-center pt-1 border-t border-[var(--border-main)]">
                            <span className="text-[10px] font-mono text-[var(--text-muted)]">
                              {replies.length > 0 ? `${replies.length} replies` : ""}
                            </span>
                            <button
                              onClick={() =>
                                setReplyingTo({
                                  id: c.id,
                                  authorName: c.author?.name || c.guestName || "User",
                                })
                              }
                              className="text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors flex items-center gap-1"
                            >
                              <CornerDownRight className="h-3 w-3" />
                              <span>Reply</span>
                            </button>
                          </div>

                          {/* Nested Replies */}
                          {replies.length > 0 && (
                            <div className="ml-3 pl-3 border-l-2 border-[var(--border-main)] space-y-2 pt-1 mt-1">
                              {replies.map((reply) => {
                                const isReplyOwner = reply.authorId && ownerId && reply.authorId === ownerId;
                                return (
                                  <div key={reply.id} className="bg-[var(--surface-subtle)] rounded-xl p-2.5 text-xs space-y-1">
                                    <div className="flex justify-between items-center">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-[var(--text-main)] text-[11px]">
                                          {reply.author?.name || reply.guestName || "Anonymous"}
                                        </span>
                                        {isReplyOwner && (
                                          <span className="rounded px-1 text-[8px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-600 dark:text-[#d4ff3a]">
                                            Owner
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-[9px] font-mono text-[var(--text-muted)]">
                                        {new Date(reply.createdAt).toLocaleDateString()}
                                      </span>
                                    </div>
                                    <p className="text-[var(--text-main)] whitespace-pre-wrap text-xs">
                                      {reply.content}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Comment Posting Form */}
                <form onSubmit={handlePostComment} className="border-t border-[var(--border-main)] pt-3 space-y-2">
                  {/* Replying banner */}
                  {replyingTo && (
                    <div className="flex items-center justify-between rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-main)] px-3 py-1 text-xs text-[var(--text-main)]">
                      <span>Replying to <strong>{replyingTo.authorName}</strong></span>
                      <button
                        type="button"
                        onClick={() => setReplyingTo(null)}
                        className="text-[var(--text-muted)] hover:text-[var(--text-main)] font-bold ml-2"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}

                  {/* Guest Name input if not authenticated */}
                  {!isOwner && (
                    <input
                      type="text"
                      placeholder="Your name or team role (e.g. Alex - Intern)"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border-main)] bg-[var(--surface-subtle)] px-3 py-2 text-xs text-[var(--text-main)] placeholder-[var(--text-muted)] focus:border-[var(--accent-action)] focus:outline-none"
                      required
                    />
                  )}

                  {/* Glassmorphic Comment Input Box */}
                  <div className="container_chat_bot">
                    <div className="container-chat-options">
                      <div className="chat">
                        <div className="chat-bot">
                          <textarea
                            id="comment_bot"
                            name="comment_bot"
                            placeholder={
                              replyingTo
                                ? `Reply to ${replyingTo.authorName}... ✦˚`
                                : commentPage
                                ? `Add note on Page ${commentPage}... ✦˚`
                                : "Add a comment or suggestion... ✦˚"
                            }
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                if (newComment.trim() && !isPosting) {
                                  handlePostComment(e as any);
                                }
                              }
                            }}
                            rows={2}
                            className="chat-bot-textarea"
                            required
                          />
                        </div>
                        <div className="chat-options-row">
                          <div className="btns-add flex items-center gap-1.5">
                            {!replyingTo ? (
                              <div className="flex items-center gap-1 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-main)] px-2.5 py-1 text-xs text-[var(--text-muted)] hover:border-[var(--accent-action)] transition-colors">
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="13"
                                  height="13"
                                  viewBox="0 0 24 24"
                                  className="text-emerald-500 dark:text-[#d4ff3a] shrink-0"
                                >
                                  <path
                                    fill="none"
                                    stroke="currentColor"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M7 8v8a5 5 0 1 0 10 0V6.5a3.5 3.5 0 1 0-7 0V15a2 2 0 0 0 4 0V8"
                                  />
                                </svg>
                                <select
                                  value={commentPage === "" ? "" : commentPage}
                                  onChange={(e) =>
                                    setCommentPage(e.target.value === "" ? "" : parseInt(e.target.value, 10))
                                  }
                                  className="bg-transparent text-xs font-mono text-[var(--text-main)] focus:outline-none cursor-pointer pr-1"
                                >
                                  <option value="">General Document Note</option>
                                  {Array.from({ length: Math.min(estimatedPages, 100) }, (_, i) => i + 1).map((pg) => (
                                    <option key={pg} value={pg}>
                                      Page / Slide {pg}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <span className="text-[11px] font-mono text-[var(--text-muted)] flex items-center gap-1">
                                <CornerDownRight className="h-3 w-3" /> Thread reply
                              </span>
                            )}
                          </div>

                          <button
                            type="submit"
                            disabled={isPosting || !newComment.trim()}
                            className="btn-submit-glass"
                            title={isPosting ? "Posting..." : replyingTo ? "Post Reply" : "Post Comment"}
                          >
                            <svg viewBox="0 0 512 512" width="15" height="15" className="translate-x-[1px]">
                              <path
                                fill="currentColor"
                                d="M473 39.05a24 24 0 0 0-25.5-5.46L47.47 185h-.08a24 24 0 0 0 1 45.16l.41.13l137.3 58.63a16 16 0 0 0 15.54-3.59L422 80a7.07 7.07 0 0 1 10 10L226.66 310.26a16 16 0 0 0-3.59 15.54l58.65 137.38c.06.2.12.38.19.57c3.2 9.27 11.3 15.81 21.09 16.25h1a24.63 24.63 0 0 0 23-15.46L478.39 64.62A24 24 0 0 0 473 39.05"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Status / Tags below comments box */}
                    <div className="tags-container justify-between">
                      <span className="text-[10px] font-mono text-[var(--text-muted)] flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-[#d4ff3a] animate-pulse" />
                        Syncs live across collaborators
                      </span>
                      {commentPage !== "" && (
                        <button
                          type="button"
                          onClick={() => setCommentPage("")}
                          className="tag-pill text-[10px] py-0.5 px-2"
                        >
                          Reset to General Note
                        </button>
                      )}
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Share Link Modal with Selectable URL and Manual Copy */}
      {showShareModal && shareUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="app-card w-full max-w-md rounded-2xl p-6 space-y-4 shadow-2xl relative border border-[var(--border-main)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-[var(--surface-subtle)] p-2.5 text-[var(--text-main)] border border-[var(--border-main)]">
                  <Share2 className="h-5 w-5 text-emerald-500 dark:text-[#d4ff3a]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-main)] uppercase tracking-tight">
                    Share Document
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)] font-mono">
                    Public Collaboration Link
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowShareModal(false)}
                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-subtle)] transition-colors"
                title="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Anyone with this link can view the document, read the AI summary, and contribute comments without needing to create an account.
            </p>

            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                Shareable URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="w-full rounded-xl border border-[var(--border-main)] bg-[var(--surface-subtle)] px-3.5 py-2.5 text-xs font-mono text-[var(--text-main)] focus:border-[var(--accent-action)] focus:outline-none"
                />
                <button
                  onClick={async () => {
                    const didCopy = await copyToClipboard(shareUrl);
                    if (didCopy) {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 3000);
                    }
                  }}
                  className="shrink-0 rounded-xl bg-[var(--accent-action)] px-4 py-2.5 text-xs font-semibold text-[var(--accent-action-text)] hover:opacity-90 shadow-sm transition-all flex items-center gap-1.5"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? "Copied!" : "Copy"}</span>
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-between items-center border-t border-[var(--border-main)]">
              <span className="text-[10px] font-mono text-[var(--text-muted)]">
                {copied ? "Link copied to clipboard!" : "Click text to select all"}
              </span>
              <button
                onClick={() => setShowShareModal(false)}
                className="rounded-xl border border-[var(--border-main)] bg-[var(--surface-subtle)] px-4 py-2 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--surface-card)] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
