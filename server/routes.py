"""
API路由模块：定义所有REST API端点
"""
import json
import logging
import os
from pathlib import Path
from flask import Blueprint, request, jsonify, send_from_directory, current_app
from werkzeug.utils import secure_filename
from server.mineru_parser import parse_mineru_layout
from server.mineru_api import call_mineru_api, parse_mineru_api_response
from server.translator_llm import translate_mineru_json

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
        - filename: PDF文件名（可选，从上传的文件中获取）
        - file: 上传的PDF文件（可选）
        - use_api: 是否使用API（默认: true）
    
    返回:
        {
            "success": true/false,
            "message": "...",
            "data": {
                "layout_count": 123,
                "layout": [...],
                "mineru_data": {...}
            }
        }
    """
    try:
        pdf_path = None
        filename = request.form.get('filename')
        use_api = request.form.get('use_api', 'true').lower() == 'true'
        
        # 如果上传了新文件
        if 'file' in request.files:
            file = request.files['file']
            if file.filename and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                upload_folder = Path(current_app.config['UPLOAD_FOLDER'])
                pdf_path = upload_folder / filename
                file.save(str(pdf_path))
        
        # 如果指定了文件名，从files文件夹读取
        elif filename:
            upload_folder = Path(current_app.config['UPLOAD_FOLDER'])
            pdf_path = upload_folder / secure_filename(filename)
        
        if not pdf_path or not pdf_path.exists():
            return get_standard_response(False, "PDF文件未找到", {}), 404
        
        # 使用MinerU API解析
        if use_api:
            mineru_api_url = current_app.config.get('MINERU_API_URL', '')
            if not mineru_api_url:
                return get_standard_response(
                    False, 
                    "未配置MINERU_API_URL，请在环境变量中设置", 
                    {}
                ), 400
            
            # 调用MinerU API
            mineru_data = call_mineru_api(str(pdf_path))
            
            # 解析layout
            layout = parse_mineru_api_response(mineru_data)
            
            # 保存MinerU返回的JSON（可选）
            mineru_folder = Path(current_app.config['MINERU_FOLDER'])
            json_filename = filename.replace('.pdf', '.json')
            json_path = mineru_folder / json_filename
            json_path.parent.mkdir(parents=True, exist_ok=True)
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(mineru_data, f, ensure_ascii=False, indent=2)
            
            return get_standard_response(
                True,
                "MinerU API解析成功",
                {
                    "layout_count": len(layout),
                    "layout": layout,
                    "mineru_json": str(json_path),
                    "mineru_data": mineru_data
                }
            )
        else:
            # 使用本地文件解析（兼容旧方式）
            return get_standard_response(False, "请使用use_api=true调用API", {}), 400
        
    except FileNotFoundError:
        return get_standard_response(False, "文件未找到", {}), 404
    except Exception as e:
        logger.error(f"解析失败: {e}", exc_info=True)
        return get_standard_response(False, f"解析失败: {str(e)}", {}), 500


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
        upload_folder = current_app.config['UPLOAD_FOLDER']
        return send_from_directory(upload_folder, filename)
    except Exception as e:
        logger.error(f"获取文件失败: {e}")
        return get_standard_response(False, f"文件不存在: {filename}", {}), 404


@api_bp.route('/mineru/<path:filename>', methods=['GET'])
def get_mineru_file(filename):
    """
    获取MinerU输出文件
    
    Args:
        filename: 文件名
    """
    try:
        mineru_folder = current_app.config['MINERU_FOLDER']
        return send_from_directory(mineru_folder, filename)
    except Exception as e:
        logger.error(f"获取文件失败: {e}")
        return get_standard_response(False, f"文件不存在: {filename}", {}), 404

