import { Types } from 'mongoose';
import { Category, type CategoryDocument } from '../models/Category';

export interface CategoryNode {
  id: string;
  code: string;
  slug: string;
  name: CategoryDocument['name'];
  image?: string;
  icon?: string;
  order: number;
  productCount: number;
  children: CategoryNode[];
}

function toNode(doc: CategoryDocument): CategoryNode {
  return {
    id: String(doc._id),
    code: doc.code,
    slug: doc.slug,
    name: doc.name,
    image: doc.image,
    icon: doc.icon,
    order: doc.order,
    productCount: doc.productCount,
    children: [],
  };
}

/**
 * One query, assembled in memory: the tree is small and read on every page.
 * `navOnly` selects which TOP-level boards appear in the navigation - their
 * sub-categories travel with them, because the mega menu's second level is
 * built from exactly those children (F-31).
 */
export async function categoryTree(navOnly = false): Promise<CategoryNode[]> {
  const docs = await Category.find({ isActive: true }).sort({ depth: 1, order: 1 });
  const byId = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];

  for (const doc of docs) byId.set(String(doc._id), toNode(doc));

  for (const doc of docs) {
    const node = byId.get(String(doc._id))!;
    const parentId = doc.parent ? String(doc.parent) : null;
    if (parentId && byId.has(parentId)) byId.get(parentId)!.children.push(node);
    else if (!navOnly || doc.showInNav) roots.push(node);
  }

  return roots;
}

export function findCategoryBySlug(slug: string) {
  return Category.findOne({ slug, isActive: true });
}

/** A category page must include products filed under any descendant. */
export async function descendantIds(categoryId: Types.ObjectId | string): Promise<string[]> {
  const id = new Types.ObjectId(String(categoryId));
  const descendants = await Category.find({ ancestors: id }).select('_id').lean();
  return [String(id), ...descendants.map((d) => String(d._id))];
}

export async function breadcrumb(categoryId: Types.ObjectId | string) {
  const category = await Category.findById(categoryId).populate('ancestors', 'slug name code');
  if (!category) return [];
  const chain = [...(category.ancestors as unknown as CategoryDocument[]), category];
  return chain.map((c) => ({ id: String(c._id), slug: c.slug, name: c.name }));
}
