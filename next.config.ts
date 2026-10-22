import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No page uses next/image. Turning the optimizer off removes the
  // /_next/image endpoint and its sharp/libvips attack surface (the source of
  // Next's 2026 image-optimization RCE advisories).
  images: { unoptimized: true },
  async rewrites() {
    // The research paper is a static Quarto render (paper/render_site.py,
    // which injects <base href="/paper/"> so relative assets resolve);
    // public/ has no directory-index resolution, so map the clean URL.
    return [{ source: "/paper", destination: "/paper/index.html" }];
  },
};

export default nextConfig;
