/**
 * O tradutor automático do Chrome (muito comum no Android) troca nós de texto
 * da página por conta própria. Quando o React tenta remover/mover esses nós,
 * o navegador lança NotFoundError e a tela inteira quebra
 * ("Ops, algo deu errado"). Aqui tornamos essas operações tolerantes a falha.
 */
export function installTranslateDomGuard() {
  if (typeof Node === 'undefined') return;
  const anyNode = Node.prototype as any;
  if (anyNode.__translateGuard) return;
  anyNode.__translateGuard = true;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      try {
        child.parentNode?.removeChild(child);
      } catch {
        /* nó já removido pelo tradutor */
      }
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  } as typeof Node.prototype.removeChild;

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      return this.appendChild(newNode) as T;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  } as typeof Node.prototype.insertBefore;
}
