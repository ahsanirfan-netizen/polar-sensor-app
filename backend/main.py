import os
import time
import logging
from datetime import datetime, timezone
from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
from scipy.signal import find_peaks
from supabase import create_client, Client
from dotenv import load_dotenv
from collections import deque

# Lazy import HypnosPy only when needed (to avoid slow TensorFlow startup)
# from hypnospy import Wearable
# from hypnospy.analysis import SleepWakeAnalysis

print("=" * 50)
print("STARTING BACKEND - main.py loading...")
print("=" * 50)

load_dotenv()

# Configure environment for HypnosPy/TensorFlow file I/O in deployment
# These libraries need writable directories for cache/temp files
os.environ.setdefault('TMPDIR', '/tmp')
os.environ.setdefault('HOME', '/tmp')
os.environ.setdefault('MPLCONFIGDIR', '/tmp/matplotlib')
os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '2')
os.environ.setdefault('NUMEXPR_MAX_THREADS', '2')

# Create required directories
os.makedirs('/tmp/matplotlib', exist_ok=True)
os.makedirs('/tmp/.keras', exist_ok=True)
os.makedirs('/tmp/.local', exist_ok=True)

print("Environment configured for HypnosPy/TensorFlow: TMPDIR=/tmp, HOME=/tmp, dirs created")

app = Flask(__name__)
CORS(app)

# In-memory log storage (last 200 lines)
log_buffer = deque(maxlen=200)
print("Flask app created, setting up logging...")

class BufferHandler(logging.Handler):
    def emit(self, record):
        log_entry = self.format(record)
        log_buffer.append(log_entry)

# Setup logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Add buffer handler
buffer_handler = BufferHandler()
buffer_handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
logger.addHandler(buffer_handler)

# Also keep console output
console_handler = logging.StreamHandler()
console_handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
logger.addHandler(console_handler)

print("Setting up logger...")
logger.info("Starting backend server...")
logger.info(f"Loading environment variables...")

try:
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    print(f"ENV CHECK - SUPABASE_URL: {'SET' if supabase_url else 'MISSING'}")
    print(f"ENV CHECK - SUPABASE_SERVICE_ROLE_KEY: {'SET' if supabase_key else 'MISSING'}")

    logger.info(f"SUPABASE_URL: {'SET' if supabase_url else 'MISSING'}")
    logger.info(f"SUPABASE_SERVICE_ROLE_KEY: {'SET' if supabase_key else 'MISSING'}")

    # Initialize supabase client (can be None if env vars missing)
    supabase = None

    if not supabase_url:
        logger.error("SUPABASE_URL environment variable is missing! Database operations will fail.")
        print("ERROR: SUPABASE_URL is MISSING!")
    elif not supabase_key:
        logger.error("SUPABASE_SERVICE_ROLE_KEY environment variable is missing! Database operations will fail.")
        print("ERROR: SUPABASE_SERVICE_ROLE_KEY is MISSING!")
    else:
        try:
            print("Creating Supabase client...")
            supabase: Client = create_client(supabase_url, supabase_key)
            logger.info("Supabase client created successfully")
            print("✓ Supabase client created successfully")
        except Exception as e:
            logger.error(f"Failed to create Supabase client: {e}")
            logger.error("Server will start but database operations will fail!")
            print(f"ERROR creating Supabase client: {e}")

    logger.info("Flask app initialization complete")
    print("✓ Flask app initialization complete")
    
except Exception as init_error:
    print(f"CRITICAL ERROR during initialization: {init_error}")
    import traceback
    traceback.print_exc()
    raise

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy' if supabase else 'degraded', 
        'supabase_connected': supabase is not None,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'version': 'v3.7-debug-startup'
    })

@app.route('/logs', methods=['GET'])
def get_logs():
    """Return recent server logs in plain text"""
    lines = request.args.get('lines', 100, type=int)
    lines = min(lines, 200)  # Cap at 200
    
    recent_logs = list(log_buffer)[-lines:]
    log_text = '\n'.join(recent_logs)
    
    return log_text, 200, {'Content-Type': 'text/plain; charset=utf-8'}

@app.route('/debug-inspect/<session_id>', methods=['GET'])
def debug_inspect(session_id):
    """Debug endpoint to inspect database structure - NO AUTH for testing"""
    if not supabase:
        return jsonify({
            'error': 'Database not initialized. Server environment variables missing.',
            'hint': 'Check /logs endpoint for details'
        }), 503
    
    try:
        # Fetch data using service role (bypasses auth)
        readings_response = supabase.table('sensor_readings') \
            .select('*') \
            .eq('session_id', session_id) \
            .limit(5) \
            .execute()
        
        if not readings_response.data:
            return jsonify({'error': 'No data found for this session', 'session_id': session_id}), 404
        
        # Create DataFrame
        df = pd.DataFrame(readings_response.data)
        
        debug_info = {
            'session_id': session_id,
            'total_rows_in_sample': len(df),
            'all_columns': list(df.columns),
            'first_row_sample': readings_response.data[0] if readings_response.data else {},
            'column_types': {col: str(df[col].dtype) for col in df.columns},
            'null_counts': {col: int(df[col].isna().sum()) for col in df.columns}
        }
        
        # Check timestamp column specifically
        if 'timestamp' in df.columns:
            debug_info['timestamp_exists'] = True
            debug_info['timestamp_samples'] = df['timestamp'].head(3).tolist()
            try:
                test_parse = pd.to_datetime(df['timestamp'], utc=True, errors='coerce')
                debug_info['timestamp_parseable'] = True
                debug_info['parse_failures'] = int(test_parse.isna().sum())
            except Exception as e:
                debug_info['timestamp_parse_error'] = str(e)
        else:
            debug_info['timestamp_exists'] = False
            debug_info['WARNING'] = 'timestamp column is missing from database!'
        
        return jsonify(debug_info), 200
        
    except Exception as e:
        import traceback
        return jsonify({
            'error': str(e), 
            'error_type': type(e).__name__,
            'traceback': traceback.format_exc()
        }), 500

