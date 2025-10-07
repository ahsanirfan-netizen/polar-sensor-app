#!/usr/bin/env python3
from flask import Flask
import os

app = Flask(__name__)

@app.route('/')
def home():
    return f"""
    <h1>Test Deploy Works!</h1>
    <p>Port: {os.getenv('PORT', '5000')}</p>
    <p>Secrets check:</p>
    <ul>
        <li>SUPABASE_URL: {'SET' if os.getenv('SUPABASE_URL') else 'MISSING'}</li>
        <li>SUPABASE_SERVICE_ROLE_KEY: {'SET' if os.getenv('SUPABASE_SERVICE_ROLE_KEY') else 'MISSING'}</li>
    </ul>
    """

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    print(f"Starting on port {port}...")
    app.run(host='0.0.0.0', port=port)
