/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure server-only packages don't leak to client bundle
  serverExternalPackages: ['groq-sdk'],
};

export default nextConfig;