@app.route('/session-duration/<session_id>', methods=['GET'])
def session_duration(session_id):
    """Calculate recording duration from timestamps - NO AUTH"""
    try:
        readings_response = supabase.table('sensor_readings') \
            .select('timestamp') \
            .eq('session_id', session_id) \
            .order('timestamp') \
            .execute()
        
        if not readings_response.data or len(readings_response.data) < 2:
            return jsonify({'error': 'Insufficient data'}), 404
        
        first_ts = readings_response.data[0]['timestamp']
        last_ts = readings_response.data[-1]['timestamp']
        
        first_dt = pd.to_datetime(first_ts, utc=True)
        last_dt = pd.to_datetime(last_ts, utc=True)
        
        duration = last_dt - first_dt
        duration_seconds = duration.total_seconds()
        duration_minutes = duration_seconds / 60
        
        return jsonify({
            'session_id': session_id,
            'total_records': len(readings_response.data),
            'first_timestamp': first_ts,
            'last_timestamp': last_ts,
            'duration_seconds': duration_seconds,
            'duration_minutes': round(duration_minutes, 2),
            'duration_formatted': f'{int(duration_minutes)} min {int(duration_seconds % 60)} sec'
        }), 200
        
    except Exception as e:
        import traceback
        return jsonify({
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500

@app.route('/debug-analyze/<session_id>', methods=['GET'])
def debug_analyze(session_id):
    """Debug endpoint that runs full analysis and returns detailed error info - NO AUTH"""
    import traceback
    
    debug_log = []
    
    try:
        debug_log.append(f"Starting debug analysis for session: {session_id}")
        
        # Step 1: Fetch data with pagination
        debug_log.append("Step 1: Fetching sensor readings from database with pagination...")
        all_readings = []
        page_size = 1000
        page = 0
        
        while True:
            start = page * page_size
            end = start + page_size - 1
            
            batch_response = supabase.table('sensor_readings') \
                .select('timestamp, ppg, acc_x, acc_y, acc_z, gyro_x, gyro_y, gyro_z') \
                .eq('session_id', session_id) \
                .order('timestamp') \
                .range(start, end) \
                .execute()
            
            if not batch_response.data:
                break
            
            all_readings.extend(batch_response.data)
            debug_log.append(f"Fetched page {page + 1}: {len(batch_response.data)} records (total: {len(all_readings)})")
            
            if len(batch_response.data) < page_size:
                break
            
            page += 1
        
        if not all_readings:
            return jsonify({
                'error': 'No data found',
                'session_id': session_id,
                'debug_log': debug_log
            }), 404
        
        debug_log.append(f"Total fetched: {len(all_readings)} rows from database")
        
        # Track processing stats for error messages
        processing_stats = {'raw_records': len(all_readings)}
        
        # Step 2: Create DataFrame
        debug_log.append("Step 2: Creating DataFrame...")
        df = pd.DataFrame(all_readings)
        debug_log.append(f"DataFrame created with {len(df)} rows and columns: {list(df.columns)}")
        debug_log.append(f"Null counts: {df.isna().sum().to_dict()}")
        
        # Track non-null sensor data counts
        processing_stats['ppg_records'] = df['ppg'].notna().sum()
        processing_stats['acc_records'] = (df['acc_x'].notna() & df['acc_y'].notna() & df['acc_z'].notna()).sum()
        debug_log.append(f"Non-null counts: PPG={processing_stats['ppg_records']}, ACC={processing_stats['acc_records']}")
        
        # Step 3: Parse timestamps
        debug_log.append("Step 3: Parsing timestamps...")
        df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True, errors='coerce')
        debug_log.append(f"Timestamps parsed. Failed to parse: {df['timestamp'].isna().sum()} rows")
        
        # Step 4: Calculate HR from PPG
        debug_log.append("Step 4: Calculating heart rate from PPG...")
        try:
            hr_data = calculate_heart_rate_from_ppg(df)
            processing_stats['hr_calculated'] = len(hr_data)
            debug_log.append(f"HR calculation completed. Generated {len(hr_data)} HR records")
            debug_log.append(f"HR data columns: {list(hr_data.columns) if len(hr_data) > 0 else 'empty'}")
        except Exception as hr_error:
            debug_log.append(f"HR calculation FAILED: {type(hr_error).__name__}: {str(hr_error)}")
            raise
        
        # Step 5: Calculate activity metrics
        debug_log.append("Step 5: Calculating activity metrics...")
        try:
            activity_data = calculate_activity_metrics(df)
            processing_stats['activity_calculated'] = len(activity_data)
            debug_log.append(f"Activity calculation completed. Generated {len(activity_data)} activity records")
            debug_log.append(f"Activity data columns: {list(activity_data.columns) if len(activity_data) > 0 else 'empty'}")
        except Exception as activity_error:
            debug_log.append(f"Activity calculation FAILED: {type(activity_error).__name__}: {str(activity_error)}")
            raise
        
        # Step 6: Merge data
        debug_log.append("Step 6: Merging HR and activity data...")
        try:
            # Handle empty DataFrames from insufficient sensor data
            if len(hr_data) == 0 and len(activity_data) == 0:
                debug_log.append("ERROR: Both HR and activity data are empty - insufficient sensor data")
                raise ValueError('Insufficient sensor data: No heart rate or activity data could be calculated. This session may contain mostly null values.')
            elif len(activity_data) == 0:
                debug_log.append("Activity data empty - using HR data only with zero activity values")
                merged_data = hr_data.copy()
                merged_data['activity_magnitude'] = 0
                merged_data['movement_intensity'] = 0
            elif len(hr_data) == 0:
                debug_log.append("HR data empty - using activity data only with null heart rate")
                merged_data = activity_data.copy()
                merged_data['heart_rate'] = None
            else:
                debug_log.append("Both datasets have data - performing merge_asof")
                merged_data = pd.merge_asof(
                    activity_data.sort_values('timestamp'),
                    hr_data.sort_values('timestamp'),
                    on='timestamp',
                    direction='nearest',
                    tolerance=pd.Timedelta('30s')
                )
            processing_stats['merged_records'] = len(merged_data)
            debug_log.append(f"Merge completed. Result has {len(merged_data)} rows")
            debug_log.append(f"Processing stats: {processing_stats}")
        except Exception as merge_error:
            debug_log.append(f"Merge FAILED: {type(merge_error).__name__}: {str(merge_error)}")
            raise
        
        # Step 7: Analyze sleep
        debug_log.append("Step 7: Running sleep analysis algorithm...")
        try:
            sleep_metrics = analyze_sleep_with_simple_algorithm(merged_data, processing_stats)
            debug_log.append(f"Sleep analysis completed successfully")
            debug_log.append(f"Sleep metrics: {sleep_metrics}")
        except Exception as sleep_error:
            debug_log.append(f"Sleep analysis FAILED: {type(sleep_error).__name__}: {str(sleep_error)}")
            raise
        
        return jsonify({
            'status': 'success',
            'session_id': session_id,
            'debug_log': debug_log,
            'sleep_metrics': sleep_metrics
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'session_id': session_id,
            'error_type': type(e).__name__,
            'error_message': str(e),
            'debug_log': debug_log,
            'traceback': traceback.format_exc()
        }), 500

@app.route('/analyze-sleep', methods=['POST'])
def analyze_sleep():
    start_time = time.time()
    
    if not supabase:
        return jsonify({
            'error': 'Database not initialized. Server environment variables missing.',
            'hint': 'Check /logs endpoint for details'
        }), 503
    
    try:
        data = request.json
        session_id = data.get('session_id')
        auth_header = request.headers.get('Authorization')
        
        if not session_id:
            return jsonify({'error': 'session_id is required'}), 400
        
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Authorization header required'}), 401
        
        token = auth_header.split('Bearer ')[1]
        
        user_response = supabase.auth.get_user(token)
        user_id = user_response.user.id
        
        session_response = supabase.table('sessions').select('*').eq('id', session_id).eq('user_id', user_id).single().execute()
        
        if not session_response.data:
            return jsonify({'error': 'Session not found or access denied'}), 404
        
        try:
            supabase.table('sleep_analysis').insert({
                'user_id': user_id,
                'session_id': session_id,
                'processing_status': 'processing'
            }).execute()
            is_owner = True
        except Exception as insert_error:
            if 'duplicate key' in str(insert_error).lower() or 'unique' in str(insert_error).lower():
                is_owner = False
                existing = supabase.table('sleep_analysis').select('*').eq('session_id', session_id).single().execute()
                
                if existing.data:
                    if existing.data['processing_status'] == 'completed':
                        return jsonify({
                            'status': 'completed',
                            'cached': True,
                            'analysis': existing.data
                        }), 200
                    elif existing.data['processing_status'] == 'processing':
                        return jsonify({
                            'status': 'processing',
                            'message': 'Analysis already in progress'
                        }), 202
                    elif existing.data['processing_status'] == 'error':
                        supabase.table('sleep_analysis').update({
                            'processing_status': 'processing',
                            'processing_error': None
                        }).eq('session_id', session_id).execute()
                        is_owner = True
            else:
                raise
        
        # Fetch all records using pagination (Supabase default limit is 1000)
        all_readings = []
        page_size = 1000
        page = 0
        
        logger.info(f"Fetching sensor readings for session {session_id} with pagination...")
        while True:
            start = page * page_size
            end = start + page_size - 1
            
            batch_response = supabase.table('sensor_readings') \
                .select('timestamp, ppg, acc_x, acc_y, acc_z, gyro_x, gyro_y, gyro_z') \
                .eq('session_id', session_id) \
                .order('timestamp') \
                .range(start, end) \
                .execute()
            
            if not batch_response.data:
                break
            
            all_readings.extend(batch_response.data)
            logger.info(f"Fetched page {page + 1}: {len(batch_response.data)} records (total: {len(all_readings)})")
            
            if len(batch_response.data) < page_size:
                break
            
            page += 1
        
        logger.info(f"Total records fetched: {len(all_readings)}")
        
        if not all_readings or len(all_readings) < 100:
            raise ValueError('Insufficient data for analysis (minimum 100 samples required)')
        
        # Track data processing stats for detailed error messages
        processing_stats = {'raw_records': len(all_readings)}
        
        try:
            df = pd.DataFrame(all_readings)
            
            if len(df) == 0:
                raise ValueError('No data returned from database')
            
            available_cols = list(df.columns) if len(df.columns) > 0 else []
            sample_data = all_readings[0] if len(all_readings) > 0 else {}
            
            if 'timestamp' not in df.columns:
                raise ValueError(f'timestamp column not found. Available columns: {available_cols}. Sample data keys: {list(sample_data.keys())}. Total rows: {len(df)}')
            
            sample_timestamps = df['timestamp'].head(3).tolist()
            df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True, errors='coerce')
            
            if df['timestamp'].isna().all():
                raise ValueError(f'All timestamps failed to parse. Sample raw values: {sample_timestamps}')
            
            # Track non-null sensor data counts
            processing_stats['ppg_records'] = df['ppg'].notna().sum()
            processing_stats['acc_records'] = (df['acc_x'].notna() & df['acc_y'].notna() & df['acc_z'].notna()).sum()
            logger.info(f"Data stats - Raw: {processing_stats['raw_records']}, PPG: {processing_stats['ppg_records']}, ACC: {processing_stats['acc_records']}")
                
        except KeyError as e:
            raise ValueError(f'KeyError accessing column: {str(e)}. Available columns: {available_cols}. Sample data: {sample_data}')
        
        hr_data = calculate_heart_rate_from_ppg(df)
        processing_stats['hr_calculated'] = len(hr_data)
        
        activity_data = calculate_activity_metrics(df)
        processing_stats['activity_calculated'] = len(activity_data)
        
        # Handle empty DataFrames from insufficient sensor data
        if len(hr_data) == 0 and len(activity_data) == 0:
            detailed_error = (f'Insufficient sensor data: No heart rate or activity data could be calculated. '
                            f'Processing stats: {processing_stats["raw_records"]} raw records, '
                            f'{processing_stats["ppg_records"]} PPG records, '
                            f'{processing_stats["acc_records"]} ACC records, '
                            f'0 HR calculated, 0 activity calculated.')
            raise ValueError(detailed_error)
        elif len(activity_data) == 0:
            # Use HR data only
            merged_data = hr_data.copy()
            merged_data['activity_magnitude'] = 0
            merged_data['movement_intensity'] = 0
        elif len(hr_data) == 0:
            # Use activity data only
            merged_data = activity_data.copy()
            merged_data['heart_rate'] = None
        else:
            # Both have data, merge normally
            merged_data = pd.merge_asof(
                activity_data.sort_values('timestamp'),
                hr_data.sort_values('timestamp'),
                on='timestamp',
                direction='nearest',
                tolerance=pd.Timedelta('30s')
            )
        
        processing_stats['merged_records'] = len(merged_data)
        logger.info(f"Merged data: {processing_stats['merged_records']} records")
        
        sleep_metrics = analyze_sleep_with_simple_algorithm(merged_data, processing_stats)
        
        sleep_metrics['user_id'] = user_id
        sleep_metrics['session_id'] = session_id
        sleep_metrics['processing_status'] = 'completed'
        sleep_metrics['processed_at'] = datetime.now(timezone.utc).isoformat()
        sleep_metrics['processing_duration_seconds'] = time.time() - start_time
        
        supabase.table('sleep_analysis').update(sleep_metrics).eq('session_id', session_id).execute()
        
        return jsonify({
            'status': 'completed',
            'cached': False,
            'analysis': sleep_metrics
        }), 200
        
    except Exception as e:
        error_msg = str(e)
        print(f'Error analyzing sleep: {error_msg}')
        
        if session_id and locals().get('is_owner', False):
            try:
                supabase.table('sleep_analysis').update({
                    'processing_status': 'error',
                    'processing_error': error_msg,
                    'processed_at': datetime.now(timezone.utc).isoformat(),
                    'processing_duration_seconds': time.time() - start_time
                }).eq('session_id', session_id).execute()
            except:
                pass
        
        return jsonify({'error': error_msg}), 500

