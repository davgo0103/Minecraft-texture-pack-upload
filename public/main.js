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
const packSelect = document.getElementById('packSelect');
const customPackName = document.getElementById('customPackName');
const downloadPackSelect = document.getElementById('downloadPackSelect');

let passwordVerified = false;
let verifiedPassword = '';
let currentUploadPack = '';
let currentDownloadPack = '';

// 取得所有包名並填充下拉選單
async function loadPackList() {
    const res = await fetch('/list-packs');
    const data = await res.json();
    const packs = data.packs || [];
    // 上傳下拉選單
    packSelect.innerHTML = '<option value="" disabled selected>請選擇或自訂名稱</option>';
    packs.forEach(pack => {
        packSelect.innerHTML += `<option value="${pack}">${pack}</option>`;
    });
    packSelect.innerHTML += '<option value="__custom__">自訂名稱...</option>';
    // 下載下拉選單
    downloadPackSelect.innerHTML = '<option value="" disabled selected>請選擇</option>';
    packs.forEach(pack => {
        downloadPackSelect.innerHTML += `<option value="${pack}">${pack}</option>`;
    });
    // 預設選第一個
    if (packs.length > 0) {
        packSelect.value = packs[0];
        downloadPackSelect.value = packs[0];
        currentUploadPack = packs[0];
        currentDownloadPack = packs[0];
        checkTexturePack();
    } else {
        packSelect.value = '';
        downloadPackSelect.value = '';
        currentUploadPack = '';
        currentDownloadPack = '';
        fileInfo.innerHTML = '<i class="fas fa-exclamation-circle icon"></i> 目前還沒有上傳的材質包';
        downloadButton.style.display = 'none';
    }
}

// 監聽上傳下拉選單，切換自訂名稱欄位
packSelect.addEventListener('change', function() {
    if (this.value === '__custom__') {
        customPackName.style.display = 'block';
        currentUploadPack = '';
    } else {
        customPackName.style.display = 'none';
        currentUploadPack = this.value;
    }
});

// 監聽自訂名稱輸入
customPackName.addEventListener('input', function() {
    const val = this.value.trim();
    if (/^[a-zA-Z0-9_]{1,32}$/.test(val)) {
        currentUploadPack = val;
        this.style.borderColor = '';
    } else {
        currentUploadPack = '';
        this.style.borderColor = 'red';
    }
});

// 監聽下載下拉選單
downloadPackSelect.addEventListener('change', function() {
    currentDownloadPack = this.value;
    checkTexturePack();
});

// 檢查材質包狀態
async function checkTexturePack() {
    if (!currentDownloadPack) {
        fileInfo.innerHTML = '<i class="fas fa-exclamation-circle icon"></i> 目前還沒有上傳的材質包';
        downloadButton.style.display = 'none';
        return;
    }
    try {
        const response = await fetch(`/check-texture-pack/${encodeURIComponent(currentDownloadPack)}`);
        const data = await response.json();
        if (data.exists) {
            const lastModified = new Date(data.lastModified).toLocaleString();
            const size = (data.size / 1024 / 1024).toFixed(2);
            let sha1Html = '';
            if (data.sha1) {
                sha1Html = `<div class="sha1-block" id="sha1-hash" title="點擊複製">${data.sha1}</div>`;
            }
            fileInfo.innerHTML = `<i class="fas fa-info-circle icon"></i> 目前的材質包大小：${size} MB<br>最後更新時間：${lastModified}${sha1Html}`;
            downloadButton.style.display = 'block';
        } else {
            fileInfo.innerHTML = '<i class="fas fa-exclamation-circle icon"></i> 目前還沒有上傳的材質包';
            downloadButton.style.display = 'none';
        }
    } catch (error) {
        fileInfo.innerHTML = '<i class="fas fa-times-circle icon"></i> 無法檢查材質包狀態';
        downloadButton.style.display = 'none';
    }
}

// 初始載入
loadPackList();

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
    if (!currentUploadPack) {
        messageDiv.style.display = 'block';
        messageDiv.className = 'message error';
        messageDiv.innerHTML = `<i class='fas fa-times-circle icon'></i> 請選擇或輸入正確的材質包名稱`;
        return;
    }
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
    formData.append('password', verifiedPassword);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/upload/${encodeURIComponent(currentUploadPack)}`);

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
            messageDiv.innerHTML = `<i class="fas fa-check-circle icon"></i> ${data.message}`;
            fileInput.value = '';
            loadPackList();
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
            messageDiv.innerHTML = `<i class="fas fa-times-circle icon"></i> ${errorMsg}`;
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
        messageDiv.innerHTML = `<i class="fas fa-times-circle icon"></i> 上傳過程發生錯誤，請稍後再試。`;
    };

    xhr.send(formData);
});

// 處理下載
downloadButton.addEventListener('click', () => {
    if (!currentDownloadPack) return;
    window.location.href = `/download-texture-pack/${encodeURIComponent(currentDownloadPack)}`;
});

// SHA1 點擊複製
document.addEventListener('click', function(e) {
    if (e.target && e.target.id === 'sha1-hash') {
        const text = e.target.textContent;
        navigator.clipboard.writeText(text);
        e.target.innerText = '已複製！';
        setTimeout(() => { e.target.innerText = text; }, 1200);
    }
});