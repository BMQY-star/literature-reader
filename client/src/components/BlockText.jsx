/**
 * 文本块显示组件：支持原文/翻译/对照模式，支持Markdown渲染
 * @param {Object} props
 * @param {Object} props.block - 文本块数据
 * @param {string} props.mode - 显示模式：'original' | 'translated' | 'both'
 */
import { useEffect, useRef } from 'react'

export default function BlockText({ block, mode = "both" }) {
  const contentRef = useRef(null)
  
  if (!block) return null

  const originalText = block.text || ""
  const translatedText = block.translated_text || ""

  // 简单的Markdown转HTML（用于文本块显示）
  const markdownToHtml = (markdown) => {
    if (!markdown) return ''
    
    let html = markdown
    
    // 保护 LaTeX 公式
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
    
    const inlineMaths = []
    html = html.replace(/(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g, (match, formula) => {
      const id = `__INLINE_MATH_${inlineMaths.length}__`
      inlineMaths.push(`$${formula}$`)
      return id
    })
    html = html.replace(/\\\(([\s\S]*?)\\\)/g, (match, formula) => {
      const id = `__INLINE_MATH_${inlineMaths.length}__`
      inlineMaths.push(`$${formula}$`)
      return id
    })
    
    // 转义HTML
    html = html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
    
    // 恢复 LaTeX
    displayMaths.forEach((formula, i) => {
      html = html.replace(`__DISPLAY_MATH_${i}__`, formula)
    })
    inlineMaths.forEach((formula, i) => {
      html = html.replace(`__INLINE_MATH_${i}__`, formula)
    })
    
    // Markdown 基础格式
    html = html
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
    
    if (!html.startsWith('<')) {
      html = '<p>' + html
    }
    if (!html.endsWith('>')) {
      html = html + '</p>'
    }
    
    return html
  }

  // 渲染 MathJax
  useEffect(() => {
    if ((translatedText || originalText) && window.MathJax && contentRef.current) {
      const timer = setTimeout(() => {
        if (window.MathJax.typesetPromise) {
          window.MathJax.typesetPromise([contentRef.current]).catch((err) => {
            console.warn('MathJax typeset error:', err)
          })
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [translatedText, originalText])

  const renderText = (text, isMarkdown = false) => {
    if (!text) return null
    
    if (isMarkdown) {
      return (
        <div
          ref={contentRef}
          className="markdown-content prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(text) }}
        />
      )
    } else {
      return (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
          {text}
        </p>
      )
    }
  }

  // 判断文本是否包含Markdown格式
  const hasMarkdown = (text) => {
    if (!text) return false
    return /[#*`\[\]()]/.test(text) || /\$\$/.test(text) || /\$\w/.test(text)
  }

  const originalIsMarkdown = hasMarkdown(originalText)
  const translatedIsMarkdown = hasMarkdown(translatedText)

  return (
    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 my-2 hover:bg-gray-100 transition-colors">
      {mode === "original" && (
        <div className="text-sm leading-relaxed text-gray-800">
          {renderText(originalText, originalIsMarkdown)}
        </div>
      )}
      {mode === "translated" && (
        <div className="text-sm leading-relaxed text-gray-800">
          {renderText(translatedText || originalText, translatedIsMarkdown || originalIsMarkdown)}
        </div>
      )}
      {mode === "both" && (
        <div>
          {translatedText ? (
            <>
              <div className="mb-3">
                <div className="text-xs font-semibold text-gray-500 mb-1">原文</div>
                <div className="text-sm leading-relaxed text-gray-800">
                  {renderText(originalText, originalIsMarkdown)}
                </div>
              </div>
              <div className="pt-3 border-t border-gray-300">
                <div className="text-xs font-semibold text-gray-500 mb-1">翻译</div>
                <div className="text-sm leading-relaxed text-gray-800">
                  {renderText(translatedText, translatedIsMarkdown)}
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm leading-relaxed text-gray-800">
              {renderText(originalText, originalIsMarkdown)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

