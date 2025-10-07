import os
from supabase import create_client

url = os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
supabase = create_client(url, key)

# Clear all HypnosPy analysis cache to force fresh retry
result = supabase.table('sleep_analysis_hypnospy').delete().neq('id', 'impossible-value').execute()
print(f"✓ Cleared {len(result.data) if result.data else 0} HypnosPy analysis records")
