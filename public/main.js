const passwordForm = document.getElementById('passwordForm');
const uploadForm = document.getElementById('uploadForm');
const fileInput = document.getElementById('texturepack');
const passwordInput = document.getElementById('password');
const messageDiv = document.getElementById('message');
const uploadButton = document.getElementById('uploadButton');
const verifyPasswordButton = document.getElementById('verifyPasswordButton');
const downloadButton = document.getElementById('downloadButton');
const fileInfo = document.getElementById('fileInfo');
const loadingSpinner = document.querySelector('.loading-spinner');
const progressGroup = document.getElementById('progressGroup');
const progressBar = document.getElementById('progressBar');

let passwordVerified = false;
let verifiedPassword = '';

// 檢查材質包狀態
async function checkTexturePack() {
    try {
        const response = await fetch('/check-texture-pack');
        const data = await response.json();
        
        if (data.exists) {
            const lastModified = new Date(data.lastModified).toLocaleString();
            const size = (data.size / 1024 / 1024).toFixed(2);
            let sha256Html = '';
            if (data.sha256) {
                sha256Html = `
                    <div style="margin-top:8px;">
                        <b>SHA256：</b>
                        <span id="sha256-hash" style="word-break:break-all;">${data.sha256}</span>
                    </div>
                `;
            }
            fileInfo.innerHTML = `
                <i class="fas fa-info-circle icon"></i>
                目前的材質包大小：${size} MB<br>
                最後更新時間：${lastModified}
                ${sha256Html}
            `;
            downloadButton.style.display = 'block';
        } else {
            fileInfo.innerHTML = `
                <i class="fas fa-exclamation-circle icon"></i>
                目前還沒有上傳的材質包
            `;
            downloadButton.style.display = 'none';
        }
    } catch (error) {
        fileInfo.innerHTML = `
            <i class="fas fa-times-circle icon"></i>
            無法檢查材質包狀態
        `;
        downloadButton.style.display = 'none';
    }
}

// 初始檢查
checkTexturePack();

// 密碼驗證流程
passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    verifyPasswordButton.disabled = true;
    messageDiv.style.display = 'none';
    const password = passwordInput.value;
    try {
        const response = await fetch('/verify-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await response.json();
        if (response.ok) {
            passwordVerified = true;
            verifiedPassword = password;
            passwordInput.disabled = true;
            verifyPasswordButton.disabled = true;
            uploadForm.style.display = 'block';
            messageDiv.style.display = 'block';
            messageDiv.className = 'message success';
            messageDiv.innerHTML = `<i class="fas fa-check-circle icon"></i> 密碼驗證成功，請選擇檔案上傳。`;
        } else {
            messageDiv.style.display = 'block';
            messageDiv.className = 'message error';
            let errorMsg = data.error || '密碼驗證失敗';
            if (errorMsg.includes('次數過多')) {
                errorMsg = data.error;
            } else if (errorMsg.includes('密碼')) {
                errorMsg = '密碼錯誤';
            }
            messageDiv.innerHTML = `<i class="fas fa-times-circle icon"></i> ${errorMsg}`;
            verifyPasswordButton.disabled = false;
        }
    } catch (error) {
        messageDiv.style.display = 'block';
        messageDiv.className = 'message error';
        messageDiv.innerHTML = `<i class="fas fa-times-circle icon"></i> 密碼驗證過程發生錯誤，請稍後再試。`;
        verifyPasswordButton.disabled = false;
    }
});

// 前端檢查副檔名與大小
fileInput.addEventListener('change', function() {
    messageDiv.style.display = 'none';
    if (this.files.length > 0) {
        const file = this.files[0];
        if (!file.name.endsWith('.zip')) {
            messageDiv.style.display = 'block';
            messageDiv.className = 'message error';
            messageDiv.innerHTML = `<i class='fas fa-times-circle icon'></i> 請選擇 .zip 檔案`;
            this.value = '';
        } else if (file.size > 50 * 1024 * 1024) {
            messageDiv.style.display = 'block';
            messageDiv.className = 'message error';
            messageDiv.innerHTML = `<i class='fas fa-times-circle icon'></i> 檔案大小不能超過 50MB`;
            this.value = '';
        }
    }
});

// 處理上傳
uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!passwordVerified) return;
    uploadButton.disabled = true;
    loadingSpinner.style.display = 'block';
    uploadButton.querySelector('.fa-upload').style.display = 'none';
    uploadButton.querySelector('span').textContent = '上傳中...';
    messageDiv.style.display = 'none';
    progressGroup.style.display = 'block';
    progressBar.style.width = '0%';
    progressBar.textContent = '';

    const formData = new FormData();
    formData.append('texturepack', fileInput.files[0]);
    formData.append('password', verifiedPassword); // 仍帶密碼給後端二次驗證

    // 用 XMLHttpRequest 來顯示進度條
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/upload');

    xhr.upload.onprogress = function(event) {
        if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            progressBar.style.width = percent + '%';
            progressBar.textContent = percent + '%';
        }
    };

    xhr.onload = function() {
        uploadButton.disabled = false;
        loadingSpinner.style.display = 'none';
        uploadButton.querySelector('.fa-upload').style.display = 'inline';
        uploadButton.querySelector('span').textContent = '上傳材質包';
        progressBar.style.width = '100%';
        setTimeout(() => { progressGroup.style.display = 'none'; }, 1000);
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch {}
        messageDiv.style.display = 'block';
        if (xhr.status >= 200 && xhr.status < 300) {
            messageDiv.className = 'message success';
            messageDiv.innerHTML = `
                <i class="fas fa-check-circle icon"></i>
                ${data.message}
            `;
            fileInput.value = '';
            checkTexturePack();
        } else {
            messageDiv.className = 'message error';
            let errorMsg = data.error || '上傳過程發生錯誤，請稍後再試。';
            if (errorMsg.includes('ZIP')) {
                errorMsg = '請上傳正確的 ZIP 檔案';
            } else if (errorMsg.includes('密碼')) {
                errorMsg = '密碼錯誤';
            } else if (errorMsg.includes('檔案大小')) {
                errorMsg = '檔案大小不能超過 50MB';
            }
            messageDiv.innerHTML = `
                <i class="fas fa-times-circle icon"></i>
                ${errorMsg}
            `;
        }
    };

    xhr.onerror = function() {
        uploadButton.disabled = false;
        loadingSpinner.style.display = 'none';
        uploadButton.querySelector('.fa-upload').style.display = 'inline';
        uploadButton.querySelector('span').textContent = '上傳材質包';
        progressGroup.style.display = 'none';
        messageDiv.style.display = 'block';
        messageDiv.className = 'message error';
        messageDiv.innerHTML = `
            <i class="fas fa-times-circle icon"></i>
            上傳過程發生錯誤，請稍後再試。
        `;
    };

    xhr.send(formData);
});

// 處理下載
downloadButton.addEventListener('click', () => {
    window.location.href = '/download-texture-pack';
});