/**
 * Formats a Date object or string to en-IN short string: "15 Sep 2026"
 */
export function formatDisplayDate(date) {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Helper to get user-friendly label for reason
 */
export function formatReasonLabel(reason) {
  const map = {
    OFFLINE_BOOKING: "In-Store / Offline Booking",
    CLEANING: "Cleaning & Washing",
    ALTERATION: "Alteration & Fitting",
    MAINTENANCE: "Maintenance & Repair",
    CUSTOMER_HOLD: "Customer Hold (Trial)",
    DAMAGED: "Damaged / Restoration",
    LOST: "Lost Inventory",
    PERSONAL_USE: "Personal Use",
    OTHER: "Manual Block",
    RENTAL: "Customer Online Rental",
    BUFFER: "Cleaning Buffer",
    OUT_OF_SERVICE: "Out of Service",
  };
  return map[reason] || reason || "Blocked";
}

/**
 * Admin Color Coding per Specification:
 * 🟢 Available: #16a34a
 * 🔴 Customer Booking: #ef4444
 * 🟠 Offline Booking: #f97316
 * 🔵 Cleaning: #3b82f6
 * 🟣 Alteration: #a855f7
 * ⚫ Maintenance: #374151
 * 🟡 Hold: #eab308
 * 🔴 Damaged / Lost: #b91c1c
 */
export function getReasonColor(reason) {
  switch (reason) {
    case "CUSTOMER_BOOKING":
    case "RENTAL":
      return "#ef4444"; // Red
    case "OFFLINE_BOOKING":
      return "#f97316"; // Orange
    case "CLEANING":
    case "BUFFER":
      return "#3b82f6"; // Blue
    case "ALTERATION":
      return "#a855f7"; // Purple
    case "MAINTENANCE":
      return "#374151"; // Dark Charcoal
    case "CUSTOMER_HOLD":
      return "#eab308"; // Yellow / Amber
    case "DAMAGED":
    case "LOST":
      return "#b91c1c"; // Crimson Red
    default:
      return "#6b7280"; // Neutral Grey
  }
}
