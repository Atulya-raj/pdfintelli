import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import DashboardClient from "@/components/DashboardClient";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  let serializedPdfs: Array<{
    id: string;
    filename: string;
    status: "PROCESSING" | "READY" | "FAILED";
    summary: string | null;
    createdAt: string;
  }> = [];

  try {
    const initialPdfs = await db.pdf.findMany({
      where: { ownerId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        filename: true,
        status: true,
        summary: true,
        createdAt: true,
      },
    });

    serializedPdfs = initialPdfs.map((pdf) => ({
      ...pdf,
      createdAt: pdf.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error("[DashboardPage] Warning: Failed to load initial PDFs on SSR:", error);
    // Graceful fallback: DashboardClient will auto-fetch on mount via its client-side effect
  }

  return (
    <DashboardClient
      initialPdfs={serializedPdfs}
      userName={session.user.name || "User"}
    />
  );
}
