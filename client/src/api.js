/**
 * API客户端：封装所有后端API调用
 */

const API_BASE = '/api'

/**
 * 上传文件
 * @param {File} file - 要上传的文件
 * @returns {Promise<Object>} 响应数据
 */
export async function uploadFile(file) {
  const formData = new FormData()
  formData.append('file', file)
  
  const response = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData
  })
  
  const data = await response.json()
  if (!data.success) {
    throw new Error(data.message || '上传失败')
  }
  return data.data
}

/**
 * 通过MinerU API解析PDF文件
 * @param {File} pdfFile - PDF文件
 * @param {boolean} wait - 是否等待任务完成（默认: false，返回task_id）
 * @returns {Promise<Object>} 包含task_id或解析结果的响应
 */
export async function parsePdfWithApi(pdfFile, wait = false) {
  const formData = new FormData()
  formData.append('file', pdfFile)
  formData.append('wait', wait.toString())
  
  const response = await fetch(`${API_BASE}/parse-pdf`, {
    method: 'POST',
    body: formData
  })
  
  const data = await response.json()
  if (!data.success) {
    throw new Error(data.message || '解析失败')
  }
  return data.data
}

/**
 * 查询MinerU解析任务状态
 * @param {string} taskId - 任务ID
 * @returns {Promise<Object>} 任务状态和结果
 */
export async function getTaskStatus(taskId) {
  const response = await fetch(`${API_BASE}/task/${taskId}`)
  const data = await response.json()
  if (!data.success) {
    throw new Error(data.message || '查询失败')
  }
  return data.data
}

/**
 * 查询MinerU批量解析任务状态
 * @param {string} batchId - 批量任务ID
 * @returns {Promise<Object>} 批量任务状态和结果
 */
export async function getBatchStatus(batchId) {
  const response = await fetch(`${API_BASE}/batch/${batchId}`)
  const data = await response.json()
  if (!data.success) {
    throw new Error(data.message || '查询失败')
  }
  return data.data
}

/**
 * 解析MinerU JSON文件，生成layout（兼容旧接口）
 * @param {string} filename - JSON文件名
 * @param {File} file - 可选：上传的JSON文件
 * @returns {Promise<Object>} 包含layout数据的响应
 */
export async function parseLayout(filename = null, file = null) {
  const formData = new FormData()
  if (filename) {
    formData.append('filename', filename)
  }
  if (file) {
    formData.append('file', file)
  }
  
  const response = await fetch(`${API_BASE}/layout`, {
    method: 'POST',
    body: formData
  })
  
  const data = await response.json()
  if (!data.success) {
    throw new Error(data.message || '解析失败')
  }
  return data.data
}

/**
 * 翻译layout数组中的文本块
 * @param {Array} layout - layout数组
 * @param {string} targetLang - 目标语言（默认: zh）
 * @param {string} model - 使用的模型（可选）
 * @param {boolean} forceRetranslate - 是否强制重新翻译所有文本块（默认: false）
 * @param {string} translationId - 翻译ID（用于保存JSON文件，可选）
 * @param {number} timestamp - 时间戳（用于保存JSON文件，可选）
 * @returns {Promise<Object>} 翻译结果，包含更新后的layout
 */
