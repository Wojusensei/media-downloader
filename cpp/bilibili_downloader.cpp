#include <windows.h>
#include <winhttp.h>
#include <shlobj.h>
#include <string>
#include <cstdio>
#include <cstdlib>

#pragma comment(lib, "winhttp.lib")
#pragma comment(lib, "shell32.lib")

#define ROOT L"D:\\桌面\\media-downloader\\downloads"

void wprint(const std::wstring& s) {
    DWORD n;
    WriteConsoleW(GetStdHandle(STD_OUTPUT_HANDLE), s.c_str(), s.length(), &n, NULL);
}
void wprintln(const std::wstring& s) { wprint(s + L"\n"); }

std::wstring wread() {
    wchar_t buf[2048] = {0};
    DWORD n;
    ReadConsoleW(GetStdHandle(STD_INPUT_HANDLE), buf, 2047, &n, NULL);
    if (n >= 2 && buf[n-2] == L'\r') buf[n-2] = L'\0';
    if (n >= 2 && buf[n-1] == L'\n') buf[n-1] = L'\0';
    return std::wstring(buf);
}

std::wstring to_ws(const std::string& s) {
    int len = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, NULL, 0);
    std::wstring w(len, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, &w[0], len);
    while (!w.empty() && w.back() == L'\0') w.pop_back();
    return w;
}

std::string to_mb(const std::wstring& w) {
    int len = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, NULL, 0, NULL, NULL);
    std::string s(len, '\0');
    WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, &s[0], len, NULL, NULL);
    while (!s.empty() && s.back() == '\0') s.pop_back();
    return s;
}

