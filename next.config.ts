import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.pusher.com; connect-src 'self' https://js.pusher.com https://sockjs-us3.pusher.com https://sockjs-us2.pusher.com https://sockjs-eu.pusher.com wss://ws-us3.pusher.com wss://ws-us2.pusher.com wss://ws-eu.pusher.com wss://ws-ap1.pusher.com; img-src 'self' data: https:; media-src 'self' data: https:;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
