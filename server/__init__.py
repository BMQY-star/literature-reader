"""
Flask应用初始化模块
"""
import logging
from pathlib import Path
from flask import Flask
from flask_caching import Cache
from server.config import config

# 初始化缓存
cache = Cache()

def create_app(config_name='default'):
    """
    应用工厂函数
    
    Args:
        config_name: 配置名称（development/production/default）
    
    Returns:
        Flask应用实例
    """
    app = Flask(__name__)
    app.config.from_object(config[config_name])
    
    # 初始化缓存
    cache.init_app(app)
    
    # 创建必要的目录
    upload_folder = Path(app.config['UPLOAD_FOLDER'])
    mineru_folder = Path(app.config['MINERU_FOLDER'])
    upload_folder.mkdir(parents=True, exist_ok=True)
    mineru_folder.mkdir(parents=True, exist_ok=True)
    
    # 配置日志
    logging.basicConfig(
        level=getattr(logging, app.config['LOG_LEVEL']),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # 注册Blueprint
    from server.routes import api_bp
    app.register_blueprint(api_bp, url_prefix='/api')
    
    # CORS支持（开发环境）
    if app.config['DEBUG']:
        from flask_cors import CORS
        CORS(app)
    
    return app

