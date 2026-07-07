import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // The research paper is a static Quarto render (paper/render_site.py,
    // which injects <base href="/paper/"> so relative assets resolve);
    // public/ has no directory-index resolution, so map the clean URL.
    return [{ source: "/paper", destination: "/paper/index.html" }];
  },
};

export default nextConfig;
