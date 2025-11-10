/**
 * 文本块显示组件：支持原文/翻译/对照模式
 * @param {Object} props
 * @param {Object} props.block - 文本块数据
 * @param {string} props.mode - 显示模式：'original' | 'translated' | 'both'
 */
export default function BlockText({ block, mode = "both" }) {
  if (!block) return null

  const originalText = block.text || ""
  const translatedText = block.translated_text || ""

  let displayText = ""

  switch (mode) {
    case "original":
      displayText = originalText
      break
    case "translated":
      displayText = translatedText || originalText
      break
    case "both":
      if (translatedText) {
        displayText = `${originalText}\n\n---\n\n${translatedText}`
      } else {
        displayText = originalText
      }
      break
    default:
      displayText = originalText
  }

  return (
    <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-200 my-2">
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
        {displayText}
      </p>
      {mode === "both" && translatedText && (
        <div className="mt-2 pt-2 border-t border-gray-200">
          <span className="text-xs text-gray-500">原文</span>
          <p className="text-sm text-gray-600 mt-1">{originalText}</p>
        </div>
      )}
    </div>
  )
}

