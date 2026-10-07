/* eslint-disable no-console */
/**
 * Removes only the records the security harnesses (secAssault*.mts) created in this
 * session's test database, then rebuilds the advertised rating for every product they
 * touched. Default is a dry run; `--apply` deletes.
 *
 *   npx tsx src/scripts/secCleanup.mts
 *   npx tsx src/scripts/secCleanup.mts --apply
 *
 * Selection is deliberately narrow: accounts whose email starts with one of the three
 * harness prefixes and whose domain is the harness's example domain. Nothing else -
 * seeded data, QA accounts from earlier passes - is matched or modified.
 */
import { connectDatabase, disconnectDatabase } from '../config/db';
import '../models';
import { Cart } from '../models/Cart';
import { Inquiry } from '../models/Inquiry';
import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { RefreshSession } from '../models/RefreshSession';
import { Review } from '../models/Review';
import { User } from '../models/User';
import { Address } from '../models/Address';
import { Subscription } from '../models/Subscription';
import { Payment } from '../models/Payment';
import { refreshProductRating } from '../services/rating.service';

const PREFIX = /^(sec|sec2|sec3|s3)(\.[a-z0-9]+)*@example\.test$/i;

async function main() {
  const apply = process.argv.includes('--apply');
  await connectDatabase();

  const users = await User.find({ email: { $regex: PREFIX.source } })
    .select('email name createdAt')
    .lean();
  console.log(`${users.length} harness account(s) matched (${apply ? 'DELETING' : 'dry run'})`);
  for (const user of users) console.log(`  ${user.email}  created ${String(user.createdAt)}`);

  const ids = users.map((u) => u._id);
  if (!ids.length) {
    console.log('nothing to clean up');
    await disconnectDatabase();
    return;
  }

  const [reviews, inquiries, orders, carts, sessions, addresses, subscriptions] = await Promise.all([
    Review.find({ user: { $in: ids } }).select('product title rating helpfulCount').lean(),
    Inquiry.find({ user: { $in: ids } }).select('subject status').lean(),
    Order.find({ user: { $in: ids } }).select('code status total').lean(),
    Cart.countDocuments({ user: { $in: ids } }),
    RefreshSession.countDocuments({ user: { $in: ids } }),
    Address.countDocuments({ user: { $in: ids } }),
    Subscription.countDocuments({ user: { $in: ids } }),
  ]);

  console.log(`reviews=${reviews.length} inquiries=${inquiries.length} orders=${orders.length} carts=${carts} refreshSessions=${sessions} addresses=${addresses} subscriptions=${subscriptions}`);
  for (const review of reviews) console.log(`  review ${String(review._id)} product=${String(review.product)} "${review.title}" ${review.rating}★ helpful=${review.helpfulCount}`);
  for (const inquiry of inquiries) console.log(`  inquiry ${String(inquiry._id)} "${inquiry.subject}" ${inquiry.status}`);
  for (const order of orders) console.log(`  order ${String(order._id)} ${order.code} ${order.status} total=${order.total}`);

  const orderIds = orders.map((o) => o._id);
  const payments = orderIds.length ? await Payment.countDocuments({ order: { $in: orderIds } }) : 0;
  console.log(`payments=${payments}`);

  const products = [...new Set(reviews.map((r) => String(r.product)))];
  console.log(`products to re-sync: ${products.join(', ') || 'none'}`);

  if (!apply) {
    console.log('dry run complete, no documents changed');
    await disconnectDatabase();
    return;
  }

  await Promise.all([
    Review.deleteMany({ user: { $in: ids } }),
    Inquiry.deleteMany({ user: { $in: ids } }),
    Payment.deleteMany(orderIds.length ? { order: { $in: orderIds } } : { _id: null }),
    Order.deleteMany({ user: { $in: ids } }),
    Cart.deleteMany({ user: { $in: ids } }),
    RefreshSession.deleteMany({ user: { $in: ids } }),
    Address.deleteMany({ user: { $in: ids } }),
    Subscription.deleteMany({ user: { $in: ids } }),
    User.deleteMany({ _id: { $in: ids } }),
  ]);
  console.log('deleted');

  for (const productId of products) await refreshProductRating(productId);
  const rows = await Product.find({ _id: { $in: products } }).select('slug ratingAverage ratingCount soldCount').lean();
  for (const row of rows) console.log(`restored ${row.slug}: ${row.ratingAverage}/${row.ratingCount}, soldCount=${row.soldCount}`);

  const remaining = await User.countDocuments({ email: { $regex: PREFIX.source } });
  console.log(`remaining harness accounts: ${remaining}`);
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
