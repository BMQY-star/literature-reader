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
 * @param {boolean} useApi - 是否使用API（默认: true）
 * @returns {Promise<Object>} 包含layout数据的响应
 */
export async function parsePdfWithApi(pdfFile, useApi = true) {
  const formData = new FormData()
  formData.append('file', pdfFile)
  formData.append('use_api', useApi.toString())
  
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

