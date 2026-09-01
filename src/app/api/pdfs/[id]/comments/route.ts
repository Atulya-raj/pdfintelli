import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessPdf } from "@/lib/permissions";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    let session: any = null;
    try {
      session = await getServerSession(authOptions);
    } catch {
      // Handled if called outside Next.js request store
    }

    const { searchParams } = new URL(req.url);
    const shareToken = searchParams.get("shareToken") || undefined;

    const access = await canAccessPdf(params.id, {
      userId: session?.user?.id,
      shareToken,
    });

    if (!access.allowed || !access.pdf) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const comments = await db.comment.findMany({
      where: { pdfId: params.id },
      include: {
        author: {
          select: { name: true, id: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      comments,
      ownerId: access.pdf.ownerId,
    });
  } catch (error: any) {
    console.error("Error fetching comments:", error);
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    let session: any = null;
    try {
      session = await getServerSession(authOptions);
    } catch {
      // Handled if called outside Next.js request store
    }

    const { searchParams } = new URL(req.url);
    const shareToken = searchParams.get("shareToken") || undefined;

    const access = await canAccessPdf(params.id, {
      userId: session?.user?.id,
      shareToken,
    });

    if (!access.allowed || !access.pdf) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await req.json();
    const { content, guestName, parentId, pageNumber } = body;

    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
    }

    // Determine the author identity
    const authorId = session?.user?.id || null;
    const finalGuestName = !authorId ? (guestName?.trim() || "Anonymous Guest") : null;

    // Optional page attachment
    const parsedPage = typeof pageNumber === "number" && pageNumber > 0 ? pageNumber : null;

    let comment: any;
    try {
      comment = await db.comment.create({
        data: {
          pdfId: params.id,
          content: content.trim(),
          authorId,
          guestName: finalGuestName,
          parentId: parentId || null,
          pageNumber: parsedPage,
        },
        include: {
          author: {
            select: { name: true, id: true },
          },
        },
      });
    } catch (createErr: any) {
      console.warn("Standard comment create warning, using direct SQL fallback:", createErr?.message);
      const crypto = await import("crypto");
      const commentId = `cmt_${crypto.randomBytes(12).toString("hex")}`;
      await db.$executeRawUnsafe(
        `INSERT INTO "Comment" ("id", "pdfId", "content", "authorId", "guestName", "parentId", "pageNumber", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        commentId,
        params.id,
        content.trim(),
        authorId,
        finalGuestName,
        parentId || null,
        parsedPage
      );
      comment = await db.comment.findUnique({
        where: { id: commentId },
        include: {
          author: {
            select: { name: true, id: true },
          },
        },
      });
    }

    return NextResponse.json({ comment });
  } catch (error: any) {
    console.error("Error posting comment:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to post comment" },
      { status: 500 }
    );
  }
}
