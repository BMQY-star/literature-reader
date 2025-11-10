import { useState } from 'react'
import PdfViewer from './components/PdfViewer'
import LayoutOverlay from './components/LayoutOverlay'
import BlockText from './components/BlockText'
import { uploadFile, parsePdfWithApi, parseLayout, translateDocument, getFileUrl } from './api'

function App() {
  const [pdfFile, setPdfFile] = useState(null)
  const [layout, setLayout] = useState([])
  const [translatedData, setTranslatedData] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [displayMode, setDisplayMode] = useState('both') // 'original' | 'translated' | 'both'
  const [selectedBlock, setSelectedBlock] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

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
      
      // 然后调用MinerU API解析
      try {
        const parseResult = await parsePdfWithApi(file, true)
        setLayout(parseResult.layout || [])
      } catch (parseErr) {
        // 如果API解析失败，只显示警告，不阻止PDF显示
        console.warn('MinerU API解析失败:', parseErr.message)
        setError(`PDF上传成功，但解析失败: ${parseErr.message}`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // 处理MinerU JSON上传和解析
  const handleJsonUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    try {
      setLoading(true)
      setError(null)
      const result = await parseLayout(null, file)
      setLayout(result.layout || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // 处理翻译
  const handleTranslate = async (filename) => {
    try {
      setLoading(true)
      setError(null)
      const result = await translateDocument(filename, 'zh')
      
      // 重新加载翻译后的数据
      const response = await fetch(getFileUrl(result.translated_file.split('/').pop(), 'mineru'))
      const data = await response.json()
      
      // 提取翻译后的布局
      const translatedLayout = []
      data.pages?.forEach(page => {
        page.blocks?.forEach(block => {
          if (block.type === 'text' && block.translated_text) {
            translatedLayout.push({
              page: page.page_no,
              bbox: block.bbox,
              text: block.lines?.map(l => l.text).join(' ') || '',
              translated_text: block.translated_text
            })
          }
        })
      })
      
      setLayout(translatedLayout)
      setTranslatedData(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // 获取当前页的文本块
  const currentPageBlocks = layout.filter(b => b.page === currentPage)

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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                上传PDF文件
              </label>
              <input
                type="file"
                accept=".pdf"
                onChange={handlePdfUpload}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                上传MinerU JSON文件
              </label>
              <input
                type="file"
                accept=".json"
                onChange={handleJsonUpload}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                disabled={loading}
              />
            </div>
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
            处理中...
          </div>
        )}

        {/* 主内容区域 */}
        {pdfFile && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* PDF查看器 */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">PDF预览</h2>
                <div className="flex gap-2">
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
                </div>
              </div>
              <div className="relative">
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
              </div>
            </div>

            {/* 文本显示区域 */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">文本内容</h2>
                <div className="flex gap-2">
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
              <div className="max-h-[600px] overflow-y-auto">
                {currentPageBlocks.length > 0 ? (
                  currentPageBlocks.map((block, i) => (
                    <BlockText key={i} block={block} mode={displayMode} />
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-8">
                    当前页暂无文本块
                  </p>
                )}
              </div>
            </div>
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

