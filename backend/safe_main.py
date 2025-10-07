#!/usr/bin/env python3
import os
import sys

# Create Flask app FIRST, before any problematic imports
from flask import Flask, jsonify
app = Flask(__name__)

# Track what works
startup_log = []

def log(msg):
    startup_log.append(msg)
    print(msg, file=sys.stderr)

log("=== SAFE STARTUP DIAGNOSTIC ===")

# Try each import separately
try:
    from flask_cors import CORS
    CORS(app)
    log("✓ Flask-CORS imported")
except Exception as e:
    log(f"✗ Flask-CORS failed: {e}")

try:
    import pandas as pd
    log("✓ Pandas imported")
except Exception as e:
    log(f"✗ Pandas failed: {e}")

try:
    import numpy as np
    log("✓ NumPy imported")
except Exception as e:
    log(f"✗ NumPy failed: {e}")

try:
    from scipy.signal import find_peaks
    log("✓ SciPy imported")
except Exception as e:
    log(f"✗ SciPy failed: {e}")

try:
    from supabase import create_client, Client
    log("✓ Supabase imported")
    
    # Try to create client
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    if supabase_url and supabase_key:
        supabase = create_client(supabase_url, supabase_key)
        log("✓ Supabase client created")
    else:
        log("✗ Supabase secrets missing")
        supabase = None
except Exception as e:
    log(f"✗ Supabase failed: {e}")
    supabase = None

try:
    from dotenv import load_dotenv
    load_dotenv()
    log("✓ dotenv imported")
except Exception as e:
    log(f"✗ dotenv failed: {e}")

log("=== STARTUP COMPLETE ===")

@app.route('/')
def home():
    return '<br>'.join(['<h1>Diagnostic Results:</h1>'] + [f'<p>{line}</p>' for line in startup_log])

@app.route('/health')
def health():
    return jsonify({
        'status': 'ok',
        'startup_log': startup_log,
        'supabase': supabase is not None
    })

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    log(f"Starting on port {port}...")
    app.run(host='0.0.0.0', port=port)
