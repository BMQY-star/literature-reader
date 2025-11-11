/**
 * 全文显示组件：显示Markdown格式的全文内容
 * @param {Object} props
 * @param {string} props.content - Markdown内容
 * @param {string} props.taskId - 任务ID，用于加载图片
 */
import { useEffect, useState, useRef } from 'react'
import { getImageUrl } from '../api'

export default function FullTextView({ content, taskId }) {
  const [processedContent, setProcessedContent] = useState('')
  const contentRef = useRef(null)

  useEffect(() => {
    if (!content) {
      setProcessedContent('')
      return
    }

    // 处理Markdown中的图片路径
    // 将 ![](images/xxx.jpg) 转换为 ![](/api/images/taskId/xxx.jpg)
    let processed = content
    if (taskId) {
      // 匹配图片引用：![](images/filename.jpg) 或 ![](./images/filename.jpg)
      processed = processed.replace(
        /!\[\]\((?:\.\/)?images\/([^)]+)\)/g,
        (match, imageName) => {
          const imageUrl = getImageUrl(taskId, imageName)
          return `![](${imageUrl})`
        }
      )
    }

    // 为行内数学公式增加非断行空格，避免中英文紧贴导致渲染问题
    processed = processed.replace(/([^\s])\$(?!\s)([^$\n]+?)\$/g, '$1 $' + '$2$')
    processed = processed.replace(/\$([^$\n]+?)\$(?!\s)([^\s])/g, '$$$1$ ' + '$2')

    setProcessedContent(processed)
  }, [content, taskId])

  // 渲染 MathJax 公式
  useEffect(() => {
    if (processedContent && window.MathJax) {
      // 等待 DOM 更新后渲染 MathJax
      const timer = setTimeout(() => {
        if (contentRef.current && window.MathJax.typesetPromise) {
          window.MathJax.typesetPromise([contentRef.current]).catch((err) => {
            console.warn('MathJax typeset error:', err)
          })
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [processedContent])

  if (!processedContent) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>暂无全文内容</p>
      </div>
    )
  }

  return (
    <div className="prose prose-sm max-w-none p-6">
      <article
        ref={contentRef}
        className="markdown-content"
        dangerouslySetInnerHTML={{ __html: markdownToHtml(processedContent) }}
      />
    </div>
  )
}

/**
 * 简单的Markdown转HTML（基础功能）
 * 注意：这是一个简化的实现，对于复杂的Markdown可能需要使用专业库如marked或react-markdown
 */
function markdownToHtml(markdown) {
  if (!markdown) return ''
  
  let html = markdown
  
  // 先保存表格（避免被转义破坏，保留rowspan、colspan等属性）
  const tables = []
  html = html.replace(/<table[\s\S]*?<\/table>/gi, (match) => {
    const id = `__TABLE_${tables.length}__`
    tables.push(match)
    return id
  })
  
  // 先保存 LaTeX 公式（避免被转义破坏）
  // 块级公式：$$...$$ 或 \[...\]
  const displayMaths = []
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
    const id = `__DISPLAY_MATH_${displayMaths.length}__`
    displayMaths.push(`$$${formula}$$`)
    return id
  })
  html = html.replace(/\\\[([\s\S]*?)\\\]/g, (match, formula) => {
    const id = `__DISPLAY_MATH_${displayMaths.length}__`
    displayMaths.push(`$$${formula}$$`)
    return id
  })
  
  // 行内公式：$...$ 或 \(...\)
  // 注意：由于已经先处理了块级公式 $$...$$，所以这里可以安全地处理行内公式
  const inlineMaths = []
  html = html.replace(/\$([^$\n]+?)\$/g, (match, formula) => {
    const id = `__INLINE_MATH_${inlineMaths.length}__`
    inlineMaths.push(`$${formula}$`)
    return id
  })
  html = html.replace(/\\\(([^\\]+?)\\\)/g, (match, formula) => {
    const id = `__INLINE_MATH_${inlineMaths.length}__`
    inlineMaths.push(`$${formula}$`)
    return id
  })
  
  // 先处理代码块（避免被其他规则处理）
  const codeBlocks = []
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    const id = `__CODE_BLOCK_${codeBlocks.length}__`
    codeBlocks.push(match)
    return id
  })
  
  // 处理行内代码
  const inlineCodes = []
  html = html.replace(/`([^`]+)`/g, (match, code) => {
    const id = `__INLINE_CODE_${inlineCodes.length}__`
    inlineCodes.push(`<code class="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono">${escapeHtml(code)}</code>`)
    return id
  })
  
  // 转义HTML（但保留已标记的代码块、表格和公式）
  html = escapeHtml(html)
  
  // 恢复行内公式
  inlineMaths.forEach((formula, i) => {
    html = html.replace(`__INLINE_MATH_${i}__`, formula)
  })
  
  // 恢复块级公式
  displayMaths.forEach((formula, i) => {
    html = html.replace(`__DISPLAY_MATH_${i}__`, formula)
  })
  
  // 恢复行内代码
  inlineCodes.forEach((code, i) => {
    html = html.replace(`__INLINE_CODE_${i}__`, code)
  })
  
  // 恢复代码块
  codeBlocks.forEach((block, i) => {
    const code = block.replace(/```[\w]*\n?/g, '').trim()
    html = html.replace(`__CODE_BLOCK_${i}__`, `<pre class="bg-gray-100 p-4 rounded-lg overflow-x-auto my-4"><code class="text-sm">${escapeHtml(code)}</code></pre>`)
  })
  
  // 恢复表格并添加样式（在转义后恢复，因为表格本身就是HTML）
  tables.forEach((table, i) => {
    // 为表格添加容器和样式，保留原有的rowspan、colspan等属性
    let styledTable = table
      // 处理 <table> 标签
      .replace(/<table([^>]*)>/gi, (match, attrs) => {
        // 检查是否已有class属性
        const hasClass = /class\s*=/i.test(attrs)
        if (hasClass) {
          return match.replace(/class\s*=\s*["']([^"']*)["']/i, (m, cls) => {
            return `class="${cls} min-w-full border-collapse border border-gray-300 my-6 shadow-sm"`
          })
        } else {
          return `<table${attrs} class="min-w-full border-collapse border border-gray-300 my-6 shadow-sm">`
        }
      })
      // 处理 <th> 标签
      .replace(/<th([^>]*)>/gi, (match, attrs) => {
        // 保留原有属性（如rowspan、colspan）
        const hasClass = /class\s*=/i.test(attrs)
        if (hasClass) {
          return match.replace(/class\s*=\s*["']([^"']*)["']/i, (m, cls) => {
            return `class="${cls} border border-gray-300 px-4 py-3 bg-gray-100 font-semibold text-left align-top"`
          })
        } else {
          return `<th${attrs} class="border border-gray-300 px-4 py-3 bg-gray-100 font-semibold text-left align-top">`
        }
      })
      // 处理 <td> 标签
      .replace(/<td([^>]*)>/gi, (match, attrs) => {
        // 保留原有属性（如rowspan、colspan）
        const hasClass = /class\s*=/i.test(attrs)
        if (hasClass) {
          return match.replace(/class\s*=\s*["']([^"']*)["']/i, (m, cls) => {
            return `class="${cls} border border-gray-300 px-4 py-2 align-top"`
          })
        } else {
          return `<td${attrs} class="border border-gray-300 px-4 py-2 align-top">`
        }
      })
      // 处理 <tr> 标签
      .replace(/<tr([^>]*)>/gi, (match, attrs) => {
        const hasClass = /class\s*=/i.test(attrs)
        if (hasClass) {
          return match.replace(/class\s*=\s*["']([^"']*)["']/i, (m, cls) => {
            return `class="${cls} hover:bg-gray-50"`
          })
        } else {
          return `<tr${attrs} class="hover:bg-gray-50">`
        }
      })
    
    // 用容器包装表格
    html = html.replace(`__TABLE_${i}__`, `<div class="overflow-x-auto my-6 rounded-lg border border-gray-200 shadow-sm"><div class="inline-block min-w-full">${styledTable}</div></div>`)
  })
  
  // 标题（按顺序处理，从多级到少级）
  html = html.replace(/^#### (.*$)/gim, '<h4 class="text-lg font-bold mt-6 mb-3">$1</h4>')
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold mt-6 mb-3">$1</h3>')
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold mt-8 mb-4">$1</h2>')
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold mt-8 mb-4">$1</h1>')
  
  // 粗体和斜体（保留 Markdown 语法，避免破坏公式）
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold">$1</strong>')
  html = html.replace(/(?<!\\)\*(.+?)(?<!\\)\*/g, '<em class="italic">$1</em>')
  
  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">$1</a>')
  
  // 图片（在转义后处理，因为图片URL可能包含特殊字符）
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="max-w-full h-auto my-4 rounded shadow-sm" loading="lazy" />')
  
  // 段落：将连续的空行分隔的文本转换为段落
  const lines = html.split('\n')
  const paragraphs = []
  let currentPara = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) {
      if (currentPara.length > 0) {
        paragraphs.push(currentPara.join(' '))
        currentPara = []
      }
    } else if (line.match(/^<[h|p|u|o|t|d|i|s|a|i|s]/) || line.match(/^<\/[h|p|u|o|t|d|i|s|a|i|s]/)) {
      // 已经是HTML标签，直接添加
      if (currentPara.length > 0) {
        paragraphs.push(currentPara.join(' '))
        currentPara = []
      }
      paragraphs.push(line)
    } else {
      currentPara.push(line)
    }
  }
  if (currentPara.length > 0) {
    paragraphs.push(currentPara.join(' '))
  }
  
  html = paragraphs.map(para => {
    if (para.trim() && !para.match(/^<[h|p|u|o|t|d|i|s|a|i|s]/) && !para.match(/^<\/[h|p|u|o|t|d|i|s|a|i|s]/)) {
      return `<p class="mb-4 leading-relaxed text-gray-800">${para}</p>`
    }
    return para
  }).join('\n')
  
  // 列表（简化处理）
  html = html.replace(/^\* (.*$)/gim, '<li class="ml-6 mb-1">$1</li>')
  html = html.replace(/^- (.*$)/gim, '<li class="ml-6 mb-1">$1</li>')
  html = html.replace(/^(\d+)\. (.*$)/gim, '<li class="ml-6 mb-1">$2</li>')
  
  // 包装列表项（简化：将连续的li包装在ul中）
  html = html.replace(/(<li[^>]*>.*?<\/li>\n?)+/g, (match) => {
    return `<ul class="list-disc my-4 space-y-1">${match}</ul>`
  })
  
  return html
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

