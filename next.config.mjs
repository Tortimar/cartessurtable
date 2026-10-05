/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.openfoodfacts.org" }],
  },
};

export default nextConfig;
