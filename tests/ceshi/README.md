# 品牌黑红榜网站

## 项目概述
记录品牌是非，守护消费者权益

## 技术栈
- 前端：React 18 + TypeScript + Tailwind CSS + Ant Design
- 后端：Node.js + Express + TypeScript  
- 数据库：MySQL + Prisma ORM
- 认证：JWT

## 项目结构
```
brand-blacklist/
├── frontend/          # 前端项目
├── backend/           # 后端项目
├── prisma/           # Prisma相关文件
├── docker-compose.yml
└── README.md
```

## 快速开始
1. 克隆项目
2. 安装依赖：`npm install`
3. 配置环境变量
4. 运行数据库：`docker-compose up -d`
5. 运行迁移：`npx prisma migrate dev`
6. 启动开发服务器