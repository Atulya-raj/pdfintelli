import { db } from "./db";
import { Pdf } from "@prisma/client";

export interface AuthContext {
  userId?: string;
  shareToken?: string;
}

export interface AccessResult {
  allowed: boolean;
  pdf?: Pdf;
  isOwner?: boolean;
}

/**
 * Single authorization helper that guards all PDF operations (reading, comments, chat).
 * Checks either:
 * 1. User is the owner of the PDF
 * 2. Or request provides a valid, unexpired shareToken for this PDF
 */
export async function canAccessPdf(
  pdfId: string,
  auth: AuthContext
): Promise<AccessResult> {
  const pdf = await db.pdf.findUnique({ where: { id: pdfId } });
  if (!pdf) return { allowed: false };

  // Check owner access
  if (auth.userId && pdf.ownerId === auth.userId) {
    return { allowed: true, pdf, isOwner: true };
  }

  // Check share token access
  if (auth.shareToken) {
    const share = await db.share.findUnique({
      where: { token: auth.shareToken },
    });

    if (
      share &&
      share.pdfId === pdfId &&
      (!share.expiresAt || new Date() < new Date(share.expiresAt))
    ) {
      return { allowed: true, pdf, isOwner: false };
    }
  }

  return { allowed: false };
}
