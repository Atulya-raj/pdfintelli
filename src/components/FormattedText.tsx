"use client";

import React from "react";
import { Sparkles } from "lucide-react";

interface FormattedTextProps {
  content: string;
  className?: string;
}

interface TopicSection {
  id: string;
  title: string;
  citation?: string;
  lines: string[];
}

/**
 * Renders Markdown-like text (Executive Overview, Topic Cards, Bullet points, Citations)
 * with generous spacing, high contrast, and clean visual cards.
 */
export function FormattedText({ content, className = "" }: FormattedTextProps) {
  if (!content) return null;

  const rawLines = content.split("\n");

  const renderInlineFormatted = (text: string): React.ReactNode[] => {
    // Matches **bold** text and citation badges like [Page X] or (pages/slides X–Y)
    const tokenRegex = /(\*\*[^*]+\*\*|\[(?:Page|Slide)[^\]]+\]|\((?:pages\/slides|slides|page|slide)\s*[\d–-]+\))/g;
    const parts = text.split(tokenRegex);

    return parts.map((part, index) => {
      if (!part) return null;

      // Bold text: **text**
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        const inner = part.slice(2, -2);
        return (
          <strong key={index} className="font-bold text-zinc-950 dark:text-zinc-50">
            {inner}
          </strong>
        );
      }

      // Citation / Page / Slide badge: [Page X] or (slides X-Y)
      if (
        (part.startsWith("[") && part.endsWith("]") && /(?:Page|Slide)/i.test(part)) ||
        (part.startsWith("(") && part.endsWith(")") && /(?:pages|slides)/i.test(part))
      ) {
        return (
          <span
            key={index}
            className="inline-flex items-center px-2 py-0.5 mx-1 rounded text-[11px] font-mono font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/80 dark:text-indigo-300 dark:border-indigo-800/60"
          >
            {part}
          </span>
        );
      }

      return <span key={index}>{part}</span>;
    });
  };

  const renderLinesBlock = (lines: string[]): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    let currentList: React.ReactNode[] = [];

    const flushList = () => {
      if (currentList.length > 0) {
        nodes.push(
          <ul
            key={`list-${nodes.length}`}
            className="my-3 space-y-2 pl-5 list-disc marker:text-indigo-600 dark:marker:text-indigo-400"
          >
            {currentList}
          </ul>
        );
        currentList = [];
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      if (!trimmed) {
        flushList();
        continue;
      }

      // Headings ### or ##
      if (trimmed.startsWith("### ") || trimmed.startsWith("## ")) {
        flushList();
        const headingText = trimmed.replace(/^#{2,3}\s+/, "");
        nodes.push(
          <h4
            key={`h-${i}`}
            className="font-bold text-zinc-950 dark:text-white text-sm sm:text-base mt-4 mb-2 flex items-center gap-2"
          >
            {renderInlineFormatted(headingText)}
          </h4>
        );
        continue;
      }

      // Bullet items (* item or - item)
      if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
        const itemText = trimmed.slice(2).trim();
        currentList.push(
          <li key={`li-${i}`} className="text-xs sm:text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
            {renderInlineFormatted(itemText)}
          </li>
        );
        continue;
      }

      // Numbered list item: 1. Item
      const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
      if (numMatch) {
        flushList();
        nodes.push(
          <div
            key={`num-${i}`}
            className="flex items-start gap-2.5 my-2 text-xs sm:text-sm leading-relaxed text-zinc-800 dark:text-zinc-200"
          >
            <span className="font-bold text-indigo-600 dark:text-indigo-400 text-xs min-w-[1.2rem] pt-0.5">
              {numMatch[1]}.
            </span>
            <div className="flex-1">{renderInlineFormatted(numMatch[2])}</div>
          </div>
        );
        continue;
      }

      // Paragraph line
      flushList();
      nodes.push(
        <p key={`p-${i}`} className="my-2 text-xs sm:text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
          {renderInlineFormatted(trimmed)}
        </p>
      );
    }

    flushList();
    return nodes;
  };

  // Check if content has Topic headings e.g. **Topic 1:...
  const hasTopicStructure = rawLines.some(
    (l) => l.trim().startsWith("**Topic") || (l.trim().startsWith("**") && l.includes("** ("))
  );

  if (!hasTopicStructure) {
    return <div className={`space-y-3 ${className}`}>{renderLinesBlock(rawLines)}</div>;
  }

  // Parse into Executive Lead + Structured Topic Cards
  const overviewLines: string[] = [];
  const topicSections: TopicSection[] = [];
  let currentTopic: TopicSection | null = null;

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      if (currentTopic) currentTopic.lines.push("");
      else overviewLines.push("");
      continue;
    }

    // Detect Topic header line e.g. **Topic 1: ...** (pages/slides 1-2)
    const isTopicLine = trimmed.startsWith("**Topic") || (trimmed.startsWith("**") && trimmed.includes("** ("));

    if (isTopicLine) {
      // Extract title and citation if present
      let title = trimmed.replace(/\*\*/g, "");
      let citation: string | undefined;

      const citationMatch = title.match(/\((?:pages\/slides|slides|page|slide)\s*[\d–-]+\)/i);
      if (citationMatch) {
        citation = citationMatch[0];
        title = title.replace(citationMatch[0], "").trim();
      }

      currentTopic = {
        id: `topic-${topicSections.length + 1}`,
        title: title.trim(),
        citation,
        lines: [],
      };
      topicSections.push(currentTopic);
    } else {
      if (currentTopic) {
        currentTopic.lines.push(rawLine);
      } else {
        overviewLines.push(rawLine);
      }
    }
  }

  const cleanOverviewText = overviewLines.join("\n").trim();

  return (
    <div className={`space-y-5 ${className}`}>
      {/* 1. Executive Overview Banner Card */}
      {cleanOverviewText && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 shadow-2xs dark:border-indigo-900/40 dark:bg-indigo-950/20">
          <div className="flex items-center gap-2 mb-2 text-[11px] font-mono font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
            <Sparkles className="h-3.5 w-3.5" />
            Executive Summary
          </div>
          <div className="text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 leading-relaxed font-medium">
            {renderInlineFormatted(cleanOverviewText)}
          </div>
        </div>
      )}

      {/* 2. Structured Topic Cards with Generous Spacing */}
      {topicSections.map((sec) => (
        <div
          key={sec.id}
          className="rounded-2xl border border-zinc-200/90 bg-white p-4.5 sm:p-5 shadow-xs dark:border-zinc-800/90 dark:bg-zinc-900/40 space-y-3 transition-all hover:border-zinc-300 dark:hover:border-zinc-700"
        >
          {/* Topic Card Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/70 pb-3 dark:border-zinc-800/70">
            <h4 className="font-bold text-xs sm:text-sm text-zinc-950 dark:text-white flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-indigo-600 dark:bg-indigo-400" />
              <span>{sec.title}</span>
            </h4>

            {sec.citation && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800">
                {sec.citation}
              </span>
            )}
          </div>

          {/* Topic Card Content */}
          <div className="text-xs sm:text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed">
            {renderLinesBlock(sec.lines)}
          </div>
        </div>
      ))}
    </div>
  );
}
