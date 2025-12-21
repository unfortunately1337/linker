import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-eval' 'unsafe-inline'; connect-src 'self' https://js.pusher.com wss://ws.pusher.com wss://ws-eu.pusher.com https://sockjs.pusher.com https://sockjs-eu.pusher.com http: https: ws: wss:; img-src 'self' data: https:; media-src 'self' data: https:",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
