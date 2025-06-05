const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// 支援 Cloudflare 及其他 Proxy 取得真實 IP
app.set('trust proxy', true);

// 防暴力破解：記錄每個 IP 的密碼錯誤次數與 block 狀態
const loginAttempts = {};
const MAX_ATTEMPTS = 5;
const BLOCK_TIME = 10 * 60 * 1000; // 10 分鐘

function checkBlockMiddleware(req, res, next) {
    const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',').shift() || req.ip;
    const now = Date.now();
    if (loginAttempts[ip] && loginAttempts[ip].blockedUntil > now) {
        const waitSec = Math.ceil((loginAttempts[ip].blockedUntil - now) / 1000);
        return res.status(429).json({ error: `密碼錯誤次數過多，請於 ${waitSec} 秒後再試。` });
    }
    next();
}

// 新增密碼驗證 middleware
function passwordCheckMiddleware(req, res, next) {
    const password = req.body.password;
    if (!password) {
        return res.status(400).json({ error: '請提供密碼' });
    }
    bcrypt.compare(password, PASSWORD_HASH)
        .then(isValid => {
            if (!isValid) {
                return res.status(401).json({ error: '密碼錯誤' });
            }
            next();
        })
        .catch(err => {
            console.error('密碼驗證錯誤:', err);
            res.status(500).json({ error: '密碼驗證過程發生錯誤' });
        });
}

// 密碼驗證 API，僅驗證密碼，並加上3次錯誤封鎖30分鐘
const verifyAttempts = {};
const VERIFY_MAX_ATTEMPTS = 3;
const VERIFY_BLOCK_TIME = 30 * 60 * 1000; // 30分鐘

// 路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 檢查材質包是否存在的路由
app.get('/check-texture-pack', (req, res) => {
    try {
        const texturePath = path.join(uploadDir, 'texture-pack.zip');
        const exists = fs.existsSync(texturePath);
        if (exists) {
            const stats = fs.statSync(texturePath);
            res.json({
                exists: true,
                lastModified: stats.mtime,
                size: stats.size
            });
        } else {
            res.json({ exists: false });
        }
    } catch (error) {
        console.error('檢查檔案狀態錯誤:', error);
        res.status(500).json({ error: '檢查檔案狀態時發生錯誤' });
    }
});

// 下載材質包路由
app.get('/download-texture-pack', (req, res) => {
    try {
        const texturePath = path.join(uploadDir, 'texture-pack.zip');
        if (fs.existsSync(texturePath)) {
            res.download(texturePath, 'minecraft-texture-pack.zip');
        } else {
            res.status(404).json({ error: '找不到材質包檔案' });
        }
    } catch (error) {
        console.error('下載檔案錯誤:', error);
        res.status(500).json({ error: '下載檔案時發生錯誤' });
    }
});

// 密碼驗證 API，僅驗證密碼，並加上3次錯誤封鎖30分鐘
app.post('/verify-password', express.json(), async (req, res) => {
    const { password } = req.body;
    const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',').shift() || req.ip;
    const now = Date.now();

    // 初始化
    if (!verifyAttempts[ip]) {
        verifyAttempts[ip] = { count: 0, blockedUntil: 0 };
    }

    // 檢查是否被封鎖
    if (verifyAttempts[ip].blockedUntil > now) {
        const waitSec = Math.ceil((verifyAttempts[ip].blockedUntil - now) / 1000);
        const waitMin = Math.ceil(waitSec / 60);
        return res.status(429).json({ error: `密碼錯誤次數過多，請於 ${waitMin} 分鐘後再試。` });
    }

    // 如果 block 過期，重置
    if (verifyAttempts[ip].blockedUntil && verifyAttempts[ip].blockedUntil <= now) {
        verifyAttempts[ip] = { count: 0, blockedUntil: 0 };
    }

    if (!password) {
        return res.status(400).json({ error: '請提供密碼' });
    }
    const isPasswordValid = await bcrypt.compare(password, PASSWORD_HASH);
    if (!isPasswordValid) {
        verifyAttempts[ip].count += 1;
        if (verifyAttempts[ip].count >= VERIFY_MAX_ATTEMPTS) {
            verifyAttempts[ip].blockedUntil = now + VERIFY_BLOCK_TIME;
            return res.status(429).json({ error: `密碼錯誤次數過多，請於 ${VERIFY_BLOCK_TIME / 60000} 分鐘後再試。` });
        }
        return res.status(401).json({ error: '密碼錯誤' });
    } else {
        // 驗證成功自動清除紀錄
        delete verifyAttempts[ip];
    }
    res.json({ message: '密碼正確' });
});

// 上傳路由
app.post('/upload', checkBlockMiddleware, upload, async (req, res) => {
    try {
        // 1. 先驗證密碼
        const password = req.body.password;
        const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',').shift() || req.ip;
        const now = Date.now();
        if (!password) {
            return res.status(400).json({ error: '請提供密碼' });
        }
        const isPasswordValid = await bcrypt.compare(password, PASSWORD_HASH);
        if (!isPasswordValid) {
            // 初始化
            if (!loginAttempts[ip]) {
                loginAttempts[ip] = { count: 0, blockedUntil: 0 };
            }
            // 過期自動重置
            if (loginAttempts[ip].blockedUntil < now) {
                loginAttempts[ip] = { count: 0, blockedUntil: 0 };
            }
            loginAttempts[ip].count += 1;
            if (loginAttempts[ip].count >= MAX_ATTEMPTS) {
                loginAttempts[ip].blockedUntil = now + BLOCK_TIME;
                return res.status(429).json({ error: `密碼錯誤次數過多，請於 ${BLOCK_TIME / 60000} 分鐘後再試。` });
            }
            return res.status(401).json({ error: '密碼錯誤' });
        } else {
            // 驗證成功自動清除紀錄
            if (loginAttempts[ip]) {
                delete loginAttempts[ip];
            }
        }

        // 2. 檢查檔案
        if (!req.file) {
            return res.status(400).json({ error: '請選擇要上傳的檔案' });
        }

        // 3. 驗證檔案內容是否為 ZIP（magic number）
        const buffer = req.file.buffer;
        if (
            !buffer ||
            buffer.length < 4 ||
            buffer[0] !== 0x50 ||
            buffer[1] !== 0x4B ||
            (buffer[2] !== 0x03 && buffer[2] !== 0x05 && buffer[2] !== 0x07) ||
            (buffer[3] !== 0x04 && buffer[3] !== 0x06 && buffer[3] !== 0x08)
        ) {
            return res.status(400).json({ error: '請上傳正確的 ZIP 檔案' });
        }

        // 4. 寫入檔案
        const finalPath = path.join(uploadDir, 'texture-pack.zip');
        await fs.promises.writeFile(finalPath, buffer);

        res.json({
            message: '材質包上傳成功',
            filename: req.file.originalname
        });
    } catch (error) {
        console.error('處理錯誤:', error);
        res.status(500).json({ error: '上傳過程發生錯誤' });
    }
});

// Multer 錯誤處理 middleware
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