/**
 * B站视频下载器 - JavaScript版 (Node.js)
 * 功能：输入B站视频链接，自动下载：
 *       - 视频文件 (.mp4)
 *       - 音频文件 (.mp3)
 *       - 视频封面 (.jpg)
 * 保存位置：downloads/视频BV号_标题/ 文件夹内
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ==================== 配置区 ====================
// 下载根目录
const DOWNLOAD_ROOT = path.join(__dirname, '..', 'downloads');

// 伪装成浏览器，防止被网站拒绝访问awa
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://www.bilibili.com/',
};
// ===============================================

/**
 * 如果根下载目录不存在，就自动创建
 */
function ensureRootFolder() {
    if (!fs.existsSync(DOWNLOAD_ROOT)) {
        fs.mkdirSync(DOWNLOAD_ROOT, { recursive: true });
    }
}

/**
 * 为每个视频创建专属文件夹，名称为：BV号_标题
 * @param {string} bv - BV号
 * @param {string} title - 视频标题
 * @returns {string} 文件夹路径
 */
function createFolder(bv, title) {
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');
    const folderName = `${bv}_${safeTitle}`;
    const folderPath = path.join(DOWNLOAD_ROOT, folderName);
    
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
        console.log(`[OK] 已创建下载文件夹: ${folderName}`);
    }
    
    return folderPath;
}

/**
 * 从B站链接中提取 BV 号
 * @param {string} url - B站视频链接
 * @returns {string|null} BV号
 */
function extractBVNumber(url) {
    const match = url.match(/BV[a-zA-Z0-9]{10}/);
    return match ? match[0] : null;
}

/**
 * 发送HTTP GET请求，返回JSON数据
 * @param {string} url - 请求地址
 * @param {object} extraHeaders - 额外请求头
 * @returns {Promise<object>} JSON响应
 */
function httpGetJSON(url, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const options = { 
            headers: { ...HEADERS, ...extraHeaders } 
        };
        
        client.get(url, options, (res) => {
            // 处理重定向
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                resolve(httpGetJSON(res.headers.location, extraHeaders));
                return;
            }
            
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('解析JSON失败 qwq'));
                }
            });
        }).on('error', reject);
    });
}

/**
 * 通过B站API获取视频标题、cid和封面地址
 * @param {string} bv - BV号
 * @returns {Promise<{title: string, cid: number, coverUrl: string}>}
 */
async function getVideoInfo(bv) {
    const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bv}`;
    const data = await httpGetJSON(apiUrl);
    
    if (data.code !== 0) {
        throw new Error(`获取视频信息失败: ${data.message} qwq`);
    }
    
    return {
        title: data.data.title,
        cid: data.data.cid,
        coverUrl: data.data.pic
    };
}

/**
 * 获取视频和音频的DASH流下载地址
 * @param {string} bv - BV号
 * @param {number} cid - 视频cid
 * @returns {Promise<{videoUrl: string, audioUrl: string}>}
 */
async function getDownloadUrls(bv, cid) {
    const apiUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bv}&cid=${cid}&qn=80&fnval=16`;
    const data = await httpGetJSON(apiUrl);
    
    if (data.code !== 0) {
        throw new Error(`获取下载地址失败: ${data.message} qwq`);
    }
    
    const dash = data.data.dash;
    const videoUrl = dash.video[0].baseUrl;
    const audioUrl = dash.audio[0].baseUrl;
    
    return { videoUrl, audioUrl };
}

/**
 * 下载文件并显示进度条
 * @param {string} url - 下载地址
 * @param {string} filePath - 保存路径
 * @param {string} fileType - 文件类型描述
 * @returns {Promise<string>} 文件路径
 */
