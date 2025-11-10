"""
Flask应用主入口
注意：生产环境应使用gunicorn或gevent，不要使用app.run()
"""
import os
from server import create_app

# 从环境变量获取配置名称
config_name = os.environ.get('FLASK_ENV', 'development')

# 创建应用
app = create_app(config_name)

if __name__ == '__main__':
    # 仅用于开发环境调试
    # 生产环境请使用: gunicorn server.main:app 或 gevent
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=app.config['DEBUG']
    )

