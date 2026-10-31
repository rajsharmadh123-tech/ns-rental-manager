/**
 * Shop domain normalization and validation allowlist for NS Bridal & Groom Collection.
 * Maps custom storefront domains to the primary Shopify myshopify.com domain.
 */

export const ALLOWED_SHOP_DOMAINS = {
  "nsbrideandgroomcollection.com": "7xca9g-jt.myshopify.com",
  "www.nsbrideandgroomcollection.com": "7xca9g-jt.myshopify.com",
  "7xca9g-jt.myshopify.com": "7xca9g-jt.myshopify.com",
};

/**
 * Normalizes an incoming shop parameter to a valid .myshopify.com domain.
 * @param {string} shop - The incoming shop domain or hostname
 * @returns {string|null} - The normalized .myshopify.com domain, or null if unauthorized
 */
export function normalizeShop(shop) {
  if (!shop || typeof shop !== "string") {
    return null;
  }

  const cleaned = shop
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

  if (ALLOWED_SHOP_DOMAINS[cleaned]) {
    return ALLOWED_SHOP_DOMAINS[cleaned];
  }

  // Allow standard myshopify domain for this store
  if (cleaned === "7xca9g-jt.myshopify.com") {
    return cleaned;
  }

  return null;
}