def calculate_heart_rate_from_ppg(df):
    print(f'[PPG] Starting HR calculation. Input columns: {list(df.columns)}, rows: {len(df)}')
    try:
        ppg_df = df[df['ppg'].notna()].copy()
        print(f'[PPG] After PPG filter. Columns: {list(ppg_df.columns)}, rows: {len(ppg_df)}')
        
        if len(ppg_df) == 0:
            print('[PPG] No PPG data, returning empty DataFrame')
            return pd.DataFrame(columns=['timestamp', 'heart_rate'])
        
        if 'timestamp' not in ppg_df.columns:
            error_msg = f'timestamp missing in PPG data. Columns: {list(ppg_df.columns)}. Input df columns: {list(df.columns)}. PPG rows: {len(ppg_df)}'
            print(f'[PPG ERROR] {error_msg}')
            raise ValueError(error_msg)
        
        # Use pandas resample for proper 1-minute epochs
        ppg_df = ppg_df.set_index('timestamp')
        
        hr_records = []
        resampled = ppg_df.resample('1min')
        
        for timestamp, group in resampled:
            if len(group) >= 50:  # Need minimum samples for peak detection
                ppg_values = group['ppg'].values
                
                ppg_normalized = (ppg_values - np.mean(ppg_values)) / (np.std(ppg_values) + 1e-8)
                
                peaks, properties = find_peaks(
                    ppg_normalized,
                    distance=50,
                    prominence=0.5,
                    height=0.3
                )
                
                if len(peaks) >= 2:
                    peak_intervals = np.diff(peaks)
                    avg_interval_samples = np.median(peak_intervals)
                    sampling_rate = 135
                    heart_rate = (sampling_rate / avg_interval_samples) * 60
                    
                    if 30 <= heart_rate <= 200:
                        hr_records.append({
                            'timestamp': timestamp,
                            'heart_rate': heart_rate
                        })
        
        print(f'[PPG] Completed. Generated {len(hr_records)} HR records')
        return pd.DataFrame(hr_records)
    except KeyError as e:
        error_msg = f'KeyError in calculate_heart_rate_from_ppg: {str(e)}. Input columns: {list(df.columns)}. PPG data shape: {ppg_df.shape if "ppg_df" in locals() else "not created"}'
        print(f'[PPG CAUGHT KEYERROR] {error_msg}')
        raise ValueError(error_msg)
    except Exception as e:
        print(f'[PPG UNEXPECTED ERROR] {type(e).__name__}: {str(e)}')
        raise

