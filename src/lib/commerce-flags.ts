// Enable only after applying the commerce migration. Explicit flags allow a
// staged release without changing the existing subscription/donation checkout.
export const purchaseFirstEnabled =
  process.env.NEXT_PUBLIC_PURCHASE_FIRST_ENABLED === "true";
export const landingPagesEnabled =
  process.env.NEXT_PUBLIC_LANDING_PAGES_ENABLED === "true";
