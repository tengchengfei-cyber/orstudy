#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
同步后端 · 自建服务器版（不需要 Cloudflare 的替代方案）

协议与 Worker 版完全一致：
    GET  /<room> → 快照 JSON（没有则 {}）
    PUT  /<room> → 存快照，返回 ok
    OPTIONS      → CORS 预检

用法：
    python sync-server.py 8124        # 数据存在 ./syncdata/<room>.json

站内「统计 → 跨设备同步」的后端地址填：
    http://<服务器IP>:8124
（要跨公网使用，请在服务器上配 HTTPS 反向代理；仅局域网用则不用。）

隐私说明：room 码就是访问钥匙（无密码体系）。密钥要长且随机。
"""
from __future__ import annotations

import http.server
import json
import os
import socketserver
import sys
from urllib.parse import unquote

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "syncdata")
os.makedirs(ROOT, exist_ok=True)
MAX_BODY = 512 * 1024
CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "*",
}


def room_ok(room: str) -> bool:
    return (
        bool(room)
        and len(room) <= 64
        and room not in (".", "..")
        and "/" not in room
        and "\\" not in room
    )


def room_path(room: str) -> str:
    return os.path.join(ROOT, room + ".json")


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def _send(self, code: int, body: bytes, ctype: str = "text/plain; charset=utf-8") -> None:
        self.send_response(code)
        for k, v in CORS.items():
            self.send_header(k, v)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self._send(204, b"")

    def do_GET(self) -> None:
        room = unquote(self.path[1:].split("?", 1)[0])
        if not room_ok(room):
            self._send(400, b"bad room")
            return
        p = room_path(room)
        if os.path.exists(p):
            try:
                with open(p, "rb") as f:
                    self._send(200, f.read(), "application/json; charset=utf-8")
            except OSError:
                self._send(500, b"read error")
        else:
            self._send(200, b"{}", "application/json; charset=utf-8")

    def do_PUT(self) -> None:
        room = unquote(self.path[1:].split("?", 1)[0])
        if not room_ok(room):
            self._send(400, b"bad room")
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            self._send(413, b"too large")
            return
        body = self.rfile.read(length)
        try:
            json.loads(body)
        except Exception:
            self._send(400, b"not json")
            return
        # 原子写：先写临时文件再替换，避免半截文件
        tmp = room_path(room) + ".tmp"
        with open(tmp, "wb") as f:
            f.write(body)
        os.replace(tmp, room_path(room))
        self._send(200, b"ok")

    def log_message(self, *args) -> None:
        pass


class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True
    # 监听队列要足够大，否则并发请求瞬间涌入会 ECONNREFUSED
    request_queue_size = 256


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8124
    httpd = Server(("0.0.0.0", port), Handler)
    print("=" * 52)
    print("  同步后端已启动")
    print("  站内「统计 → 跨设备同步」的后端地址填：")
    print(f"    http://<服务器IP>:{port}/")
    print("  数据目录：./syncdata/")
    print("  按 Ctrl + C 停止")
    print("=" * 52)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")


if __name__ == "__main__":
    main()
