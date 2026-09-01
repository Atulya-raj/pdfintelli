import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canAccessPdf } from "@/lib/permissions";
import { getDownloadPresignedUrl } from "@/lib/storage";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(req.url);
    const shareToken = searchParams.get("shareToken") || undefined;

    const access = await canAccessPdf(params.id, {
      userId: session?.user?.id,
      shareToken,
    });

    if (!access.allowed || !access.pdf) {
      return NextResponse.json(
        { error: "Access denied or PDF not found" },
        { status: 403 }
      );
    }

    let viewUrl = "";
    try {
      viewUrl = await getDownloadPresignedUrl(access.pdf.storageKey);
    } catch (s3Err) {
      console.warn("[API/PDFs/ID] Failed to generate presigned download URL:", s3Err);
    }

    return NextResponse.json({
      pdf: access.pdf,
      viewUrl,
      isOwner: access.isOwner,
    });
  } catch (error: any) {
    console.error("Error fetching PDF details:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch PDF" },
      { status: 500 }
    );
  }
}
