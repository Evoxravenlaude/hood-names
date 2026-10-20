/**
 * Browser translators (Chrome's, Edge's) replace the page's text nodes with
 * their own elements. React still holds the originals, and when it later
 * removes or moves one that is no longer where it left it, the DOM throws
 * and the whole page goes blank. These two guards let React carry on; the
 * known fix from React issue #11538. Names, addresses and amounts are also
 * marked translate="no" where they are shown, so they always update.
 */
export function guardAgainstTranslators() {
  if (typeof Node !== 'function' || !Node.prototype) return;
  const removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child) as T;
  };
  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) return node;
    return insertBefore.call(this, node, ref) as T;
  };
}
