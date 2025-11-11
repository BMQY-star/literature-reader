"""
API路由模块：定义所有REST API端点
"""
import json
import logging
import os
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import Blueprint, request, jsonify, send_from_directory, current_app, Response, stream_with_context
from werkzeug.utils import secure_filename
from server.mineru_parser import parse_mineru_layout
from server.mineru_api import (
    create_extract_task, 
    get_task_result, 
    get_batch_task_result,
    wait_for_task_completion,
    get_file_upload_urls,
    upload_file_to_url,
    parse_pdf_with_mineru_api,
    download_and_extract_zip
)
from server.translator_llm import translate_mineru_json, translate_with_llm

logger = logging.getLogger(__name__)

api_bp = Blueprint('api', __name__)


def allowed_file(filename: str) -> bool:
    """
    检查文件扩展名是否允许
    
    Args:
        filename: 文件名
    
    Returns:
        是否允许
    """
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in current_app.config['ALLOWED_EXTENSIONS']


def get_standard_response(success: bool, message: str = "", data: dict = None):
    """
    返回标准JSON响应格式
    
    Args:
        success: 是否成功
        message: 消息
        data: 数据字典
    
    Returns:
        标准JSON响应
    """
    response = {
        "success": success,
        "message": message,
        "data": data or {}
    }
    return jsonify(response)


def chunk_markdown_text(text: str, max_chars: int = 1800) -> list:
    if not text:
        return []
    
    lines = text.splitlines()
    chunks = []
    current = []
    current_len = 0
    fence_open = False
    
    for line in lines:
        stripped = line.rstrip('\n')
        if stripped.lstrip().startswith('#') and not fence_open and current:
            # 新的标题开始，先提交当前块
            chunks.append('\n'.join(current).strip('\n'))
            current = [line]
            current_len = len(line)
            continue
        
        current.append(line)
        current_len += len(line)
        
        fence_count = stripped.count('```')
        if fence_count % 2 == 1:
            fence_open = not fence_open
        
        # 如果没有标题分隔，仍然按长度拆分
        if not fence_open and current_len >= max_chars:
            chunks.append('\n'.join(current).strip('\n'))
            current = []
            current_len = 0
    
    if current:
        chunks.append('\n'.join(current).strip('\n'))
    
    filtered = [chunk for chunk in chunks if chunk.strip()]
    return filtered or [text.strip()]


def format_sse(event: str, data: dict) -> str:
    """
    构建符合SSE协议的消息字符串
    """
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


def translate_full_markdown(task_id: str, target_lang: str = 'zh', model: str = None, translation_id: str = None, timestamp: int = None) -> tuple:
    mineru_folder = Path(current_app.config['MINERU_FOLDER'])
    full_path = mineru_folder / task_id / 'full.md'
    if not full_path.exists():
        raise FileNotFoundError("未找到full.md")
    
    raw_text = full_path.read_text(encoding='utf-8')
    chunks = chunk_markdown_text(raw_text)
    translated_chunks = []
    
    for chunk in chunks:
        if not chunk.strip():
            translated_chunks.append(chunk)
        else:
            translated_chunks.append(
                translate_with_llm(chunk, target_lang=target_lang, model=model)
            )
    
    translated_text = '\n\n'.join(translated_chunks)
    
    if timestamp is None:
        timestamp = int(time.time())
    if translation_id is None:
        translation_id = f"trans_{timestamp}"
    
    output_path = full_path.parent / f'full_translated_{target_lang}.md'
    output_path.write_text(translated_text, encoding='utf-8')
    
    translations_folder = mineru_folder / 'translations'
    translations_folder.mkdir(parents=True, exist_ok=True)
    archive_file = translations_folder / f"full_{translation_id}_{target_lang}_{timestamp}.md"
    archive_file.write_text(translated_text, encoding='utf-8')
    
    return translated_text, archive_file.name, len(chunks)


