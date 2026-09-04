import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);

  const filter = url.searchParams.get("filter") || "month";
  const customStart = url.searchParams.get("customStart");
  const customEnd = url.searchParams.get("customEnd");

  const now = new Date();
  let startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  let endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  if (filter === "today") {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  } else if (filter === "week") {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    startDate = new Date(now.setDate(diff));
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000);
    endDate.setHours(23, 59, 59, 999);
  } else if (filter === "year") {
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
  } else if (filter === "custom" && customStart && customEnd) {
    startDate = new Date(customStart);
    endDate = new Date(customEnd);
  } else if (filter === "all") {
    startDate = new Date(2020, 0, 1);
    endDate = new Date(2035, 11, 31);
  }

  const rentals = await prisma.rental.findMany({
    where: {
      shop: session.shop,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      payments: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const headers = [
    "Booking ID",
    "Customer Name",
    "Phone",
    "Email",
    "Product Title",
    "Variant / Size",
    "Pickup Date",
    "Return Date",
    "Rental Price (INR)",
    "Discount (INR)",
    "Security Deposit (INR)",
    "Final Amount (INR)",
    "Amount Paid (INR)",
    "Balance Due (INR)",
    "Payment Status",
    "Rental Status",
    "Late Fee (INR)",
    "Damage Fee (INR)",
    "Refundable Deposit (INR)",
    "Created Date",
  ];

  const escapeCSV = (str) => {
    if (str === null || str === undefined) return '""';
    const val = String(str).replace(/"/g, '""');
    return `"${val}"`;
  };

  const rows = rentals.map((r) => {
    const finalAmt = r.finalAmount || r.rentalPrice || 0;
    const amountPaid = r.payments ? r.payments.reduce((acc, p) => p.paymentType !== "REFUND" ? acc + p.amount : acc, 0) : 0;
    const balance = Math.max(0, finalAmt - amountPaid);

    return [
      escapeCSV(r.bookingId || r.id.slice(-8)),
      escapeCSV(r.customerName),
      escapeCSV(r.customerPhone),
      escapeCSV(r.customerEmail || ""),
      escapeCSV(r.productTitle),
      escapeCSV(r.variantId || ""),
      escapeCSV(new Date(r.pickupDate).toISOString().split("T")[0]),
      escapeCSV(new Date(r.returnDate).toISOString().split("T")[0]),
      escapeCSV(r.rentalPrice),
      escapeCSV(r.discount || 0),
      escapeCSV(r.securityDeposit || 0),
      escapeCSV(finalAmt),
      escapeCSV(amountPaid),
      escapeCSV(balance),
      escapeCSV(r.paymentStatus),
      escapeCSV(r.status),
      escapeCSV(r.lateFee || 0),
      escapeCSV(r.damageFee || 0),
      escapeCSV(r.refundableDeposit || 0),
      escapeCSV(new Date(r.createdAt).toISOString().split("T")[0]),
    ].join(",");
  });

  const csvContent = [headers.join(","), ...rows].join("\n");

  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gm-rentals-export-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
};
