import type { NextConfig } from "next";
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://connect.facebook.net https://analytics.tiktok.com https://js.paystack.co https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://img.youtube.com https://www.facebook.com https://analytics.tiktok.com https://*.b-cdn.net https://video.bunnycdn.com https://*.mediadelivery.net",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.paystack.co https://checkout.paystack.com https://connect.facebook.net https://graph.facebook.com https://analytics.tiktok.com https://business-api.tiktok.com https://va.vercel-scripts.com https://vitals.vercel-insights.com https://*.b-cdn.net https://video.bunnycdn.com https://*.mediadelivery.net",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.dailymotion.com https://www.loom.com https://fast.wistia.net https://iframe.mediadelivery.net https://video.bunnycdn.com https://*.mediadelivery.net https://*.b-cdn.net https://drive.google.com https://checkout.paystack.com https://js.paystack.co",
  "media-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https://*.b-cdn.net https://video.bunnycdn.com https://*.mediadelivery.net",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspDirectives.join("; ") },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};
export default nextConfig;
