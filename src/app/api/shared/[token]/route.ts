import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDownloadPresignedUrl } from "@/lib/storage";

export async function GET(
  req: Request,
  { params }: { params: { token: string } }
) {
  try {
    const share = await db.share.findUnique({
      where: { token: params.token },
      include: {
        pdf: {
          select: {
            id: true,
            filename: true,
            status: true,
            summary: true,
            createdAt: true,
            storageKey: true,
            owner: {
              select: {
                name: true,
              }
            }
          }
        }
      }
    });

    if (!share) {
      return NextResponse.json({ error: "Invalid share link" }, { status: 404 });
    }

    if (share.expiresAt && new Date() > share.expiresAt) {
      return NextResponse.json({ error: "Share link has expired" }, { status: 403 });
    }

    if (!share.pdf) {
      return NextResponse.json({ error: "PDF no longer exists" }, { status: 404 });
    }

    let viewUrl = "";
    try {
      viewUrl = await getDownloadPresignedUrl(share.pdf.storageKey);
    } catch (s3Err) {
      console.warn("[API/Shared/Token] Failed to generate presigned download URL:", s3Err);
    }

    return NextResponse.json({
      pdf: share.pdf,
      viewUrl,
      isGuest: true,
    });
  } catch (error: any) {
    console.error("Error fetching shared PDF:", error);
    return NextResponse.json(
      { error: "Failed to fetch shared PDF" },
      { status: 500 }
    );
  }
}
