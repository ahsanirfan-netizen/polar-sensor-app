import os
import time
from datetime import datetime, timezone
from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
from scipy.signal import find_peaks
from supabase import create_client, Client
from dotenv import load_dotenv
from hypnospy import Wearable
from hypnospy.analysis import SleepWakeAnalysis

load_dotenv()

app = Flask(__name__)
CORS(app)

supabase_url = os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
if not supabase_key:
    raise ValueError("SUPABASE_SERVICE_ROLE_KEY environment variable is required")
supabase: Client = create_client(supabase_url, supabase_key)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy', 
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'version': 'v3.0-comprehensive-logging'
    })

@app.route('/test-error', methods=['GET'])
def test_error():
    try:
        df = pd.DataFrame({'data': [1, 2, 3]})
        # This will cause a KeyError
        value = df['timestamp']
    except KeyError as e:
        raise ValueError(f'Test KeyError caught successfully: {str(e)}. Columns: {list(df.columns)}')

@app.route('/analyze-sleep', methods=['POST'])
def analyze_sleep():
    start_time = time.time()
    
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
        
        readings_response = supabase.table('sensor_readings') \
            .select('timestamp, ppg, acc_x, acc_y, acc_z, gyro_x, gyro_y, gyro_z') \
            .eq('session_id', session_id) \
            .order('timestamp') \
            .execute()
        
        if not readings_response.data or len(readings_response.data) < 100:
            raise ValueError('Insufficient data for analysis (minimum 100 samples required)')
        
        try:
            df = pd.DataFrame(readings_response.data)
            
            if len(df) == 0:
                raise ValueError('No data returned from database')
            
            available_cols = list(df.columns) if len(df.columns) > 0 else []
            sample_data = readings_response.data[0] if len(readings_response.data) > 0 else {}
            
            if 'timestamp' not in df.columns:
                raise ValueError(f'timestamp column not found. Available columns: {available_cols}. Sample data keys: {list(sample_data.keys())}. Total rows: {len(df)}')
            
            sample_timestamps = df['timestamp'].head(3).tolist()
            df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True, errors='coerce')
            
            if df['timestamp'].isna().all():
                raise ValueError(f'All timestamps failed to parse. Sample raw values: {sample_timestamps}')
                
        except KeyError as e:
            raise ValueError(f'KeyError accessing column: {str(e)}. Available columns: {available_cols}. Sample data: {sample_data}')
        
        hr_data = calculate_heart_rate_from_ppg(df)
        
        activity_data = calculate_activity_metrics(df)
        
        merged_data = pd.merge_asof(
            activity_data.sort_values('timestamp'),
            hr_data.sort_values('timestamp'),
            on='timestamp',
            direction='nearest',
            tolerance=pd.Timedelta('30s')
        )
        
        sleep_metrics = analyze_sleep_with_simple_algorithm(merged_data)
        
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
        
        hr_records = []
        window_size = 260
        step_size = 130
        
        for i in range(0, len(ppg_df) - window_size, step_size):
            window = ppg_df.iloc[i:i+window_size]
            ppg_values = window['ppg'].values
            
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
                    try:
                        ts = window.iloc[window_size//2]['timestamp']
                        hr_records.append({
                            'timestamp': ts,
                            'heart_rate': heart_rate
                        })
                    except KeyError as e:
                        print(f'[PPG ERROR IN LOOP] KeyError accessing timestamp in window: {str(e)}. Window columns: {list(window.columns)}')
                        raise ValueError(f'KeyError in PPG loop: {str(e)}. Window columns: {list(window.columns)}')
        
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
        
        activity_records = []
        window_size_seconds = 60
        sampling_rate = 52
        window_size_samples = window_size_seconds * sampling_rate
        
        for i in range(0, len(acc_df) - window_size_samples, window_size_samples):
            window = acc_df.iloc[i:i+window_size_samples]
            
            avg_magnitude = window['activity_magnitude'].mean()
            std_magnitude = window['activity_magnitude'].std()
            movement_count = (window['activity_magnitude'] > avg_magnitude + std_magnitude).sum()
            
            try:
                ts = window.iloc[window_size_samples//2]['timestamp']
                activity_records.append({
                    'timestamp': ts,
                    'activity_magnitude': avg_magnitude,
                    'movement_intensity': movement_count
                })
            except KeyError as e:
                print(f'[ACC ERROR IN LOOP] KeyError accessing timestamp in window: {str(e)}. Window columns: {list(window.columns)}')
                raise ValueError(f'KeyError in ACC loop: {str(e)}. Window columns: {list(window.columns)}')
        
        print(f'[ACC] Completed. Generated {len(activity_records)} activity records')
        return pd.DataFrame(activity_records)
    except KeyError as e:
        error_msg = f'KeyError in calculate_activity_metrics: {str(e)}. Input columns: {list(df.columns)}. ACC data shape: {acc_df.shape if "acc_df" in locals() else "not created"}'
        print(f'[ACC CAUGHT KEYERROR] {error_msg}')
        raise ValueError(error_msg)
    except Exception as e:
        print(f'[ACC UNEXPECTED ERROR] {type(e).__name__}: {str(e)}')
        raise

def analyze_sleep_with_simple_algorithm(df):
    if len(df) < 10:
        raise ValueError('Insufficient processed data for sleep analysis')
    
    df = df.sort_values('timestamp').reset_index(drop=True)
    
    hr_threshold = df['heart_rate'].quantile(0.35) if 'heart_rate' in df.columns and df['heart_rate'].notna().any() else None
    activity_threshold = df['activity_magnitude'].quantile(0.25) if 'activity_magnitude' in df.columns else None
    
    if hr_threshold is not None and activity_threshold is not None:
        df['likely_sleep'] = (df['heart_rate'] < hr_threshold) & (df['activity_magnitude'] < activity_threshold)
    elif activity_threshold is not None:
        df['likely_sleep'] = df['activity_magnitude'] < activity_threshold
    else:
        df['likely_sleep'] = False
    
    sleep_blocks = []
    current_block_start = None
    
    for idx, row in df.iterrows():
        if row['likely_sleep']:
            if current_block_start is None:
                current_block_start = idx
        else:
            if current_block_start is not None:
                if idx - current_block_start >= 30:
                    sleep_blocks.append((current_block_start, idx - 1))
                current_block_start = None
    
    if current_block_start is not None and len(df) - current_block_start >= 30:
        sleep_blocks.append((current_block_start, len(df) - 1))
    
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
    
    main_sleep_block = max(sleep_blocks, key=lambda x: x[1] - x[0])
    sleep_onset_idx, wake_idx = main_sleep_block
    
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
    hypnospy_df = hypnospy_df.set_index('hyp_time_col')
    
    return hypnospy_df

def analyze_sleep_with_hypnospy(df, algorithm='cole-kripke'):
    hypnospy_df = prepare_data_for_hypnospy(df)
    
    if len(hypnospy_df) < 60:
        raise ValueError('Insufficient data for HypnosPy analysis (minimum 60 minutes required)')
    
    try:
        wearable = Wearable(hypnospy_df)
    except Exception as e:
        raise ValueError(f'Failed to create HypnosPy Wearable object: {str(e)}')
    
    sw = SleepWakeAnalysis(wearable)
    
    if algorithm.lower() == 'sadeh':
        sw.run_sleep_algorithm("Sadeh", inplace=True)
        sleep_col = 'Sadeh'
    else:
        sw.run_sleep_algorithm("Cole-Kripke", inplace=True)
        sleep_col = 'Cole-Kripke'
    
    result_df = wearable.data.reset_index()
    
    if sleep_col not in result_df.columns:
        raise ValueError(f'HypnosPy did not generate {sleep_col} sleep predictions')
    
    result_df['is_sleep'] = result_df[sleep_col] == 0
    
    sleep_periods = result_df[result_df['is_sleep']].copy()
    
    if len(sleep_periods) == 0:
        return {
            'sleep_onset': None,
            'wake_time': None,
            'total_sleep_time_minutes': 0,
            'time_in_bed_minutes': 0,
            'sleep_efficiency_percent': 0,
            'sleep_onset_latency_minutes': 0,
            'wake_after_sleep_onset_minutes': 0,
            'number_of_awakenings': 0,
            'awakening_index': 0,
            'algorithm_used': algorithm,
            'sleep_stages': None,
            'hourly_metrics': None,
            'movement_metrics': None,
            'hr_metrics': None,
            'hypnospy_raw_output': None
        }
    
    sleep_onset = sleep_periods['hyp_time_col'].iloc[0]
    wake_time = sleep_periods['hyp_time_col'].iloc[-1]
    
    total_sleep_minutes = len(sleep_periods)
    
    time_period = result_df[(result_df['hyp_time_col'] >= sleep_onset) & (result_df['hyp_time_col'] <= wake_time)]
    time_in_bed = len(time_period)
    
    sleep_efficiency = (total_sleep_minutes / time_in_bed * 100) if time_in_bed > 0 else 0
    
    pre_sleep_data = result_df[result_df['hyp_time_col'] < sleep_onset]
    if len(pre_sleep_data) > 0:
        sleep_onset_latency = len(pre_sleep_data)
    else:
        sleep_onset_latency = 0
    
    wake_periods = time_period[~time_period['is_sleep']]
    waso_minutes = len(wake_periods)
    
    awakenings = 0
    in_wake_period = False
    for idx in range(len(time_period)):
        row = time_period.iloc[idx]
        if not row['is_sleep']:
            if not in_wake_period:
                awakenings += 1
                in_wake_period = True
        else:
            in_wake_period = False
    
    awakening_index = (awakenings / (total_sleep_minutes / 60)) if total_sleep_minutes > 0 else 0
    
    hr_data = calculate_heart_rate_from_ppg(df) if 'ppg' in df.columns else pd.DataFrame()
    hr_metrics = None
    if len(hr_data) > 0:
        sleep_hr_data = hr_data[(hr_data['timestamp'] >= sleep_onset) & (hr_data['timestamp'] <= wake_time)]
        if len(sleep_hr_data) > 0:
            hr_metrics = {
                'avg_hr': float(sleep_hr_data['heart_rate'].mean()),
                'min_hr': float(sleep_hr_data['heart_rate'].min()),
                'max_hr': float(sleep_hr_data['heart_rate'].max())
            }
    
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
        'algorithm_used': algorithm,
        'sleep_stages': None,
        'hourly_metrics': None,
        'movement_metrics': {
            'avg_activity': float(result_df['hyp_act_x'].mean()),
            'activity_std': float(result_df['hyp_act_x'].std())
        },
        'hr_metrics': hr_metrics,
        'hypnospy_raw_output': {
            'sleep_periods': len(sleep_periods),
            'wake_periods': len(wake_periods),
            'total_epochs': len(result_df)
        }
    }

@app.route('/analyze-sleep-hypnospy', methods=['POST'])
def analyze_sleep_hypnospy():
    start_time = time.time()
    
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
        
        readings_response = supabase.table('sensor_readings') \
            .select('timestamp, ppg, acc_x, acc_y, acc_z') \
            .eq('session_id', session_id) \
            .order('timestamp') \
            .execute()
        
        if not readings_response.data or len(readings_response.data) < 100:
            raise ValueError('Insufficient data for HypnosPy analysis (minimum 100 samples required)')
        
        try:
            df = pd.DataFrame(readings_response.data)
            
            if len(df) == 0:
                raise ValueError('No data returned from database')
            
            available_cols = list(df.columns) if len(df.columns) > 0 else []
            sample_data = readings_response.data[0] if len(readings_response.data) > 0 else {}
            
            if 'timestamp' not in df.columns:
                raise ValueError(f'timestamp column not found. Available columns: {available_cols}. Sample data keys: {list(sample_data.keys())}. Total rows: {len(df)}')
            
            sample_timestamps = df['timestamp'].head(3).tolist()
            df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True, errors='coerce')
            
            if df['timestamp'].isna().all():
                raise ValueError(f'All timestamps failed to parse. Sample raw values: {sample_timestamps}')
                
        except KeyError as e:
            raise ValueError(f'KeyError accessing column: {str(e)}. Available columns: {available_cols}. Sample data: {sample_data}')
        
        sleep_metrics = analyze_sleep_with_hypnospy(df, algorithm=algorithm)
        
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
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
