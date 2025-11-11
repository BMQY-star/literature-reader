/**
 * 中英文对照双栏视图组件
 * @param {Object} props
 * @param {Array} props.layout - 文本块数组，包含text和translated_text
 * @param {string} props.originalContent - 原文Markdown内容（可选）
 * @param {string} props.translatedContent - 翻译后的Markdown内容（可选）
 * @param {string} props.taskId - 任务ID，用于加载图片
 */
import { useEffect, useRef, useState } from 'react'
import { getImageUrl } from '../api'

export default function BilingualView({ layout = [], originalContent = null, translatedContent = null, taskId = null }) {
  const leftRef = useRef(null)
  const rightRef = useRef(null)
  const [isScrolling, setIsScrolling] = useState(false)

  // 同步滚动
  useEffect(() => {
    const leftEl = leftRef.current
    const rightEl = rightRef.current
    
    if (!leftEl || !rightEl) return

    const handleLeftScroll = () => {
      if (!isScrolling) {
        setIsScrolling(true)
        rightEl.scrollTop = leftEl.scrollTop
        setTimeout(() => setIsScrolling(false), 100)
      }
    }

    const handleRightScroll = () => {
      if (!isScrolling) {
        setIsScrolling(true)
        leftEl.scrollTop = rightEl.scrollTop
        setTimeout(() => setIsScrolling(false), 100)
      }
    }

    leftEl.addEventListener('scroll', handleLeftScroll)
    rightEl.addEventListener('scroll', handleRightScroll)

    return () => {
      leftEl.removeEventListener('scroll', handleLeftScroll)
      rightEl.removeEventListener('scroll', handleRightScroll)
    }
  }, [isScrolling])

  // 渲染 MathJax 公式
  useEffect(() => {
    if ((originalContent || translatedContent || layout.length > 0) && window.MathJax) {
      const timer = setTimeout(() => {
        const leftEl = leftRef.current
        const rightEl = rightRef.current
        if (window.MathJax.typesetPromise) {
          const elements = []
          if (leftEl) elements.push(leftEl)
          if (rightEl) elements.push(rightEl)
          if (elements.length > 0) {
            window.MathJax.typesetPromise(elements).catch((err) => {
              console.warn('MathJax typeset error:', err)
            })
          }
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [originalContent, translatedContent, layout])

  // 检查layout中是否有翻译
  const hasTranslatedBlocks = layout.some(block => block.translated_text && block.translated_text.trim().length > 0)
  
  // 调试：打印翻译状态
  useEffect(() => {
    if (layout.length > 0) {
      const translatedCount = layout.filter(block => block.translated_text && block.translated_text.trim().length > 0).length
      console.log(`[BilingualView] Layout状态: 总数=${layout.length}, 已翻译=${translatedCount}, 有全文翻译=${!!translatedContent}`)
      if (translatedCount > 0 && !translatedContent) {
        console.log('[BilingualView] 检测到layout中有翻译，但translatedFullText为空，将使用layout模式显示')
      }
    }
  }, [layout, translatedContent])
  
  // 如果有全文内容且翻译内容不为空，使用全文内容；否则使用layout数据
  if (originalContent && translatedContent && translatedContent.trim().length > 0) {
    return (
      <div className="flex h-full border-t border-gray-200">
        {/* 左侧：原文 */}
        <div 
          ref={leftRef}
          className="flex-1 overflow-y-auto border-r border-gray-200 bg-white"
          style={{ height: '100%' }}
        >
          <div className="sticky top-0 bg-gray-100 px-4 py-2 border-b border-gray-200 z-10">
            <h3 className="text-sm font-semibold text-gray-700">原文（English）</h3>
          </div>
          <div className="prose prose-sm max-w-none p-6">
            <div 
              className="markdown-content"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(originalContent || '', taskId) }}
            />
          </div>
        </div>

        {/* 右侧：翻译 */}
        <div 
          ref={rightRef}
          className="flex-1 overflow-y-auto bg-gray-50"
          style={{ height: '100%' }}
        >
          <div className="sticky top-0 bg-gray-100 px-4 py-2 border-b border-gray-200 z-10">
            <h3 className="text-sm font-semibold text-gray-700">翻译（中文）</h3>
          </div>
          <div className="prose prose-sm max-w-none p-6">
            <div 
              className="markdown-content"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(translatedContent || '', taskId) }}
            />
          </div>
        </div>
      </div>
    )
  }
  
  // 如果没有全文翻译但有layout翻译，显示提示
  if (originalContent && !translatedContent && hasTranslatedBlocks) {
    console.log('检测到layout中有翻译，但translatedFullText为空，使用layout模式显示')
  }

  // 使用layout数据构建对照视图
  if (layout.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>暂无数据</p>
        <p className="text-sm mt-2">请先解析PDF并翻译文本块</p>
      </div>
    )
  }
  
  // 检查是否有翻译
  if (!hasTranslatedBlocks) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>暂无翻译内容</p>
        <p className="text-sm mt-2">请先点击"翻译全文"按钮进行翻译</p>
      </div>
    )
  }

  // 按页面分组
  const getBlockKey = (block, fallback) => {
    if (!block) return fallback
    return block.block_id || block.id || fallback
  }

  const blocksByPage = {}
  layout.forEach(block => {
    const page = block.page || block.page_no || block.pageNo || 1
    if (!blocksByPage[page]) {
      blocksByPage[page] = []
    }
    blocksByPage[page].push(block)
  })

  const pages = Object.keys(blocksByPage).sort((a, b) => parseInt(a) - parseInt(b))

  return (
    <div className="flex h-full border-t border-gray-200">
      {/* 左侧：原文 */}
      <div 
        ref={leftRef}
        className="flex-1 overflow-y-auto border-r border-gray-200 bg-white"
        style={{ height: '100%' }}
      >
        <div className="sticky top-0 bg-gray-100 px-4 py-2 border-b border-gray-200 z-10">
          <h3 className="text-sm font-semibold text-gray-700">原文（English）</h3>
        </div>
        <div className="p-6">
          {pages.map(page => (
            <div key={`original-page-${page}`} className="mb-8">
              <div className="text-xs font-semibold text-gray-500 mb-3">第 {page} 页</div>
              {blocksByPage[page].map((block, idx) => {
                const key = `original-${page}-${getBlockKey(block, idx)}`
                return (
                <div 
                  key={key}
                  className="mb-4 p-3 bg-gray-50 rounded border border-gray-200"
                >
                  <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
                    {block.text || ''}
                  </p>
                </div>
              )})}
            </div>
          ))}
        </div>
      </div>

      {/* 右侧：翻译 */}
      <div 
        ref={rightRef}
        className="flex-1 overflow-y-auto bg-gray-50"
        style={{ height: '100%' }}
      >
        <div className="sticky top-0 bg-gray-100 px-4 py-2 border-b border-gray-200 z-10">
          <h3 className="text-sm font-semibold text-gray-700">翻译（中文）</h3>
        </div>
        <div className="p-6">
          {pages.map(page => (
            <div key={`translated-page-${page}`} className="mb-8">
              <div className="text-xs font-semibold text-gray-500 mb-3">第 {page} 页</div>
              {blocksByPage[page].map((block, idx) => {
                const key = `translated-${page}-${getBlockKey(block, idx)}`
                // 优先显示翻译，如果没有翻译则显示原文（但添加提示）
                const displayText = block.translated_text && block.translated_text.trim()
                  ? block.translated_text.trim()
                  : (block.text || '')
                const hasTranslation = block.translated_text && block.translated_text.trim()
                
                return (
                  <div 
                    key={key}
                    className={`mb-4 p-3 rounded border ${
                      hasTranslation 
                        ? 'bg-white border-gray-200' 
                        : 'bg-yellow-50 border-yellow-200'
                    }`}
                  >
                    {!hasTranslation && (
                      <div className="text-xs text-yellow-600 mb-1 italic">
                        ⚠️ 此文本块尚未翻译
                      </div>
                    )}
                    <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
                      {displayText}
                    </p>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Markdown转HTML（简化版，用于双栏视图）
 */
function markdownToHtml(markdown, taskId) {
  if (!markdown) return ''
  
  let html = markdown
  
  // 处理图片路径
  if (taskId) {
    html = html.replace(
      /!\[\]\((?:\.\/)?images\/([^)]+)\)/g,
      (match, imageName) => {
        const imageUrl = getImageUrl(taskId, imageName)
        return `![](${imageUrl})`
      }
    )
  }
  
  // 保存表格
  const tables = []
  html = html.replace(/<table[\s\S]*?<\/table>/gi, (match) => {
    const id = `__TABLE_${tables.length}__`
    tables.push(match)
    return id
  })
  
  // 保存LaTeX公式
  const displayMaths = []
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
    const id = `__DISPLAY_MATH_${displayMaths.length}__`
    displayMaths.push(`$$${formula}$$`)
    return id
  })
  
  const inlineMaths = []
  html = html.replace(/\$([^$\n]+?)\$/g, (match, formula) => {
    const id = `__INLINE_MATH_${inlineMaths.length}__`
    inlineMaths.push(`$${formula}$`)
    return id
  })
  
  // 保存代码块
  const codeBlocks = []
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    const id = `__CODE_BLOCK_${codeBlocks.length}__`
    codeBlocks.push(match)
    return id
  })
  
  // 转义HTML
  html = escapeHtml(html)
  
  // 恢复代码块
  codeBlocks.forEach((block, i) => {
    const code = block.replace(/```[\w]*\n?/g, '').trim()
    html = html.replace(`__CODE_BLOCK_${i}__`, `<pre class="bg-gray-100 p-4 rounded-lg overflow-x-auto my-4"><code class="text-sm">${escapeHtml(code)}</code></pre>`)
  })
  
  // 恢复公式
  inlineMaths.forEach((formula, i) => {
    html = html.replace(`__INLINE_MATH_${i}__`, formula)
  })
  displayMaths.forEach((formula, i) => {
    html = html.replace(`__DISPLAY_MATH_${i}__`, formula)
  })
  
  // 恢复表格
  tables.forEach((table, i) => {
    let styledTable = table
      .replace(/<table([^>]*)>/gi, (match, attrs) => {
        const hasClass = /class\s*=/i.test(attrs)
        if (hasClass) {
          return match.replace(/class\s*=\s*["']([^"']*)["']/i, (m, cls) => {
            return `class="${cls} min-w-full border-collapse border border-gray-300 my-6 shadow-sm"`
          })
        } else {
          return `<table${attrs} class="min-w-full border-collapse border border-gray-300 my-6 shadow-sm">`
        }
      })
      .replace(/<th([^>]*)>/gi, (match, attrs) => {
        const hasClass = /class\s*=/i.test(attrs)
        if (hasClass) {
          return match.replace(/class\s*=\s*["']([^"']*)["']/i, (m, cls) => {
            return `class="${cls} border border-gray-300 px-4 py-3 bg-gray-100 font-semibold text-left align-top"`
          })
        } else {
          return `<th${attrs} class="border border-gray-300 px-4 py-3 bg-gray-100 font-semibold text-left align-top">`
        }
      })
      .replace(/<td([^>]*)>/gi, (match, attrs) => {
        const hasClass = /class\s*=/i.test(attrs)
        if (hasClass) {
          return match.replace(/class\s*=\s*["']([^"']*)["']/i, (m, cls) => {
            return `class="${cls} border border-gray-300 px-4 py-2 align-top"`
          })
        } else {
          return `<td${attrs} class="border border-gray-300 px-4 py-2 align-top">`
        }
      })
    
    html = html.replace(`__TABLE_${i}__`, `<div class="overflow-x-auto my-6 rounded-lg border border-gray-200 shadow-sm"><div class="inline-block min-w-full">${styledTable}</div></div>`)
  })
  
  // 标题
  html = html.replace(/^#### (.*$)/gim, '<h4 class="text-lg font-bold mt-6 mb-3">$1</h4>')
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold mt-6 mb-3">$1</h3>')
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold mt-8 mb-4">$1</h2>')
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold mt-8 mb-4">$1</h1>')
  
  // 粗体和斜体
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold">$1</strong>')
  html = html.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
  
  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">$1</a>')
  
  // 图片
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="max-w-full h-auto my-4 rounded shadow-sm" loading="lazy" />')
  
  // 段落
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
  
  return html
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

