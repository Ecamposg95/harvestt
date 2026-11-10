import { DOMAINS, type Domain, type TermSummary } from './api'

export type TreeNode = TermSummary & { children: TreeNode[] }

const collator = new Intl.Collator('es')
const byLabel = (a: TreeNode, b: TreeNode) => collator.compare(a.label, b.label)

function sortDeep(nodes: TreeNode[]): TreeNode[] {
  nodes.sort(byLabel)
  for (const n of nodes) sortDeep(n.children)
  return nodes
}

/**
 * Agrupa los términos por dominio y los anida bajo su padre.
 * Un término cuyo padre no está en la lista (o es de otro dominio) queda como raíz.
 */
export function buildTree(terms: TermSummary[]): Record<Domain, TreeNode[]> {
  const out = Object.fromEntries(DOMAINS.map((d) => [d, [] as TreeNode[]])) as Record<Domain, TreeNode[]>
  const nodes = new Map<string, TreeNode>(terms.map((t) => [t.id, { ...t, children: [] }]))
  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : undefined
    if (parent && parent.domain === node.domain && parent.id !== node.id) {
      parent.children.push(node)
    } else if (node.domain in out) {
      out[node.domain as Domain].push(node)
    }
  }
  for (const d of DOMAINS) sortDeep(out[d])
  return out
}
