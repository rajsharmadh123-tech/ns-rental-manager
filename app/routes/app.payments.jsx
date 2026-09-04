import { useLoaderData, useActionData, Form, Link } from "react-router";
import { authenticate } from "../shopify.server.js";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);

  const query = url.searchParams.get("query") || "";

  // Fetch all payment transactions
  const payments = await prisma.rentalPayment.findMany({
    where: {
      rental: {
        shop: session.shop,
      },
    },
    include: {
      rental: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Fetch all rentals for total financial overview
  const rentals = await prisma.rental.findMany({
    where: { shop: session.shop },
    include: { payments: true },
  });

  let totalRevenue = 0;
  let totalDepositsHeld = 0;
  let totalRefundsProcessed = 0;
  let totalOutstandingBalance = 0;

  for (const r of rentals) {
    if (r.status !== "CANCELLED") {
      const finalAmt = r.finalAmount || r.rentalPrice || 0;
      totalRevenue += finalAmt;

      const totalPaid = r.payments.reduce((acc, p) => p.paymentType !== "REFUND" ? acc + p.amount : acc, 0);
      const totalRefunded = r.payments.reduce((acc, p) => p.paymentType === "REFUND" ? acc + p.amount : acc, 0);

      totalDepositsHeld += (r.securityDeposit || 0);
      totalRefundsProcessed += totalRefunded;

      const balance = Math.max(0, finalAmt - totalPaid);
      totalOutstandingBalance += balance;
    }
  }

  // Filter payments by search query if present
  const filteredPayments = payments.filter((p) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      (p.rental.bookingId && p.rental.bookingId.toLowerCase().includes(q)) ||
      p.rental.customerName.toLowerCase().includes(q) ||
      p.rental.customerPhone.includes(q) ||
      p.paymentMethod.toLowerCase().includes(q) ||
      p.paymentType.toLowerCase().includes(q)
    );
  });

  return {
    payments: filteredPayments,
    rentals,
    totalRevenue,
    totalDepositsHeld,
    totalRefundsProcessed,
    totalOutstandingBalance,
    query,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const rentalId = formData.get("rentalId");
  const amount = parseFloat(formData.get("amount")) || 0;
  const paymentType = formData.get("paymentType") || "RENTAL_PRICE";
  const paymentMethod = formData.get("paymentMethod") || "CASH";
  const notes = formData.get("notes")?.trim();

  if (!rentalId || amount <= 0) {
    return { error: "Please select a valid booking and enter an amount greater than ₹0." };
  }

  const rental = await prisma.rental.findUnique({
    where: { id: rentalId, shop: session.shop },
    include: { payments: true },
  });

  if (!rental) {
    return { error: "Rental booking not found." };
  }

  // Record payment transaction
  await prisma.rentalPayment.create({
    data: {
      rentalId,
      amount,
      paymentType,
      paymentMethod,
      notes,
    },
  });

  // Recalculate payment status for rental
  const updatedPayments = await prisma.rentalPayment.findMany({
    where: { rentalId },
  });

  const totalPaid = updatedPayments.reduce((acc, p) => p.paymentType !== "REFUND" ? acc + p.amount : acc, 0);
  const finalPayable = rental.finalAmount || rental.rentalPrice || 0;

  let newPaymentStatus = rental.paymentStatus;
  if (totalPaid >= finalPayable) {
    newPaymentStatus = "PAID";
  } else if (totalPaid > 0) {
    newPaymentStatus = "PARTIAL";
  } else {
    newPaymentStatus = "UNPAID";
  }

  if (paymentType === "REFUND") {
    newPaymentStatus = "REFUNDED";
  }

  await prisma.rental.update({
    where: { id: rentalId },
    data: { paymentStatus: newPaymentStatus },
  });

  return { success: `Payment of ₹${amount} (${paymentType}) recorded successfully!` };
};

export default function PaymentsManagement() {
  const { payments, rentals, totalRevenue, totalDepositsHeld, totalRefundsProcessed, totalOutstandingBalance, query } = useLoaderData();
  const actionData = useActionData();

  return (
    <s-page heading="Payment & Deposit Management">

      <s-section>
        <s-heading>Financial Summary & Payment History</s-heading>
        <s-paragraph>
          Record payment receipts, track security deposits, manage refunds, and monitor outstanding balances.
        </s-paragraph>
      </s-section>

      {actionData?.success && (
        <s-section>
          <div style={{ padding: "12px", backgroundColor: "#e3f5e1", color: "#166534", borderRadius: "8px", fontWeight: "600" }}>
            ✅ {actionData.success}
          </div>
        </s-section>
      )}

      {actionData?.error && (
        <s-section>
          <div style={{ padding: "12px", backgroundColor: "#ffe4e6", color: "#9f1239", borderRadius: "8px", fontWeight: "600" }}>
            ⚠️ {actionData.error}
          </div>
        </s-section>
      )}

      {/* Financial Overview Cards */}
      <s-section heading="Overview">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "16px" }}>

          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ backgroundColor: "#f0faf4" }}>
            <s-heading style={{ color: "#16803c" }}>₹{totalRevenue.toLocaleString("en-IN")}</s-heading>
            <s-paragraph>Total Rental Revenue</s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ backgroundColor: "#f4f6fb" }}>
            <s-heading style={{ color: "#005bd3" }}>₹{totalDepositsHeld.toLocaleString("en-IN")}</s-heading>
            <s-paragraph>Security Deposits Collected</s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ backgroundColor: "#fffdf0" }}>
            <s-heading style={{ color: "#9c6d00" }}>₹{totalOutstandingBalance.toLocaleString("en-IN")}</s-heading>
            <s-paragraph>Outstanding Balance</s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ backgroundColor: "#fbf2ff" }}>
            <s-heading style={{ color: "#6b21a8" }}>₹{totalRefundsProcessed.toLocaleString("en-IN")}</s-heading>
            <s-paragraph>Total Refunds Processed</s-paragraph>
          </s-box>

        </div>
      </s-section>

      {/* Record New Payment Form */}
      <s-section heading="Record Payment / Deposit / Refund Transaction">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <Form method="post">
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "12px" }}>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "600", fontSize: "13px" }}>
                  Select Rental Booking *
                </label>
                <select
                  name="rentalId"
                  required
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                >
                  <option value="">-- Select Booking --</option>
                  {rentals.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.bookingId || r.id.slice(-8)} - {r.customerName} ({r.productTitle})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "600", fontSize: "13px" }}>
                  Amount (₹) *
                </label>
                <input
                  type="number"
                  name="amount"
                  step="0.01"
                  required
                  placeholder="e.g. 5000"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "600", fontSize: "13px" }}>
                  Payment Type
                </label>
                <select
                  name="paymentType"
                  defaultValue="RENTAL_PRICE"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                >
                  <option value="RENTAL_PRICE">Rental Price</option>
                  <option value="DEPOSIT">Security Deposit</option>
                  <option value="LATE_FEE">Late Fee</option>
                  <option value="DAMAGE_FEE">Damage Fee</option>
                  <option value="REFUND">Refund Deposit</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "600", fontSize: "13px" }}>
                  Payment Method
                </label>
                <select
                  name="paymentMethod"
                  defaultValue="UPI"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                >
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI / GPay / PhonePe</option>
                  <option value="CARD">Credit / Debit Card</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                </select>
              </div>

            </div>

            <div style={{ marginTop: "12px" }}>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: "600", fontSize: "13px" }}>
                Payment Notes / Transaction Ref
              </label>
              <input
                type="text"
                name="notes"
                placeholder="UPI transaction ID, receipt reference..."
                style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginTop: "12px" }}>
              <s-button type="submit">+ Record Transaction</s-button>
            </div>
          </Form>
        </s-box>
      </s-section>

      {/* Payment Transactions Table */}
      <s-section heading={`Payment History (${payments.length})`}>
        {payments.length === 0 ? (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-paragraph>No payment transactions recorded yet.</s-paragraph>
          </s-box>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #eee", backgroundColor: "#f9f9f9" }}>
                  <th style={{ padding: "10px" }}>Date & Time</th>
                  <th style={{ padding: "10px" }}>Booking ID</th>
                  <th style={{ padding: "10px" }}>Customer</th>
                  <th style={{ padding: "10px" }}>Type</th>
                  <th style={{ padding: "10px" }}>Method</th>
                  <th style={{ padding: "10px" }}>Amount</th>
                  <th style={{ padding: "10px" }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "10px", fontSize: "12px", color: "#666" }}>
                      {new Date(p.createdAt).toLocaleString("en-IN")}
                    </td>
                    <td style={{ padding: "10px", fontWeight: "600" }}>
                      <Link to={`/app/rentals/${p.rental.id}`} style={{ color: "#005bd3", textDecoration: "none" }}>
                        {p.rental.bookingId || p.rental.id.slice(-8)}
                      </Link>
                    </td>
                    <td style={{ padding: "10px" }}>{p.rental.customerName}</td>
                    <td style={{ padding: "10px" }}>
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: "600",
                          backgroundColor: p.paymentType === "REFUND" ? "#fbf2ff" : "#e3f5e1",
                          color: p.paymentType === "REFUND" ? "#6b21a8" : "#166534"
                        }}
                      >
                        {p.paymentType}
                      </span>
                    </td>
                    <td style={{ padding: "10px", fontWeight: "600" }}>{p.paymentMethod}</td>
                    <td style={{ padding: "10px", fontWeight: "700", color: p.paymentType === "REFUND" ? "#b00020" : "#16803c" }}>
                      {p.paymentType === "REFUND" ? `-₹${p.amount}` : `+₹${p.amount}`}
                    </td>
                    <td style={{ padding: "10px", fontSize: "12px", color: "#666" }}>{p.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </s-section>

    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
