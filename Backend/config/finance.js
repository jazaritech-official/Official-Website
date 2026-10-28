/**
 * Finance policy flags — the ONE place an owner can flip a behaviour.
 *
 * FINANCE_SPLIT_SUPER_ONLY
 *   true  (default) — only a super_admin may assign who gets which share of an
 *          order. A plain admin can create and edit orders and record payments,
 *          but split fields in their request are ignored and the order is
 *          computed from the default percentages with nobody assigned, so the
 *          company box keeps 100% until a super admin assigns people. The same
 *          flag also removes the `split` object from every order response a
 *          plain admin receives (server-side, not a UI trick), and gates
 *          PATCH /api/admin/orders/:id/payout.
 *   false — any active admin may assign shares; the split is always returned.
 *
 * Changing this flag changes permissions, so it is deliberately a build-time
 * constant rather than a setting in the database.
 */
export const FINANCE_SPLIT_SUPER_ONLY = true;

export default FINANCE_SPLIT_SUPER_ONLY;
