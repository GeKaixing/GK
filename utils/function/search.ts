const MARK_CLASS =
  "rounded-[2px] bg-yellow-200/70 text-inherit dark:bg-yellow-500/40"

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * 在 HTML 内容中高亮命中的查询词（客户端、DOM 安全）。
 * 只遍历文本节点，标签/属性/链接结构不会被破坏；命中段包上 <mark>。
 * 返回 html 原样（未命中/空 query/SSR 环境时）。
 */
export function highlightMatches(html: string, query: string): string {
  const trimmed = query.trim()
  if (typeof window === "undefined" || !trimmed || !html) {
    return html
  }

  const parser = new DOMParser()
  const documentNode = parser.parseFromString(`<div>${html}</div>`, "text/html")
  const container = documentNode.body.firstElementChild

  if (!container) {
    return html
  }

  const regex = new RegExp(escapeRegExp(trimmed), "ig")
  const walker = documentNode.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []

  while (walker.nextNode()) {
    const node = walker.currentNode
    if (
      node.nodeType === Node.TEXT_NODE &&
      node.nodeValue &&
      node.parentElement &&
      !node.parentElement.closest("a,[data-mention-handle]")
    ) {
      textNodes.push(node as Text)
    }
  }

  let highlighted = false
  textNodes.forEach((textNode) => {
    const text = textNode.nodeValue ?? ""
    if (!regex.test(text)) {
      return
    }

    regex.lastIndex = 0
    let lastIndex = 0
    const fragment = documentNode.createDocumentFragment()

    for (const match of text.matchAll(regex)) {
      const matchIndex = match.index ?? -1
      const matchText = match[0] ?? ""
      if (matchIndex < 0 || !matchText) {
        continue
      }

      if (matchIndex > lastIndex) {
        fragment.appendChild(
          documentNode.createTextNode(text.slice(lastIndex, matchIndex))
        )
      }

      const mark = documentNode.createElement("mark")
      mark.className = MARK_CLASS
      mark.textContent = matchText
      fragment.appendChild(mark)

      lastIndex = matchIndex + matchText.length
    }

    if (lastIndex < text.length) {
      fragment.appendChild(documentNode.createTextNode(text.slice(lastIndex)))
    }

    textNode.replaceWith(fragment)
    highlighted = true
  })

  return highlighted ? container.innerHTML : html
}