def calculate_activity_metrics(df):
    print(f'[ACC] Starting activity calculation. Input columns: {list(df.columns)}, rows: {len(df)}')
    try:
        acc_df = df[(df['acc_x'].notna()) & (df['acc_y'].notna()) & (df['acc_z'].notna())].copy()
        print(f'[ACC] After ACC filter. Columns: {list(acc_df.columns)}, rows: {len(acc_df)}')
        
        if len(acc_df) == 0:
            print('[ACC] No accelerometer data, returning empty DataFrame')
            return pd.DataFrame(columns=['timestamp', 'activity_magnitude', 'movement_intensity'])
        
        if 'timestamp' not in acc_df.columns:
            error_msg = f'timestamp missing in accelerometer data. Columns: {list(acc_df.columns)}. Input df columns: {list(df.columns)}. ACC rows: {len(acc_df)}'
            print(f'[ACC ERROR] {error_msg}')
            raise ValueError(error_msg)
        
        acc_df['activity_magnitude'] = np.sqrt(
            acc_df['acc_x']**2 + acc_df['acc_y']**2 + acc_df['acc_z']**2
        )
        
        # Use pandas resample for proper 1-minute epochs
        acc_df = acc_df.set_index('timestamp')
        
        # Resample to 1-minute epochs
        activity_records = []
        resampled = acc_df.resample('1min')
        
        for timestamp, group in resampled:
            if len(group) > 0:
                avg_magnitude = group['activity_magnitude'].mean()
                std_magnitude = group['activity_magnitude'].std()
                movement_count = (group['activity_magnitude'] > avg_magnitude + std_magnitude).sum() if std_magnitude > 0 else 0
                
                activity_records.append({
                    'timestamp': timestamp,
                    'activity_magnitude': avg_magnitude,
                    'movement_intensity': movement_count
                })
        
        print(f'[ACC] Completed. Generated {len(activity_records)} activity records')
        return pd.DataFrame(activity_records)
    except KeyError as e:
        error_msg = f'KeyError in calculate_activity_metrics: {str(e)}. Input columns: {list(df.columns)}. ACC data shape: {acc_df.shape if "acc_df" in locals() else "not created"}'
        print(f'[ACC CAUGHT KEYERROR] {error_msg}')
        raise ValueError(error_msg)
    except Exception as e:
        print(f'[ACC UNEXPECTED ERROR] {type(e).__name__}: {str(e)}')
        raise

