"""
MinerU API调用模块：通过API调用MinerU服务解析PDF
"""
import json
import logging
import requests
from typing import Dict, Any, Optional
from flask import current_app

logger = logging.getLogger(__name__)


def call_mineru_api(pdf_file_path: str, api_url: str = None, api_key: str = None) -> Dict[str, Any]:
    """
    调用MinerU API解析PDF文件
    
    Args:
        pdf_file_path: PDF文件路径
        api_url: MinerU API地址（可选，从配置读取）
        api_key: API密钥（可选，从配置读取）
    
    Returns:
        MinerU返回的JSON数据
    """
    try:
        # 从配置获取API信息
        if not api_url:
            api_url = current_app.config.get('MINERU_API_URL', '')
        if not api_key:
            api_key = current_app.config.get('MINERU_API_KEY', '')
        
        if not api_url:
            raise ValueError("未配置MINERU_API_URL，请在环境变量或config.py中设置")
        
        # 准备请求
        timeout = current_app.config.get('MINERU_TIMEOUT', 300)
        headers = {}
        if api_key:
            headers['Authorization'] = f'Bearer {api_key}'
        
        # 读取PDF文件
        with open(pdf_file_path, 'rb') as f:
            files = {'file': (pdf_file_path.split('/')[-1], f, 'application/pdf')}
            
            # 调用API
            logger.info(f"正在调用MinerU API: {api_url}")
            response = requests.post(
                api_url,
                files=files,
                headers=headers,
                timeout=timeout
            )
            
            # 检查响应
            response.raise_for_status()
            
            # 解析响应
            result = response.json()
            logger.info(f"MinerU API调用成功，返回数据大小: {len(str(result))} 字符")
            return result
            
    except requests.exceptions.Timeout:
        logger.error(f"MinerU API调用超时（{timeout}秒）")
        raise Exception(f"MinerU API调用超时，请稍后重试")
    except requests.exceptions.RequestException as e:
        logger.error(f"MinerU API调用失败: {e}")
        raise Exception(f"MinerU API调用失败: {str(e)}")
    except json.JSONDecodeError as e:
        logger.error(f"MinerU API返回非JSON格式: {e}")
        raise Exception(f"MinerU API返回数据格式错误: {str(e)}")
    except Exception as e:
        logger.error(f"MinerU API调用异常: {e}", exc_info=True)
        raise


def parse_mineru_api_response(api_response: Dict[str, Any]) -> list:
    """
    解析MinerU API返回的JSON数据，提取layout信息
    
    Args:
        api_response: MinerU API返回的JSON数据
    
    Returns:
        包含页面、位置和文本的列表
    """
    layout = []
    
    try:
        # 遍历所有页面
        for page in api_response.get("pages", []):
            page_no = page.get("page_no", 0)
            
            # 遍历页面中的所有块
            for block in page.get("blocks", []):
                if block.get("type") == "text":
                    # 合并所有行的文本
                    lines = block.get("lines", [])
                    text = " ".join([line.get("text", "") for line in lines if isinstance(line, dict)])
                    
                    if text.strip():  # 只添加非空文本块
                        layout.append({
                            "page": page_no,
                            "bbox": block.get("bbox", [0, 0, 0, 0]),
                            "text": text.strip(),
                            "type": "text"
                        })
        
        logger.info(f"解析完成，共提取 {len(layout)} 个文本块")
        return layout
        
    except Exception as e:
        logger.error(f"解析MinerU API响应失败: {e}", exc_info=True)
        raise