export async function translateLayout(layout, targetLang = 'zh', model = null, forceRetranslate = false, translationId = null, timestamp = null) {
  const requestBody = {
    layout: layout,
    target_lang: targetLang,
    model: model,
    force_retranslate: forceRetranslate
  }
  
  if (translationId) {
    requestBody.translation_id = translationId
  }
  if (timestamp) {
    requestBody.timestamp = timestamp
  }
  
  const response = await fetch(`${API_BASE}/translate-layout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })
  
  const data = await response.json()
  if (!data.success) {
    throw new Error(data.message || '翻译失败')
  }
  return data.data
}

/**
 * 翻译全文Markdown（full.md）- 同步版本
 * @param {string} taskId - 任务ID或batch_id
 * @param {string} targetLang - 目标语言（默认: zh）
 * @param {string} model - 使用的模型（可选）
 * @param {string} translationId - 翻译ID（可选，用于保存文件名）
 * @param {number} timestamp - 时间戳（可选，用于保存文件名）
 * @returns {Promise<Object>} 翻译结果，包含content和translation_file
 */
export async function translateFullMarkdown(taskId, targetLang = 'zh', model = null, translationId = null, timestamp = null) {
  const payload = {
    task_id: taskId,
    target_lang: targetLang,
    model: model,
    translation_id: translationId,
    timestamp: timestamp
  }

  const response = await fetch(`${API_BASE}/translate-full`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  // 检查响应状态
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`HTTP ${response.status}: ${errorText || '请求失败'}`)
  }

  // 检查响应内容是否为空
  const text = await response.text()
  if (!text || !text.trim()) {
    throw new Error('服务器返回空响应')
  }

  let data
  try {
    data = JSON.parse(text)
  } catch (parseError) {
    console.error('JSON解析失败:', parseError)
    console.error('响应内容:', text.substring(0, 500))
    throw new Error(`JSON解析失败: ${parseError.message}. 响应内容: ${text.substring(0, 200)}`)
  }

  if (!data.success) {
    throw new Error(data.message || '全文翻译失败')
  }
  return data.data
}

/**
 * 翻译全文Markdown（full.md）- 流式版本（SSE）
 * @param {string} taskId - 任务ID或batch_id
 * @param {string} targetLang - 目标语言（默认: zh）
 * @param {string} model - 使用的模型（可选）
 * @param {string} translationId - 翻译ID（可选，用于保存文件名）
 * @param {number} timestamp - 时间戳（可选，用于保存文件名）
 * @param {Function} onProgress - 进度回调函数 (chunkNumber, totalChunks, translatedChunk, status, error)
 * @param {Function} onComplete - 完成回调函数 (content, translationFile)
 * @param {Function} onError - 错误回调函数 (error)
 * @returns {Promise<void>}
 */
export function translateFullMarkdownStream(taskId, targetLang = 'zh', model = null, translationId = null, timestamp = null, onProgress = null, onComplete = null, onError = null) {
  return new Promise((resolve, reject) => {
    const payload = {
      task_id: taskId,
      target_lang: targetLang,
      model: model,
      translation_id: translationId,
      timestamp: timestamp
    }

    // 使用 EventSource 接收 SSE 事件
    // 注意：EventSource 只支持 GET，我们需要用 fetch + ReadableStream
    fetch(`${API_BASE}/translate-full-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      function readStream() {
        reader.read().then(({ done, value }) => {
          if (done) {
            if (buffer.trim()) {
              // 处理剩余的缓冲区数据
              processBuffer(buffer)
            }
            return
          }

          buffer += decoder.decode(value, { stream: true })
          
          // SSE 格式：每个事件由空行分隔，格式为：
          // event: <event_type>
          // data: <json_data>
          // (空行)
          const events = buffer.split('\n\n')
          buffer = events.pop() || '' // 保留最后不完整的事件

          for (const event of events) {
            if (!event.trim()) continue
            
            const lines = event.split('\n')
            let eventType = null
            let eventData = null
            
            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventType = line.substring(7).trim()
              } else if (line.startsWith('data: ')) {
                const dataStr = line.substring(6).trim()
                try {
                  eventData = JSON.parse(dataStr)
                } catch (e) {
                  console.error('解析SSE数据失败:', e, '数据:', dataStr)
                  continue
                }
              }
            }
            
            if (eventType && eventData) {
              processEvent(eventType, eventData)
            }
          }

          readStream()
        }).catch(err => {
          console.error('读取流失败:', err)
          if (onError) onError(err)
          reject(err)
        })
      }

      function processEvent(eventType, data) {
        if (eventType === 'init') {
          // 初始化事件
          if (onProgress) {
            onProgress(
              'init',
              0,
              data.total_chunks || 0,
              null,
              'init',
              null
            )
          }
        } else if (eventType === 'progress') {
          // 进度事件
          if (onProgress) {
            onProgress(
              'progress',
              data.chunk_number || 0,
              data.total_chunks || 0,
              data.translated_chunk || '',
              data.status || 'success',
              data.error || null
            )
          }
        } else if (eventType === 'complete') {
          // 完成事件
          if (onComplete) {
            onComplete(data.content || '', data.translation_file || '')
          }
          resolve(data)
        } else if (eventType === 'error') {
          // 错误事件
          const error = new Error(data.message || '翻译失败')
          if (onError) onError(error)
          reject(error)
        }
      }

      function processBuffer(buff) {
        // 处理缓冲区中的完整事件
        const events = buff.split('\n\n')
        for (const event of events) {
          if (!event.trim()) continue
          const lines = event.split('\n')
          let eventType = null
          let eventData = null
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.substring(7).trim()
            } else if (line.startsWith('data: ')) {
              try {
                eventData = JSON.parse(line.substring(6).trim())
              } catch (e) {
                console.error('解析缓冲区数据失败:', e)
                continue
              }
            }
          }
          if (eventType && eventData) {
            processEvent(eventType, eventData)
          }
        }
      }

      readStream()
    })
    .catch(err => {
      console.error('SSE请求失败:', err)
      if (onError) onError(err)
      reject(err)
    })
  })
}

/**
 * 翻译MinerU JSON文件
 * @param {string} filename - JSON文件名
 * @param {string} targetLang - 目标语言（默认: zh）
 * @param {string} model - 使用的模型（可选）
 * @param {File} file - 可选：上传的JSON文件
 * @returns {Promise<Object>} 翻译结果
 */
export async function translateDocument(filename = null, targetLang = 'zh', model = null, file = null) {
  const formData = new FormData()
  if (filename) {
    formData.append('filename', filename)
  }
  formData.append('target_lang', targetLang)
  if (model) {
    formData.append('model', model)
  }
  if (file) {
    formData.append('file', file)
  }
  
  const response = await fetch(`${API_BASE}/translate`, {
    method: 'POST',
    body: formData
  })
  
  const data = await response.json()
  if (!data.success) {
    throw new Error(data.message || '翻译失败')
  }
  return data.data
}

/**
 * 获取文件URL
 * @param {string} filename - 文件名
 * @param {string} type - 文件类型：'files' 或 'mineru'
 * @returns {string} 文件URL
 */
export function getFileUrl(filename, type = 'files') {
  return `${API_BASE}/${type}/${filename}`
}

/**
 * 获取全文Markdown内容
 * @param {string} taskId - 任务ID或batch_id
 * @returns {Promise<Object>} 包含content的响应
 */
export async function getFullText(taskId) {
  const response = await fetch(`${API_BASE}/full-text/${taskId}`)
  const data = await response.json()
  if (!data.success) {
    throw new Error(data.message || '获取全文失败')
  }
  return data.data
}

/**
 * 获取图片URL
 * @param {string} taskId - 任务ID或batch_id
 * @param {string} imageName - 图片文件名
 * @returns {string} 图片URL
 */
export function getImageUrl(taskId, imageName) {
  return `${API_BASE}/images/${taskId}/${imageName}`
}

/**
 * 获取翻译结果下载URL
 * @param {string} filename - 翻译结果文件名
 * @returns {string} 下载URL
 */
export function getTranslationDownloadUrl(filename) {
  return `${API_BASE}/download-translation/${filename}`
}

