#!/usr/bin/env python3
"""Tiny proxy to serve index.html and forward TfWM API calls. No dependencies needed."""
import http.server
import urllib.request
import os

APP_ID = '3109385c'
APP_KEY = 'd2d7e3a45ab1e76875644f708ded95f9'
BASE = 'http://api.tfwm.org.uk'
PORT = 8080

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/api/'):
            self.proxy_api()
        else:
            super().do_GET()

    def proxy_api(self):
        routes = {
            '/api/arrivals': f'{BASE}/Line/4056/Arrivals?app_id={APP_ID}&app_key={APP_KEY}&formatter=json',
            '/api/stops': f'{BASE}/Line/4056/StopPoints?app_id={APP_ID}&app_key={APP_KEY}&formatter=json',
        }
        url = routes.get(self.path)
        if not url:
            self.send_error(404)
            return
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                data = resp.read()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self.send_error(502, str(e))

    def log_message(self, format, *args):
        if '/api/' in str(args[0]):
            super().log_message(format, *args)

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f'WM Metro proxy running on http://localhost:{PORT}')
    print('Open http://localhost:8080/index.html in your browser')
    http.server.HTTPServer(('', PORT), Handler).serve_forever()
