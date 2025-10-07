#!/usr/bin/env python3
"""
Minimal startup test to diagnose deployment issues
"""
import os
import sys

print("=" * 60)
print("DEPLOYMENT DIAGNOSTIC TEST")
print("=" * 60)

# Test 1: Python version
print(f"Python version: {sys.version}")

# Test 2: Environment variables
print("\nEnvironment Variables Check:")
supabase_url = os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

print(f"SUPABASE_URL: {'✓ SET' if supabase_url else '✗ MISSING'}")
print(f"SUPABASE_SERVICE_ROLE_KEY: {'✓ SET' if supabase_key else '✗ MISSING'}")

# Test 3: Import test
print("\nImport Test:")
try:
    from flask import Flask
    print("✓ Flask import OK")
except Exception as e:
    print(f"✗ Flask import failed: {e}")

try:
    from supabase import create_client
    print("✓ Supabase import OK")
except Exception as e:
    print(f"✗ Supabase import failed: {e}")

try:
    import pandas as pd
    print("✓ Pandas import OK")
except Exception as e:
    print(f"✗ Pandas import failed: {e}")

# Test 4: Create Flask app
print("\nFlask App Test:")
try:
    app = Flask(__name__)
    
    @app.route('/test')
    def test():
        return {
            'status': 'working',
            'supabase_url_set': supabase_url is not None,
            'supabase_key_set': supabase_key is not None
        }
    
    print("✓ Flask app created successfully")
    print("\nStarting test server on port 5000...")
    app.run(host='0.0.0.0', port=5000)
except Exception as e:
    print(f"✗ Flask app failed: {e}")
    import traceback
    traceback.print_exc()

print("=" * 60)
