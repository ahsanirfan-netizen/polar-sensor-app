#!/usr/bin/env python3
import sys
import os

# Super minimal test - just print and serve
print("=" * 60, file=sys.stderr)
print("MINIMAL TEST STARTING", file=sys.stderr)
print(f"Python: {sys.version}", file=sys.stderr)
print(f"Working dir: {os.getcwd()}", file=sys.stderr)
print(f"Files here: {os.listdir('.')}", file=sys.stderr)
print("=" * 60, file=sys.stderr)

# Try to start a simple HTTP server
from http.server import BaseHTTPRequestHandler, HTTPServer

class SimpleHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/html')
        self.end_headers()
        
        response = f"""
        <html><body>
        <h1>Minimal Test Works!</h1>
        <p>Python: {sys.version}</p>
        <p>Working dir: {os.getcwd()}</p>
        <p>SUPABASE_URL: {'SET' if os.getenv('SUPABASE_URL') else 'MISSING'}</p>
        <p>SUPABASE_SERVICE_ROLE_KEY: {'SET' if os.getenv('SUPABASE_SERVICE_ROLE_KEY') else 'MISSING'}</p>
        </body></html>
        """
        self.wfile.write(response.encode())
    
    def log_message(self, format, *args):
        sys.stderr.write(f"{self.address_string()} - {format % args}\n")

if __name__ == '__main__':
    server = HTTPServer(('0.0.0.0', 5000), SimpleHandler)
    print("Server starting on port 5000...", file=sys.stderr)
    server.serve_forever()
