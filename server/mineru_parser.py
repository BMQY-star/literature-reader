"""
MinerU JSON解析模块：将MinerU输出的JSON转换为layout.json格式
"""
import json
import logging
from pathlib import Path
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


def parse_mineru_layout(input_path: str, output_path: str = None) -> List[Dict[str, Any]]:
    """
    解析MinerU JSON文件，提取文本块和位置信息
    
    Args:
        input_path: MinerU输出的JSON文件路径
        output_path: 输出的layout.json路径（可选）
    
    Returns:
        包含页面、位置和文本的列表
    """
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        layout = []
        
        # 遍历所有页面
        for page in data.get("pages", []):
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
        
        # 如果指定了输出路径，保存结果
        if output_path:
            output_file = Path(output_path)
            output_file.parent.mkdir(parents=True, exist_ok=True)
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(layout, f, ensure_ascii=False, indent=2)
            logger.info(f"Layout文件已保存到: {output_path}")
        
        logger.info(f"解析完成，共提取 {len(layout)} 个文本块")
        return layout
        
    except FileNotFoundError:
        logger.error(f"文件未找到: {input_path}")
        raise
    except json.JSONDecodeError as e:
        logger.error(f"JSON解析错误: {e}")
        raise
    except Exception as e:
        logger.error(f"解析过程中发生错误: {e}", exc_info=True)
        raise

