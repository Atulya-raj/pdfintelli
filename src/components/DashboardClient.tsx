"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  FileText,
  Sparkles,
  Search,
  Plus,
  Trash2,
  ArrowRight,
  Bookmark,
  AlertCircle,
  LogOut,
} from "lucide-react";
import UploadModal from "./UploadModal";
import PullStringThemeSwitch from "./PullStringThemeSwitch";
import Loader from "./Loader";
import Logo from "./Logo";

interface PdfItem {
  id: string;
  filename: string;
  status: "PROCESSING" | "READY" | "FAILED";
  summary: string | null;
  createdAt: string;
}

interface SemanticResult {
  id: string;
  pdfId: string;
  filename: string;
  pageNumber: number | null;
  similarityPercentage: number;
  snippet: string;
}

interface DashboardClientProps {
  initialPdfs: PdfItem[];
  userName: string;
}

export default function DashboardClient({
  initialPdfs,
  userName,
}: DashboardClientProps) {
  const [pdfs, setPdfs] = useState<PdfItem[]>(initialPdfs);
  const [search, setSearch] = useState("");
  const [searchMode, setSearchMode] = useState<"filename" | "semantic">("filename");
  const [semanticQuery, setSemanticQuery] = useState("");
  const [semanticResults, setSemanticResults] = useState<SemanticResult[]>([]);
  const [isSearchingSemantic, setIsSearchingSemantic] = useState(false);
  const [hasSearchedSemantic, setHasSearchedSemantic] = useState(false);
  const [lastSearchedQuery, setLastSearchedQuery] = useState("");

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [openingDocId, setOpeningDocId] = useState<string | null>(null);

  const popularSemanticChips = [
    "Executive summary",
    "Key project deadlines",
    "Budget & pricing details",
    "Key findings & conclusions",
  ];

  const fetchPdfs = useCallback(async () => {
    try {
      const res = await fetch(`/api/pdfs?search=${encodeURIComponent(search)}`);
      if (res.ok) {
        const data = await res.json();
        setPdfs(data.pdfs);
      }
    } catch (err) {
      console.error("Failed to load PDFs:", err);
    }
  }, [search]);

  useEffect(() => {
    fetchPdfs();
  }, [fetchPdfs]);

  // Polling for processing PDFs
  useEffect(() => {
    const hasProcessing = pdfs.some((p) => p.status === "PROCESSING");
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      fetchPdfs();
    }, 3000);

    return () => clearInterval(interval);
  }, [pdfs, fetchPdfs]);

  const handleSemanticSearch = async (queryToSearch?: string) => {
    const q = (queryToSearch !== undefined ? queryToSearch : semanticQuery).trim();
    if (!q) return;

    try {
      setIsSearchingSemantic(true);
      setHasSearchedSemantic(true);
      setLastSearchedQuery(q);
      const res = await fetch("/api/search/semantic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });

      if (res.ok) {
        const data = await res.json();
        setSemanticResults(data.results || []);
      }
    } catch (err) {
      console.error("Semantic search error:", err);
    } finally {
      setIsSearchingSemantic(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm("Are you sure you want to delete this PDF? This action cannot be undone.")) {
      return;
    }

    try {
      setIsDeleting(id);
      const res = await fetch(`/api/pdfs?id=${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setPdfs((prev) => prev.filter((p) => p.id !== id));
      } else {
        alert("Failed to delete PDF");
      }
    } catch (err) {
      console.error(err);
      alert("Error deleting PDF");
    } finally {
      setIsDeleting(null);
    }
  };

  const getStatusBadge = (status: PdfItem["status"]) => {
    switch (status) {
      case "READY":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-mono font-medium text-emerald-600 dark:bg-[#d4ff3a]/10 dark:text-[#d4ff3a] dark:border dark:border-[#d4ff3a]/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-[#d4ff3a] animate-pulse"></span>
            READY
          </span>
        );
      case "PROCESSING":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-mono font-medium text-amber-600 dark:text-amber-400 dark:border dark:border-amber-500/20">
            <Loader size="xs" variant="amber" />
            PROCESSING
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-mono font-medium text-rose-600 dark:text-rose-400 dark:border dark:border-rose-500/20">
            <AlertCircle className="h-3 w-3" />
            FAILED
          </span>
        );
    }
  };

  return (
    <div className="relative min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] transition-colors duration-300 overflow-x-hidden">
      {/* Ambient background glow accents */}
      <div className="sylven-ambient-glow -top-32 -left-32 h-80 w-80 md:h-96 md:w-96 bg-[#80e9ff] dark:bg-[#80e9ff]/10 pointer-events-none" />
      <div className="sylven-ambient-glow -top-20 -right-20 h-80 w-80 md:h-[450px] md:w-[450px] bg-[#d4ff3a] dark:bg-[#d4ff3a]/10 pointer-events-none" />

      {/* Hanging Pull-String Theme Switch (fixed at top-right, perfectly visible) */}
      <div className="fixed top-0 right-4 sm:right-8 md:right-12 z-50">
        <PullStringThemeSwitch stringLength={70} />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 md:px-8 lg:px-10">
        {/* Top Minimalist Header */}
        <header className="mb-8 md:mb-12 flex flex-col justify-between gap-4 border-b border-[var(--border-main)] pb-6 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3.5">
            <Logo size={40} />
            <div>
              <span className="font-extrabold tracking-tight text-lg sm:text-xl uppercase block">
                PDF Intelligence
              </span>
              <p className="text-xs text-[var(--text-muted)] font-mono">
                Document Workspace
              </p>
            </div>
          </div>

          {/* Right Action Bar */}
          <div className="flex items-center gap-3 pr-14 sm:pr-18">
            <button
              onClick={() => setIsUploadOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-action)] px-4 py-2.5 text-xs font-semibold text-[var(--accent-action-text)] shadow-sm hover:opacity-90 transition-all"
            >
              <Plus className="h-4 w-4" />
              <span>Upload Document</span>
            </button>
            <Link
              href="/signout"
              title="Sign Out"
              className="rounded-xl border border-[var(--border-main)] bg-[var(--surface-card)] p-2.5 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors shadow-sm"
            >
              <LogOut className="h-4 w-4" />
            </Link>
          </div>
        </header>

        {/* Hero Headline Section */}
        <section className="mb-10 md:mb-12">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 border-b border-[var(--border-main)] pb-8 md:pb-10">
            <div className="w-full max-w-3xl">
              <div className="flex items-center gap-2.5 text-xs font-mono font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
                <span>Active Workspace · {userName}</span>
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tighter leading-[1.08] uppercase">
                Document Intelligence
              </h1>
              <p className="mt-4 text-sm sm:text-base md:text-lg text-[var(--text-muted)] max-w-2xl font-normal leading-relaxed">
                Upload, search, and understand your PDFs with{" "}
                <span className="font-semibold text-[var(--text-main)] underline decoration-[var(--accent-lime)] underline-offset-4">
                  instant summaries
                </span>
                , smart search, and interactive chat.
              </p>
            </div>

            {/* Architecture Highlights */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:flex lg:flex-col gap-3 font-mono text-xs text-[var(--text-muted)] lg:border-l lg:border-[var(--border-main)] lg:pl-6 shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[var(--text-main)]">01)</span>
                <span>Smart Search</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-[var(--text-main)]">02)</span>
                <span>Instant Summaries</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-[var(--text-main)]">03)</span>
                <span>Interactive Chat</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-[var(--text-main)]">04)</span>
                <span>Page-by-Page Notes</span>
              </div>
            </div>
          </div>
        </section>

        {/* Search Controls & Mode Selector */}
        <section className="mb-10 space-y-4">
          <div className="app-card rounded-2xl p-4 sm:p-6 space-y-4">
            {/* Mode Switcher Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-main)] pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setSearchMode("filename")}
                  className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                    searchMode === "filename"
                      ? "bg-[var(--accent-action)] text-[var(--accent-action-text)] shadow-sm"
                      : "text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-main)]"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Filter by Filename</span>
                </button>
                <button
                  onClick={() => setSearchMode("semantic")}
                  className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                    searchMode === "semantic"
                      ? "bg-[var(--accent-action)] text-[var(--accent-action-text)] shadow-sm"
                      : "text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-main)]"
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 text-indigo-500 dark:text-[#d4ff3a]" />
                  <span>Search by Meaning</span>
                </button>
              </div>

              <div className="font-mono text-xs text-[var(--text-muted)]">
                {pdfs.length} {pdfs.length === 1 ? "document" : "documents"} indexed
              </div>
            </div>

            {/* Mode 1: Filename Filter */}
            {searchMode === "filename" ? (
              <div className="relative w-full max-w-xl">
                <input
                  type="text"
                  placeholder="Filter documents by filename..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-main)] bg-[var(--surface-subtle)] py-2.5 pl-10 pr-4 text-xs sm:text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] focus:border-[var(--accent-action)] focus:bg-[var(--surface-card)] focus:outline-none transition-all"
                />
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[var(--text-muted)]">
                  <Search className="h-4 w-4" />
                </div>
              </div>
            ) : (
              /* Mode 2: Semantic Content Search */
              <div className="space-y-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSemanticSearch();
                  }}
                  className="flex flex-col sm:flex-row gap-2 w-full max-w-3xl"
                >
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Ask a question or search for any concept across your documents..."
                      value={semanticQuery}
                      onChange={(e) => {
                        setSemanticQuery(e.target.value);
                        if (!e.target.value.trim()) {
                          setHasSearchedSemantic(false);
                          setSemanticResults([]);
                        }
                      }}
                      className="w-full rounded-xl border border-[var(--border-main)] bg-[var(--surface-subtle)] py-2.5 pl-10 pr-4 text-xs sm:text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] focus:border-[var(--accent-action)] focus:bg-[var(--surface-card)] focus:outline-none transition-all"
                    />
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[var(--text-muted)]">
                      <Sparkles className="h-4 w-4 text-indigo-500 dark:text-[#d4ff3a]" />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isSearchingSemantic || !semanticQuery.trim()}
                    className="rounded-xl bg-[var(--accent-action)] px-5 py-2.5 text-xs font-semibold text-[var(--accent-action-text)] hover:opacity-90 shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 shrink-0"
                  >
                    {isSearchingSemantic ? (
                      <>
                        <Loader size="xs" />
                        <span>Searching...</span>
                      </>
                    ) : (
                      <>
                        <Search className="h-3.5 w-3.5" />
                        <span>Search Content</span>
                      </>
                    )}
                  </button>
                </form>

                {/* Query Chips */}
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  <span className="text-[var(--text-muted)] font-mono text-[11px]">Suggestions:</span>
                  {popularSemanticChips.map((chip, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setSemanticQuery(chip);
                        handleSemanticSearch(chip);
                      }}
                      className="rounded-lg border border-[var(--border-main)] bg-[var(--surface-subtle)] px-2.5 py-1 text-xs text-[var(--text-muted)] hover:border-[var(--accent-action)] hover:text-[var(--text-main)] transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Semantic Results Section */}
        {searchMode === "semantic" && (isSearchingSemantic || hasSearchedSemantic) && (
          <section className="mb-12 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-main)] pb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-main)] flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#d4ff3a]" />
                <span>Search Results</span>
                {hasSearchedSemantic && !isSearchingSemantic && (
                  <span className="rounded-full bg-[var(--surface-subtle)] border border-[var(--border-main)] px-2 py-0.5 text-[11px] font-mono font-semibold text-[var(--text-main)]">
                    {semanticResults.length} found
                  </span>
                )}
              </h2>
            </div>

            {isSearchingSemantic ? (
              <div className="app-card rounded-2xl p-10 sm:p-12 text-center flex flex-col items-center justify-center">
                <Loader size="md" className="mb-3" />
                <p className="text-sm font-semibold text-[var(--text-main)]">
                  Searching across your documents...
                </p>
                <p className="text-xs text-[var(--text-muted)] font-mono mt-1">
                  Looking through all pages and sections
                </p>
              </div>
            ) : semanticResults.length === 0 ? (
              <div className="app-card rounded-2xl p-8 sm:p-10 text-center flex flex-col items-center justify-center max-w-xl mx-auto">
                <div className="rounded-2xl bg-[var(--surface-subtle)] p-3.5 text-[var(--text-main)] border border-[var(--border-main)] mb-3">
                  <Search className="h-6 w-6 text-[var(--text-muted)]" />
                </div>
                <h3 className="text-sm sm:text-base font-bold text-[var(--text-main)]">
                  No matching excerpts found for &ldquo;{lastSearchedQuery}&rdquo;
                </h3>
                <p className="mt-1 text-xs text-[var(--text-muted)] max-w-sm">
                  The topic you&apos;re searching for might not be in your uploaded documents yet.
                </p>
                <button
                  onClick={() => setIsUploadOpen(true)}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--accent-action)] px-4 py-2.5 text-xs font-semibold text-[var(--accent-action-text)] hover:opacity-90 shadow-sm transition-all"
                >
                  <Plus className="h-4 w-4" />
                  <span>Upload Document</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {semanticResults.map((result) => (
                  <div
                    key={result.id}
                    className="app-card group flex flex-col justify-between rounded-2xl p-5 border-l-4 border-l-[var(--accent-action)]"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <Link
                          href={`/pdf/${result.pdfId}`}
                          onClick={() => setOpeningDocId(result.pdfId)}
                          className="font-bold text-[var(--text-main)] text-sm hover:underline line-clamp-1"
                        >
                          {result.filename}
                        </Link>
                        <span className="shrink-0 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-600 dark:bg-[#d4ff3a]/10 dark:border-[#d4ff3a]/30 dark:text-[#d4ff3a]">
                          {result.similarityPercentage}% Match
                        </span>
                      </div>

                      {result.pageNumber && (
                        <div className="inline-flex items-center gap-1.5 rounded-md bg-[var(--surface-subtle)] border border-[var(--border-main)] px-2 py-0.5 text-[10px] font-mono font-semibold text-[var(--text-main)]">
                          <Bookmark className="h-3 w-3" />
                          <span>Page {result.pageNumber}</span>
                        </div>
                      )}

                      <blockquote className="rounded-xl bg-[var(--surface-subtle)] p-3.5 text-xs text-[var(--text-main)] leading-relaxed italic border-l-2 border-[var(--border-main)]">
                        &ldquo;{result.snippet}&rdquo;
                      </blockquote>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[var(--border-main)] flex justify-end">
                      <Link
                        href={`/pdf/${result.pdfId}`}
                        onClick={() => setOpeningDocId(result.pdfId)}
                        className="text-xs font-semibold text-[var(--text-main)] hover:underline flex items-center gap-1.5"
                      >
                        <span>Open Document at Page</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Regular Document Cards Grid */}
        {(searchMode === "filename" || !hasSearchedSemantic) && (
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {search ? `Documents matching "${search}"` : "Indexed Documents Archive"}
              </h2>
            </div>

            {pdfs.length === 0 ? (
              <div className="app-card flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-16 px-6 text-center">
                <div className="rounded-2xl bg-[var(--surface-subtle)] p-4 text-[var(--text-main)] mb-4">
                  <FileText className="h-8 w-8" />
                </div>
                <h3 className="text-base font-bold text-[var(--text-main)]">
                  {search ? "No matching documents found" : "No documents indexed yet"}
                </h3>
                <p className="mt-1 text-xs sm:text-sm text-[var(--text-muted)] max-w-sm">
                  {search
                    ? `No PDFs found matching "${search}". Try searching with another keyword.`
                    : "Upload a PDF document to get instant summaries, smart search, and interactive chat."}
                </p>
                {!search && (
                  <button
                    onClick={() => setIsUploadOpen(true)}
                    className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--accent-action)] px-4 py-2.5 text-xs font-semibold text-[var(--accent-action-text)] hover:opacity-90 shadow-sm transition-all"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Upload First PDF</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {pdfs.map((pdf) => (
                  <div
                    key={pdf.id}
                    className="app-card group relative flex flex-col justify-between rounded-2xl p-5"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="rounded-xl bg-[var(--surface-subtle)] p-2.5 text-[var(--text-main)] border border-[var(--border-main)]">
                          <FileText className="h-5 w-5" />
                        </div>
                        {getStatusBadge(pdf.status)}
                      </div>

                      <Link 
                        href={`/pdf/${pdf.id}`} 
                        onClick={() => setOpeningDocId(pdf.id)}
                        className="block focus:outline-none"
                      >
                        <h3
                          title={pdf.filename}
                          className="truncate text-base font-bold text-[var(--text-main)] group-hover:opacity-80 transition-opacity"
                        >
                          {pdf.filename}
                        </h3>
                        <p suppressHydrationWarning className="mt-1 text-[11px] font-mono text-[var(--text-muted)]">
                          Uploaded {new Date(pdf.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>

                        {pdf.summary && (
                          <p className="mt-3 line-clamp-3 text-xs text-[var(--text-muted)] leading-relaxed">
                            {pdf.summary}
                          </p>
                        )}
                      </Link>
                    </div>

                    <div className="mt-6 flex items-center justify-between border-t border-[var(--border-main)] pt-3.5">
                      <Link
                        href={`/pdf/${pdf.id}`}
                        onClick={() => setOpeningDocId(pdf.id)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-main)] hover:underline transition-all"
                      >
                        <span>Open Document</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        onClick={(e) => handleDelete(pdf.id, e)}
                        disabled={isDeleting === pdf.id}
                        title="Delete Document"
                        className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-rose-500/10 hover:text-rose-600 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Document Opening Loading Overlay */}
      {openingDocId && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md transition-all">
          <div className="flex flex-col items-center gap-4 rounded-3xl bg-[var(--surface-card)] border border-[var(--border-main)] p-8 shadow-2xl max-w-xs sm:max-w-sm mx-4 text-center">
            <Loader size="lg" />
            <div>
              <h3 className="text-base font-bold text-[var(--text-main)]">
                Opening Document
              </h3>
              <p className="mt-1 text-xs text-[var(--text-muted)] font-mono">
                Loading intelligence, summaries & tools...
              </p>
            </div>
            <div className="w-full bg-[var(--surface-subtle)] h-1.5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-[#d4ff3a] rounded-full animate-pulse w-4/5" />
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={fetchPdfs}
      />
    </div>
  );
}
