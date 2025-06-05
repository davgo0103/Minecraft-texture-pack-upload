const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

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
    },
    fileFilter: function (req, file, cb) {
        // 只允許上傳 zip 檔案
        if (!file.originalname.match(/\.(zip)$/)) {
            return cb(new Error('只允許上傳 ZIP 檔案！'));
        }
        cb(null, true);
    }
}).single('texturepack');

// 中間件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

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

// 上傳路由
app.post('/upload', (req, res) => {
    upload(req, res, async function(err) {
        if (err) {
            console.error('檔案上傳錯誤:', err);
            if (err.message === '只允許上傳 ZIP 檔案！') {
                return res.status(400).json({ error: err.message });
            }
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: '檔案大小不能超過 50MB' });
            }
            return res.status(500).json({ error: '檔案上傳過程發生錯誤' });
        }

        try {
            // 驗證密碼
            const password = req.body.password;
            if (!password) {
                return res.status(400).json({ error: '請提供密碼' });
            }

            let isPasswordValid = false;
            try {
                isPasswordValid = await bcrypt.compare(password, PASSWORD_HASH);
            } catch (error) {
                console.error('密碼驗證錯誤:', error);
                return res.status(500).json({ error: '密碼驗證過程發生錯誤' });
            }

            if (!isPasswordValid) {
                return res.status(401).json({ error: '密碼錯誤' });
            }

            // 檢查檔案
            if (!req.file) {
                return res.status(400).json({ error: '請選擇要上傳的檔案' });
            }

            // 寫入檔案
            const finalPath = path.join(uploadDir, 'texture-pack.zip');
            await fs.promises.writeFile(finalPath, req.file.buffer);

            res.json({ 
                message: '材質包上傳成功',
                filename: req.file.originalname
            });
        } catch (error) {
            console.error('處理錯誤:', error);
            res.status(500).json({ error: '上傳過程發生錯誤' });
        }
    });
});

app.listen(port, () => {
    console.log(`伺服器運行在 http://localhost:${port}`);
}); 