"""
配置文件：管理开发和生产环境变量
"""
import os
from pathlib import Path

class Config:
    """基础配置"""
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    
    # 文件上传配置
    UPLOAD_FOLDER = Path('data/files')
    MINERU_FOLDER = Path('data/mineru')
    MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100MB
    
    # 允许的文件扩展名
    ALLOWED_EXTENSIONS = {'pdf', 'json'}
    
    # 日志配置
    LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO')
    
    # LLM配置 - 通义千问
    QWEN_API_KEY = os.environ.get('QWEN_API_KEY', '')
    QWEN_BASE_URL = os.environ.get('QWEN_BASE_URL', 'https://dashscope.aliyuncs.com/compatible-mode/v1')
    QWEN_MODEL = os.environ.get('QWEN_MODEL', 'qwen-turbo')
    
    # 兼容OpenAI格式的配置（用于通义千问）
    OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')  # 如果使用通义千问，这里填QWEN_API_KEY
    OPENAI_BASE_URL = os.environ.get('OPENAI_BASE_URL', QWEN_BASE_URL)
    DEFAULT_MODEL = os.environ.get('DEFAULT_MODEL', QWEN_MODEL)
    
    # MinerU API配置
    MINERU_API_URL = os.environ.get('MINERU_API_URL', '')
    MINERU_API_KEY = os.environ.get('MINERU_API_KEY', '')
    MINERU_TIMEOUT = int(os.environ.get('MINERU_TIMEOUT', '300'))  # 5分钟超时
    
    # 翻译目标语言
    DEFAULT_TARGET_LANG = 'zh'
    
    # 缓存配置
    CACHE_TYPE = 'simple'
    CACHE_DEFAULT_TIMEOUT = 3600


class DevelopmentConfig(Config):
    """开发环境配置"""
    DEBUG = True
    TESTING = False


class ProductionConfig(Config):
    """生产环境配置"""
    DEBUG = False
    TESTING = False
    SECRET_KEY = os.environ.get('SECRET_KEY') or os.urandom(32)


# 配置字典
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}

