/**
 * Configuración principal de Next.js (App Router).
 * - Cabeceras de seguridad OWASP (X-Frame-Options, CSP, etc.) aplicadas a todas las rutas; el middleware también las inyecta.
 * - Estáticos (_next/static) usan caché largo e immutable.
 * - CORS: Access-Control-Allow-Origin según VERCEL_URL o localhost:3000.
 */
import type { NextConfig } from "next";

/** Lista de cabeceras HTTP de seguridad que se envían en cada respuesta */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://*.firebaseapp.com https://*.google.com",
      "connect-src 'self' https://*.googleapis.com https://*.google.com https://*.firebaseapp.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com wss://*.firebaseio.com https://*.firebaseio.com",
      "frame-src 'self' https://*.firebaseapp.com https://*.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https: blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
  {
    key: "Access-Control-Allow-Origin",
    value:
      process.env.VERCEL_URL != null
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          {
            key: "Access-Control-Allow-Origin",
            value:
              process.env.VERCEL_URL != null
                ? `https://${process.env.VERCEL_URL}`
                : "http://localhost:3000",
          },
        ],
      },
    ];
  },
};

export default nextConfig;





