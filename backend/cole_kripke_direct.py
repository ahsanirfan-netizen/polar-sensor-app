"""
Direct Cole-Kripke Algorithm Implementation

Research-validated formula from:
Cole, R.J., et al. (1992). "Automatic sleep/wake identification from wrist activity." 
Sleep, 15(5):461–469

Formula: SI = 0.001 × (106×A₋₄ + 54×A₋₃ + 58×A₋₂ + 76×A₋₁ + 230×A₀ + 74×A₊₁ + 67×A₊₂)
Classification: SI < 1 = Wake, SI ≥ 1 = Sleep
"""

import pandas as pd
import numpy as np

def apply_cole_kripke(df, activity_column='hyp_act_x'):
    """
    Apply Cole-Kripke algorithm directly to DataFrame with 1-minute epochs
    
    Parameters:
    -----------
    df : pandas DataFrame
        Must have DatetimeIndex and activity count column
    activity_column : str
        Name of column containing activity counts
    
    Returns:
    --------
    DataFrame with added columns:
        - sleep_index: Cole-Kripke sleep index
        - sleep_wake: 0=wake, 1=sleep
    """
    df = df.copy()
    
    # Cole-Kripke preprocessing: divide by 100 and clip at 300
    scaled_activity = (df[activity_column] / 100).clip(upper=300)
    
    # Cole-Kripke coefficients for 1-minute epochs (7-epoch sliding window)
    coefficients = {
        -4: 106,  # 4 epochs before
        -3: 54,   # 3 epochs before
        -2: 58,   # 2 epochs before
        -1: 76,   # 1 epoch before
        0: 230,   # current epoch
        1: 74,    # 1 epoch after
        2: 67     # 2 epochs after
    }
    
    # Calculate sleep index (SI)
    sleep_index = pd.Series(0.0, index=df.index)
    
    for offset, coef in coefficients.items():
        if offset < 0:
            # Previous epochs (shift forward in time)
            shifted = scaled_activity.shift(-offset).fillna(0)
        elif offset > 0:
            # Future epochs (shift backward in time)
            shifted = scaled_activity.shift(-offset).fillna(0)
        else:
            shifted = scaled_activity
        
        sleep_index += coef * shifted
    
    sleep_index *= 0.001
    
    # Sleep/wake classification: SI < 1 = wake (0), SI ≥ 1 = sleep (1)
    df['sleep_index'] = sleep_index
    df['sleep_wake'] = (sleep_index >= 1).astype(int)
    
    return df


def extract_sleep_metrics(results_df):
    """
    Extract sleep metrics from Cole-Kripke results
    
    Returns comprehensive sleep analysis including:
    - Main sleep period (longest consecutive sleep sequence)
    - Sleep efficiency
    - Awakenings and WASO
    """
    # Find consecutive sleep periods
    results_df['sleep_group'] = (results_df['sleep_wake'] != results_df['sleep_wake'].shift()).cumsum()
    sleep_groups = results_df[results_df['sleep_wake'] == 1].groupby('sleep_group').size()
    
    if len(sleep_groups) == 0:
        raise ValueError('No sleep periods detected by Cole-Kripke algorithm')
    
    # Use the longest sleep period as main sleep
    main_sleep_group = sleep_groups.idxmax()
    main_sleep = results_df[results_df['sleep_group'] == main_sleep_group]
    
    sleep_onset = main_sleep.index.min()
    wake_time = main_sleep.index.max()
    total_sleep_minutes = len(main_sleep)
    
    # Calculate sleep efficiency (sleep time / time in bed)
    total_duration_minutes = (wake_time - sleep_onset).total_seconds() / 60
    sleep_efficiency = (total_sleep_minutes / total_duration_minutes) * 100 if total_duration_minutes > 0 else 0
    
    # Count awakenings (wake periods within main sleep window)
    bed_period = results_df[(results_df.index >= sleep_onset) & (results_df.index <= wake_time)]
    wake_epochs_in_bed = bed_period[bed_period['sleep_wake'] == 0]
    
    # Count number of awakening episodes
    wake_epochs_in_bed['wake_episode'] = (wake_epochs_in_bed['sleep_wake'] != wake_epochs_in_bed['sleep_wake'].shift()).cumsum()
    num_awakenings = wake_epochs_in_bed['wake_episode'].nunique() if len(wake_epochs_in_bed) > 0 else 0
    
    waso = len(wake_epochs_in_bed)  # Wake After Sleep Onset
    
    return {
        'sleep_onset': sleep_onset.isoformat(),
        'wake_time': wake_time.isoformat(),
        'total_sleep_time_minutes': int(total_sleep_minutes),
        'time_in_bed_minutes': int(total_duration_minutes),
        'sleep_efficiency_percent': round(sleep_efficiency, 1),
        'sleep_onset_latency_minutes': 0,  # Not calculated in this simple version
        'wake_after_sleep_onset_minutes': int(waso),
        'number_of_awakenings': int(num_awakenings),
        'awakening_index': round(num_awakenings / (total_sleep_minutes / 60), 2) if total_sleep_minutes > 0 else 0,
        'algorithm_used': 'cole-kripke-direct',
        'sleep_stages': None,
        'hourly_metrics': None,
        'movement_metrics': {
            'avg_activity': float(results_df['hyp_act_x'].mean()),
            'activity_std': float(results_df['hyp_act_x'].std())
        },
        'hr_metrics': None,
        'hypnospy_raw_output': {
            'total_epochs': len(results_df),
            'sleep_epochs': int(results_df['sleep_wake'].sum()),
            'wake_epochs': int((results_df['sleep_wake'] == 0).sum())
        }
    }
