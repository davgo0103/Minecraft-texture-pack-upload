const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
// const helmet = require('helmet');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3002;

// 確保上傳目錄存在
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
const PASSWORD_HASH = '$2b$10$/8o26RZl7EP05nw3ArtX9.awVVj0agJp96PX4ii83/m.B/eLCsFSa';

// 設定暫存檔案上傳
const tmpStorage = multer.memoryStorage();
const upload = multer({ 
    storage: tmpStorage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 限制檔案大小為 50MB
    }
}).single('texturepack');

// 中間件
// app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// 支援 Cloudflare 及其他 Proxy 取得真實 IP
app.set('trust proxy', true);

// 🚫 錯誤次數追蹤（共用）
const authAttempts = {};
const MAX_ATTEMPTS = 5;
const BLOCK_TIME = 30 * 60 * 1000; // 30分鐘

function getClientIP(req) {
    return req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',').shift() || req.headers['cf-pseudo-ipv4'] || req.ip;
}

function checkBlock(req, res, next) {
    const ip = getClientIP(req);
    const now = Date.now();
    if (authAttempts[ip] && authAttempts[ip].blockedUntil > now) {
        const waitMin = Math.ceil((authAttempts[ip].blockedUntil - now) / 60000);
        return res.status(429).json({ error: `密碼錯誤次數過多，請於 ${waitMin} 分鐘後再試。` });
    }
    next();
}

// 📜 請求紀錄
app.use((req, res, next) => {
    const ip = getClientIP(req);
    const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    const ua = req.headers['user-agent'] || '';
    console.log(`[訪問紀錄] ${now} | IP: ${ip} | ${req.method} ${req.originalUrl} | UA: ${ua}`);
    // console.log('[Header Debug]', req.headers); // 已關閉 header debug 輸出
    next();
});

// 工具：檢查包名是否合法（只允許英文、數字、底線，長度1-32）
function isValidPackName(name) {
    return /^[a-zA-Z0-9_]{1,32}$/.test(name);
}

// 工具：取得所有包名（.zip 檔案）
function getAllPackNames() {
    if (!fs.existsSync(uploadDir)) return [];
    return fs.readdirSync(uploadDir)
        .filter(f => f.endsWith('.zip'))
        .map(f => f.replace(/\.zip$/, ''));
}

// 路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 列出所有包名
app.get('/list-packs', (req, res) => {
    const packs = getAllPackNames();
    res.json({ packs });
});

// 查詢材質包狀態
app.get('/check-texture-pack/:pack', async (req, res) => {
    const pack = req.params.pack;
    if (!isValidPackName(pack)) return res.status(400).json({ error: '包名格式錯誤' });
    const texturePath = path.join(uploadDir, `${pack}.zip`);
    const hashFilePath = path.join(uploadDir, `${pack}.sha1`);
    if (fs.existsSync(texturePath)) {
        const stats = fs.statSync(texturePath);
        let sha1 = null;
        if (fs.existsSync(hashFilePath)) {
            sha1 = await fs.promises.readFile(hashFilePath, 'utf-8');
        }
        return res.json({
            exists: true,
            lastModified: stats.mtime,
            size: stats.size,
            sha1
        });
    }
    res.json({ exists: false });
});

// 下載材質包
app.get('/download-texture-pack/:pack', (req, res) => {
    const pack = req.params.pack;
    if (!isValidPackName(pack)) return res.status(400).json({ error: '包名格式錯誤' });
    const texturePath = path.join(uploadDir, `${pack}.zip`);
    if (fs.existsSync(texturePath)) {
        res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
        return res.download(texturePath, `${pack}.zip`);
    }
    res.status(404).json({ error: '找不到材質包檔案' });
});

// 密碼驗證 API
app.post('/verify-password', express.json(), async (req, res) => {
    const ip = getClientIP(req);
    const now = Date.now();
    if (!authAttempts[ip]) authAttempts[ip] = { count: 0, blockedUntil: 0 };
    if (authAttempts[ip].blockedUntil > now) {
        const waitMin = Math.ceil((authAttempts[ip].blockedUntil - now) / 60000);
        return res.status(429).json({ error: `密碼錯誤次數過多，請於 ${waitMin} 分鐘後再試。` });
    }
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: '請提供密碼' });
    const isValid = await bcrypt.compare(password, PASSWORD_HASH);
    if (!isValid) {
        authAttempts[ip].count += 1;
        if (authAttempts[ip].count >= MAX_ATTEMPTS) {
            authAttempts[ip].blockedUntil = now + BLOCK_TIME;
            return res.status(429).json({ error: `密碼錯誤次數過多，請於 ${BLOCK_TIME / 60000} 分鐘後再試。` });
        }
        return res.status(401).json({ error: '密碼錯誤' });
    }
    delete authAttempts[ip];
    res.json({ message: '密碼正確' });
});

// 上傳 API
app.post('/upload/:pack', checkBlock, upload, async (req, res) => {
    const ip = getClientIP(req);
    const now = Date.now();
    if (!authAttempts[ip]) authAttempts[ip] = { count: 0, blockedUntil: 0 };
    const password = req.body.password;
    if (!password) return res.status(400).json({ error: '請提供密碼' });
    const isValid = await bcrypt.compare(password, PASSWORD_HASH);
    if (!isValid) {
        authAttempts[ip].count += 1;
        if (authAttempts[ip].count >= MAX_ATTEMPTS) {
            authAttempts[ip].blockedUntil = now + BLOCK_TIME;
            return res.status(429).json({ error: `密碼錯誤次數過多，請於 ${BLOCK_TIME / 60000} 分鐘後再試。` });
        }
        return res.status(401).json({ error: '密碼錯誤' });
    }
    delete authAttempts[ip];
    const pack = req.params.pack;
    if (!isValidPackName(pack)) return res.status(400).json({ error: '包名格式錯誤，只允許英文、數字、底線' });
    if (!req.file) return res.status(400).json({ error: '請選擇要上傳的檔案' });
    const buffer = req.file.buffer;
    const mime = req.file.mimetype;
    if (
        !buffer || buffer.length < 4 ||
        buffer[0] !== 0x50 || buffer[1] !== 0x4B ||
        (buffer[2] !== 0x03 && buffer[2] !== 0x05 && buffer[2] !== 0x07) ||
        (buffer[3] !== 0x04 && buffer[3] !== 0x06 && buffer[3] !== 0x08)
    ) {
        return res.status(400).json({ error: '請上傳正確的 ZIP 檔案' });
    }
    if (mime !== 'application/zip' && mime !== 'application/x-zip-compressed') {
        return res.status(400).json({ error: '只允許上傳 ZIP 檔案' });
    }
    const finalPath = path.join(uploadDir, `${pack}.zip`);
    await fs.promises.writeFile(finalPath, buffer);
    const hash = crypto.createHash('sha1').update(buffer).digest('hex');
    await fs.promises.writeFile(path.join(uploadDir, `${pack}.sha1`), hash);
    res.json({
        message: '材質包上傳成功',
        filename: req.file.originalname,
        sha1: hash
    });
});

// Multer 錯誤處理
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: '檔案大小不能超過 50MB' });
        }
        return res.status(400).json({ error: '檔案上傳錯誤' });
    }
    next(err);
});

app.listen(port, () => {
    console.log(`伺服器運行在 http://localhost:${port}`);
}); 