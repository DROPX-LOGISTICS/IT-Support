/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Up to 5 screenshots of 5 MB each, plus form fields.
    serverActions: { bodySizeLimit: "28mb" },
  },
};
export default nextConfig;
