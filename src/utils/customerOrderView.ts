/**
 * Internal operations fields - staff notes, admin-cancelled reasons and the id of
 * the admin who moved a status - belong to the admin panel only. Customer-facing
 * endpoints run every order through this view so the contract cannot ship them.
 */
export function customerOrderView<T>(order: T): T {
  const json = (order as { toJSON?: () => Record<string, unknown> })?.toJSON?.() ?? (order as Record<string, unknown>);
  if (!json || typeof json !== 'object') return order;

  const copy: Record<string, unknown> = { ...json };
  delete copy.adminNote;
  delete copy.cancelReason;

  const history = copy.statusHistory;
  if (Array.isArray(history)) {
    copy.statusHistory = history.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      const item: Record<string, unknown> = { ...(entry as Record<string, unknown>) };
      delete item.changedBy;
      // The note an operator types when moving a status is operations text -
      // courier arrangements, warehouse instructions - not a customer message.
      delete item.note;
      return item;
    });
  }

  return copy as T;
}

export function customerOrderListView<T>(orders: T[]): T[] {
  return orders.map(customerOrderView);
}
