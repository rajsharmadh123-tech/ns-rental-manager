export const DEFAULT_WHATSAPP_TEMPLATES = {
  confirmation: `Hello {{customer_name}},

Thank you for choosing NS Bridal & Groom Collection! Your rental booking is CONFIRMED.

Booking ID: {{booking_id}}
Outfit: {{product_name}}
Pickup Date: {{pickup_date}}
Return Date: {{return_date}}
Rental Amount: ₹{{rental_amount}}
Security Deposit: ₹{{deposit}}
Balance Due: ₹{{balance}}

We look forward to serving you!`,

  pickup_reminder: `Hello {{customer_name}},

Your outfit ({{product_name}}) for Booking {{booking_id}} is ready for pickup at NS Bridal & Groom Collection!

Pickup Date: {{pickup_date}}
Return Date: {{return_date}}
Balance Due: ₹{{balance}}

Please visit our store to collect your garment.`,

  return_reminder: `Hello {{customer_name}},

Reminder: Your rental outfit ({{product_name}}) for Booking {{booking_id}} is scheduled for return on {{return_date}}.

Security Deposit Held: ₹{{deposit}}

Please ensure the garment is returned on time to receive your full security deposit refund.`,

  overdue_reminder: `URGENT OVERDUE NOTICE

Hello {{customer_name}},

Your rental outfit ({{product_name}}) for Booking {{booking_id}} was due on {{return_date}} and is currently OVERDUE.

Applicable Late Fee: ₹{{late_fee}}

Please return the outfit to NS Bridal & Groom Collection immediately to avoid further charges.`,

  payment_reminder: `Hello {{customer_name}},

This is a gentle payment reminder for your rental booking {{booking_id}} ({{product_name}}).

Outstanding Balance Due: ₹{{balance}}

Please complete your payment via UPI/Cash at your earliest convenience.`,

  cancellation: `Hello {{customer_name}},

Your rental booking {{booking_id}} for {{product_name}} has been CANCELLED.

If you have any questions regarding refunds or re-booking, please contact NS Bridal & Groom Collection.`,
};

/**
 * Replaces placeholders in WhatsApp template with actual rental values
 */
export function formatWhatsAppMessage(templateText, rental, extraVars = {}) {
  if (!templateText) return "";

  const pDate = new Date(rental.pickupDate).toLocaleDateString("en-IN", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const rDate = new Date(rental.returnDate).toLocaleDateString("en-IN", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const finalAmt = rental.finalAmount || rental.rentalPrice || 0;
  const totalPaid = rental.payments
    ? rental.payments.reduce((acc, p) => p.paymentType !== "REFUND" ? acc + p.amount : acc, 0)
    : 0;
  const balance = Math.max(0, finalAmt - totalPaid);

  let msg = templateText
    .replace(/\{\{customer_name\}\}/g, rental.customerName || "Customer")
    .replace(/\{\{booking_id\}\}/g, rental.bookingId || rental.id.slice(-8))
    .replace(/\{\{product_name\}\}/g, rental.productTitle || "Outfit")
    .replace(/\{\{pickup_date\}\}/g, pDate)
    .replace(/\{\{return_date\}\}/g, rDate)
    .replace(/\{\{rental_amount\}\}/g, String(finalAmt))
    .replace(/\{\{deposit\}\}/g, String(rental.securityDeposit || 0))
    .replace(/\{\{balance\}\}/g, String(balance))
    .replace(/\{\{late_fee\}\}/g, String(rental.lateFee || extraVars.lateFee || 0));

  return msg;
}

/**
 * Generates an encoded wa.me link for WhatsApp click-to-chat
 */
export function generateWhatsAppLink(phone, messageText) {
  if (!phone) return "#";
  const cleanPhone = phone.replace(/\D/g, "");
  const encodedText = encodeURIComponent(messageText);
  return `https://wa.me/${cleanPhone}?text=${encodedText}`;
}
