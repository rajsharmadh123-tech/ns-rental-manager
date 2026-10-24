import { vercelPreset } from "@vercel/react-router/vite";

/**
 * React Router 7 Configuration
 * Allows action submissions from embedded Shopify Admin, store domains, and app domain.
 */
export default {
  ssr: true,
  presets: [vercelPreset()],
  allowedActionOrigins: [
    "*.vercel.app",
    "ns-rental-manager.onrender.com",
    "*.onrender.com",
    "admin.shopify.com",
    "*.shopify.com",
    "*.myshopify.com",
    "*.spin.dev",
    "localhost",
    "localhost:*",
    "null",
  ],
};
