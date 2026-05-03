#include <windows.h>
#include <winhttp.h>
#include <shlobj.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#pragma comment(lib, "winhttp.lib")
#pragma comment(lib, "shell32.lib")

#define BUF (64*1024)
#define ROOT L"D:\\桌面\\media-downloader\\downloads"

void wprint(const wchar_t* s) {
    DWORD n; WriteConsoleW(GetStdHandle(STD_OUTPUT_HANDLE), s, wcslen(s), &n, NULL);
}
void wprintln(const wchar_t* s) { wprint(s); wprint(L"\r\n"); }

void wreadline(wchar_t* buf, DWORD size) {
    DWORD n; ReadConsoleW(GetStdHandle(STD_INPUT_HANDLE), buf, size, &n, NULL);
    if (n >= 2 && buf[n-2]==L'\r') buf[n-2]=L'\0';
}

wchar_t* to_wide(const char* s) {
    int n = MultiByteToWideChar(CP_UTF8, 0, s, -1, NULL, 0);
    wchar_t* w = malloc(n * sizeof(wchar_t));
    MultiByteToWideChar(CP_UTF8, 0, s, -1, w, n);
    return w;
}

char* http_get(const char* url) {
    wchar_t* wurl = to_wide(url);
    HINTERNET s = WinHttpOpen(L"Mozilla/5.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, NULL, NULL, 0);
    if (!s) { free(wurl); return NULL; }
    URL_COMPONENTS uc = {0}; uc.dwStructSize = sizeof(uc);
    wchar_t host[256]={0}, path[4096]={0};
    uc.lpszHostName=host; uc.dwHostNameLength=256;
    uc.lpszUrlPath=path; uc.dwUrlPathLength=4096;
    WinHttpCrackUrl(wurl,0,0,&uc); free(wurl);
    HINTERNET c = WinHttpConnect(s, host, uc.nPort, 0);
    if (!c) { WinHttpCloseHandle(s); return NULL; }
    DWORD fl = (uc.nScheme==INTERNET_SCHEME_HTTPS) ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET r = WinHttpOpenRequest(c, L"GET", path, NULL, NULL, WINHTTP_DEFAULT_ACCEPT_TYPES, fl);
    if (!r) { WinHttpCloseHandle(c); WinHttpCloseHandle(s); return NULL; }
    WinHttpAddRequestHeaders(r, L"Referer: https://www.bilibili.com/\r\n", -1, WINHTTP_ADDREQ_FLAG_ADD);
    if (!WinHttpSendRequest(r,NULL,0,NULL,0,0,0) || !WinHttpReceiveResponse(r,NULL)) {
        WinHttpCloseHandle(r); WinHttpCloseHandle(c); WinHttpCloseHandle(s); return NULL;
    }
    DWORD st=0,sz=sizeof(st);
    WinHttpQueryHeaders(r, WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER, NULL, &st,&sz,NULL);
    if (st==301 || st==302) {
        wchar_t loc[4096]={0}; DWORD ls=sizeof(loc);
        WinHttpQueryHeaders(r, WINHTTP_QUERY_LOCATION, NULL, loc,&ls,NULL);
        WinHttpCloseHandle(r); WinHttpCloseHandle(c); WinHttpCloseHandle(s);
        char loc8[4096]; WideCharToMultiByte(CP_UTF8,0,loc,-1,loc8,4096,NULL,NULL);
        return http_get(loc8);
    }
    DWORD t=0,rd=0;
    char* bf = malloc(1024*1024);
    while (WinHttpReadData(r, bf+t, 1024*1024-t-1, &rd) && rd>0) { t+=rd; if(t>=1024*1024-1) break; }
    bf[t]='\0';
    WinHttpCloseHandle(r); WinHttpCloseHandle(c); WinHttpCloseHandle(s);
    return bf;
}

int download_file(const char* url, const wchar_t* folder, const wchar_t* filename, const wchar_t* label) {
    wprint(L"["); wprint(label); wprintln(L"] Downloading...");

    char* cln = strdup(url);
    char* p;
    while ((p=strstr(cln,"\\u0026"))) {*p='&'; memmove(p+1,p+6,strlen(p+6)+1);}
    wchar_t* wurl = to_wide(cln); free(cln);

    HINTERNET s = WinHttpOpen(L"Mozilla/5.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, NULL, NULL, 0);
    if (!s) { free(wurl); return 0; }
    URL_COMPONENTS uc={0}; uc.dwStructSize=sizeof(uc);
    wchar_t host[256]={0}, pth[4096]={0};
    uc.lpszHostName=host; uc.dwHostNameLength=256;
    uc.lpszUrlPath=pth; uc.dwUrlPathLength=4096;
    WinHttpCrackUrl(wurl,0,0,&uc);
    HINTERNET c = WinHttpConnect(s, host, uc.nPort, 0);
    if (!c) { WinHttpCloseHandle(s); free(wurl); return 0; }
    DWORD fl = (uc.nScheme==INTERNET_SCHEME_HTTPS) ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET r = WinHttpOpenRequest(c, L"GET", pth, NULL, NULL, WINHTTP_DEFAULT_ACCEPT_TYPES, fl);
    if (!r) { WinHttpCloseHandle(c); WinHttpCloseHandle(s); free(wurl); return 0; }
    WinHttpAddRequestHeaders(r, L"Referer: https://www.bilibili.com/\r\n", -1, WINHTTP_ADDREQ_FLAG_ADD);
    if (!WinHttpSendRequest(r,NULL,0,NULL,0,0,0) || !WinHttpReceiveResponse(r,NULL)) {
        WinHttpCloseHandle(r); WinHttpCloseHandle(c); WinHttpCloseHandle(s); free(wurl); return 0;
    }
    DWORD st=0,sz=sizeof(st);
    WinHttpQueryHeaders(r, WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER, NULL, &st,&sz,NULL);
    if (st==301 || st==302) {
        wchar_t loc[4096]={0}; DWORD ls=sizeof(loc);
        WinHttpQueryHeaders(r, WINHTTP_QUERY_LOCATION, NULL, loc,&ls,NULL);
        WinHttpCloseHandle(r); WinHttpCloseHandle(c); WinHttpCloseHandle(s); free(wurl);
        char loc8[4096]; WideCharToMultiByte(CP_UTF8,0,loc,-1,loc8,4096,NULL,NULL);
        int ret = download_file(loc8, folder, filename, label); free(loc8);
        return ret;
    }
    DWORD cl=0,clz=sizeof(cl);
    WinHttpQueryHeaders(r, WINHTTP_QUERY_CONTENT_LENGTH|WINHTTP_QUERY_FLAG_NUMBER, NULL, &cl,&clz,NULL);

    wchar_t full[1024];
    swprintf(full, 1024, L"%s\\%s", folder, filename);

    HANDLE hf = CreateFileW(full, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (hf==INVALID_HANDLE_VALUE) {
        DWORD err = GetLastError();
        wprint(L"[ERROR] Cannot create file, code: ");
        wchar_t code[16]; swprintf(code, 16, L"%lu", err); wprintln(code);
        wprint(L"        Path: "); wprintln(full);
        WinHttpCloseHandle(r); WinHttpCloseHandle(c); WinHttpCloseHandle(s); free(wurl); return 0;
    }
    DWORD64 total=0; BYTE buf[BUF]; DWORD rd;
    while (WinHttpReadData(r, buf, BUF, &rd) && rd>0) {
        DWORD wr; WriteFile(hf, buf, rd, &wr, NULL); total+=wr;
        if (cl>0) {
            wchar_t prg[128];
            swprintf(prg, 128, L"\r[%s] %.1f%% (%.1fMB/%.1fMB)   ", label,
                (double)total/cl*100, total/(1024.*1024.), cl/(1024.*1024.));
            wprint(prg);
        }
    }
    CloseHandle(hf); WinHttpCloseHandle(r); WinHttpCloseHandle(c); WinHttpCloseHandle(s); free(wurl);
    wprint(L"\n["); wprint(label); wprintln(L"] Done DA\x2606ZE");
    return 1;
}

int extract_bv(const char* url, char* bv) {
    const char* p = strstr(url, "BV");
    if (!p) return 0;
    int i; for (i=0; i<12 && p[i]; i++) bv[i]=p[i];
    bv[i]='\0'; return 1;
}

char* json_str(const char* json, const char* key) {
    const char* p = strstr(json, key);
    if (!p) return NULL;
    p += strlen(key);
    const char* end = strchr(p, '"');
    if (!end) return NULL;
    int len = end - p;
    char* r = malloc(len+1);
    memcpy(r,p,len); r[len]='\0';
    return r;
}

long long json_ll(const char* json, const char* key) {
    const char* p = strstr(json, key);
    return p ? atoll(p + strlen(key)) : 0;
}

char* get_baseurl(const char* json, const char* section) {
    const char* p = strstr(json, section);
    if (!p) return NULL;
    p = strstr(p + strlen(section), "\"baseUrl\":\"");
    if (!p) return NULL;
    p += 11;
    const char* end = strchr(p, '"');
    if (!end) return NULL;
    int len = end - p;
    char* r = malloc(len+1);
    memcpy(r,p,len); r[len]='\0';
    for (int i=0; r[i]; i++) if (strncmp(r+i,"\\u0026",6)==0) {r[i]='&'; memmove(r+i+1,r+i+6,strlen(r+i+6)+1);}
    return r;
}

void safe_name(char* out, const char* in) {
    int j=0;
    for (int i=0; in[i]; i++) {
        char c=in[i];
        if (c=='\\'||c=='/'||c==':'||c=='*'||c=='?'||c=='"'||c=='<'||c=='>'||c=='|') out[j++]='_';
        else out[j++]=c;
    }
    out[j]='\0';
}

int main(void) {
    CreateDirectoryW(ROOT, NULL);

    wprintln(L"=======================================================");
    wprintln(L"    Bilibili Downloader (C)  DA\x2606ZE");
    wprintln(L"=======================================================");
    wprintln(L"");

    wprint(L"Enter URL: ");
    wchar_t wu[2048]; wreadline(wu, 2048);
    wprintln(L"");

    char url[2048]; WideCharToMultiByte(CP_UTF8,0,wu,-1,url,2048,NULL,NULL);

    char bv[16]={0};
    if (!extract_bv(url, bv)) { wprintln(L"[FAIL] Bad URL"); return 1; }
    wprint(L"BV: "); wprintln(to_wide(bv));

    wprintln(L"Fetching info...");
    char api[512]; sprintf(api, "https://api.bilibili.com/x/web-interface/view?bvid=%s", bv);
    char* json = http_get(api);
    if (!json) { wprintln(L"[ERROR] Network failed"); return 1; }

    char* title = json_str(json, "\"title\":\"");
    char* cover = json_str(json, "\"pic\":\"");
    long long cid = json_ll(json, "\"cid\":");
    if (!title) { wprintln(L"[ERROR] Parse failed"); free(json); return 1; }

    wprint(L"Title: "); wchar_t* wt = to_wide(title); wprintln(wt);

    char sf[512]; safe_name(sf, title);
    wchar_t wsf[512]; MultiByteToWideChar(CP_UTF8,0,sf,-1,wsf,512);
    wchar_t wbv[16]; MultiByteToWideChar(CP_UTF8,0,bv,-1,wbv,16);
    wchar_t folder[1024];
    swprintf(folder, 1024, L"%s\\%s_%s", ROOT, wbv, wsf);

    CreateDirectoryW(folder, NULL);
    DWORD err = GetLastError();
    if (err != ERROR_ALREADY_EXISTS && err != ERROR_SUCCESS) {
        wprint(L"[WARN] Create dir failed, code: ");
        wchar_t ce[16]; swprintf(ce, 16, L"%lu", err); wprintln(ce);
        wprint(L"      Trying anyway...\n");
    }

    download_file(cover, folder, L"cover.jpg", L"Cover");

    char dash[512]; sprintf(dash, "https://api.bilibili.com/x/player/playurl?bvid=%s&cid=%lld&qn=80&fnval=16", bv, cid);
    char* djson = http_get(dash);
    char *vurl=NULL, *aurl=NULL;
    if (djson) { vurl=get_baseurl(djson,"\"video\":["); aurl=get_baseurl(djson,"\"audio\":["); free(djson); }

    if (vurl) download_file(vurl, folder, L"video_only.mp4", L"Video");
    if (aurl) download_file(aurl, folder, L"audio_only.mp3", L"Audio");

    wprintln(L"");
    wprintln(L"=======================================================");
    wprintln(L"    Done DA\x2606ZE");
    wprint(L"    "); wprintln(folder);
    wprintln(L"=======================================================");

    free(title); free(cover); free(json); free(wt);
    if (vurl) free(vurl);
    if (aurl) free(aurl);
    return 0;
}