def analyze_sleep_with_simple_algorithm(df, processing_stats=None):
    if len(df) < 10:
        if processing_stats:
            detailed_error = (f'Insufficient processed data for sleep analysis. '
                            f'Only {len(df)} processed records available, need at least 10. '
                            f'Processing breakdown: {processing_stats["raw_records"]} raw records → '
                            f'{processing_stats["ppg_records"]} PPG records → {processing_stats["hr_calculated"]} HR calculated, '
                            f'{processing_stats["acc_records"]} ACC records → {processing_stats["activity_calculated"]} activity calculated → '
                            f'{processing_stats.get("merged_records", len(df))} merged records.')
            raise ValueError(detailed_error)
        else:
            raise ValueError(f'Insufficient processed data for sleep analysis. Only {len(df)} records, need at least 10.')
    
    df = df.sort_values('timestamp').reset_index(drop=True)
    
    # Use activity as PRIMARY sleep indicator (like Cole-Kripke), HR as secondary
    activity_threshold = df['activity_magnitude'].quantile(0.40) if 'activity_magnitude' in df.columns else None
    hr_threshold = df['heart_rate'].quantile(0.60) if 'heart_rate' in df.columns and df['heart_rate'].notna().any() else None
    
    logger.info(f'[SLEEP ANALYSIS] Activity threshold: {activity_threshold}, HR threshold: {hr_threshold}')
    logger.info(f'[SLEEP ANALYSIS] Total records: {len(df)}')
    
    # Primary signal: low activity (below 40th percentile)
    if activity_threshold is not None:
        df['likely_sleep'] = df['activity_magnitude'] < activity_threshold
        
        # Secondary enhancement: if HR data available, slightly boost confidence for low HR
        if hr_threshold is not None:
            # Keep all low-activity as sleep, but can refine later if needed
            pass
    else:
        df['likely_sleep'] = False
    
    sleep_count = df['likely_sleep'].sum()
    logger.info(f'[SLEEP ANALYSIS] Records marked as sleep: {sleep_count}/{len(df)} ({100*sleep_count/len(df):.1f}%)')
    
    # Use a more robust sleep block detection that tolerates brief awakenings
    sleep_blocks = []
    in_sleep_period = False
    sleep_start = None
    awake_count = 0
    max_awake_tolerance = 3  # Allow up to 3 minutes of wake time before ending sleep block
    
    for idx, row in df.iterrows():
        if row['likely_sleep']:
            if not in_sleep_period:
                sleep_start = idx
                in_sleep_period = True
            awake_count = 0  # Reset awake counter when sleep is detected
        else:
            if in_sleep_period:
                awake_count += 1
                if awake_count > max_awake_tolerance:
                    # End the sleep block
                    if idx - sleep_start >= 10:  # Minimum 10 minutes
                        sleep_blocks.append((sleep_start, idx - awake_count - 1))
                    in_sleep_period = False
                    awake_count = 0
    
    # Handle final sleep block
    if in_sleep_period and len(df) - sleep_start >= 10:
        sleep_blocks.append((sleep_start, len(df) - 1))
    
    logger.info(f'[SLEEP ANALYSIS] Found {len(sleep_blocks)} sleep blocks: {sleep_blocks}')
    
    if not sleep_blocks:
        return {
            'sleep_onset': None,
            'wake_time': None,
            'total_sleep_time_minutes': 0,
            'time_in_bed_minutes': (df['timestamp'].max() - df['timestamp'].min()).total_seconds() / 60,
            'sleep_efficiency_percent': 0,
            'sleep_onset_latency_minutes': None,
            'wake_after_sleep_onset_minutes': None,
            'number_of_awakenings': 0,
            'awakening_index': 0,
            'sleep_stages': None,
            'hourly_metrics': None,
            'movement_metrics': None,
            'hr_metrics': None
        }
    
    # Use first block start as sleep onset, last block end as wake time
    sleep_onset_idx = sleep_blocks[0][0]
    wake_idx = sleep_blocks[-1][1]
    
    sleep_onset = df.iloc[sleep_onset_idx]['timestamp']
    wake_time = df.iloc[wake_idx]['timestamp']
    
    total_sleep_minutes = sum([(df.iloc[end]['timestamp'] - df.iloc[start]['timestamp']).total_seconds() / 60 
                                for start, end in sleep_blocks])
    
    time_in_bed = (df['timestamp'].max() - df['timestamp'].min()).total_seconds() / 60
    sleep_efficiency = (total_sleep_minutes / time_in_bed * 100) if time_in_bed > 0 else 0
    
    sleep_onset_latency = (sleep_onset - df['timestamp'].min()).total_seconds() / 60
    
    wake_periods_during_sleep = []
    for i in range(len(df)):
        if sleep_onset_idx <= i <= wake_idx and not df.iloc[i]['likely_sleep']:
            wake_periods_during_sleep.append(i)
    
    waso_minutes = len(wake_periods_during_sleep)
    
    awakenings = 0
    in_wake_period = False
    for i in range(sleep_onset_idx, wake_idx + 1):
        if not df.iloc[i]['likely_sleep']:
            if not in_wake_period:
                awakenings += 1
                in_wake_period = True
        else:
            in_wake_period = False
    
    awakening_index = (awakenings / (total_sleep_minutes / 60)) if total_sleep_minutes > 0 else 0
    
    return {
        'sleep_onset': sleep_onset.isoformat(),
        'wake_time': wake_time.isoformat(),
        'total_sleep_time_minutes': round(total_sleep_minutes, 2),
        'time_in_bed_minutes': round(time_in_bed, 2),
        'sleep_efficiency_percent': round(sleep_efficiency, 2),
        'sleep_onset_latency_minutes': round(sleep_onset_latency, 2),
        'wake_after_sleep_onset_minutes': round(waso_minutes, 2),
        'number_of_awakenings': awakenings,
        'awakening_index': round(awakening_index, 2),
        'sleep_stages': None,
        'hourly_metrics': None,
        'movement_metrics': {
            'avg_activity': float(df['activity_magnitude'].mean()) if 'activity_magnitude' in df.columns else None,
            'activity_std': float(df['activity_magnitude'].std()) if 'activity_magnitude' in df.columns else None
        },
        'hr_metrics': {
            'avg_hr': float(df['heart_rate'].mean()) if 'heart_rate' in df.columns and df['heart_rate'].notna().any() else None,
            'min_hr': float(df['heart_rate'].min()) if 'heart_rate' in df.columns and df['heart_rate'].notna().any() else None,
            'max_hr': float(df['heart_rate'].max()) if 'heart_rate' in df.columns and df['heart_rate'].notna().any() else None
        }
    }

