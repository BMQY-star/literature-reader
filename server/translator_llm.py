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

logger = logging.getLogger(__name__)

def get_cache():
    """
    获取已初始化的缓存对象（目前禁用缓存，直接返回None）
    """
    return None


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
    
    # 检查缓存（目前已禁用）
    
    # 获取配置 - 优先使用通义千问配置
    qwen_api_key = current_app.config.get('QWEN_API_KEY', '')
    qwen_base_url = current_app.config.get('QWEN_BASE_URL', 'https://dashscope.aliyuncs.com/compatible-mode/v1')
    qwen_model = current_app.config.get('QWEN_MODEL', 'qwen-turbo')
    
    # 如果配置了通义千问，优先使用
    if qwen_api_key:
        api_key = qwen_api_key
        base_url = qwen_base_url
        default_model = model or qwen_model
        logger.info(f"使用通义千问API进行翻译: base_url={base_url}, model={default_model}")
    else:
        # 否则使用OpenAI兼容配置
        api_key = current_app.config.get('OPENAI_API_KEY', '')
        base_url = current_app.config.get('OPENAI_BASE_URL', 'https://api.openai.com/v1')
        default_model = model or current_app.config.get('DEFAULT_MODEL', 'gpt-4o-mini')
        logger.info(f"使用OpenAI兼容API进行翻译: base_url={base_url}, model={default_model}")
    
    if not api_key:
        logger.warning("未配置API密钥（QWEN_API_KEY或OPENAI_API_KEY），返回原文")
        logger.warning("请设置环境变量 QWEN_API_KEY 以使用通义千问API")
        return text
    
    try:
        # 初始化OpenAI兼容客户端（支持通义千问和OpenAI）
        # 设置超时为60秒，避免长时间等待
        client = OpenAI(api_key=api_key, base_url=base_url, timeout=60.0)
        logger.info(f"OpenAI客户端已初始化，base_url: {base_url}, timeout: 60秒")
        
        # 构建提示词（直接使用原始文本，在提示词中要求保留 LaTeX）
        lang_map = {
            'zh': '中文',
            'en': 'English',
            'ja': '日本語',
            'ko': '한국어'
        }
        target_lang_name = lang_map.get(target_lang, target_lang)
        
        prompt_lines = [
            f"请将以下学术段落翻译成{target_lang_name}，保持术语准确性和结构完整性。",
            "",
            "【重要要求】：",
            "1. 必须原样保留所有 LaTeX 数学公式，包括：",
            "   - 行内公式：$...$ 格式（例如：$x = y + z$）",
            "   - 显示公式：$$...$$ 格式（例如：$$\\sum_{i=1}^{n} x_i$$）",
            "   - 公式内容不得翻译、修改或删除任何符号",
            "2. 保留所有 Markdown 结构与排版（包括标题、列表、表格、粗体、斜体等），不要改动 Markdown 的语法符号",
            "3. 保留代码块、行内代码等格式，勿删除 ` 或 ```",
            "4. 【关键】只返回中文翻译，不要保留英文原文，不要出现中英文对照的形式",
            "   - 如果原文是英文，翻译后只保留中文",
            "   - 不要出现类似 '英文原文（中文翻译）' 或 '中文翻译（英文原文）' 的格式",
            "   - 仅在必要时（如专业术语、人名、地名等），可以在中文后加括号标注英文，例如：'机器学习（Machine Learning）'",
            "5. 不要添加额外解释、注释或前后文",
            "",
            "原文：",
            text
        ]
        prompt = "\n".join(prompt_lines)
        
        # 检查文本长度（通义千问有token限制）
        if len(text) > 6000:  # 大约1500个token
            logger.warning(f"文本过长 ({len(text)} 字符)，可能超出token限制")
        
        # 减少日志输出（提升性能）- 只对长文本或调试模式记录详细日志
        if len(text) > 500:
            logger.debug(f"调用翻译API: 文本长度={len(text)} 字符, model={default_model}")
        
        # 调用大模型API
        try:
            import time
            start_time = time.time()
            
            response = client.chat.completions.create(
                model=default_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
            )
            
            elapsed_time = time.time() - start_time
            # 只在慢请求时记录日志（>2秒）
            if elapsed_time > 2.0:
                logger.warning(f"慢请求: 翻译耗时 {elapsed_time:.2f}秒, 文本长度={len(text)}")
        except Exception as api_error:
            error_msg = str(api_error)
            logger.error(f"API调用失败: {error_msg}")
            
            # 提供更详细的错误信息
            if "401" in error_msg or "Unauthorized" in error_msg:
                raise Exception(f"API密钥无效或已过期，请检查QWEN_API_KEY配置。错误详情: {error_msg}")
            elif "429" in error_msg or "rate limit" in error_msg.lower():
                raise Exception(f"API调用频率超限，请稍后重试。错误详情: {error_msg}")
            elif "timeout" in error_msg.lower():
                raise Exception(f"API调用超时，请检查网络连接。错误详情: {error_msg}")
            elif "model" in error_msg.lower() and "not found" in error_msg.lower():
                raise Exception(f"模型不存在: {default_model}，请检查QWEN_MODEL配置。错误详情: {error_msg}")
            else:
                raise Exception(f"API调用失败: {error_msg}")
        
        # 检查响应
        if not response or not response.choices:
            raise Exception("API返回空响应")
        
        if not response.choices[0].message:
            raise Exception("API响应格式错误：缺少message字段")
        
        translated_text = response.choices[0].message.content.strip()
        
        if not translated_text:
            logger.warning("大模型返回的翻译结果为空，返回原文")
            return text
        
        # 验证翻译结果
        if translated_text == text:
            logger.warning(f"大模型返回的翻译结果与原文相同，可能未进行翻译")
        
        # 减少日志输出 - 只在调试模式或长文本时记录
        if len(text) > 500:
            logger.debug(f"翻译完成: {len(text)} -> {len(translated_text)} 字符")
        
        # 缓存结果
        cache = get_cache()
        if cache:
            try:
                cache_key = get_translation_cache_key(text, target_lang)
                cache.set(cache_key, translated_text, timeout=86400)  # 24小时缓存
                logger.debug("翻译结果已缓存")
            except Exception as cache_error:
                logger.warning(f"缓存保存失败: {cache_error}")
        
        return translated_text
        
    except Exception as e:
        # 确保错误信息是字符串
        if isinstance(e, Exception):
            error_msg = str(e)
        else:
            error_msg = repr(e)
        
        logger.error(f"翻译失败: {error_msg}", exc_info=True)
        
        # 如果错误信息包含对象表示，尝试提取更详细的信息
        if '<' in error_msg and 'object at 0x' in error_msg:
            error_type = type(e).__name__
            error_msg = f"{error_type}: {error_msg}"
        
        # 重新抛出异常，让调用者知道具体错误
        raise Exception(f"翻译失败: {error_msg}")


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

