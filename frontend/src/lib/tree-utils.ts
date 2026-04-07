import type { Klant } from "@/types";

export interface KlantTreeNode extends Klant {
  children: KlantTreeNode[];
  depth: number;
}

/**
 * Build a tree from a flat list of klanten.
 * Returns only root nodes (parentId is null/undefined).
 */
export function buildTree(klanten: Klant[]): KlantTreeNode[] {
  const map = new Map<string, KlantTreeNode>();

  // Create nodes
  for (const k of klanten) {
    map.set(k.id, { ...k, children: [], depth: 0 });
  }

  const roots: KlantTreeNode[] = [];

  // Link parent-child
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      const parent = map.get(node.parentId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Fix depth recursively for deeper nodes
  function setDepth(node: KlantTreeNode, depth: number) {
    node.depth = depth;
    for (const child of node.children) {
      setDepth(child, depth + 1);
    }
  }
  for (const root of roots) {
    setDepth(root, 0);
  }

  // Sort children by name
  function sortChildren(node: KlantTreeNode) {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    node.children.forEach(sortChildren);
  }
  roots.sort((a, b) => a.name.localeCompare(b.name));
  roots.forEach(sortChildren);

  return roots;
}

/**
 * Filter tree by search query. Returns a new tree with only matching nodes
 * and their ancestors to maintain tree structure.
 */
export function filterTree(roots: KlantTreeNode[], query: string): KlantTreeNode[] {
  if (!query.trim()) return roots;

  const lowerQuery = query.toLowerCase();

  function filterNode(node: KlantTreeNode): KlantTreeNode | null {
    const filteredChildren = node.children
      .map(filterNode)
      .filter((n): n is KlantTreeNode => n !== null);

    if (node.name.toLowerCase().includes(lowerQuery) || filteredChildren.length > 0) {
      return { ...node, children: filteredChildren };
    }
    return null;
  }

  return roots
    .map(filterNode)
    .filter((n): n is KlantTreeNode => n !== null);
}

/**
 * Get the ancestor path from root to a specific klant.
 */
export function getAncestorPath(klanten: Klant[], klantId: string): Klant[] {
  const map = new Map(klanten.map(k => [k.id, k]));
  const path: Klant[] = [];
  let current = map.get(klantId);
  while (current) {
    path.unshift(current);
    current = current.parentId ? map.get(current.parentId) : undefined;
  }
  return path;
}

/**
 * Find a node in the tree by ID.
 */
export function findNode(roots: KlantTreeNode[], id: string): KlantTreeNode | null {
  for (const root of roots) {
    if (root.id === id) return root;
    const found = findNode(root.children, id);
    if (found) return found;
  }
  return null;
}

/**
 * Collect all IDs in a subtree (node + all descendants).
 */
export function collectSubtreeIds(node: KlantTreeNode): string[] {
  const ids = [node.id];
  for (const child of node.children) {
    ids.push(...collectSubtreeIds(child));
  }
  return ids;
}
