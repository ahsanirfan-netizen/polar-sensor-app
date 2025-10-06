# Sleep Analysis Backend Deployment Guide

## Overview

The Python Flask backend (`backend/main.py`) processes raw sensor data from Supabase and calculates sleep metrics. This service must be deployed to a production environment with a stable URL that will be baked into the Android APK builds.

## Deployment on Replit

This Repl is configured for **VM deployment** which keeps the backend API always running.

### Deployment Configuration

- **Target**: VM (always-on server for stateful APIs)
- **Command**: `gunicorn --bind=0.0.0.0:5000 --reuse-port -w 2 backend.main:app`
- **Workers**: 2 (sufficient for concurrent analysis requests)

### Steps to Deploy

1. **Click the "Deploy" button** in the Replit interface (top right)
2. The deployment will:
   - Install Python dependencies from `backend/requirements.txt`
   - Start the Gunicorn WSGI server on port 5000
   - Expose the API at a stable Replit deployment URL

3. **Copy the deployment URL** (e.g., `https://your-repl.repl.co`)

4. **Add GitHub Secret**:
   - Go to your GitHub repository settings
   - Navigate to Secrets and Variables → Actions
   - Add a new secret: `SLEEP_API_URL` = `https://your-repl.repl.co`

5. **Trigger APK Build**:
   - Push a commit or manually trigger the GitHub Actions workflow
   - The APK will be built with the production API URL baked in

## Environment Variables Required

The backend needs these Replit secrets:
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (required for server-side auth and database operations)

**Important**: The service role key is needed because the backend:
- Validates user JWTs using `supabase.auth.get_user()`
- Writes to the database bypassing RLS policies
- Performs server-side operations that require elevated permissions

You can find your service role key in the Supabase dashboard under Settings → API.

## API Endpoints

- `GET /health` - Health check
- `POST /analyze-sleep` - Trigger sleep analysis for a session
  - Body: `{"session_id": "uuid"}`
  - Headers: `Authorization: Bearer <supabase-jwt>`

## Monitoring

Check deployment logs in Replit to monitor:
- API request processing
- Sleep analysis calculations
- Supabase connectivity
- Error messages

## Cost Estimate

- Replit VM deployment is always-on and uses Replit's compute resources
- Estimated cost: Covered by Replit Core or Replit Teams plan
- Alternative: Deploy to Vercel, Railway, or Render (all have free tiers)

## Alternative Deployment Options

If you prefer not to use Replit deployments:

1. **Railway**: Free tier with 500 hours/month
   - Connect GitHub repo
   - Set start command: `gunicorn --bind=0.0.0.0:$PORT -w 2 backend.main:app`

2. **Render**: Free tier with 750 hours/month
   - Deploy as Web Service
   - Set start command: `gunicorn --bind=0.0.0.0:$PORT -w 2 backend.main:app`

3. **Vercel**: Serverless deployment (may have cold starts)
   - Use `vercel.json` configuration
   - Good for low-traffic scenarios
