# 使用官方 Node.js 18 作為基礎鏡像
FROM node:18-slim

# 設定工作目錄
WORKDIR /app

# 複製 package.json 和 package-lock.json（如果存在）
COPY package*.json ./

# 安裝依賴
RUN npm install

# 複製源代碼
COPY . .

# 創建上傳目錄
RUN mkdir -p uploads && chown -R node:node /app

# 使用非 root 用戶運行
USER node

# 暴露端口
EXPOSE 3000

# 啟動命令
CMD ["node", "server.js"] 