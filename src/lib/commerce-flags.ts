// Enabled by default after the commerce migration. An explicit false value
// remains available for deployments that need to disable a feature.
export const purchaseFirstEnabled =
  process.env.NEXT_PUBLIC_PURCHASE_FIRST_ENABLED !== "false";
export const landingPagesEnabled =
  process.env.NEXT_PUBLIC_LANDING_PAGES_ENABLED !== "false";
