/**
 * React Router 7 Configuration
 * Allows action submissions from embedded Shopify Admin, store domains, and app domain.
 */
export default {
  allowedActionOrigins: [
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
