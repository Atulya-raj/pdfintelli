import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteFileFromStorage } from "@/lib/storage";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";

    const pdfs = await db.pdf.findMany({
      where: {
        ownerId: session.user.id,
        filename: {
          contains: search,
          mode: "insensitive",
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ pdfs });
  } catch (error: any) {
    console.error("Error fetching PDFs:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch PDFs" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "PDF ID is required" }, { status: 400 });
    }

    const pdf = await db.pdf.findUnique({
      where: { id },
    });

    if (!pdf || pdf.ownerId !== session.user.id) {
      return NextResponse.json(
        { error: "PDF not found or access denied" },
        { status: 404 }
      );
    }

    // Delete from R2 storage
    try {
      await deleteFileFromStorage(pdf.storageKey);
    } catch (s3Error) {
      console.warn("Storage deletion warning:", s3Error);
    }

    // Delete from DB (cascades to comments, chatMessages, chunks, shares)
    await db.pdf.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting PDF:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete PDF" },
      { status: 500 }
    );
  }
}