def translate_full_markdown_stream(task_id: str, target_lang: str = 'zh', model: str = None,
                                   translation_id: str = None, timestamp: int = None):
    """
    将full.md按块翻译，并通过SSE实时推送进度（多并发版本）
    """
    mineru_folder = Path(current_app.config['MINERU_FOLDER'])
    full_path = mineru_folder / task_id / 'full.md'
    if not full_path.exists():
        raise FileNotFoundError("未找到full.md")
    
    raw_text = full_path.read_text(encoding='utf-8')
    chunks = chunk_markdown_text(raw_text)
    total_chunks = len(chunks)
    
    if timestamp is None:
        timestamp = int(time.time())
    if translation_id is None:
        translation_id = f"trans_{timestamp}"
    
    translations_folder = mineru_folder / 'translations'
    translations_folder.mkdir(parents=True, exist_ok=True)
    
    output_path = full_path.parent / f'full_translated_{target_lang}.md'
    archive_file = translations_folder / f"full_{translation_id}_{target_lang}_{timestamp}.md"
    
    # 并发数量：根据块数量动态调整，最多10个并发
    max_workers = min(10, max(3, total_chunks // 3))
    
    # 获取应用实例和配置，用于在线程中创建上下文
    app = current_app._get_current_object()
    
    def translate_chunk(idx, chunk):
        """翻译单个块的辅助函数（在线程中运行，需要应用上下文）"""
        chunk_number = idx + 1
        if not chunk.strip():
            return idx, chunk, "success", ""
        
        # 在线程中创建 Flask 应用上下文
        with app.app_context():
            try:
                logger.info(f"调用LLM翻译Markdown块 [{chunk_number}/{total_chunks}]，长度={len(chunk)}")
                translated_chunk = translate_with_llm(chunk, target_lang=target_lang, model=model)
                return idx, translated_chunk, "success", ""
            except Exception as chunk_error:
                error_message = str(chunk_error)
                logger.error(f"翻译Markdown块失败 [{chunk_number}/{total_chunks}]: {chunk_error}")
                return idx, chunk, "failed", error_message
    
    def event_stream():
        translated_chunks = [None] * total_chunks  # 预分配列表，保持顺序
        completed_count = 0
        
        try:
            init_payload = {
                "task_id": task_id,
                "total_chunks": total_chunks,
                "target_lang": target_lang,
                "translation_id": translation_id,
                "timestamp": timestamp,
                "max_workers": max_workers
            }
            yield format_sse("init", init_payload)
            
            # 使用线程池并发翻译
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                # 提交所有翻译任务
                future_to_idx = {
                    executor.submit(translate_chunk, idx, chunk): idx 
                    for idx, chunk in enumerate(chunks)
                }
                
                # 按完成顺序处理结果（不一定是提交顺序）
                for future in as_completed(future_to_idx):
                    idx, translated_chunk, status, error_message = future.result()
                    translated_chunks[idx] = translated_chunk
                    completed_count += 1
                    
                    # 实时推送进度
                    progress_payload = {
                        "task_id": task_id,
                        "chunk_index": idx,
                        "chunk_number": idx + 1,
                        "total_chunks": total_chunks,
                        "completed_count": completed_count,
                        "status": status,
                        "translated_chunk": translated_chunk,
                        "error": error_message
                    }
                    yield format_sse("progress", progress_payload)
            
            # 确保所有块都已翻译（处理可能的异常情况）
            for idx, chunk_result in enumerate(translated_chunks):
                if chunk_result is None:
                    translated_chunks[idx] = chunks[idx]  # 失败时使用原文
                    logger.warning(f"块 {idx + 1} 翻译结果为空，使用原文")
            
            # 按顺序拼接所有翻译结果
            translated_text = '\n\n'.join(translated_chunks)
            output_path.write_text(translated_text, encoding='utf-8')
            archive_file.write_text(translated_text, encoding='utf-8')
            
            complete_payload = {
                "task_id": task_id,
                "total_chunks": total_chunks,
                "translation_file": archive_file.name,
                "content": translated_text
            }
            yield format_sse("complete", complete_payload)
        
        except Exception as e:
            logger.error(f"SSE翻译流程异常: {e}", exc_info=True)
            yield format_sse("error", {"message": str(e)})
    
    return event_stream()


@api_bp.route('/health', methods=['GET'])
def health_check():
    """
    健康检查端点
    """
    return get_standard_response(True, "服务运行正常", {"status": "ok"})


@api_bp.route('/upload', methods=['POST'])
def upload_file():
    """
    上传PDF或JSON文件
    
    返回:
        {
            "success": true/false,
            "message": "...",
            "data": {
                "filename": "...",
                "filepath": "..."
            }
        }
    """
    try:
        if 'file' not in request.files:
            return get_standard_response(False, "未找到文件", {}), 400
        
        file = request.files['file']
        if file.filename == '':
            return get_standard_response(False, "文件名为空", {}), 400
        
        if not allowed_file(file.filename):
            return get_standard_response(
                False, 
                f"不支持的文件类型，仅支持: {', '.join(current_app.config['ALLOWED_EXTENSIONS'])}", 
                {}
            ), 400
        
        # 保存文件
        filename = secure_filename(file.filename)
        upload_folder = Path(current_app.config['UPLOAD_FOLDER'])
        filepath = upload_folder / filename
        
        file.save(str(filepath))
        logger.info(f"文件上传成功: {filename}")
        
        return get_standard_response(
            True, 
            "文件上传成功", 
            {
                "filename": filename,
                "filepath": str(filepath)
            }
        )
        
    except Exception as e:
        logger.error(f"文件上传失败: {e}", exc_info=True)
        return get_standard_response(False, f"上传失败: {str(e)}", {}), 500


@api_bp.route('/parse-pdf', methods=['POST'])
def parse_pdf_with_api():
    """
    通过MinerU API解析PDF文件
    
    请求参数:
        - file: 上传的PDF文件
        - file_url: 文件URL（可选，如果提供则直接使用，否则先上传）
        - wait: 是否等待任务完成（默认: true）
        - model_version: 模型版本（vlm 或 pipeline，默认从配置读取）
    
    返回:
        {
            "success": true/false,
            "message": "...",
            "data": {
                "task_id": "...",
                "state": "done/pending/running",
                "layout": [...],
                "mineru_data": {...}
            }
        }
    """
    try:
        file_url = request.form.get('file_url')
        wait_for_completion = request.form.get('wait', 'true').lower() == 'true'
        model_version = request.form.get('model_version')
        
        pdf_path = None
        filename = None
        
        # 如果上传了新文件
        if 'file' in request.files:
            file = request.files['file']
            if file.filename and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                upload_folder = Path(current_app.config['UPLOAD_FOLDER'])
                pdf_path = upload_folder / filename
                file.save(str(pdf_path))
        
        # 如果没有提供file_url，使用批量上传接口
        if not file_url:
            if not pdf_path or not pdf_path.exists():
                return get_standard_response(False, "请提供file_url或上传PDF文件", {}), 400
            
            # 使用批量上传接口获取上传URL
            try:
                files_data = [{"name": filename}]
                upload_info = get_file_upload_urls(files_data, model_version)
                upload_urls = upload_info.get('file_urls', [])
                batch_id = upload_info.get('batch_id')
                
                if not upload_urls:
                    return get_standard_response(False, "未获取到上传URL", {}), 500
                
                # 上传文件
                upload_file_to_url(str(pdf_path), upload_urls[0])
                
                # 注意：使用批量上传后，系统会自动提交解析任务
                # 需要查询batch_id的结果
                return get_standard_response(
                    True,
                    "文件已上传，系统将自动提交解析任务",
                    {
                        "batch_id": batch_id,
                        "state": "waiting-file",
                        "message": "请使用batch_id查询解析结果"
                    }
                )
                
            except Exception as e:
                logger.error(f"文件上传失败: {e}", exc_info=True)
                return get_standard_response(False, f"文件上传失败: {str(e)}", {}), 500
        
        # 如果有file_url，直接创建解析任务
        try:
            result = parse_pdf_with_mineru_api(
                file_path=str(pdf_path) if pdf_path else '',
                file_url=file_url,
                wait_for_completion=wait_for_completion,
                model_version=model_version
            )
            
            if result.get('state') == 'done':
                # 解析layout
                mineru_data = result.get('mineru_data', {})
                layout = parse_mineru_layout_from_data(mineru_data)
                
                return get_standard_response(
                    True,
                    "MinerU API解析成功",
                    {
                        "task_id": result.get('task_id'),
                        "layout_count": len(layout),
                        "layout": layout,
                        "mineru_data": mineru_data,
                        "json_path": result.get('json_path')
                    }
                )
            else:
                return get_standard_response(
                    True,
                    "任务已提交",
                    result
                )
                
        except Exception as e:
            logger.error(f"MinerU API调用失败: {e}", exc_info=True)
            return get_standard_response(False, f"解析失败: {str(e)}", {}), 500
        
    except FileNotFoundError:
        return get_standard_response(False, "文件未找到", {}), 404
    except Exception as e:
        logger.error(f"解析失败: {e}", exc_info=True)
        return get_standard_response(False, f"解析失败: {str(e)}", {}), 500


def parse_mineru_layout_from_data(mineru_data: dict) -> list:
    """
    从MinerU JSON数据中解析layout
    
    支持多种格式：
    1. layout.json格式：{"pdf_info": [{"para_blocks": [...], "page_idx": 0}, ...]}
    2. content_list.json格式：[{"text": "...", "bbox": [...], "page_idx": 0}, ...]
    3. model.json格式：[[{"type": "...", "content": "...", "bbox": [...]}, ...], ...]
    4. 旧格式：{"pages": [{"blocks": [...], "page_no": 1}, ...]}
    
    Args:
        mineru_data: MinerU返回的JSON数据
    
    Returns:
        包含页面、位置和文本的列表，格式：[{"page": 1, "bbox": [x1, y1, x2, y2], "text": "...", "type": "text/title"}, ...]
    """
    layout = []
    
    try:
        if not mineru_data:
            logger.warning("mineru_data为空")
            return layout
        
        # 格式1: layout.json格式 - {"pdf_info": [...]}
        if "pdf_info" in mineru_data:
            logger.info("检测到layout.json格式（pdf_info）")
            pdf_info = mineru_data.get("pdf_info", [])
            logger.info(f"开始解析，共 {len(pdf_info)} 页")
            
            for page_data in pdf_info:
                # 获取页码（page_idx从0开始，前端需要从1开始）
                page_idx = page_data.get("page_idx", 0)
                page_no = page_idx + 1
                
                # 获取段落块
                para_blocks = page_data.get("para_blocks", [])
                if not para_blocks:
                    logger.debug(f"第{page_no}页没有para_blocks")
                    continue
                
                logger.debug(f"第{page_no}页有 {len(para_blocks)} 个段落块")
                
                # 遍历段落块
                block_counter = 0
                for block in para_blocks:
                    block_type = block.get("type", "")
                    
                    # 只处理text和title类型的块
                    if block_type not in ["text", "title"]:
                        continue
                    
                    # 获取bbox
                    bbox = block.get("bbox", [])
                    if not bbox or len(bbox) < 4:
                        continue
                    
                    # 从lines -> spans -> content中提取文本
                    lines = block.get("lines", [])
                    text_parts = []
                    
                    for line in lines:
                        if not isinstance(line, dict):
                            continue
                        
                        spans = line.get("spans", [])
                        for span in spans:
                            if isinstance(span, dict):
                                content = span.get("content", "")
                                if content:
                                    text_parts.append(content)
                    
                    # 合并文本
                    text = " ".join(text_parts).strip()
                    
                    if text:  # 只添加非空文本块
                        block_id = (
                            block.get("block_id")
                            or block.get("id")
                            or block.get("uuid")
                            or f"p{page_no}_b{block_counter}"
                        )
                        block_counter += 1
                        layout.append({
                            "page": page_no,
                            "bbox": bbox,
                            "text": text,
                            "type": block_type,
                            "block_id": block_id
                        })
                        logger.debug(f"添加{block_type}块: 第{page_no}页, 文本长度: {len(text)}")
            
            logger.info(f"解析完成，共提取 {len(layout)} 个文本块")
            return layout
        
        # 格式2: content_list.json格式 - [{"text": "...", "bbox": [...], "page_idx": 0}, ...]
        if isinstance(mineru_data, list) and len(mineru_data) > 0:
            first_item = mineru_data[0]
            if isinstance(first_item, dict) and "text" in first_item and "page_idx" in first_item:
                logger.info("检测到content_list.json格式")
                logger.info(f"开始解析，共 {len(mineru_data)} 个文本块")
                
                block_counter = 0
                for item in mineru_data:
                    text = item.get("text", "").strip()
                    if not text:
                        continue
                    
                    bbox = item.get("bbox", [])
                    if not bbox or len(bbox) < 4:
                        continue
                    
                    page_idx = item.get("page_idx", 0)
                    page_no = page_idx + 1
                    
                    block_type = item.get("type", "text")
                    if item.get("text_level") == 1:
                        block_type = "title"
                    
                    block_id = (
                        item.get("block_id")
                        or item.get("id")
                        or item.get("uuid")
                        or f"p{page_no}_b{block_counter}"
                    )
                    block_counter += 1

                    layout.append({
                        "page": page_no,
                        "bbox": bbox,
                        "text": text,
                        "type": block_type,
                        "block_id": block_id
                    })
                
                logger.info(f"解析完成，共提取 {len(layout)} 个文本块")
                return layout
            
            # 格式3: model.json格式 - [[{...}, ...], ...] (二维数组，第一维是页面)
            if isinstance(first_item, list):
                logger.info("检测到model.json格式（二维数组）")
                logger.info(f"开始解析，共 {len(mineru_data)} 页")
                
                for page_idx, page_blocks in enumerate(mineru_data):
                    block_counter = 0
                    page_no = page_idx + 1
                    
                    if not isinstance(page_blocks, list):
                        continue
                    
                    for block in page_blocks:
                        if not isinstance(block, dict):
                            continue
                        
                        content = block.get("content", "").strip()
                        if not content:
                            continue
                        
                        bbox = block.get("bbox", [])
                        if not bbox or len(bbox) < 4:
                            continue
                        
                        # model.json中的bbox是相对坐标(0-1)，需要转换为像素坐标
                        # 但这里我们不知道页面尺寸，所以先保持原样
                        # 前端可能需要根据实际页面尺寸进行转换
                        block_type = block.get("type", "text")
                        
                        block_id = (
                            block.get("block_id")
                            or block.get("id")
                            or block.get("uuid")
                            or f"p{page_no}_b{block_counter}"
                        )
                        block_counter += 1

                        layout.append({
                            "page": page_no,
                            "bbox": bbox,
                            "text": content,
                            "type": block_type,
                            "block_id": block_id
                        })
                
                logger.info(f"解析完成，共提取 {len(layout)} 个文本块")
                return layout
        
        # 格式4: 旧格式 - {"pages": [...]}
        pages = mineru_data.get("pages", [])
        if pages:
            logger.info("检测到旧格式（pages）")
            logger.info(f"开始解析，共 {len(pages)} 页")
            
            for page_idx, page in enumerate(pages):
                # 支持多种页码字段名
                page_no = page.get("page_no") or page.get("page") or page.get("pageNo") or page.get("page_idx", 0) + 1
                
                blocks = page.get("blocks", [])
                if not blocks:
                    logger.debug(f"第{page_no}页没有blocks")
                    continue
                
                logger.debug(f"第{page_no}页有 {len(blocks)} 个块")
                
                # 遍历页面中的所有块
                block_counter = 0
                for block_idx, block in enumerate(blocks):
                    block_type = block.get("type", "")
                    
                    if block_type in ["text", "title"]:
                        # 合并所有行的文本
                        lines = block.get("lines", [])
                        if not lines:
                            logger.debug(f"第{page_no}页第{block_idx}个文本块没有lines")
                            continue
                        
                        text_parts = []
                        for line in lines:
                            if isinstance(line, dict):
                                line_text = line.get("text", "") or line.get("content", "")
                                if line_text:
                                    text_parts.append(line_text)
                        
                        text = " ".join(text_parts).strip()
                        
                        if text:  # 只添加非空文本块
                            bbox = block.get("bbox") or block.get("bbox_coords") or [0, 0, 0, 0]
                            block_id = (
                                block.get("block_id")
                                or block.get("id")
                                or block.get("uuid")
                                or f"p{page_no}_b{block_counter}"
                            )
                            block_counter += 1
                            layout.append({
                                "page": page_no,
                                "bbox": bbox,
                                "text": text,
                                "type": block_type,
                                "block_id": block_id
                            })
                            logger.debug(f"添加文本块: 第{page_no}页, 文本长度: {len(text)}")
            
            logger.info(f"解析完成，共提取 {len(layout)} 个文本块")
            return layout
        
        # 如果都不匹配，记录警告
        logger.warning("未识别到支持的MinerU数据格式")
        logger.debug(f"mineru_data keys/type: {list(mineru_data.keys()) if isinstance(mineru_data, dict) else type(mineru_data)}")
        logger.debug(f"示例数据: {json.dumps(mineru_data if isinstance(mineru_data, dict) else (mineru_data[0] if isinstance(mineru_data, list) and len(mineru_data) > 0 else {}), ensure_ascii=False, indent=2)[:1000]}")
        
        return layout
        
    except Exception as e:
        logger.error(f"解析MinerU数据失败: {e}", exc_info=True)
        return []


@api_bp.route('/task/<task_id>', methods=['GET'])
def get_mineru_task(task_id: str):
    """
    查询MinerU解析任务状态
    
    Args:
        task_id: 任务ID
    
    返回:
        任务状态和结果
    """
    try:
        result = get_task_result(task_id)
        
        # 如果任务完成，尝试解析layout
        if result.get('state') == 'done':
            zip_url = result.get('full_zip_url')
            if zip_url:
                try:
                    extract_dir = Path(current_app.config['MINERU_FOLDER']) / task_id
                    zip_info = download_and_extract_zip(zip_url, extract_dir)
                    
                    # 读取JSON文件
                    json_path = zip_info['json_path']
                    with open(json_path, 'r', encoding='utf-8') as f:
                        mineru_data = json.load(f)
                    
                    layout = parse_mineru_layout_from_data(mineru_data)
                    
                    result['mineru_data'] = mineru_data
                    result['layout'] = layout
                    result['layout_count'] = len(layout)
                    result['json_path'] = json_path
                    result['extract_dir'] = zip_info.get('extract_dir')
                    result['full_md_path'] = zip_info.get('full_md_path')
                    result['images_dir'] = zip_info.get('images_dir')
                except Exception as e:
                    logger.warning(f"下载结果失败: {e}")
        
        return get_standard_response(True, "查询成功", result)
        
    except Exception as e:
        logger.error(f"查询任务失败: {e}", exc_info=True)
        return get_standard_response(False, f"查询失败: {str(e)}", {}), 500


@api_bp.route('/batch/<batch_id>', methods=['GET'])
def get_mineru_batch(batch_id: str):
    """
    查询MinerU批量解析任务状态
    
    Args:
        batch_id: 批量任务ID
    
    返回:
        批量任务状态和结果
    """
    try:
        result = get_batch_task_result(batch_id)
        
        # 处理批量结果
        extract_results = result.get('extract_result', [])
        if extract_results:
            # 取第一个结果（通常只有一个文件）
            first_result = extract_results[0]
            state = first_result.get('state', '')
            
            # 如果任务完成，尝试解析layout
            if state == 'done':
                zip_url = first_result.get('full_zip_url')
                if zip_url:
                    try:
                        extract_dir = Path(current_app.config['MINERU_FOLDER']) / batch_id
                        zip_info = download_and_extract_zip(zip_url, extract_dir)
                        
                        # 读取JSON文件
                        json_path = zip_info['json_path']
                        with open(json_path, 'r', encoding='utf-8') as f:
                            mineru_data = json.load(f)
                        
                        layout = parse_mineru_layout_from_data(mineru_data)
                        
                        first_result['mineru_data'] = mineru_data
                        first_result['layout'] = layout
                        first_result['layout_count'] = len(layout)
                        first_result['json_path'] = json_path
                        first_result['extract_dir'] = zip_info.get('extract_dir')
                        first_result['full_md_path'] = zip_info.get('full_md_path')
                        first_result['images_dir'] = zip_info.get('images_dir')
                    except Exception as e:
                        logger.warning(f"下载结果失败: {e}")
            
            # 返回第一个结果的状态和进度信息
            return get_standard_response(True, "查询成功", {
                "batch_id": batch_id,
                "state": state,
                "file_name": first_result.get('file_name', ''),
                "err_msg": first_result.get('err_msg', ''),
                "extract_progress": first_result.get('extract_progress', {}),
                "layout": first_result.get('layout', []),
                "layout_count": first_result.get('layout_count', 0),
                "mineru_data": first_result.get('mineru_data')
            })
        else:
            return get_standard_response(True, "查询成功", {
                "batch_id": batch_id,
                "state": "pending",
                "message": "任务处理中"
            })
        
    except Exception as e:
        logger.error(f"查询批量任务失败: {e}", exc_info=True)
        return get_standard_response(False, f"查询失败: {str(e)}", {}), 500


@api_bp.route('/layout', methods=['POST'])
def parse_layout():
    """
    解析MinerU JSON文件，生成layout.json（兼容旧接口）
    
    请求参数:
        - filename: MinerU JSON文件名（可选，从上传的文件中获取）
        - file: 上传的JSON文件（可选）
    
    返回:
        {
            "success": true/false,
            "message": "...",
            "data": {
                "layout_count": 123,
                "layout_file": "..."
            }
        }
    """
    try:
        input_path = None
        filename = request.form.get('filename')
        
        # 如果上传了新文件
        if 'file' in request.files:
            file = request.files['file']
            if file.filename and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                mineru_folder = Path(current_app.config['MINERU_FOLDER'])
                input_path = mineru_folder / filename
                file.save(str(input_path))
        
        # 如果指定了文件名，从mineru文件夹读取
        elif filename:
            mineru_folder = Path(current_app.config['MINERU_FOLDER'])
            input_path = mineru_folder / secure_filename(filename)
        
        if not input_path or not input_path.exists():
            return get_standard_response(False, "文件未找到", {}), 404
        
        # 生成输出路径
        output_path = str(input_path).replace('.json', '_layout.json')
        
        # 解析layout
        layout = parse_mineru_layout(str(input_path), output_path)
        
        return get_standard_response(
            True,
            "解析成功",
            {
                "layout_count": len(layout),
                "layout_file": output_path,
                "layout": layout  # 可选：直接返回layout数据
            }
        )
        
    except FileNotFoundError:
        return get_standard_response(False, "文件未找到", {}), 404
    except Exception as e:
        logger.error(f"解析失败: {e}", exc_info=True)
        return get_standard_response(False, f"解析失败: {str(e)}", {}), 500


@api_bp.route('/translate-layout', methods=['POST'])
def translate_layout():
    """
    直接翻译layout数组中的文本块
    
    请求参数:
        - layout: JSON格式的layout数组
        - target_lang: 目标语言（默认: zh）
        - model: 使用的模型（可选）
    
    返回:
        {
            "success": true/false,
            "message": "...",
            "data": {
                "layout": [...],  # 包含translated_text的layout数组
                "translated_count": 123
            }
        }
    """
    try:
        data = request.get_json()
        if not data:
            return get_standard_response(False, "请求数据为空", {}), 400
        
        layout = data.get('layout', [])
        if not layout:
            return get_standard_response(False, "layout数据为空", {}), 400
        
        target_lang = data.get('target_lang', current_app.config.get('DEFAULT_TARGET_LANG', 'zh'))
        model = data.get('model')
        force_retranslate = data.get('force_retranslate', False)  # 是否强制重新翻译
        
        # 检查是否配置了通义千问
        qwen_api_key = current_app.config.get('QWEN_API_KEY', '')
        if qwen_api_key:
            logger.info("翻译服务：使用通义千问API")
        else:
            logger.warning("翻译服务：未配置QWEN_API_KEY，将尝试使用OPENAI_API_KEY")
        
        translated_count = 0
        skipped_count = 0
        failed_count = 0
        total_count = len(layout)
        first_error = None  # 记录第一个错误详情
        
        logger.info(f"开始翻译 {total_count} 个文本块，目标语言: {target_lang}, 强制重新翻译: {force_retranslate}")
        
        # 翻译每个文本块 - 保持原始顺序
        # 重要：必须保持layout的顺序，以便前端能正确匹配
        translated_layout = []
        for idx, block in enumerate(layout):
            text = block.get('text', '').strip()
            
            # 如果文本为空，直接添加到结果中（保持顺序）
            if not text:
                translated_layout.append({ **block })
                continue
            
            # 如果已有翻译且不强制重新翻译，则跳过（但也要添加到结果中）
            if not force_retranslate and block.get('translated_text'):
                translated_layout.append({ **block })
                skipped_count += 1
                continue
            
            try:
                block_start_time = time.time()
                
                # 减少日志输出，只在关键节点记录（提升性能）
                if (idx + 1) % 10 == 0 or idx == 0:
                    logger.info(f"翻译进度: [{idx+1}/{total_count}] ({translated_count*100//total_count}%)")
                
                # 调用大模型进行翻译
                translated_text = translate_with_llm(text, target_lang=target_lang, model=model)
                block_elapsed = time.time() - block_start_time
                
                # 只在慢请求时记录详细日志（>2秒）
                if block_elapsed > 2.0:
                    logger.warning(f"慢请求: 文本块 [{idx+1}] 耗时 {block_elapsed:.2f}秒, 长度={len(text)}")
                
                # 检查翻译结果是否与原文相同（可能是错误）
                if translated_text == text and len(text) > 10:
                    logger.warning(f"⚠️ 翻译结果与原文相同: {text[:50]}...")
                
                # 保持原始block结构，只添加translated_text
                translated_block = { **block, 'translated_text': translated_text }
                translated_layout.append(translated_block)
                translated_count += 1
                if translated_count % 10 == 0:
                    logger.info(f"🎯 里程碑进度: {translated_count}/{total_count} ({translated_count*100//total_count}%)")
                    
            except Exception as e:
                error_msg = str(e)
                logger.error(f"❌ 翻译文本块失败 [{idx+1}/{total_count}]")
                logger.error(f"错误信息: {error_msg}")
                logger.error(f"错误类型: {type(e).__name__}")
                failed_count += 1
                
                # 记录第一个失败的错误详情，用于返回给前端
                if failed_count == 1:
                    first_error = error_msg
                    logger.error(f"🔴 第一个翻译失败的错误详情: {error_msg}", exc_info=True)
                    import traceback
                    logger.error(f"完整错误堆栈:\n{traceback.format_exc()}")
                    logger.error(f"失败时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
                
                # 失败时保留原文或已有翻译，但仍要添加到结果中
                failed_block = { **block }
                if not failed_block.get('translated_text'):
                    failed_block['translated_text'] = text
                translated_layout.append(failed_block)
        
        # 确保所有块都被添加到translated_layout中（保持顺序）
        # 如果有些块没有被处理（比如空文本或跳过），确保它们也在结果中
        if len(translated_layout) < len(layout):
            logger.warning(f"translated_layout长度({len(translated_layout)})小于原始layout长度({len(layout)})，检查是否有遗漏的块")
            # 补充遗漏的块
            for idx, block in enumerate(layout):
                if idx >= len(translated_layout):
                    translated_layout.append({ **block })
        
        logger.info(f"翻译完成: 成功 {translated_count} 个，跳过 {skipped_count} 个，失败 {failed_count} 个，总计 {total_count} 个文本块")
        logger.info(f"返回的layout长度: {len(translated_layout)}，原始layout长度: {len(layout)}")
        
        # 如果有失败，提供更详细的错误信息
        message = f"翻译完成：成功 {translated_count} 个"
        if skipped_count > 0:
            message += f"，跳过 {skipped_count} 个"
        if failed_count > 0:
            message += f"，失败 {failed_count} 个"
            
            # 检查是否是因为API配置问题
            qwen_api_key = current_app.config.get('QWEN_API_KEY', '')
            openai_api_key = current_app.config.get('OPENAI_API_KEY', '')
            
            if not qwen_api_key and not openai_api_key:
                message += "（未配置API密钥，请设置QWEN_API_KEY或OPENAI_API_KEY）"
            elif first_error:
                # 分析第一个错误
                if "API密钥" in first_error or "401" in first_error or "Unauthorized" in first_error:
                    message += "（API密钥无效，请检查配置）"
                elif "429" in first_error or "rate limit" in first_error.lower():
                    message += "（API调用频率超限，请稍后重试）"
                elif "timeout" in first_error.lower():
                    message += "（API调用超时，请检查网络）"
                elif "model" in first_error.lower() and "not found" in first_error.lower():
                    message += "（模型不存在，请检查模型配置）"
                else:
                    message += f"（错误: {first_error[:100]}...）"
        
        # 保存翻译结果到JSON文件（如果提供了translation_id）
        translation_id = data.get('translation_id')
        translation_file = None
        
        if translation_id:
            import time
            # 使用translation_id和timestamp生成固定文件名，每次合并保存（因为可能是逐个翻译）
            # 这样所有翻译结果都会保存在同一个文件中
            timestamp = data.get('timestamp')  # 如果前端提供了timestamp，使用它；否则使用当前时间
            if not timestamp:
                timestamp = int(time.time())
            
            # 创建翻译结果目录
            translations_folder = Path(current_app.config['MINERU_FOLDER']) / 'translations'
            translations_folder.mkdir(parents=True, exist_ok=True)
            
            # 使用固定的文件名（基于translation_id和timestamp）
            translation_file = translations_folder / f"translation_{translation_id}_{timestamp}.json"
            
            # 尝试读取已有的翻译结果（如果存在）
            existing_data = None
            if translation_file.exists():
                try:
                    with open(translation_file, 'r', encoding='utf-8') as f:
                        existing_data = json.load(f)
                except Exception as read_error:
                    logger.warning(f"读取已有翻译结果失败: {read_error}")
            
            # 合并翻译结果
            if existing_data and isinstance(existing_data.get('layout'), list):
                # 合并layout：优先按block_id匹配，其次回退到text+page
                existing_layout = existing_data.get('layout', [])
                
                def get_block_key(block):
                    block_id = block.get('block_id')
                    if block_id:
                        return f"id_{block_id}"
                    block_text = (block.get('text') or '').strip()
                    block_page = block.get('page') or block.get('page_no') or block.get('pageNo') or 1
                    return f"text_{block_page}_{block_text}"
                
                existing_layout_map = {get_block_key(block): block for block in existing_layout}
                
                # 更新或添加新的翻译块
                for new_block in translated_layout:
                    key = get_block_key(new_block)
                    existing_layout_map[key] = new_block
                
                # 合并后的layout保持原有顺序，尽量使用existing_layout顺序，追加新块
                merged_layout = []
                seen_keys = set()
                for block in existing_layout:
                    key = get_block_key(block)
                    if key in existing_layout_map:
                        merged_layout.append(existing_layout_map[key])
                        seen_keys.add(key)
                # 添加新增块
                for key, block in existing_layout_map.items():
                    if key not in seen_keys:
                        merged_layout.append(block)
                
                # 重新计算统计数据
                translated_count = sum(1 for blk in merged_layout if blk.get('translated_text') and blk.get('translated_text') != blk.get('text'))
                skipped_count = sum(1 for blk in merged_layout if blk.get('translated_text') and blk.get('translated_text') == blk.get('text'))
                failed_count = sum(1 for blk in merged_layout if not blk.get('translated_text'))
                total_count = len(merged_layout)
            else:
                # 如果没有已有数据，直接使用当前结果
                merged_layout = translated_layout
                total_count = len(merged_layout)
                translated_count = sum(1 for blk in merged_layout if blk.get('translated_text') and blk.get('translated_text') != blk.get('text'))
                skipped_count = sum(1 for blk in merged_layout if blk.get('translated_text') and blk.get('translated_text') == blk.get('text'))
                failed_count = sum(1 for blk in merged_layout if not blk.get('translated_text'))
            
            translation_data = {
                "translation_id": translation_id,
                "timestamp": timestamp,
                "target_lang": target_lang,
                "model": model,
                "translated_count": translated_count,
                "skipped_count": skipped_count,
                "failed_count": failed_count,
                "total_count": total_count,
                "layout": merged_layout
            }
            
            try:
                with open(translation_file, 'w', encoding='utf-8') as f:
                    json.dump(translation_data, f, ensure_ascii=False, indent=2)
                logger.debug(f"翻译结果已保存到: {translation_file} (共 {len(merged_layout)} 个块)")
            except Exception as save_error:
                logger.warning(f"保存翻译结果失败: {save_error}")
        
        response_data = {
            "layout": translated_layout,  # 使用保持顺序的translated_layout
            "translated_count": translated_count,
            "skipped_count": skipped_count,
            "failed_count": failed_count,
            "total_count": total_count
        }
        
        if translation_id:
            response_data["translation_id"] = translation_id
        if translation_file:
            response_data["translation_file"] = str(translation_file.name)  # 只返回文件名，不包含路径
        
        # 如果有错误，添加错误详情
        if first_error:
            response_data["first_error"] = first_error
            response_data["error_summary"] = {
                "api_configured": bool(qwen_api_key or openai_api_key),
                "qwen_configured": bool(qwen_api_key),
                "openai_configured": bool(openai_api_key)
            }
        
        return get_standard_response(
            True,
            message,
            response_data
        )
        
    except Exception as e:
        error_msg = str(e)
        logger.error(f"翻译layout失败: {error_msg}", exc_info=True)
        
        # 提供更友好的错误信息
        if "API密钥" in error_msg or "QWEN_API_KEY" in error_msg:
            friendly_msg = "翻译失败：请检查通义千问API密钥配置（QWEN_API_KEY）"
        elif "rate limit" in error_msg.lower() or "429" in error_msg:
            friendly_msg = "翻译失败：API调用频率超限，请稍后重试"
        elif "timeout" in error_msg.lower():
            friendly_msg = "翻译失败：API调用超时，请检查网络连接"
        else:
            friendly_msg = f"翻译失败: {error_msg}"
        
        return get_standard_response(False, friendly_msg, {
            "error_detail": error_msg
        }), 500


@api_bp.route('/translate-full', methods=['POST'])
def translate_full_text():
    """
    翻译MinerU生成的全文Markdown（full.md）- 同步版本（已废弃，建议使用流式版本）
    """
    try:
        data = request.get_json() or {}
        task_id = data.get('task_id')
        if not task_id:
            return get_standard_response(False, "task_id不能为空", {}), 400
        
        target_lang = data.get('target_lang', current_app.config.get('DEFAULT_TARGET_LANG', 'zh'))
        model = data.get('model')
        translation_id = data.get('translation_id')
        timestamp = data.get('timestamp')
        
        translated_text, filename, chunk_count = translate_full_markdown(
            task_id,
            target_lang=target_lang,
            model=model,
            translation_id=translation_id,
            timestamp=timestamp
        )
        
        return get_standard_response(True, "全文翻译完成", {
            "task_id": task_id,
            "target_lang": target_lang,
            "content": translated_text,
            "translation_file": filename,
            "chunk_count": chunk_count
        })
    except FileNotFoundError:
        return get_standard_response(False, "未找到full.md文件", {}), 404
    except Exception as e:
        logger.error(f"全文翻译失败: {e}", exc_info=True)
        return get_standard_response(False, f"翻译失败: {str(e)}", {}), 500


@api_bp.route('/translate-full-stream', methods=['POST'])
def translate_full_text_stream():
    """
    翻译MinerU生成的全文Markdown（full.md）- 流式版本（SSE）
    实时推送翻译进度，支持边翻译边显示
    """
    try:
        data = request.get_json() or {}
        task_id = data.get('task_id')
        if not task_id:
            return get_standard_response(False, "task_id不能为空", {}), 400
        
        target_lang = data.get('target_lang', current_app.config.get('DEFAULT_TARGET_LANG', 'zh'))
        model = data.get('model')
        translation_id = data.get('translation_id')
        timestamp = data.get('timestamp')
        
        from flask import Response
        return Response(
            stream_with_context(
                translate_full_markdown_stream(
                    task_id,
                    target_lang=target_lang,
                    model=model,
                    translation_id=translation_id,
                    timestamp=timestamp
                )
            ),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no'  # 禁用Nginx缓冲
            }
        )
    except FileNotFoundError:
        return get_standard_response(False, "未找到full.md文件", {}), 404
    except Exception as e:
        logger.error(f"流式翻译失败: {e}", exc_info=True)
        return get_standard_response(False, f"翻译失败: {str(e)}", {}), 500


@api_bp.route('/translate', methods=['POST'])
def translate_document():
    """
    翻译MinerU JSON文件
    
    请求参数:
        - filename: JSON文件名
        - target_lang: 目标语言（默认: zh）
        - model: 使用的模型（可选）
        - file: 上传的JSON文件（可选）
    
    返回:
        {
            "success": true/false,
            "message": "...",
            "data": {
                "translated_file": "..."
            }
        }
    """
    try:
        input_path = None
        filename = request.form.get('filename')
        target_lang = request.form.get('target_lang', current_app.config['DEFAULT_TARGET_LANG'])
        model = request.form.get('model')
        
        # 如果上传了新文件
        if 'file' in request.files:
            file = request.files['file']
            if file.filename and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                mineru_folder = Path(current_app.config['MINERU_FOLDER'])
                input_path = mineru_folder / filename
                file.save(str(input_path))
        
        # 如果指定了文件名，从mineru文件夹读取
        elif filename:
            mineru_folder = Path(current_app.config['MINERU_FOLDER'])
            input_path = mineru_folder / secure_filename(filename)
        
        if not input_path or not input_path.exists():
            return get_standard_response(False, "文件未找到", {}), 404
        
        # 生成输出路径
        output_path = str(input_path).replace('.json', f'_{target_lang}.json')
        
        # 翻译
        translate_mineru_json(str(input_path), output_path, target_lang, model)
        
        return get_standard_response(
            True,
            "翻译成功",
            {
                "translated_file": output_path,
                "target_lang": target_lang
            }
        )
        
    except FileNotFoundError:
        return get_standard_response(False, "文件未找到", {}), 404
    except Exception as e:
        logger.error(f"翻译失败: {e}", exc_info=True)
        return get_standard_response(False, f"翻译失败: {str(e)}", {}), 500


@api_bp.route('/files/<path:filename>', methods=['GET'])
def get_file(filename):
    """
    获取上传的文件
    
    Args:
        filename: 文件名
    """
    try:
        upload_folder = Path(current_app.config['UPLOAD_FOLDER'])
        file_path = upload_folder / filename
        
        # 检查文件是否存在
        if not file_path.exists():
            logger.error(f"文件不存在: {file_path}")
            return get_standard_response(False, f"文件不存在: {filename}", {}), 404
        
        # 确保路径是绝对路径
        upload_folder = upload_folder.resolve()
        
        logger.debug(f"返回文件: {upload_folder} / {filename}")
        return send_from_directory(str(upload_folder), filename)
    except Exception as e:
        logger.error(f"获取文件失败: {e}", exc_info=True)
        return get_standard_response(False, f"文件不存在: {filename}", {}), 404


@api_bp.route('/mineru/<path:filename>', methods=['GET'])
def get_mineru_file(filename):
    """
    获取MinerU输出文件
    
    Args:
        filename: 文件名（可以是相对路径，如 task_id/full.md 或 task_id/images/image.jpg）
    """
    try:
        mineru_folder = Path(current_app.config['MINERU_FOLDER'])
        file_path = mineru_folder / filename
        
        # 安全检查：确保文件在mineru文件夹内
        if not str(file_path.resolve()).startswith(str(mineru_folder.resolve())):
            return get_standard_response(False, "非法路径", {}), 403
        
        if not file_path.exists():
            return get_standard_response(False, f"文件不存在: {filename}", {}), 404
        
        # 如果是目录，返回错误
        if file_path.is_dir():
            return get_standard_response(False, "路径是目录", {}), 400
        
        return send_from_directory(str(file_path.parent), file_path.name)
    except Exception as e:
        logger.error(f"获取文件失败: {e}", exc_info=True)
        return get_standard_response(False, f"文件不存在: {filename}", {}), 404


@api_bp.route('/full-text/<task_id>', methods=['GET'])
def get_full_text(task_id: str):
    """
    获取MinerU解析的全文Markdown内容
    
    Args:
        task_id: 任务ID或batch_id
    """
    try:
        mineru_folder = Path(current_app.config['MINERU_FOLDER'])
        
        # 尝试查找full.md文件
        md_path = mineru_folder / task_id / 'full.md'
        
        if md_path.exists():
            with open(md_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            return get_standard_response(True, "获取成功", {
                "content": content,
                "path": str(md_path)
            })
        
        # 如果直接路径不存在，尝试递归查找
        task_dir = mineru_folder / task_id
        if task_dir.exists():
            md_files = list(task_dir.rglob('full.md'))
            if md_files:
                md_path = md_files[0]
                with open(md_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                return get_standard_response(True, "获取成功", {
                    "content": content,
                    "path": str(md_path)
                })
        
        return get_standard_response(False, "未找到full.md文件", {}), 404
        
    except Exception as e:
        logger.error(f"获取全文失败: {e}", exc_info=True)
        return get_standard_response(False, f"获取失败: {str(e)}", {}), 500


@api_bp.route('/images/<task_id>/<path:image_name>', methods=['GET'])
def get_image(task_id: str, image_name: str):
    """
    获取MinerU解析的图片
    
    Args:
        task_id: 任务ID或batch_id
        image_name: 图片文件名
    """
    try:
        mineru_folder = Path(current_app.config['MINERU_FOLDER'])
        image_path = mineru_folder / task_id / 'images' / image_name
        
        # 安全检查
        if not str(image_path.resolve()).startswith(str(mineru_folder.resolve())):
            return get_standard_response(False, "非法路径", {}), 403
        
        if not image_path.exists():
            return get_standard_response(False, f"图片不存在: {image_name}", {}), 404
        
        return send_from_directory(str(image_path.parent), image_path.name)
    except Exception as e:
        logger.error(f"获取图片失败: {e}", exc_info=True)
        return get_standard_response(False, f"图片不存在: {image_name}", {}), 404


@api_bp.route('/download-translation/<filename>', methods=['GET'])
def download_translation(filename: str):
    """
    下载翻译结果JSON文件
    
    Args:
        filename: 翻译结果文件名（如 translation_xxx_1234567890.json）
    """
    try:
        translations_folder = Path(current_app.config['MINERU_FOLDER']) / 'translations'
        file_path = translations_folder / secure_filename(filename)
        
        # 安全检查：确保文件在translations文件夹内
        if not str(file_path.resolve()).startswith(str(translations_folder.resolve())):
            return get_standard_response(False, "非法路径", {}), 403
        
        if not file_path.exists():
            return get_standard_response(False, f"文件不存在: {filename}", {}), 404
        
        return send_from_directory(
            str(file_path.parent), 
            file_path.name,
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        logger.error(f"下载翻译结果失败: {e}", exc_info=True)
        return get_standard_response(False, f"下载失败: {str(e)}", {}), 500

