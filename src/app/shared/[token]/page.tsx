import { db } from "@/lib/db";
import { getDownloadPresignedUrl } from "@/lib/storage";
import { notFound } from "next/navigation";
import PdfViewerClient from "@/components/PdfViewerClient";

export default async function SharedPdfPage({
  params,
}: {
  params: { token: string };
}) {
  // Find the share record
  const share = await db.share.findUnique({
    where: { token: params.token },
    include: { pdf: true },
  });

  if (!share || !share.pdf) {
    notFound(); // 404 if invalid token
  }

  // Check expiration if applicable
  if (share.expiresAt && new Date() > new Date(share.expiresAt)) {
    notFound();
  }

  // Generate the signed URL to view the PDF (guests need to see it too)
  let viewUrl = "";
  try {
    viewUrl = await getDownloadPresignedUrl(share.pdf.storageKey);
  } catch (s3Err) {
    console.warn("[SharedPdfPage] Failed to generate presigned download URL:", s3Err);
  }

  // We are a guest since this is the shared route
  const isOwner = false;

  return (
    <PdfViewerClient
      pdf={{
        id: share.pdf.id,
        filename: share.pdf.filename,
        status: share.pdf.status,
        extractedText: share.pdf.extractedText,
        summary: share.pdf.summary,
        createdAt: share.pdf.createdAt.toISOString(),
      }}
      viewUrl={viewUrl}
      isOwner={isOwner}
      shareToken={params.token} // Pass token so the client knows it's a guest session
    />
  );
}
