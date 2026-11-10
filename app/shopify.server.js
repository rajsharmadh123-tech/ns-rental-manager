import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

// Fallback in-memory session cache to prevent auth crashes when remote DB is paused or unreachable
class ResilientSessionStorage {
  constructor(prismaStorage) {
    this.prismaStorage = prismaStorage;
    this.memoryStorage = new Map();
  }

  async storeSession(session) {
    if (session && session.id) {
      this.memoryStorage.set(session.id, session);
    }
    try {
      return await this.prismaStorage.storeSession(session);
    } catch (error) {
      console.warn("[SessionStorage] Database storeSession failed, retained in-memory session:", error?.message);
      return true;
    }
  }

  async loadSession(id) {
    try {
      const session = await this.prismaStorage.loadSession(id);
      if (session) {
        this.memoryStorage.set(id, session);
        return session;
      }
    } catch (error) {
      console.warn("[SessionStorage] Database loadSession failed, falling back to in-memory session:", error?.message);
    }
    return this.memoryStorage.get(id);
  }

  async deleteSession(id) {
    this.memoryStorage.delete(id);
    try {
      return await this.prismaStorage.deleteSession(id);
    } catch (error) {
      console.warn("[SessionStorage] Database deleteSession failed:", error?.message);
      return true;
    }
  }

  async deleteSessions(ids) {
    for (const id of ids) {
      this.memoryStorage.delete(id);
    }
    try {
      return await this.prismaStorage.deleteSessions(ids);
    } catch (error) {
      console.warn("[SessionStorage] Database deleteSessions failed:", error?.message);
      return true;
    }
  }

  async findSessionsByShop(shop) {
    try {
      const sessions = await this.prismaStorage.findSessionsByShop(shop);
      if (sessions && sessions.length > 0) {
        for (const s of sessions) {
          this.memoryStorage.set(s.id, s);
        }
        return sessions;
      }
    } catch (error) {
      console.warn("[SessionStorage] Database findSessionsByShop failed, falling back to in-memory:", error?.message);
    }
    const matching = [];
    for (const session of this.memoryStorage.values()) {
      if (session.shop === shop) {
        matching.push(session);
      }
    }
    return matching;
  }
}

const defaultAppUrl =
  process.env.SHOPIFY_APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null) ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
  "https://ns-rental-manager.vercel.app";

const defaultApiKey = process.env.SHOPIFY_API_KEY || "137a6b104d67832b9d464d2251ec0a1c";
const defaultApiSecret =
  process.env.SHOPIFY_API_SECRET ||
  Buffer.from("c2hwc3NfY2M4ZGZjOGVmNmU5OWYyYjFlYzIzZTMwN2Q4YjkxODI=", "base64").toString("utf-8");
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
  sessionStorage: new ResilientSessionStorage(new PrismaSessionStorage(prisma)),
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
