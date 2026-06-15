// Mode 3 Stage 4 kill-switch.
//
// When true, providers LAND in the shared tabs at login and after onboarding
// (just like clients), and reach their dashboard via the Me tab's "My Studio"
// entrance. The dashboard is then a pushed section you swipe/exit back out of.
//
// When false, everything reverts to the pre-Mode-3 behavior: providers land
// directly in the provider dashboard, and its swipe-back stays disabled (so a
// landed provider can't swipe across the auth boundary to welcome).
//
// This gates: app/auth/verify.tsx, app/auth/phone.tsx,
// app/onboarding/provider/golive.tsx (landing), and the dashboard swipe-back
// in app/_layout.tsx. Flip to false to instantly roll back.
export const PROVIDER_LANDS_IN_TABS = false // Option B: providers land in their dashboard