std::string http_get(const std::string& url) {
    std::wstring wurl = to_ws(url);
    HINTERNET hS = WinHttpOpen(L"Mozilla/5.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, NULL, NULL, 0);
    if (!hS) return "";
    URL_COMPONENTS uc = {0};
    uc.dwStructSize = sizeof(uc);
    wchar_t host[256] = {0}, path[4096] = {0};
    uc.lpszHostName = host; uc.dwHostNameLength = 256;
    uc.lpszUrlPath = path; uc.dwUrlPathLength = 4096;
    WinHttpCrackUrl(wurl.c_str(), 0, 0, &uc);
    HINTERNET hC = WinHttpConnect(hS, host, uc.nPort, 0);
    if (!hC) { WinHttpCloseHandle(hS); return ""; }
    DWORD fl = (uc.nScheme == INTERNET_SCHEME_HTTPS) ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET hR = WinHttpOpenRequest(hC, L"GET", path, NULL, NULL, WINHTTP_DEFAULT_ACCEPT_TYPES, fl);
    if (!hR) { WinHttpCloseHandle(hC); WinHttpCloseHandle(hS); return ""; }
    WinHttpAddRequestHeaders(hR, L"Referer: https://www.bilibili.com/\r\n", -1, WINHTTP_ADDREQ_FLAG_ADD);
    if (!WinHttpSendRequest(hR, NULL, 0, NULL, 0, 0, 0) || !WinHttpReceiveResponse(hR, NULL)) {
        WinHttpCloseHandle(hR); WinHttpCloseHandle(hC); WinHttpCloseHandle(hS); return "";
    }
    DWORD st = 0, sz = sizeof(st);
    WinHttpQueryHeaders(hR, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, NULL, &st, &sz, NULL);
    if (st == 301 || st == 302) {
        wchar_t loc[4096] = {0}; DWORD ls = sizeof(loc);
        WinHttpQueryHeaders(hR, WINHTTP_QUERY_LOCATION, NULL, loc, &ls, NULL);
        WinHttpCloseHandle(hR); WinHttpCloseHandle(hC); WinHttpCloseHandle(hS);
        return http_get(to_mb(loc));
    }
    std::string body;
    char buf[65536]; DWORD rd;
    while (WinHttpReadData(hR, buf, sizeof(buf)-1, &rd) && rd > 0) body.append(buf, rd);
    WinHttpCloseHandle(hR); WinHttpCloseHandle(hC); WinHttpCloseHandle(hS);
    return body;
}

bool download(const std::string& url, const std::wstring& dir, const std::wstring& fname, const std::wstring& label) {
    wprintln(L"  [" + label + L"] 下载中 一w一");

    std::string cUrl = url;
    size_t p;
    while ((p = cUrl.find("\\u0026")) != std::string::npos) cUrl.replace(p, 6, "&");

    std::wstring wurl = to_ws(cUrl);
    HINTERNET hS = WinHttpOpen(L"Mozilla/5.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, NULL, NULL, 0);
    if (!hS) return false;
    URL_COMPONENTS uc = {0};
    uc.dwStructSize = sizeof(uc);
    wchar_t host[256] = {0}, path[4096] = {0};
    uc.lpszHostName = host; uc.dwHostNameLength = 256;
    uc.lpszUrlPath = path; uc.dwUrlPathLength = 4096;
    WinHttpCrackUrl(wurl.c_str(), 0, 0, &uc);
    HINTERNET hC = WinHttpConnect(hS, host, uc.nPort, 0);
    if (!hC) { WinHttpCloseHandle(hS); return false; }
    DWORD fl = (uc.nScheme == INTERNET_SCHEME_HTTPS) ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET hR = WinHttpOpenRequest(hC, L"GET", path, NULL, NULL, WINHTTP_DEFAULT_ACCEPT_TYPES, fl);
    if (!hR) { WinHttpCloseHandle(hC); WinHttpCloseHandle(hS); return false; }
    WinHttpAddRequestHeaders(hR, L"Referer: https://www.bilibili.com/\r\n", -1, WINHTTP_ADDREQ_FLAG_ADD);
    if (!WinHttpSendRequest(hR, NULL, 0, NULL, 0, 0, 0) || !WinHttpReceiveResponse(hR, NULL)) {
        WinHttpCloseHandle(hR); WinHttpCloseHandle(hC); WinHttpCloseHandle(hS); return false;
    }
    DWORD st = 0, sz = sizeof(st);
    WinHttpQueryHeaders(hR, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, NULL, &st, &sz, NULL);
    if (st == 301 || st == 302) {
        wchar_t loc[4096] = {0}; DWORD ls = sizeof(loc);
        WinHttpQueryHeaders(hR, WINHTTP_QUERY_LOCATION, NULL, loc, &ls, NULL);
        WinHttpCloseHandle(hR); WinHttpCloseHandle(hC); WinHttpCloseHandle(hS);
        return download(to_mb(loc), dir, fname, label);
    }
    DWORD cl = 0, clz = sizeof(cl);
    WinHttpQueryHeaders(hR, WINHTTP_QUERY_CONTENT_LENGTH | WINHTTP_QUERY_FLAG_NUMBER, NULL, &cl, &clz, NULL);

    std::wstring full = dir + L"\\" + fname;
    HANDLE hF = CreateFileW(full.c_str(), GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (hF == INVALID_HANDLE_VALUE) {
        WinHttpCloseHandle(hR); WinHttpCloseHandle(hC); WinHttpCloseHandle(hS);
        wprintln(L"  [" + label + L"] 创建文件失败 qwq");
        return false;
    }
    DWORD64 done = 0; BYTE buf[65536]; DWORD rd;
    while (WinHttpReadData(hR, buf, sizeof(buf), &rd) && rd > 0) {
        DWORD wr; WriteFile(hF, buf, rd, &wr, NULL); done += wr;
        if (cl > 0) {
            wchar_t prog[128];
            swprintf(prog, 128, L"\r  [%s] %.1f%% (%.1fMB/%.1fMB)   ", label.c_str(),
                (double)done/cl*100, done/(1024.*1024.), cl/(1024.*1024.));
            wprint(prog);
        }
    }
    CloseHandle(hF); WinHttpCloseHandle(hR); WinHttpCloseHandle(hC); WinHttpCloseHandle(hS);
    wprintln(L"\n  [" + label + L"] 完成 DA\x2606ZE");
    return true;
}

std::string get_bv(const std::string& url) {
    size_t p = url.find("BV");
    if (p == std::string::npos) return "";
    return url.substr(p, 12);
}

std::string j_str(const std::string& j, const std::string& k) {
    size_t p = j.find(k);
    if (p == std::string::npos) return "";
    p += k.length();
    size_t e = j.find('"', p);
    if (e == std::string::npos) return "";
    return j.substr(p, e-p);
}

long long j_ll(const std::string& j, const std::string& k) {
    size_t p = j.find(k);
    if (p == std::string::npos) return 0;
    return atoll(j.c_str() + p + k.length());
}

std::string get_vurl(const std::string& j, const std::string& sec) {
    size_t p = j.find(sec);
    if (p == std::string::npos) return "";
    p = j.find("\"baseUrl\":\"", p + sec.length());
    if (p == std::string::npos) return "";
    p += 11;
    size_t e = j.find('"', p);
    if (e == std::string::npos) return "";
    std::string r = j.substr(p, e-p);
    size_t x;
    while ((x = r.find("\\u0026")) != std::string::npos) r.replace(x, 6, "&");
    return r;
}

std::wstring safe(const std::string& s) {
    std::string o;
    for (char c : s) {
        if (c=='\\'||c=='/'||c==':'||c=='*'||c=='?'||c=='"'||c=='<'||c=='>'||c=='|') o+='_';
        else o+=c;
    }
    return to_ws(o);
}

int main(int argc, char* argv[]) {
    SetConsoleOutputCP(65001);
    CreateDirectoryW(ROOT, NULL);

    wprintln(L"=======================================================");
    wprintln(L"    Bilibili \x89C6\x9891\x4E0B\x8F7D\x5668 (C++)  DA\x2606ZE");
    wprintln(L"=======================================================");
    wprintln(L"");

    wprint(L"\x8BF7\x8F93\x5165 Bilibili \x89C6\x9891\x94FE\x63A5: ");
    std::wstring wurl = wread();
    wprintln(L"");

    std::string url = to_mb(wurl);
    std::string bv = get_bv(url);
    if (bv.empty()) { wprintln(L"\x2716 \x65E0\x6CD5\x8BC6\x522B\x94FE\x63A5 qwq"); return 1; }
    wprintln(L"\x2714 BV: " + to_ws(bv));

    wprintln(L"\x6B63\x5728\x83B7\x53D6\x89C6\x9891\x4FE1\x606F 一w一");
    char api[512];
    sprintf(api, "https://api.bilibili.com/x/web-interface/view?bvid=%s", bv.c_str());
    std::string json = http_get(api);
    if (json.empty()) { wprintln(L"\x2716 \x7F51\x7EDC\x8BF7\x6C42\x5931\x8D25 qwq"); return 1; }

    std::string title = j_str(json, "\"title\":\"");
    std::string cover = j_str(json, "\"pic\":\"");
    long long cid = j_ll(json, "\"cid\":");
    if (title.empty()) { wprintln(L"\x2716 \x89E3\x6790\x5931\x8D25 qwq"); return 1; }

    wprintln(L"\x2714 \x6807\x9898: " + to_ws(title));

    std::wstring wbv = to_ws(bv);
    std::wstring wsf = safe(title);
    std::wstring folder = std::wstring(ROOT) + L"\\" + wbv + L"_" + wsf;
    CreateDirectoryW(folder.c_str(), NULL);

    wprintln(L"");
    download(cover, folder, L"cover.jpg", L"\x5C01\x9762");

    char dash[512];
    sprintf(dash, "https://api.bilibili.com/x/player/playurl?bvid=%s&cid=%lld&qn=80&fnval=16", bv.c_str(), cid);
    std::string djson = http_get(dash);

    if (!djson.empty()) {
        std::string vu = get_vurl(djson, "\"video\":[");
        std::string au = get_vurl(djson, "\"audio\":[");
        if (!vu.empty()) download(vu, folder, L"video_only.mp4", L"\x89C6\x9891");
        if (!au.empty()) download(au, folder, L"audio_only.mp3", L"\x97F3\x9891");
    }

    wprintln(L"");
    wprintln(L"=======================================================");
    wprintln(L"    \x4E0B\x8F7D\x5B8C\x6210 DA\x2606ZE");
    wprint(L"    \x6587\x4EF6\x5939: "); wprintln(folder);
    wprintln(L"=======================================================");

    return 0;
}