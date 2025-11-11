# 使用轻量级 Nginx 基础镜像
FROM nginx:1.27-alpine

# 复制自定义 Nginx 配置
COPY nginx.conf /etc/nginx/nginx.conf

# 复制静态资源到默认站点目录
COPY index.html /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/
COPY script.js /usr/share/nginx/html/

# 暴露端口（文档用途）
EXPOSE 80

# 使用默认的 Nginx 前台启动命令
# （镜像已设置 CMD ["nginx", "-g", "daemon off;"]）
