/** @type {import('next').NextConfig} */
const nextConfig = {
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
