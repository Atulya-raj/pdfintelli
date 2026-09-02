// Normalize and sanitize NEXTAUTH_URL to prevent NextAuth parseUrl from throwing TypeError: Invalid URL at build time
const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
const rawNextAuthUrl = process.env.NEXTAUTH_URL?.trim();

if (!rawNextAuthUrl) {
  process.env.NEXTAUTH_URL = vercelUrl;
} else if (!rawNextAuthUrl.startsWith("http://") && !rawNextAuthUrl.startsWith("https://")) {
  process.env.NEXTAUTH_URL = `https://${rawNextAuthUrl}`;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  },
  experimental: {
    serverComponentsExternalPackages: [
      "bcrypt",
      "pdf-parse",
      "pdf-to-img",
      "pdfjs-dist",
      "@prisma/client",
      "@langchain/google-genai",
      "@langchain/core",
      "@langchain/textsplitters",
      "@aws-sdk/client-s3",
      "@aws-sdk/s3-request-presigner",
    ],
  },
};

export default nextConfig;

