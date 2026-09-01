import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import crypto from "crypto";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify ownership
    const pdf = await db.pdf.findUnique({
      where: { id: params.id },
    });

    if (!pdf || pdf.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
    }

    // Check if an active share already exists for this document
    const existingShare = await db.share.findFirst({
      where: { pdfId: pdf.id },
      orderBy: { createdAt: "desc" },
    });

    if (existingShare) {
      return NextResponse.json({
        token: existingShare.token,
        shareToken: existingShare.token,
      });
    }

    // Generate random 32-byte token
    const token = crypto.randomBytes(32).toString("base64url");

    // Save new share
    const share = await db.share.create({
      data: {
        pdfId: pdf.id,
        token,
      },
    });

    return NextResponse.json({
      token: share.token,
      shareToken: share.token,
    });
  } catch (error: any) {
    console.error("Error creating share link:", error);
    return NextResponse.json(
      { error: "Failed to create share link" },
      { status: 500 }
    );
  }
}
