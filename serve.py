#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地服务器 · 让手机在同一 WiFi 下打开这个页面。

用法：
    python serve.py            # 默认 8123
    python serve.py 9000       # 指定端口

停止：Ctrl + C

注意：这里用 ThreadingHTTPServer（每个请求一个线程）。
      不要用 socketserver.TCPServer —— 它是单线程的，浏览器会并发开多条连接，
      一条卡住整个服务器就永久阻塞。
"""
from __future__ import annotations

import http.server
import os
import socket
import sys
import threading

os.chdir(os.path.dirname(os.path.abspath(__file__)) or ".")

PORT_DEFAULT = 8123


class Handler(http.server.SimpleHTTPRequestHandler):
    # 每个请求处理完就关连接，避免 keep-alive 把线程挂住
    protocol_version = "HTTP/1.0"
    # 兜底超时：即使客户端不发数据，线程也会被回收
    timeout = 30

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".js": "text/javascript; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".webmanifest": "application/manifest+json",
    }

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args) -> None:  # 安静模式
        pass


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    # 监听队列：浏览器/并发请求瞬间涌入时，队列太短会直接 ECONNREFUSED。
    # 256 足以应付数百并发（本应用实际只有几条连接，留足余量）。
    request_queue_size = 256


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def selftest(port: int) -> bool:
    """启动后自测一次，确认服务器真的在响应。"""
    import urllib.request

    for host in ("127.0.0.1", "localhost"):
        try:
            with urllib.request.urlopen(f"http://{host}:{port}/", timeout=6) as r:
                if r.status == 200 and len(r.read()) > 1000:
                    return True
        except Exception:
            continue
    return False


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT_DEFAULT

    httpd = None
    for p in range(port, port + 20):
        try:
            httpd = Server(("0.0.0.0", p), Handler)
            port = p
            break
        except OSError:
            continue
    if httpd is None:
        print("端口都被占用了，换一个：python serve.py 9000")
        return

    ip = lan_ip()
    line = "=" * 54
    print(line)
    print("  优化方向 · 课表与打卡")
    print(line)
    print(f"  电脑打开 : http://127.0.0.1:{port}/")
    print(f"  手机打开 : http://{ip}:{port}/")
    print()
    print("  手机需与电脑连同一个 WiFi。")
    print()
    print("  页面已就绪…")
    sys.stdout.flush()

    ok = selftest(port)
    print("  自检：" + ("✅ 服务器响应正常" if ok else "❌ 未通过自检"))
    if not ok:
        print("      请把上面的报错发给助手。")
    print()
    print("  如果手机打不开 → 多半是 Windows 防火墙拦截入站。")
    print("  以【管理员】身份打开 PowerShell，执行：")
    print(f'    netsh advfirewall firewall add rule name="orstudy-{port}" '
          f"dir=in action=allow protocol=TCP localport={port}")
    print()
    print("  按 Ctrl + C 停止")
    print(line)
    sys.stdout.flush()

    try:
        httpd.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        print("\n已停止。")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