function downloadFile(url, filePath, fileType) {
    return new Promise((resolve, reject) => {
        console.log(`[下载] ${fileType} 文件中...`);
        
        const client = url.startsWith('https') ? https : http;
        const options = { 
            headers: { 
                ...HEADERS,
                'Referer': 'https://www.bilibili.com/'
            } 
        };
        
        client.get(url, options, (res) => {
            // 处理重定向
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                resolve(downloadFile(res.headers.location, filePath, fileType));
                return;
            }
            
            const totalSize = parseInt(res.headers['content-length'] || '0');
            let downloaded = 0;
            const file = fs.createWriteStream(filePath);
            
            res.on('data', (chunk) => {
                downloaded += chunk.length;
                if (totalSize > 0) {
                    const percent = (downloaded / totalSize * 100).toFixed(1);
                    const mbDone = (downloaded / (1024 * 1024)).toFixed(1);
                    const mbTotal = (totalSize / (1024 * 1024)).toFixed(1);
                    process.stdout.write(`\r  进度: ${percent}% (${mbDone}MB / ${mbTotal}MB)`);
                }
            });
            
            res.pipe(file);
            
            file.on('finish', () => {
                file.close();
                console.log(`\n[完成] ${fileType} 保存成功`);
                resolve(filePath);
            });
            
            res.on('error', reject);
            file.on('error', reject);
        }).on('error', reject);
    });
}

// ==================== 主程序 ====================
async function main() {
    console.log('='.repeat(55));
    console.log('    B站视频下载器 v2.0 (JavaScript)');
    console.log('    下载内容: 视频 + 音频 + 封面');
    console.log('='.repeat(55));
    console.log();
    
    // 确保根下载目录存在
    ensureRootFolder();
    
    // 获取用户输入
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    rl.question('请输入B站视频链接: ', async (url) => {
        console.log();
        rl.close();
        
        try {
            // 步骤1: 提取BV号
            console.log('[1/5] 正在识别视频链接...');
            const bv = extractBVNumber(url.trim());
            if (!bv) {
                console.log('[失败] 无法识别B站链接！');
                console.log('       正确格式: https://www.bilibili.com/video/BV1xx411c7mD');
                return;
            }
            console.log(`       BV号: ${bv}`);
            
            // 步骤2: 获取视频信息
            console.log('[2/5] 正在获取视频信息...');
            const { title, cid, coverUrl } = await getVideoInfo(bv);
            console.log(`       标题: ${title}`);
            console.log(`       封面: 已获取`);
            
            // 步骤3: 创建专属文件夹
            console.log('[3/5] 正在创建下载文件夹...');
            const folder = createFolder(bv, title);
            
            // 步骤4: 下载封面
            console.log('[4/5] 正在下载封面...');
            const coverPath = path.join(folder, 'cover.jpg');
            await downloadFile(coverUrl, coverPath, '封面');
            
            // 步骤5: 获取视频和音频地址并下载
            console.log('[5/5] 正在获取视频和音频地址...');
            const { videoUrl, audioUrl } = await getDownloadUrls(bv, cid);
            
            // 下载视频流
            const videoPath = path.join(folder, 'video_only.mp4');
            await downloadFile(videoUrl, videoPath, '视频流');
            
            // 下载音频流
            const audioPath = path.join(folder, 'audio_only.mp3');
            await downloadFile(audioUrl, audioPath, '音频流');
            
            // 完成
            console.log();
            console.log('='.repeat(55));
            console.log('    全部下载完成！');
            console.log(`    文件夹: ${folder}`);
            console.log('    包含文件:');
            console.log('       - cover.jpg (封面)');
            console.log('       - video_only.mp4 (纯视频)');
            console.log('       - audio_only.mp3 (纯音频)');
            console.log('='.repeat(55));
            
        } catch (error) {
            console.log(`\n[错误] ${error.message}`);
            console.log('\n可能的原因:');
            console.log('  - 视频需要登录才能访问');
            console.log('  - 网络连接不稳定');
            console.log('  - 请尝试其他视频链接');
        }
    });
}

main();