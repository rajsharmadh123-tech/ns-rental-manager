import prisma from "../db.server.js";
import { DEFAULT_WHATSAPP_TEMPLATES } from "./whatsapp.js";

export { DEFAULT_WHATSAPP_TEMPLATES, formatWhatsAppMessage, generateWhatsAppLink } from "./whatsapp.js";

/**
 * Fetches shop settings or returns default templates
 */
export async function getShopTemplates(shop) {
  const settings = await prisma.rentalSettings.findUnique({
    where: { shop },
  });

  if (settings && settings.whatsappTemplates) {
    try {
      return JSON.parse(settings.whatsappTemplates);
    } catch (e) {
      // Fallback
    }
  }

  return DEFAULT_WHATSAPP_TEMPLATES;
}