def prepare_data_for_hypnospy(df):
    acc_df = df[(df['acc_x'].notna()) & (df['acc_y'].notna()) & (df['acc_z'].notna())].copy()
    
    if len(acc_df) == 0:
        raise ValueError('No accelerometer data available for HypnosPy analysis')
    
    acc_df['activity_magnitude'] = np.sqrt(
        acc_df['acc_x']**2 + acc_df['acc_y']**2 + acc_df['acc_z']**2
    )
    
    acc_df['timestamp'] = pd.to_datetime(acc_df['timestamp'], utc=True, errors='coerce')
    
    # Filter out invalid timestamps (NaT values)
    acc_df = acc_df[acc_df['timestamp'].notna()].copy()
    
    if len(acc_df) == 0:
        raise ValueError('No valid timestamps in accelerometer data')
    
    acc_df = acc_df.sort_values('timestamp')
    
    epoch_duration = pd.Timedelta(seconds=60)
    start_time = acc_df['timestamp'].iloc[0].floor('1min')
    end_time = acc_df['timestamp'].iloc[-1].ceil('1min')
    
    epochs = pd.date_range(start=start_time, end=end_time, freq='60S')
    
    hypnospy_data = []
    for i in range(len(epochs) - 1):
        epoch_start = epochs[i]
        epoch_end = epochs[i + 1]
        
        epoch_data = acc_df[(acc_df['timestamp'] >= epoch_start) & (acc_df['timestamp'] < epoch_end)]
        
        if len(epoch_data) > 0:
            activity_count = int(epoch_data['activity_magnitude'].sum())
        else:
            activity_count = 0
        
        hypnospy_data.append({
            'hyp_time_col': epoch_start,
            'hyp_act_x': activity_count,
            'pid': 'session_001'
        })
    
    hypnospy_df = pd.DataFrame(hypnospy_data)
    
    if len(hypnospy_df) == 0:
        raise ValueError('No epochs generated from accelerometer data')
    
    # Ensure index is datetime before setting
    if 'hyp_time_col' not in hypnospy_df.columns:
        raise ValueError('Missing hyp_time_col in HypnosPy data')
    
    # Make sure timestamps are valid before setting as index
    hypnospy_df['hyp_time_col'] = pd.to_datetime(hypnospy_df['hyp_time_col'], errors='coerce')
    hypnospy_df = hypnospy_df[hypnospy_df['hyp_time_col'].notna()].copy()
    
    if len(hypnospy_df) == 0:
        raise ValueError('No valid epochs after timestamp validation')
    
    hypnospy_df = hypnospy_df.set_index('hyp_time_col')
    
    # Validate final structure for HypnosPy
    if not isinstance(hypnospy_df.index, pd.DatetimeIndex):
        raise ValueError(f'HypnosPy requires DatetimeIndex, got {type(hypnospy_df.index)}')
    
    required_cols = ['hyp_act_x', 'pid']
    missing_cols = [col for col in required_cols if col not in hypnospy_df.columns]
    if missing_cols:
        raise ValueError(f'Missing required columns for HypnosPy: {missing_cols}')
    
    return hypnospy_df

