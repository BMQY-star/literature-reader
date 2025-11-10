"""
LLM翻译模块：使用大语言模型翻译MinerU JSON中的文本
支持多种模型：OpenAI、Claude、Qwen、DeepSeek
"""
import json
import logging
import hashlib
from pathlib import Path
from typing import Dict, Any, Optional
from openai import OpenAI
from flask import current_app
from flask_caching import Cache

logger = logging.getLogger(__name__)
cache = Cache()


def get_translation_cache_key(text: str, target_lang: str) -> str:
    """
    生成翻译缓存键
    
    Args:
        text: 待翻译文本
        target_lang: 目标语言
    
    Returns:
        缓存键（SHA256哈希）
    """
    content = f"{text}_{target_lang}".encode('utf-8')
    return hashlib.sha256(content).hexdigest()


def translate_with_llm(text: str, target_lang: str = "zh", model: str = None) -> str:
    """
    使用LLM翻译文本
    
    Args:
        text: 待翻译文本
        target_lang: 目标语言代码（zh/en等）
        model: 模型名称（可选，使用配置中的默认模型）
    
    Returns:
        翻译后的文本
    """
    if not text or not text.strip():
        return text
    
    # 检查缓存
    cache_key = get_translation_cache_key(text, target_lang)
    cached_result = cache.get(cache_key)
    if cached_result:
        logger.debug(f"使用缓存翻译: {cache_key[:8]}...")
        return cached_result
    
    # 获取配置 - 优先使用通义千问配置
    qwen_api_key = current_app.config.get('QWEN_API_KEY', '')
    qwen_base_url = current_app.config.get('QWEN_BASE_URL', 'https://dashscope.aliyuncs.com/compatible-mode/v1')
    qwen_model = current_app.config.get('QWEN_MODEL', 'qwen-turbo')
    
    # 如果配置了通义千问，优先使用
    if qwen_api_key:
        api_key = qwen_api_key
        base_url = qwen_base_url
        default_model = model or qwen_model
    else:
        # 否则使用OpenAI兼容配置
        api_key = current_app.config.get('OPENAI_API_KEY', '')
        base_url = current_app.config.get('OPENAI_BASE_URL', 'https://api.openai.com/v1')
        default_model = model or current_app.config.get('DEFAULT_MODEL', 'gpt-4o-mini')
    
    if not api_key:
        logger.warning("未配置API密钥（QWEN_API_KEY或OPENAI_API_KEY），返回原文")
        return text
    
    try:
        # 初始化OpenAI兼容客户端（支持通义千问和OpenAI）
        client = OpenAI(api_key=api_key, base_url=base_url)
        
        # 构建提示词
        lang_map = {
            'zh': '中文',
            'en': 'English',
            'ja': '日本語',
            'ko': '한국어'
        }
        target_lang_name = lang_map.get(target_lang, target_lang)
        
        prompt = (
            f"请将以下学术段落翻译成{target_lang_name}，"
            f"保持术语准确性和结构完整性，不要添加任何解释或注释：\n\n{text}"
        )
        
        # 调用API
        response = client.chat.completions.create(
            model=default_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )
        
        translated_text = response.choices[0].message.content.strip()
        
        # 缓存结果
        cache.set(cache_key, translated_text, timeout=86400)  # 24小时缓存
        
        logger.info(f"翻译完成: {len(text)} 字符 -> {len(translated_text)} 字符")
        return translated_text
        
    except Exception as e:
        logger.error(f"翻译失败: {e}", exc_info=True)
        # 翻译失败时返回原文
        return text


def translate_mineru_json(
    input_path: str, 
    output_path: str = None, 
    target_lang: str = "zh",
    model: str = None
) -> Dict[str, Any]:
    """
    翻译MinerU JSON文件中的所有文本块
    
    Args:
        input_path: 输入的MinerU JSON文件路径
        output_path: 输出的翻译后JSON文件路径（可选）
        target_lang: 目标语言
        model: 使用的模型名称
    
    Returns:
        翻译后的JSON数据
    """
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        total_blocks = 0
        translated_blocks = 0
        
        # 遍历所有页面和文本块
        for page in data.get("pages", []):
            for block in page.get("blocks", []):
                if block.get("type") == "text":
                    total_blocks += 1
                    lines = block.get("lines", [])
                    original_text = " ".join([
                        line.get("text", "") 
                        for line in lines 
                        if isinstance(line, dict)
                    ]).strip()
                    
                    if original_text:
                        # 翻译文本
                        translated_text = translate_with_llm(
                            original_text, 
                            target_lang=target_lang,
                            model=model
                        )
                        block["translated_text"] = translated_text
                        translated_blocks += 1
        
        # 保存翻译后的JSON
        if output_path:
            output_file = Path(output_path)
            output_file.parent.mkdir(parents=True, exist_ok=True)
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            logger.info(f"翻译文件已保存到: {output_path}")
        
        logger.info(f"翻译完成: {translated_blocks}/{total_blocks} 个文本块")
        return data
        
    except FileNotFoundError:
        logger.error(f"文件未找到: {input_path}")
        raise
    except json.JSONDecodeError as e:
        logger.error(f"JSON解析错误: {e}")
        raise
    except Exception as e:
        logger.error(f"翻译过程中发生错误: {e}", exc_info=True)
        raise

