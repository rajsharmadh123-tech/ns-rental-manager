import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;

  const rental = await prisma.rental.findUnique({
    where: { id },
    include: {
      customer: true,
      payments: true,
    },
  });

  if (!rental || rental.shop !== session.shop) {
    throw new Response("Receipt Not Found", { status: 404 });
  }

  const settings = await prisma.rentalSettings.findUnique({
    where: { shop: session.shop },
  });

  const totalPaid = rental.payments.reduce((acc, p) => p.paymentType !== "REFUND" ? acc + p.amount : acc, 0);
  const finalPayable = rental.finalAmount || rental.rentalPrice || 0;
  const balanceDue = Math.max(0, finalPayable - totalPaid);

  return {
    rental,
    settings,
    totalPaid,
    finalPayable,
    balanceDue,
  };
};

export default function HandoverReceipt() {
  const { rental, settings, totalPaid, finalPayable, balanceDue } = useLoaderData();
  const bName = settings?.businessName || "NS Bridal & Groom Collection";
  const lateRate = settings?.lateFeePerDay ?? 500;

  return (
    <div style={{ fontFamily: "Arial, sans-serif", padding: "40px", maxWidth: "800px", margin: "0 auto", color: "#222" }}>
      
      {/* Print Button Header */}
      <div style={{ textAlign: "right", marginBottom: "20px" }} className="no-print">
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            padding: "10px 20px",
            backgroundColor: "#222",
            color: "#fff",
            border: "0",
            borderRadius: "6px",
            fontWeight: "700",
            fontSize: "14px",
            cursor: "pointer"
          }}
        >
          🖨️ Print Receipt
        </button>
      </div>

      {/* Header Branding */}
      <div style={{ borderBottom: "3px solid #111", paddingBottom: "16px", marginBottom: "24px" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: "28px", letterSpacing: "1px", textTransform: "uppercase" }}>
          {bName}
        </h1>
        <p style={{ margin: "0", fontSize: "14px", color: "#555" }}>
          {settings?.address || "Premium Bridal & Groom Rental Outfits | High Fashion & Designer Wear"} {settings?.phone ? `| Tel: ${settings.phone}` : ""}
        </p>
      </div>

      <div style={{ display: "flex", justify: "space-between", marginBottom: "24px" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: "20px" }}>RENTAL HANDOVER RECEIPT</h2>
          <div style={{ fontSize: "14px", color: "#555" }}>
            Date: {new Date().toLocaleDateString("en-IN")}
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "18px", fontWeight: "800", color: "#005bd3" }}>
            Booking ID: {rental.bookingId || rental.id.slice(-8)}
          </div>
          <div style={{ fontSize: "13px", color: "#666" }}>
            Status: {rental.status}
          </div>
        </div>
      </div>

      {/* Customer & Dates Info */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "24px" }}>
        
        <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px", backgroundColor: "#fafafa" }}>
          <h3 style={{ margin: "0 0 10px", fontSize: "16px", borderBottom: "1px solid #eee", paddingBottom: "6px" }}>
            Customer Details
          </h3>
          <div style={{ fontSize: "14px", lineHeight: "1.6" }}>
            <div><strong>Name:</strong> {rental.customerName}</div>
            <div><strong>Phone:</strong> {rental.customerPhone}</div>
            {rental.customerEmail && <div><strong>Email:</strong> {rental.customerEmail}</div>}
            {rental.customerAddress && <div><strong>Address:</strong> {rental.customerAddress}</div>}
          </div>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px", backgroundColor: "#fafafa" }}>
          <h3 style={{ margin: "0 0 10px", fontSize: "16px", borderBottom: "1px solid #eee", paddingBottom: "6px" }}>
            Rental Dates
          </h3>
          <div style={{ fontSize: "14px", lineHeight: "1.6" }}>
            <div><strong>Outfit Name:</strong> {rental.productTitle}</div>
            {rental.variantId && <div><strong>Variant/Size:</strong> {rental.variantId}</div>}
            <div><strong>Pickup Date:</strong> {new Date(rental.pickupDate).toLocaleDateString("en-IN")}</div>
            <div><strong>Return Date:</strong> {new Date(rental.returnDate).toLocaleDateString("en-IN")}</div>
          </div>
        </div>

      </div>

      {/* Itemized Financial Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "24px", fontSize: "14px" }}>
        <thead>
          <tr style={{ backgroundColor: "#222", color: "#fff" }}>
            <th style={{ padding: "12px", textAlign: "left" }}>Description</th>
            <th style={{ padding: "12px", textAlign: "right" }}>Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: "1px solid #eee" }}>
            <td style={{ padding: "10px" }}>Rental Charges ({rental.productTitle})</td>
            <td style={{ padding: "10px", textAlign: "right" }}>₹{rental.rentalPrice}</td>
          </tr>

          {rental.discount > 0 && (
            <tr style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "10px" }}>Discount Applied</td>
              <td style={{ padding: "10px", textAlign: "right", color: "#b00020" }}>-₹{rental.discount}</td>
            </tr>
          )}

          <tr style={{ borderBottom: "2px solid #222", fontWeight: "700" }}>
            <td style={{ padding: "10px" }}>Final Rental Amount</td>
            <td style={{ padding: "10px", textAlign: "right" }}>₹{finalPayable}</td>
          </tr>

          <tr style={{ borderBottom: "1px solid #eee" }}>
            <td style={{ padding: "10px" }}>Security Deposit Collected</td>
            <td style={{ padding: "10px", textAlign: "right" }}>₹{rental.securityDeposit || 0}</td>
          </tr>

          <tr style={{ borderBottom: "1px solid #eee", backgroundColor: "#f9f9f9" }}>
            <td style={{ padding: "10px" }}>Total Amount Paid</td>
            <td style={{ padding: "10px", textAlign: "right", color: "#16803c", fontWeight: "700" }}>₹{totalPaid}</td>
          </tr>

          <tr style={{ borderBottom: "2px solid #222", backgroundColor: "#fff9f9" }}>
            <td style={{ padding: "12px", fontWeight: "800", fontSize: "16px" }}>Balance Amount Due</td>
            <td style={{ padding: "12px", textAlign: "right", fontWeight: "800", fontSize: "16px", color: balanceDue > 0 ? "#b00020" : "#16803c" }}>
              ₹{balanceDue}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Terms & Conditions */}
      <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px", marginBottom: "32px", fontSize: "12px", color: "#555", lineHeight: "1.5" }}>
        <h4 style={{ margin: "0 0 6px", color: "#222", fontSize: "13px" }}>Rental Terms & Conditions:</h4>
        <ol style={{ margin: "0", paddingLeft: "18px" }}>
          <li>Outfit must be returned on or before the agreed Return Date ({new Date(rental.returnDate).toLocaleDateString("en-IN")}).</li>
          <li>Late returns will attract a late fee of ₹{lateRate} per day.</li>
          <li>Security deposit will be refunded upon return after quality inspection.</li>
          <li>Any permanent stain, tear, or damage will result in deposit deduction or repair charges.</li>
          <li>{settings?.generalTerms || "Valid Photo ID proof required at garment pickup."}</li>
        </ol>
      </div>

      {settings?.receiptFooter && (
        <div style={{ textAlign: "center", fontStyle: "italic", fontSize: "13px", color: "#555", marginBottom: "24px" }}>
          "{settings.receiptFooter}"
        </div>
      )}

      {/* Signature Lines */}
      <div style={{ display: "flex", justify: "space-between", marginTop: "40px", paddingTop: "20px", borderTop: "1px dashed #aaa" }}>
        <div style={{ textAlign: "center", width: "200px" }}>
          <div style={{ minHeight: "40px" }} />
          <div style={{ borderTop: "1px solid #222", fontSize: "14px", fontWeight: "600", paddingTop: "4px" }}>
            Customer Signature
          </div>
        </div>

        <div style={{ textAlign: "center", width: "220px" }}>
          <div style={{ minHeight: "40px" }} />
          <div style={{ borderTop: "1px solid #222", fontSize: "14px", fontWeight: "600", paddingTop: "4px" }}>
            {bName}
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; }
        }
      `}</style>

    </div>
  );
}