def analyze_sleep_with_hypnospy(df, algorithm='cole-kripke', processing_stats=None):
    """
    Analyze sleep using Cole-Kripke algorithm
    Now uses direct implementation (research-validated formula) instead of HypnosPy wrapper
    """
    from cole_kripke_direct import apply_cole_kripke, extract_sleep_metrics
    
    hypnospy_df = prepare_data_for_hypnospy(df)
    
    if len(hypnospy_df) < 60:
        if processing_stats:
            detailed_error = (f'Insufficient data for sleep analysis. '
                            f'Only {len(hypnospy_df)} minutes available, need ≥60 minutes. '
                            f'Processing: {processing_stats["raw_records"]} raw → '
                            f'{processing_stats["ppg_records"]} PPG → '
                            f'{processing_stats["acc_records"]} ACC records.')
            raise ValueError(detailed_error)
        else:
            raise ValueError(f'Insufficient data: {len(hypnospy_df)}min, need ≥60min')
    
    logger.info(f"Applying Cole-Kripke algorithm to {len(hypnospy_df)} minute epochs...")
    
    # Apply Cole-Kripke algorithm directly
    results_df = apply_cole_kripke(hypnospy_df, activity_column='hyp_act_x')
    
    # Extract sleep metrics
    metrics = extract_sleep_metrics(results_df)
    
    logger.info(f"Cole-Kripke complete: {metrics['total_sleep_time_minutes']}min sleep, "
                f"{metrics['sleep_efficiency_percent']}% efficiency, "
                f"{metrics['number_of_awakenings']} awakenings")
    
    return metrics

