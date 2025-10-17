"""
HAVOK (Hankel Alternative View of Koopman) Analysis for Ultradian Rhythm Detection

This implementation uses time-delay embedding and SVD to identify ultradian patterns
in physiological sensor data (ACC + PPG/HR).

Based on:
Brunton et al. (2017). "Chaos as an intermittently forced linear system," Nature Communications
"""

import pandas as pd
import numpy as np
from scipy.linalg import svd
from scipy.signal import find_peaks
from datetime import datetime

def create_hankel_matrix(data, stackmax):
    """
    Create Hankel matrix from time series data using time-delay embedding
    
    Parameters:
    -----------
    data : array-like
        Time series data
    stackmax : int
        Number of delay embeddings (rows in Hankel matrix)
    
    Returns:
    --------
    H : ndarray
        Hankel matrix of shape (stackmax, len(data) - stackmax + 1)
    """
    n = len(data)
    H = np.zeros((stackmax, n - stackmax + 1))
    
    for i in range(stackmax):
        H[i, :] = data[i:n - stackmax + i + 1]
    
    return H

def detect_ultradian_cycles(data, sampling_rate_hz=1.0, min_period_min=30, max_period_min=180):
    """
    Detect ultradian cycles (30min - 3hr) using autocorrelation
    
    Parameters:
    -----------
    data : array-like
        Time series data (activity or HR)
    sampling_rate_hz : float
        Sampling rate in Hz
    min_period_min : int
        Minimum cycle period in minutes
    max_period_min : int
        Maximum cycle period in minutes
    
    Returns:
    --------
    dict : Detected cycles with periods and strengths
    """
    # Calculate autocorrelation
    data_normalized = (data - np.mean(data)) / np.std(data)
    autocorr = np.correlate(data_normalized, data_normalized, mode='full')
    autocorr = autocorr[len(autocorr)//2:]
    autocorr = autocorr / autocorr[0]
    
    # Convert periods to samples
    min_samples = int(min_period_min * 60 * sampling_rate_hz)
    max_samples = int(max_period_min * 60 * sampling_rate_hz)
    
    # Find peaks in autocorrelation (indicating periodic patterns)
    if len(autocorr) > max_samples:
        search_window = autocorr[min_samples:max_samples]
        peaks, properties = find_peaks(search_window, height=0.2, distance=min_samples//2)
        
        cycles = []
        for idx, peak in enumerate(peaks):
            actual_lag = peak + min_samples
            period_minutes = (actual_lag / sampling_rate_hz) / 60
            strength = properties['peak_heights'][idx]
            
            cycles.append({
                'period_minutes': round(period_minutes, 1),
                'strength': round(float(strength), 3),
                'lag_samples': int(actual_lag)
            })
        
        return {
            'detected': len(cycles) > 0,
            'cycles': cycles,
            'dominant_period_minutes': cycles[0]['period_minutes'] if cycles else None
        }
    
    return {'detected': False, 'cycles': [], 'dominant_period_minutes': None}

def detect_state_transitions(forcing_signal, threshold_percentile=75):
    """
    Detect state transition events from HAVOK forcing signal
    
    Parameters:
    -----------
    forcing_signal : array-like
        The forcing/intermittent component from HAVOK decomposition
    threshold_percentile : float
        Percentile threshold for detecting significant transitions
    
    Returns:
    --------
    list : Transition events with timestamps and magnitudes
    """
    threshold = np.percentile(np.abs(forcing_signal), threshold_percentile)
    
    # Find where forcing exceeds threshold (state transitions)
    transitions_idx = np.where(np.abs(forcing_signal) > threshold)[0]
    
    if len(transitions_idx) == 0:
        return []
    
    # Group nearby transitions
    transitions = []
    prev_idx = -100
    
    for idx in transitions_idx:
        if idx - prev_idx > 10:  # Start new transition event
            transitions.append({
                'sample_index': int(idx),
                'magnitude': float(np.abs(forcing_signal[idx]))
            })
        prev_idx = idx
    
    return transitions

def apply_havok_analysis(df, stackmax=100, svd_rank=15):
    """
    Apply HAVOK analysis to detect ultradian rhythms and state transitions
    
    Parameters:
    -----------
    df : pandas DataFrame
        Must have 'timestamp' and sensor columns (activity_magnitude, heart_rate)
    stackmax : int
        Time-delay embedding dimension (100 recommended for overnight data)
    svd_rank : int
        Number of SVD modes to retain (15 recommended)
    
    Returns:
    --------
    dict : HAVOK analysis results with ultradian cycles and state transitions
    """
    # Prepare time series data
    if 'activity_magnitude' not in df.columns and 'heart_rate' not in df.columns:
        raise ValueError('DataFrame must contain activity_magnitude or heart_rate columns')
    
    # Use activity as primary signal, HR as secondary
    if 'activity_magnitude' in df.columns and df['activity_magnitude'].notna().sum() > 100:
        primary_signal = df['activity_magnitude'].fillna(0).values
        signal_type = 'activity'
    elif 'heart_rate' in df.columns and df['heart_rate'].notna().sum() > 100:
        primary_signal = df['heart_rate'].fillna(method='ffill').fillna(method='bfill').values
        signal_type = 'heart_rate'
    else:
        raise ValueError('Insufficient data in activity or heart rate columns')
    
    # Normalize signal
    signal_normalized = (primary_signal - np.mean(primary_signal)) / (np.std(primary_signal) + 1e-8)
    
    # Create Hankel matrix (time-delay embedding)
    H = create_hankel_matrix(signal_normalized, stackmax)
    
    # SVD decomposition
    U, S, Vt = svd(H, full_matrices=False)
    
    # Retain top svd_rank modes
    U_r = U[:, :svd_rank]
    S_r = np.diag(S[:svd_rank])
    Vt_r = Vt[:svd_rank, :]
    
    # Time-delay coordinates (projected data)
    V_r = Vt_r.T
    
    # Forcing signal (last mode captures intermittent dynamics)
    forcing_signal = V_r[:, -1]
    
    # Calculate energy distribution across modes
    energy_distribution = (S**2 / np.sum(S**2))[:svd_rank]
    
    # Detect ultradian cycles using autocorrelation
    sampling_rate = 1.0 / 60  # Assume 1-minute epochs
    cycle_detection = detect_ultradian_cycles(
        signal_normalized, 
        sampling_rate_hz=sampling_rate,
        min_period_min=30,
        max_period_min=180
    )
    
    # Detect state transitions from forcing signal
    state_transitions = detect_state_transitions(forcing_signal, threshold_percentile=75)
    
    # Map transitions back to timestamps
    for transition in state_transitions:
        idx = transition['sample_index'] + stackmax - 1  # Adjust for Hankel offset
        if idx < len(df):
            transition['timestamp'] = df.iloc[idx]['timestamp'].isoformat()
            transition['time_offset_minutes'] = round((idx * 1.0), 1)  # Assuming 1-min epochs
    
    # Rhythm stability metrics
    rhythm_metrics = {
        'signal_type': signal_type,
        'total_samples': len(df),
        'svd_rank_used': svd_rank,
        'stackmax_used': stackmax,
        'energy_in_top_5_modes': round(float(np.sum(energy_distribution[:5])), 3),
        'forcing_magnitude_mean': round(float(np.mean(np.abs(forcing_signal))), 3),
        'forcing_magnitude_std': round(float(np.std(forcing_signal)), 3),
        'rhythm_stability_score': round(float(energy_distribution[0]), 3),  # First mode dominance
        'chaos_indicator': round(float(np.mean(np.abs(forcing_signal))), 3)  # High = more chaotic
    }
    
    return {
        'ultradian_cycles': cycle_detection,
        'state_transitions': state_transitions[:20],  # Limit to top 20 transitions
        'rhythm_metrics': rhythm_metrics,
        'svd_rank': svd_rank,
        'stackmax': stackmax
    }

def extract_havok_metrics(results_df):
    """
    Extract HAVOK sleep metrics from analyzed data
    
    Parameters:
    -----------
    results_df : pandas DataFrame
        Processed sensor data with timestamp and sensor columns
    
    Returns:
    --------
    dict : Comprehensive HAVOK analysis results
    """
    try:
        # Apply HAVOK analysis
        havok_results = apply_havok_analysis(results_df, stackmax=100, svd_rank=15)
        
        # Calculate summary statistics
        num_cycles = len(havok_results['ultradian_cycles']['cycles'])
        avg_cycle_duration = None
        
        if num_cycles > 0:
            cycle_periods = [c['period_minutes'] for c in havok_results['ultradian_cycles']['cycles']]
            avg_cycle_duration = round(np.mean(cycle_periods), 1)
        
        # Count significant state transitions
        num_transitions = len(havok_results['state_transitions'])
        
        # Calculate session duration
        session_duration_hours = (results_df['timestamp'].max() - results_df['timestamp'].min()).total_seconds() / 3600
        
        return {
            'algorithm_used': 'havok',
            'ultradian_cycles_detected': num_cycles,
            'average_cycle_duration_minutes': avg_cycle_duration,
            'dominant_period_minutes': havok_results['ultradian_cycles'].get('dominant_period_minutes'),
            'state_transitions_count': num_transitions,
            'rhythm_stability_score': havok_results['rhythm_metrics']['rhythm_stability_score'],
            'chaos_indicator': havok_results['rhythm_metrics']['chaos_indicator'],
            'session_duration_hours': round(session_duration_hours, 2),
            'ultradian_cycles': havok_results['ultradian_cycles'],
            'state_transitions': havok_results['state_transitions'],
            'rhythm_metrics': havok_results['rhythm_metrics'],
            'svd_rank': havok_results['svd_rank'],
            'stackmax': havok_results['stackmax']
        }
    
    except Exception as e:
        raise ValueError(f'HAVOK analysis failed: {str(e)}')
