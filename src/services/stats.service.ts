import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { User } from '../models/User';
import { Review } from '../models/Review';
import { Inquiry } from '../models/Inquiry';
import { ORDER_STATUSES, type OrderStatus } from '../constants';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function dashboardStats() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

  const [users, products, activeProducts, orders, openInquiries, pendingReviews] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    Product.countDocuments(),
    Product.countDocuments({ isActive: true }),
    Order.countDocuments(),
    Inquiry.countDocuments({ status: 'open' }),
    Review.countDocuments({ isApproved: false }),
  ]);

  const statusRows = await Order.aggregate<{ _id: OrderStatus; count: number }>([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const statusCounts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<OrderStatus, number>;
  for (const row of statusRows) statusCounts[row._id] = row.count;

  const [revenueRow] = await Order.aggregate<{ total: number; count: number }>([
    { $match: { status: { $nin: ['cancelled'] } } },
    { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
  ]);

  const [monthRow] = await Order.aggregate<{ total: number; count: number }>([
    { $match: { createdAt: { $gte: monthStart }, status: { $nin: ['cancelled'] } } },
    { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
  ]);

  const daily = await Order.aggregate([
    { $match: { createdAt: { $gte: weekAgo } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        orders: { $sum: 1 },
        revenue: { $sum: '$total' },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, date: '$_id', orders: 1, revenue: 1 } },
  ]);

  const recentOrders = await Order.find().sort({ createdAt: -1 }).limit(8).lean();

  const topProducts = await Product.find({ isActive: true })
    .sort({ soldCount: -1 })
    .limit(5)
    .select('name slug thumbnail price soldCount ratingAverage')
    .lean();

  return {
    totals: {
      users,
      products,
      activeProducts,
      orders,
      revenue: revenueRow?.total ?? 0,
      openInquiries,
      pendingReviews,
    },
    month: { orders: monthRow?.count ?? 0, revenue: monthRow?.total ?? 0 },
    statusCounts,
    daily,
    recentOrders,
    topProducts,
  };
}
