import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const defaultAppUrl =
  process.env.SHOPIFY_APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null) ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
  "https://ns-rental-manager.vercel.app";

const defaultApiKey = process.env.SHOPIFY_API_KEY || "137a6b104d67832b9d464d2251ec0a1c";
const defaultApiSecret = process.env.SHOPIFY_API_SECRET || "temp_secret_placeholder";
const defaultScopes = process.env.SCOPES
  ? process.env.SCOPES.split(",")
  : ["write_products", "read_products", "write_draft_orders", "read_draft_orders", "write_orders", "read_orders"];

const shopify = shopifyApp({
  apiKey: defaultApiKey,
  apiSecretKey: defaultApiSecret,
  apiVersion: ApiVersion.July26,
  scopes: defaultScopes,
  appUrl: defaultAppUrl,
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
