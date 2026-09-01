import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { canAccessPdf } from "@/lib/permissions";
import { getDownloadPresignedUrl } from "@/lib/storage";
import PdfViewerClient from "@/components/PdfViewerClient";

interface PageProps {
  params: { id: string };
  searchParams: { token?: string };
}

export default async function PdfPage({ params, searchParams }: PageProps) {
  const session = await getServerSession(authOptions);

  const access = await canAccessPdf(params.id, {
    userId: session?.user?.id,
    shareToken: searchParams.token,
  });

  if (!access.allowed || !access.pdf) {
    if (!session) {
      redirect(`/login?callbackUrl=/pdf/${params.id}`);
    }
    notFound();
  }

  let viewUrl = "";
  try {
    viewUrl = await getDownloadPresignedUrl(access.pdf.storageKey);
  } catch (err) {
    console.error("[PdfPage] Failed to generate presigned download URL:", err);
  }

  const serializedPdf = {
    id: access.pdf.id,
    filename: access.pdf.filename,
    status: access.pdf.status,
    extractedText: access.pdf.extractedText,
    summary: access.pdf.summary,
    createdAt: access.pdf.createdAt.toISOString(),
  };

  return (
    <PdfViewerClient
      pdf={serializedPdf}
      viewUrl={viewUrl}
      isOwner={access.isOwner || false}
    />
  );
}
