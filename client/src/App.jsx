import { useState, useRef, useEffect } from 'react'
import PdfViewer from './components/PdfViewer'
import LayoutOverlay from './components/LayoutOverlay'
import BlockText from './components/BlockText'
import { uploadFile, parsePdfWithApi, getTaskStatus, getBatchStatus, translateFullMarkdownStream, getFileUrl, getFullText, getTranslationDownloadUrl } from './api'
import FullTextView from './components/FullTextView'
import BilingualView from './components/BilingualView'

function App() {
  const [pdfFile, setPdfFile] = useState(null)
  const [layout, setLayout] = useState([])
  const [translatedData, setTranslatedData] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [displayMode, setDisplayMode] = useState('both') // 'original' | 'translated' | 'both'
  const [selectedBlock, setSelectedBlock] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [parsingStatus, setParsingStatus] = useState(null) // 解析状态：'uploading' | 'parsing' | 'done' | 'failed'
  const [taskId, setTaskId] = useState(null)
  const [batchId, setBatchId] = useState(null)
  const [parseProgress, setParseProgress] = useState(null) // { extracted: 0, total: 0 }
  const [translating, setTranslating] = useState(false) // 翻译状态
  const [translationProgress, setTranslationProgress] = useState(null) // { translated: 0, total: 0 }
  const [forceRetranslate, setForceRetranslate] = useState(false) // 是否强制重新翻译
  const [viewMode, setViewMode] = useState('pdf') // 'pdf' | 'fulltext' | 'bilingual' - 视图模式
  const [fullTextContent, setFullTextContent] = useState(null) // 全文Markdown内容
  const [fullTextLoading, setFullTextLoading] = useState(false) // 全文加载状态
  const [translatedFullText, setTranslatedFullText] = useState(null) // 翻译后的全文内容
  const [isFullscreen, setIsFullscreen] = useState(false) // 是否全屏显示全文
  const [translationFile, setTranslationFile] = useState(null) // 翻译结果JSON文件名
  
  // 可调整大小的面板状态
  const [leftPanelWidth, setLeftPanelWidth] = useState(66.67) // 默认66.67%（2/3）
  const [isResizing, setIsResizing] = useState(false)
  const [isLargeScreen, setIsLargeScreen] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  )
  const containerRef = useRef(null)
  
  // 监听窗口大小变化
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const handleResize = () => {
      setIsLargeScreen(window.innerWidth >= 1024)
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 监听ESC键退出全屏
  useEffect(() => {
    if (!isFullscreen) return
    
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false)
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen])

  // 处理PDF文件上传和解析
  const handlePdfUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    try {
      setLoading(true)
      setError(null)
      
      // 先上传文件
      const uploadResult = await uploadFile(file)
      setPdfFile(uploadResult.filename)
      
      // 调用MinerU API解析（不等待完成，返回task_id）
      setParsingStatus('parsing')
      try {
        const parseResult = await parsePdfWithApi(file, false)
        
        // 如果有task_id，开始轮询任务状态
        if (parseResult.task_id) {
          setTaskId(parseResult.task_id)
          pollTaskStatus(parseResult.task_id)
        } 
        // 如果有batch_id，说明使用了批量上传
        else if (parseResult.batch_id) {
          setBatchId(parseResult.batch_id)
          setParsingStatus('parsing')
          pollBatchStatus(parseResult.batch_id)
        }
        // 如果直接返回了结果
        else if (parseResult.layout) {
          setLayout(parseResult.layout)
          setParsingStatus('done')
        }
      } catch (parseErr) {
        // 如果API解析失败，只显示警告，不阻止PDF显示
        console.warn('MinerU API解析失败:', parseErr.message)
        setParsingStatus('failed')
        setError(`PDF上传成功，但解析失败: ${parseErr.message}`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // 轮询任务状态
  const pollTaskStatus = async (taskId) => {
    const maxAttempts = 120 // 最多轮询120次（10分钟）
    let attempts = 0
    
    const poll = async () => {
      try {
        const result = await getTaskStatus(taskId)
        const state = result.state
        
        console.log(`任务状态查询 [${attempts + 1}/${maxAttempts}]:`, state, result)
        
        if (state === 'done') {
          // 任务完成，设置layout
          setParsingStatus('done')
          console.log('任务完成，结果数据:', result)
          
          if (result.layout && result.layout.length > 0) {
            console.log('设置layout数据，数量:', result.layout.length)
            setLayout(result.layout)
            setError(null)
            setParseProgress(null)
            
            // 尝试加载全文内容
            if (taskId) {
              loadFullText(taskId)
            }
          } else {
            console.warn('未获取到layout数据，尝试从mineru_data提取')
            // 尝试从mineru_data提取layout
            if (result.mineru_data) {
              const extractedLayout = extractLayoutFromMineruData(result.mineru_data)
              if (extractedLayout.length > 0) {
                console.log('从mineru_data提取layout，数量:', extractedLayout.length)
                setLayout(extractedLayout)
                setError(null)
                
                // 尝试加载全文内容
                if (taskId) {
                  loadFullText(taskId)
                }
              } else {
                setError('解析完成，但文档中未找到文本块，请检查PDF是否为扫描件')
              }
            } else {
              setError('解析完成，但未获取到layout数据，请查看后端日志')
            }
          }
        } else if (state === 'failed') {
          setParsingStatus('failed')
          setError(`解析失败: ${result.err_msg || '未知错误'}`)
          setParseProgress(null)
        } else if (state === 'running' || state === 'pending' || state === 'converting') {
          setParsingStatus('parsing')
          
          // 更新进度
          const progress = result.extract_progress
          if (progress) {
            setParseProgress({
              extracted: progress.extracted_pages || 0,
              total: progress.total_pages || 0,
              startTime: progress.start_time
            })
          }
          
          // 继续轮询
          attempts++
          if (attempts < maxAttempts) {
            setTimeout(poll, 3000) // 3秒后再次查询
          } else {
            setParsingStatus('failed')
            setError('解析超时，请稍后手动查询任务状态')
          }
        }
      } catch (err) {
        console.error('查询任务状态失败:', err)
        attempts++
        if (attempts < maxAttempts) {
          setTimeout(poll, 3000)
        } else {
          setParsingStatus('failed')
          setError('查询任务状态失败，请稍后重试')
        }
      }
    }
    
    // 开始轮询
    poll()
  }

  // 轮询批量任务状态
  const pollBatchStatus = async (batchId) => {
    const maxAttempts = 120 // 最多轮询120次（10分钟）
    let attempts = 0
    
    const poll = async () => {
      try {
        const result = await getBatchStatus(batchId)
        const state = result.state
        
        console.log(`批量任务状态查询 [${attempts + 1}/${maxAttempts}]:`, state, result)
        
        if (state === 'done') {
          // 任务完成，设置layout
          setParsingStatus('done')
          console.log('批量任务完成，结果数据:', result)
          
          if (result.layout && result.layout.length > 0) {
            console.log('设置layout数据，数量:', result.layout.length)
            setLayout(result.layout)
            setError(null)
            setParseProgress(null)
            
            // 尝试加载全文内容
            if (batchId) {
              loadFullText(batchId)
            }
          } else {
            console.warn('未获取到layout数据，尝试从mineru_data提取')
            // 尝试从mineru_data提取layout
            if (result.mineru_data) {
              const extractedLayout = extractLayoutFromMineruData(result.mineru_data)
              if (extractedLayout.length > 0) {
                console.log('从mineru_data提取layout，数量:', extractedLayout.length)
                setLayout(extractedLayout)
                setError(null)
                
                // 尝试加载全文内容
                if (batchId) {
                  loadFullText(batchId)
                }
              } else {
                setError('解析完成，但文档中未找到文本块，请检查PDF是否为扫描件')
              }
            } else {
              setError('解析完成，但未获取到layout数据，请查看后端日志')
            }
          }
        } else if (state === 'failed') {
          setParsingStatus('failed')
          setError(`解析失败: ${result.err_msg || '未知错误'}`)
          setParseProgress(null)
        } else if (state === 'running' || state === 'pending' || state === 'waiting-file' || state === 'converting') {
          setParsingStatus('parsing')
          
          // 更新进度
          const progress = result.extract_progress
          if (progress) {
            setParseProgress({
              extracted: progress.extracted_pages || 0,
              total: progress.total_pages || 0,
              startTime: progress.start_time
            })
          }
          
          // 继续轮询
          attempts++
          if (attempts < maxAttempts) {
            setTimeout(poll, 3000) // 3秒后再次查询
          } else {
            setParsingStatus('failed')
            setError('解析超时，请稍后手动查询任务状态')
          }
        }
      } catch (err) {
        console.error('查询批量任务状态失败:', err)
        attempts++
        if (attempts < maxAttempts) {
          setTimeout(poll, 3000)
        } else {
          setParsingStatus('failed')
          setError('查询任务状态失败，请稍后重试')
        }
      }
    }
    
    // 开始轮询
    poll()
  }

  // 加载全文内容
  const loadFullText = async (id) => {
    if (!id) return
    
    try {
      setFullTextLoading(true)
      const result = await getFullText(id)
      setFullTextContent(result.content)
      console.log('全文内容加载成功，长度:', result.content?.length)
      
      // 如果已有翻译的layout，生成翻译后的全文
      if (layout.length > 0 && layout.some(block => block.translated_text)) {
        generateTranslatedFullText(result.content, layout)
      }
    } catch (err) {
      console.warn('加载全文失败:', err.message)
      // 不显示错误，因为全文是可选的
    } finally {
      setFullTextLoading(false)
    }
  }

  // 生成翻译后的全文内容
  const generateTranslatedFullText = (originalText, layoutData) => {
    if (!originalText || !layoutData || layoutData.length === 0) return
    
    try {
      // 方法1：尝试基于原文结构，用翻译替换对应文本块
      // 但这种方法可能不够准确，因为全文中的文本格式可能与layout中的不完全一致
      
      // 方法2：直接基于layout数据构建翻译后的全文（更可靠）
      // 按页面分组，然后按顺序拼接翻译后的文本块
      const blocksByPage = {}
      layoutData.forEach(block => {
        const page = block.page || block.page_no || block.pageNo || 1
        if (!blocksByPage[page]) {
          blocksByPage[page] = []
        }
        blocksByPage[page].push(block)
      })
      
      const pages = Object.keys(blocksByPage).sort((a, b) => parseInt(a) - parseInt(b))
      
      // 构建翻译后的全文
      const translatedParts = []
      pages.forEach(page => {
        const blocks = blocksByPage[page]
        blocks.forEach(block => {
          // 优先使用翻译，如果没有翻译则使用原文
          const text = block.translated_text && block.translated_text.trim() 
            ? block.translated_text.trim() 
            : (block.text && block.text.trim() ? block.text.trim() : '')
          
          if (text) {
            translatedParts.push(text)
          }
        })
      })
      
      // 如果基于layout构建的翻译文本太短，则尝试文本替换方法
      const layoutBasedText = translatedParts.join('\n\n')
      
      if (layoutBasedText.length > originalText.length * 0.3) {
        // 如果基于layout的文本足够长，使用它
        setTranslatedFullText(layoutBasedText)
        console.log('翻译后的全文已生成（基于layout数据）')
      } else {
        // 否则尝试文本替换方法
        let translatedText = originalText
        const sortedBlocks = [...layoutData]
          .filter(block => block.translated_text && block.text)
          .sort((a, b) => (b.text?.length || 0) - (a.text?.length || 0))
        
        let replacedCount = 0
        sortedBlocks.forEach(block => {
          const original = block.text.trim()
          const translated = block.translated_text.trim()
          
          if (original && translated && original !== translated && original.length > 10) {
            // 转义特殊字符
            const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            // 尝试匹配（不区分大小写，允许前后有空白）
            const regex = new RegExp(`\\s*${escapedOriginal}\\s*`, 'gi')
            if (regex.test(translatedText)) {
              translatedText = translatedText.replace(regex, (match) => {
                // 保留原有的空白字符
                const leadingWhitespace = match.match(/^\s*/)?.[0] || ''
                const trailingWhitespace = match.match(/\s*$/)?.[0] || ''
                return leadingWhitespace + translated + trailingWhitespace
              })
              replacedCount++
            }
          }
        })
        
        if (replacedCount > 0) {
          setTranslatedFullText(translatedText)
          console.log(`翻译后的全文已生成（文本替换，替换了 ${replacedCount} 处）`)
        } else {
          // 如果替换失败，使用基于layout的方法
          setTranslatedFullText(layoutBasedText)
          console.log('翻译后的全文已生成（回退到layout数据）')
        }
      }
    } catch (err) {
      console.warn('生成翻译全文失败:', err.message)
      // 失败时，至少尝试基于layout构建
      try {
        const blocksByPage = {}
        layoutData.forEach(block => {
          const page = block.page || block.page_no || block.pageNo || 1
          if (!blocksByPage[page]) {
            blocksByPage[page] = []
          }
          blocksByPage[page].push(block)
        })
        const pages = Object.keys(blocksByPage).sort((a, b) => parseInt(a) - parseInt(b))
        const translatedParts = []
        pages.forEach(page => {
          blocksByPage[page].forEach(block => {
            const text = block.translated_text && block.translated_text.trim() 
              ? block.translated_text.trim() 
              : (block.text && block.text.trim() ? block.text.trim() : '')
            if (text) {
              translatedParts.push(text)
            }
          })
        })
        setTranslatedFullText(translatedParts.join('\n\n'))
      } catch (fallbackErr) {
        console.error('生成翻译全文完全失败:', fallbackErr)
      }
    }
  }

  // 将翻译后的 Markdown 映射到 layout 中的文本块
  const mapTranslationToBlocks = (translatedMarkdown, layoutBlocks) => {
    if (!translatedMarkdown || !layoutBlocks || layoutBlocks.length === 0) {
      return
    }

    try {
      // 将翻译后的 Markdown 按段落分割（按双换行符或标题分割）
      const translatedParagraphs = translatedMarkdown
        .split(/\n\n+/)
        .map(p => p.trim())
        .filter(p => p.length > 0)

      // 为每个 layout 块查找对应的翻译段落
      const updatedLayout = layoutBlocks.map(block => {
        if (!block.text || block.text.trim().length === 0) {
          return block
        }

        const originalText = block.text.trim()
        
        // 方法1：尝试精确匹配（去除标点符号和空白后比较）
        const normalizeText = (text) => {
          return text
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
        }

        const normalizedOriginal = normalizeText(originalText)
        
        // 在翻译段落中查找最匹配的段落
        let bestMatch = null
        let bestScore = 0

        for (const translatedPara of translatedParagraphs) {
          const normalizedTranslated = normalizeText(translatedPara)
          
          // 计算相似度（简单的包含关系或长度相似度）
          let score = 0
          
          // 如果翻译段落包含原文的关键词，给高分
          const originalWords = normalizedOriginal.split(/\s+/).filter(w => w.length > 3)
          const translatedWords = normalizedTranslated.split(/\s+/).filter(w => w.length > 3)
          
          const commonWords = originalWords.filter(w => translatedWords.includes(w))
          if (commonWords.length > 0) {
            score = commonWords.length / Math.max(originalWords.length, translatedWords.length)
          }
          
          // 如果长度相似，也加分
          const lengthRatio = Math.min(originalText.length, translatedPara.length) / 
                              Math.max(originalText.length, translatedPara.length)
          score += lengthRatio * 0.3
          
          if (score > bestScore) {
            bestScore = score
            bestMatch = translatedPara
          }
        }

        // 如果找到匹配的翻译（相似度 > 0.3），则使用它
        if (bestMatch && bestScore > 0.3) {
          return {
            ...block,
            translated_text: bestMatch
          }
        }

        // 如果没找到匹配，尝试基于位置匹配（按顺序）
        const blockIndex = layoutBlocks.indexOf(block)
        if (blockIndex >= 0 && blockIndex < translatedParagraphs.length) {
          return {
            ...block,
            translated_text: translatedParagraphs[blockIndex]
          }
        }

        return block
      })

      // 更新 layout state
      setLayout(updatedLayout)
      console.log(`已将翻译映射到 ${updatedLayout.filter(b => b.translated_text).length} 个文本块`)
    } catch (err) {
      console.error('映射翻译到文本块失败:', err)
    }
  }

  // 处理翻译（流式翻译，实时显示进度）
  const handleTranslate = async () => {
    if (!fullTextContent) {
      setError('请先解析并加载全文内容')
      return
    }

    const activeTaskId = taskId || batchId
    if (!activeTaskId) {
      setError('未找到任务ID，请先上传并解析PDF')
      return
    }
    
    try {
      setTranslating(true)
      setError(null)
      setTranslatedFullText('') // 清空之前的翻译
      setTranslationFile(null)
      
      const translationTimestamp = Math.floor(Date.now() / 1000)
      const translationId = `trans_${translationTimestamp}_${Math.random().toString(36).substr(2, 9)}`

      // 用于累积翻译内容
      const translatedChunks = []
      let totalChunks = 0

      // 使用流式翻译 API
      await translateFullMarkdownStream(
        activeTaskId,
        'zh',
        null,
        translationId,
        translationTimestamp,
        // onProgress 回调
        (eventType, chunkNumber, total, translatedChunk, status, error) => {
          if (eventType === 'init') {
            totalChunks = total || 0
            setTranslationProgress({ translated: 0, total: total || 0, skipped: 0, failed: 0 })
            if (totalChunks > 0) {
              translatedChunks.length = totalChunks
            }
          } else if (eventType === 'progress') {
            totalChunks = total || totalChunks
            // 更新进度
            setTranslationProgress(prev => ({
              translated: Math.max(chunkNumber, prev?.translated || 0),
              total: total || prev?.total || totalChunks,
              skipped: prev?.skipped || 0,
              failed: status === 'failed' ? (prev?.failed || 0) + 1 : (prev?.failed || 0)
            }))

            // 累积翻译内容
            if (translatedChunk) {
              translatedChunks[chunkNumber - 1] = translatedChunk
              
              // 实时更新显示（拼接已翻译的块）
              const currentTranslated = translatedChunks
                .filter(chunk => chunk !== undefined && chunk !== null)
                .join('\n\n')
              setTranslatedFullText(currentTranslated)
            }

            if (error) {
              console.error(`翻译块 ${chunkNumber} 失败:`, error)
            }
          }
        },
        // onComplete 回调
        (content, translationFile) => {
          setTranslatedFullText(content)
          setTranslationFile(translationFile)
          
          // 将翻译后的 Markdown 映射到 layout 中的文本块
          if (content && layout.length > 0) {
            mapTranslationToBlocks(content, layout)
          }
          
          setTranslationProgress(prev => {
            const totalValue = prev?.total || totalChunks
            return {
              translated: totalValue,
              total: totalValue,
              skipped: prev?.skipped || 0,
              failed: prev?.failed || 0
            }
          })
          setError(null)
          console.log('翻译完成！')
        },
        // onError 回调
        (error) => {
          const errorMsg = error.message || '未知错误'
          setError(`翻译失败: ${errorMsg}`)
          console.error('翻译错误详情:', error)
        }
      )
    } catch (err) {
      const errorMsg = err.message || '未知错误'
      setError(`翻译失败: ${errorMsg}`)
      console.error('翻译错误详情:', err)
    } finally {
      setTranslating(false)
    }
  }

  // 从MinerU数据中提取layout
  const extractLayoutFromMineruData = (mineruData) => {
    const extractedLayout = []
    
    const countersMap = new Map()
    const getCounter = (pageNo) => {
      if (!countersMap.has(pageNo)) {
        countersMap.set(pageNo, { page: pageNo, index: 0 })
      }
      return countersMap.get(pageNo)
    }
    
    const getBlockId = (block, counter) => {
      if (!block) {
        return `p${counter.page}_b${counter.index++}`
      }
      const rawId = block.block_id || block.id || block.uuid || block.index
      if (rawId !== undefined && rawId !== null) {
        return String(rawId)
      }
      return `p${counter.page}_b${counter.index++}`
    }
    
    const pushBlock = (pageNo, bbox, text, type, block, extra = {}) => {
      if (!text) return
      const counter = getCounter(pageNo)
      extractedLayout.push({
        page: pageNo,
        bbox: bbox,
        text: text,
        type: type,
        block_id: getBlockId(block, counter),
        ...extra
      })
    }
    
    try {
      if (!mineruData) {
        console.warn('mineruData为空')
        return extractedLayout
      }
      
      // 格式1: layout.json格式 - {"pdf_info": [...]}
      if (mineruData.pdf_info && Array.isArray(mineruData.pdf_info)) {
        console.log('检测到layout.json格式（pdf_info）')
        mineruData.pdf_info.forEach((pageData) => {
          const pageIdx = pageData.page_idx || 0
          const pageNo = pageIdx + 1
          
          const paraBlocks = pageData.para_blocks || []
          paraBlocks.forEach((block) => {
            const blockType = block.type || ''
            if (blockType !== 'text' && blockType !== 'title') {
              return
            }
            
            const bbox = block.bbox || []
            if (!bbox || bbox.length < 4) {
              return
            }
            
            const lines = block.lines || []
            const textParts = []
            
            lines.forEach((line) => {
              if (line && typeof line === 'object') {
                const spans = line.spans || []
                spans.forEach((span) => {
                  if (span && typeof span === 'object') {
                    const content = span.content || ''
                    if (content) {
                      textParts.push(content)
                    }
                  }
                })
              }
            })
            
            const text = textParts.join(' ').trim()
            pushBlock(pageNo, bbox, text, blockType, block)
          })
        })
        
        console.log('提取的layout数量:', extractedLayout.length)
        return extractedLayout
      }
      
      // 格式2: content_list.json格式 - [{"text": "...", "bbox": [...], "page_idx": 0}, ...]
      if (Array.isArray(mineruData) && mineruData.length > 0) {
        const firstItem = mineruData[0]
        if (firstItem && typeof firstItem === 'object' && 'text' in firstItem && 'page_idx' in firstItem) {
          console.log('检测到content_list.json格式')
          mineruData.forEach((item) => {
            const text = (item.text || '').trim()
            if (!text) return
            
            const bbox = item.bbox || []
            if (!bbox || bbox.length < 4) return
            
            const pageIdx = item.page_idx || 0
            const pageNo = pageIdx + 1
            
            let blockType = item.type || 'text'
            if (item.text_level === 1) {
              blockType = 'title'
            }
            
            pushBlock(pageNo, bbox, text, blockType, item)
          })
          
          console.log('提取的layout数量:', extractedLayout.length)
          return extractedLayout
        }
        
        // 格式3: model.json格式 - [[{...}, ...], ...] (二维数组，第一维是页面)
        if (Array.isArray(firstItem)) {
          console.log('检测到model.json格式（二维数组）')
          mineruData.forEach((pageBlocks, pageIdx) => {
            const pageNo = pageIdx + 1
            
            if (!Array.isArray(pageBlocks)) return
            
            pageBlocks.forEach((block) => {
              if (!block || typeof block !== 'object') return
              
              const content = (block.content || '').trim()
              if (!content) return
              
              const bbox = block.bbox || []
              if (!bbox || bbox.length < 4) return
              
              const blockType = block.type || 'text'
              
              pushBlock(pageNo, bbox, content, blockType, block)
            })
          })
          
          console.log('提取的layout数量:', extractedLayout.length)
          return extractedLayout
        }
      }
      
      // 格式4: 旧格式 - {"pages": [...]}
      if (mineruData.pages && Array.isArray(mineruData.pages)) {
        console.log('检测到旧格式（pages）')
        mineruData.pages.forEach((page) => {
          const pageNo = page.page_no || page.page || page.pageNo || page.page_idx + 1 || 1
          const blocks = page.blocks || []
          
          blocks.forEach((block) => {
            const blockType = block.type || ''
            if (blockType !== 'text' && blockType !== 'title') {
              return
            }
            
            const lines = block.lines || []
            const textParts = []
            
            lines.forEach((line) => {
              if (line && typeof line === 'object') {
                const lineText = line.text || line.content || ''
                if (lineText) {
                  textParts.push(lineText)
                }
              }
            })
            
            const text = textParts.join(' ').trim()
            const bbox = block.bbox || block.bbox_coords || [0, 0, 0, 0]
            pushBlock(pageNo, bbox, text, blockType, block)
          })
        })
        
        console.log('提取的layout数量:', extractedLayout.length)
        return extractedLayout
      }
      
      console.warn('未识别到支持的MineruData格式:', mineruData)
      return extractedLayout
    } catch (err) {
      console.error('提取layout失败:', err)
      return extractedLayout
    }
  }

  // 拖拽调整大小处理
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing || !containerRef.current) return
      
      const container = containerRef.current
      const containerRect = container.getBoundingClientRect()
      const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100
      
      // 限制在20%到80%之间
      const clampedWidth = Math.max(20, Math.min(80, newLeftWidth))
      setLeftPanelWidth(clampedWidth)
    }
    
    const handleMouseUp = () => {
      setIsResizing(false)
    }
    
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [isResizing])
  
  const handleResizeStart = (e) => {
    e.preventDefault()
    setIsResizing(true)
  }

  // 获取当前页的文本块
  const currentPageBlocks = layout.filter(b => b.page === currentPage)
  
  // 调试信息
  console.log('当前状态:', {
    pdfFile,
    layoutCount: layout.length,
    currentPage,
    currentPageBlocks: currentPageBlocks.length,
    parsingStatus
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-800">📚 文献阅读器</h1>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* 文件上传区域 */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">文件上传</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              上传PDF文件（将自动通过MinerU API解析）
            </label>
            <input
              type="file"
              accept=".pdf"
              onChange={handlePdfUpload}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              disabled={loading}
            />
            <p className="mt-2 text-xs text-gray-500">
              上传PDF后，系统会自动调用MinerU API进行解析，解析完成后会显示文档结构
            </p>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* 加载提示 */}
        {loading && (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded mb-4">
            正在上传文件...
          </div>
        )}

        {/* 解析状态提示 */}
        {parsingStatus === 'parsing' && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded mb-4">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-700"></div>
              <span>正在通过MinerU API解析PDF，请稍候...</span>
            </div>
            {parseProgress && parseProgress.total > 0 ? (
              <div className="mt-2">
                <div className="flex justify-between text-sm mb-1">
                  <span>解析进度:</span>
                  <span>{parseProgress.extracted} / {parseProgress.total} 页 ({Math.round((parseProgress.extracted / parseProgress.total) * 100)}%)</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-yellow-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(parseProgress.extracted / parseProgress.total) * 100}%` }}
                  ></div>
                </div>
                {parseProgress.startTime && (
                  <p className="text-xs mt-1 text-gray-600">开始时间: {parseProgress.startTime}</p>
                )}
              </div>
            ) : (
              <div className="mt-2 text-sm text-gray-600">
                <p>• 正在等待MinerU服务器处理...</p>
                <p>• 解析可能需要几分钟，请耐心等待</p>
                <p>• 进度信息将在解析开始后显示</p>
              </div>
            )}
            {taskId && (
              <p className="text-xs mt-1">任务ID: {taskId}</p>
            )}
            {batchId && (
              <p className="text-xs mt-1">批量任务ID: {batchId}</p>
            )}
          </div>
        )}
        
        {parsingStatus === 'done' && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
            {layout.length > 0 ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-lg">✓</span>
                  <span>解析完成！共提取 {layout.length} 个文本块</span>
                </div>
                <div className="mt-2 text-sm">
                  <p>• PDF上已显示文本块高亮（黄色区域）</p>
                  <p>• 点击高亮区域可查看文本内容</p>
                  <p>• 右侧显示当前页的文本块列表</p>
                  <p>• 当前页（第{currentPage}页）有 {currentPageBlocks.length} 个文本块</p>
                </div>
              </>
            ) : (
              <div>
                <p className="font-semibold">⚠️ 解析完成，但未找到文本块</p>
                <p className="text-sm mt-1">可能原因：</p>
                <ul className="text-sm mt-1 ml-4 list-disc">
                  <li>PDF文档可能是扫描件（需要OCR）</li>
                  <li>文档中没有可提取的文本内容</li>
                  <li>解析结果格式异常，请查看浏览器控制台</li>
                </ul>
              </div>
            )}
          </div>
        )}

        {/* 主内容区域 */}
        {pdfFile && (
          <div 
            ref={containerRef}
            className={`flex flex-col lg:flex-row gap-0 bg-gray-100 rounded-lg overflow-hidden ${
              isFullscreen ? 'fixed inset-0 z-50 m-0 rounded-none' : ''
            }`}
            style={{ 
              minHeight: isFullscreen ? '100vh' : '600px',
              height: isFullscreen ? '100vh' : 'auto'
            }}
          >
            {/* PDF查看器/全文显示 */}
            <div 
              className={`bg-white lg:rounded-l-lg rounded-t-lg shadow-sm p-6 overflow-auto ${
                isFullscreen ? 'w-full' : ''
              }`}
              style={{ 
                width: isFullscreen 
                  ? '100%' 
                  : (isLargeScreen ? `${leftPanelWidth}%` : '100%'),
                minWidth: isFullscreen ? 'auto' : (isLargeScreen ? '300px' : 'auto'),
                transition: isResizing ? 'none' : 'width 0.2s ease',
                height: isFullscreen ? '100vh' : 'auto',
                maxHeight: isFullscreen ? '100vh' : 'none'
              }}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">
                  {viewMode === 'pdf' ? 'PDF预览' : '全文显示'}
                </h2>
                <div className="flex gap-2">
                  {viewMode === 'pdf' && (
                    <>
                      <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage <= 1}
                        className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-50"
                      >
                        上一页
                      </button>
                      <button
                        onClick={() => setCurrentPage(currentPage + 1)}
                        className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                      >
                        下一页
                      </button>
                    </>
                  )}
                  <div className="flex gap-2">
                    {fullTextContent && (
                      <button
                        onClick={() => setViewMode('fulltext')}
                        className={`px-3 py-1 rounded text-sm ${
                          viewMode === 'fulltext'
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 hover:bg-gray-200'
                        }`}
                      >
                        全文
                      </button>
                    )}
                    {layout.length > 0 && (
                      <button
                        onClick={() => setViewMode('bilingual')}
                        className={`px-3 py-1 rounded text-sm ${
                          viewMode === 'bilingual'
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 hover:bg-gray-200'
                        }`}
                      >
                        双栏对照
                      </button>
                    )}
                    <button
                      onClick={() => setViewMode('pdf')}
                      className={`px-3 py-1 rounded text-sm ${
                        viewMode === 'pdf'
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 hover:bg-gray-200'
                      }`}
                    >
                      PDF
                    </button>
                    {(viewMode === 'fulltext' || viewMode === 'bilingual') && (
                      <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className={`px-3 py-1 rounded text-sm ${
                          isFullscreen 
                            ? 'bg-red-500 hover:bg-red-600 text-white' 
                            : 'bg-gray-100 hover:bg-gray-200'
                        }`}
                        title={isFullscreen ? '退出全屏 (Esc)' : '全屏显示'}
                      >
                        {isFullscreen ? (
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <span className="text-xs">退出</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                            </svg>
                            <span className="text-xs">全屏</span>
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {viewMode === 'pdf' ? (
                <div className="relative inline-block">
                  <PdfViewer
                    fileUrl={getFileUrl(pdfFile, 'files')}
                    currentPage={currentPage}
                    onPageChange={setCurrentPage}
                    scale={1.2}
                  />
                  {layout.length > 0 && (
                    <LayoutOverlay
                      layout={layout}
                      page={currentPage}
                      scale={1.2}
                      onBlockClick={setSelectedBlock}
                    />
                  )}
                  {parsingStatus === 'done' && layout.length === 0 && (
                    <div className="absolute top-2 left-2 bg-yellow-100 border border-yellow-300 rounded px-3 py-2 text-sm text-yellow-800 z-20">
                      ⚠️ 当前页未检测到文本块，请切换到其他页面查看
                    </div>
                  )}
                </div>
              ) : viewMode === 'bilingual' ? (
                <div className={isFullscreen ? 'h-screen' : 'h-full'}>
                  <BilingualView
                    layout={layout}
                    originalContent={fullTextContent}
                    translatedContent={translatedFullText}
                    taskId={taskId || batchId}
                  />
                </div>
              ) : (
                <div className={isFullscreen ? 'h-screen overflow-auto' : 'h-full overflow-auto'}>
                  {fullTextLoading ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      <span className="ml-3 text-gray-600">正在加载全文...</span>
                    </div>
                  ) : fullTextContent ? (
                    <FullTextView 
                      content={fullTextContent} 
                      taskId={taskId || batchId}
                    />
                  ) : (
                    <div className="p-8 text-center text-gray-500">
                      <p>全文内容暂不可用</p>
                      <p className="text-sm mt-2">解析完成后会自动加载全文内容</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* 可拖拽的分隔条 */}
            {!isFullscreen && (
              <div
                className="hidden lg:flex items-center justify-center w-2 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors relative group"
                onMouseDown={handleResizeStart}
                style={{ 
                  flexShrink: 0,
                  minWidth: '8px'
                }}
              >
              {/* 拖拽提示图标 */}
              <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-1 h-1 bg-gray-500 rounded-full"></div>
                <div className="w-1 h-1 bg-gray-500 rounded-full"></div>
                <div className="w-1 h-1 bg-gray-500 rounded-full"></div>
              </div>
              {/* 扩大拖拽区域 */}
              <div className="absolute inset-y-0 -left-2 -right-2 bg-transparent"></div>
            </div>
            )}

            {/* 文本显示区域 */}
            {!isFullscreen && (
              <div 
                className="bg-white lg:rounded-r-lg rounded-b-lg shadow-sm p-6 overflow-auto"
                style={{ 
                  width: isLargeScreen ? `${100 - leftPanelWidth}%` : '100%',
                  minWidth: isLargeScreen ? '300px' : 'auto',
                  transition: isResizing ? 'none' : 'width 0.2s ease'
                }}
              >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">文本内容</h2>
                <div className="flex gap-2 items-center">
                  <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={forceRetranslate}
                      onChange={(e) => setForceRetranslate(e.target.checked)}
                      disabled={translating}
                      className="rounded"
                    />
                    <span>强制重新翻译</span>
                  </label>
                  <button
                    onClick={handleTranslate}
                    disabled={translating || layout.length === 0}
                    className={`px-3 py-1 rounded text-sm ${
                      translating
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-green-500 hover:bg-green-600 text-white'
                    }`}
                  >
                    {translating ? '翻译中...' : '翻译全文'}
                  </button>
                  {translationFile && !translating && (
                    <a
                      href={getTranslationDownloadUrl(translationFile)}
                      download={translationFile}
                      className="px-3 py-1 rounded text-sm bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-1"
                      title="下载翻译结果JSON文件"
                    >
                      <span>📥</span>
                      <span>下载翻译结果</span>
                    </a>
                  )}
                  <button
                    onClick={() => setDisplayMode('original')}
                    className={`px-3 py-1 rounded text-sm ${
                      displayMode === 'original'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 hover:bg-gray-200'
                    }`}
                  >
                    原文
                  </button>
                  <button
                    onClick={() => setDisplayMode('translated')}
                    className={`px-3 py-1 rounded text-sm ${
                      displayMode === 'translated'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 hover:bg-gray-200'
                    }`}
                  >
                    翻译
                  </button>
                  <button
                    onClick={() => setDisplayMode('both')}
                    className={`px-3 py-1 rounded text-sm ${
                      displayMode === 'both'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 hover:bg-gray-200'
                    }`}
                  >
                    对照
                  </button>
                </div>
              </div>
              {translating && translationProgress && translationProgress.total > 0 && (
                <div className="mb-4 bg-blue-50 border border-blue-200 rounded px-3 py-2 text-sm text-blue-700">
                  <div className="flex justify-between mb-1">
                    <span className="font-semibold">翻译进度:</span>
                    <span>
                      {translationProgress.translated} / {translationProgress.total}
                      {' '}
                      ({Math.round((translationProgress.translated / translationProgress.total) * 100)}%)
                      {translationProgress.skipped > 0 && ` | 跳过: ${translationProgress.skipped}`}
                      {translationProgress.failed > 0 && ` | 失败: ${translationProgress.failed}`}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                    <div 
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                      style={{ 
                        width: `${Math.min(100, (translationProgress.translated / translationProgress.total) * 100)}%` 
                      }}
                    ></div>
                  </div>
                  <p className="text-xs mt-1 text-gray-600">
                    正在分批翻译文本块，已翻译的文本会立即显示...
                  </p>
                </div>
              )}
              <div className="max-h-[600px] overflow-y-auto">
                {layout.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500 mb-2">等待解析完成...</p>
                    <p className="text-xs text-gray-400">
                      {parsingStatus === 'parsing' && '正在解析中，请稍候'}
                      {parsingStatus === 'done' && '解析完成，但未找到文本块'}
                      {!parsingStatus && '请先上传PDF文件'}
                    </p>
                  </div>
                ) : currentPageBlocks.length > 0 ? (
                  <>
                    <div className="mb-2 text-xs text-gray-500">
                      显示第 {currentPage} 页的 {currentPageBlocks.length} 个文本块
                    </div>
                    {currentPageBlocks
                      .sort((a, b) => {
                        // 按位置排序：从上到下，从左到右
                        const [ax, ay] = a.bbox || [0, 0]
                        const [bx, by] = b.bbox || [0, 0]
                        if (Math.abs(ay - by) > 10) {
                          return ay - by // 先按Y坐标（从上到下）
                        }
                        return ax - bx // 再按X坐标（从左到右）
                      })
                      .map((block, i) => (
                        <BlockText key={i} block={block} mode={displayMode} />
                      ))}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500 mb-2">当前页（第{currentPage}页）暂无文本块</p>
                    <p className="text-xs text-gray-400">
                      共 {layout.length} 个文本块分布在其他页面
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      提示：尝试切换到其他页面查看
                    </p>
                  </div>
                )}
              </div>
            </div>
            )}
          </div>
        )}

        {/* 如果没有PDF，显示提示 */}
        {!pdfFile && (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <p className="text-gray-500 text-lg">请先上传PDF文件开始使用</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App