@app.route('/analyze-sleep-hypnospy', methods=['POST'])
def analyze_sleep_hypnospy():
    start_time = time.time()
    
    if not supabase:
        return jsonify({
            'error': 'Database not initialized. Server environment variables missing.',
            'hint': 'Check /logs endpoint for details'
        }), 503
    
    try:
        data = request.json
        session_id = data.get('session_id')
        algorithm = data.get('algorithm', 'cole-kripke')
        auth_header = request.headers.get('Authorization')
        
        if not session_id:
            return jsonify({'error': 'session_id is required'}), 400
        
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Authorization header required'}), 401
        
        token = auth_header.split('Bearer ')[1]
        
        user_response = supabase.auth.get_user(token)
        user_id = user_response.user.id
        
        session_response = supabase.table('sessions').select('*').eq('id', session_id).eq('user_id', user_id).single().execute()
        
        if not session_response.data:
            return jsonify({'error': 'Session not found or access denied'}), 404
        
        try:
            supabase.table('sleep_analysis_hypnospy').insert({
                'user_id': user_id,
                'session_id': session_id,
                'processing_status': 'processing',
                'algorithm_used': algorithm
            }).execute()
            is_owner = True
        except Exception as insert_error:
            if 'duplicate key' in str(insert_error).lower() or 'unique' in str(insert_error).lower():
                is_owner = False
                existing = supabase.table('sleep_analysis_hypnospy').select('*').eq('session_id', session_id).single().execute()
                
                if existing.data:
                    if existing.data['processing_status'] == 'completed':
                        return jsonify({
                            'status': 'completed',
                            'cached': True,
                            'analysis': existing.data
                        }), 200
                    elif existing.data['processing_status'] == 'processing':
                        return jsonify({
                            'status': 'processing',
                            'message': 'HypnosPy analysis already in progress'
                        }), 202
                    elif existing.data['processing_status'] == 'error':
                        supabase.table('sleep_analysis_hypnospy').update({
                            'processing_status': 'processing',
                            'processing_error': None
                        }).eq('session_id', session_id).execute()
                        is_owner = True
            else:
                raise
        
        # Fetch all records using pagination (Supabase default limit is 1000)
        all_readings = []
        page_size = 1000
        page = 0
        
        logger.info(f"Fetching sensor readings for session {session_id} with pagination...")
        while True:
            start = page * page_size
            end = start + page_size - 1
            
            batch_response = supabase.table('sensor_readings') \
                .select('timestamp, ppg, acc_x, acc_y, acc_z') \
                .eq('session_id', session_id) \
                .order('timestamp') \
                .range(start, end) \
                .execute()
            
            if not batch_response.data:
                break
            
            all_readings.extend(batch_response.data)
            logger.info(f"Fetched page {page + 1}: {len(batch_response.data)} records (total: {len(all_readings)})")
            
            if len(batch_response.data) < page_size:
                break
            
            page += 1
        
        logger.info(f"Total records fetched: {len(all_readings)}")
        
        if not all_readings or len(all_readings) < 100:
            raise ValueError('Insufficient data for HypnosPy analysis (minimum 100 samples required)')
        
        # Track data processing stats for detailed error messages
        processing_stats = {'raw_records': len(all_readings)}
        
        try:
            df = pd.DataFrame(all_readings)
            
            if len(df) == 0:
                raise ValueError('No data returned from database')
            
            available_cols = list(df.columns) if len(df.columns) > 0 else []
            sample_data = all_readings[0] if len(all_readings) > 0 else {}
            
            if 'timestamp' not in df.columns:
                raise ValueError(f'timestamp column not found. Available columns: {available_cols}. Sample data keys: {list(sample_data.keys())}. Total rows: {len(df)}')
            
            sample_timestamps = df['timestamp'].head(3).tolist()
            df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True, errors='coerce')
            
            if df['timestamp'].isna().all():
                raise ValueError(f'All timestamps failed to parse. Sample raw values: {sample_timestamps}')
            
            # Track non-null sensor data counts
            processing_stats['ppg_records'] = df['ppg'].notna().sum()
            processing_stats['acc_records'] = (df['acc_x'].notna() & df['acc_y'].notna() & df['acc_z'].notna()).sum()
            logger.info(f"HypnosPy data stats - Raw: {processing_stats['raw_records']}, PPG: {processing_stats['ppg_records']}, ACC: {processing_stats['acc_records']}")
                
        except KeyError as e:
            raise ValueError(f'KeyError accessing column: {str(e)}. Available columns: {available_cols}. Sample data: {sample_data}')
        
        sleep_metrics = analyze_sleep_with_hypnospy(df, algorithm=algorithm, processing_stats=processing_stats)
        
        sleep_metrics['user_id'] = user_id
        sleep_metrics['session_id'] = session_id
        sleep_metrics['processing_status'] = 'completed'
        sleep_metrics['processed_at'] = datetime.now(timezone.utc).isoformat()
        sleep_metrics['processing_duration_seconds'] = time.time() - start_time
        
        supabase.table('sleep_analysis_hypnospy').update(sleep_metrics).eq('session_id', session_id).execute()
        
        return jsonify({
            'status': 'completed',
            'cached': False,
            'analysis': sleep_metrics
        }), 200
        
    except Exception as e:
        error_msg = str(e)
        print(f'Error analyzing sleep with HypnosPy: {error_msg}')
        
        if session_id and locals().get('is_owner', False):
            try:
                supabase.table('sleep_analysis_hypnospy').update({
                    'processing_status': 'error',
                    'processing_error': error_msg,
                    'processed_at': datetime.now(timezone.utc).isoformat(),
                    'processing_duration_seconds': time.time() - start_time
                }).eq('session_id', session_id).execute()
            except:
                pass
        
        return jsonify({'error': error_msg}), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 8081))
    print(f"Starting Flask server on 0.0.0.0:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
