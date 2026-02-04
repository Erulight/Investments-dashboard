# Railway Deployment Guide

This guide explains how to deploy the Investments Dashboard to Railway.app.

## Prerequisites

1. A Railway account (sign up at https://railway.app)
2. A GitHub account with access to this repository
3. PostgreSQL database (Railway can provision one automatically)

## Environment Variables

The following environment variables must be configured in Railway:

### Required for Both Build and Runtime

These variables must be set as **both build-time and runtime variables**:

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | Secret key for JWT token signing | `b0cd8e599b04030c55a597a5ef5a1ff1` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:port/db` |

### Optional Runtime Variables

| Variable | Description | Default | Production Value |
|----------|-------------|---------|------------------|
| `COOKIE_SECURE` | Enable secure cookies (HTTPS only) | `false` | `true` |
| `COOKIE_SAME_SITE` | Cookie SameSite policy | `lax` | `lax` or `strict` |
| `NODE_ENV` | Node environment | Auto-set by Railway | `production` |
| `PORT` | Server port | `3000` | Auto-set by Railway |

## Deployment Steps

### 1. Create a New Project in Railway

1. Go to https://railway.app/new
2. Select "Deploy from GitHub repo"
3. Authorize Railway to access your GitHub account
4. Select the `Erulight/Investments-dashboard` repository

### 2. Add PostgreSQL Database

1. In your Railway project, click "New" → "Database" → "Add PostgreSQL"
2. Railway will automatically:
   - Provision a PostgreSQL database
   - Set the `DATABASE_URL` environment variable
   - Make it available to your application

### 3. Configure Environment Variables

#### In Railway Service Settings:

1. Click on your service (the one connected to GitHub)
2. Go to "Variables" tab
3. Add the following variables:

**Build and Runtime Variables:**
- `JWT_SECRET`: Your JWT secret key (e.g., `b0cd8e599b04030c55a597a5ef5a1ff1`)

**Runtime-Only Variables:**
- `COOKIE_SECURE`: `true`
- `COOKIE_SAME_SITE`: `lax`

**Note**: `DATABASE_URL` should already be set automatically by Railway when you added the PostgreSQL database.

### 4. Configure Build Settings

Railway should automatically detect the Dockerfile and use it for deployment. Verify in Settings → Build:

- **Builder**: Dockerfile
- **Dockerfile Path**: `Dockerfile`

### 5. Enable Build-Time Environment Variables

**Important**: Railway needs to pass environment variables during the Docker build process.

In your Railway service settings:
1. Go to "Settings" tab
2. Find "Build" section
3. Ensure that environment variables are available during build

Railway automatically makes variables available during build when using Dockerfile with `ARG` instructions.

### 6. Deploy

1. Click "Deploy" or push to your GitHub repository
2. Railway will automatically:
   - Build the Docker image with your environment variables
   - Run database migrations (if configured)
   - Start the application

### 7. Run Database Migrations

After the first deployment, you need to run Prisma migrations:

#### Option A: Using Railway CLI

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Run migrations
railway run npx prisma migrate deploy

# Seed the database (optional)
railway run npm run prisma:seed
```

#### Option B: Using Railway Dashboard

1. Go to your service in Railway
2. Click on "Deploy Logs" or "Metrics"
3. In the right panel, click "Create" → "Empty Service"
4. Add a new service with a one-time command:
   ```bash
   npx prisma migrate deploy && npm run prisma:seed
   ```

## Dockerfile Build Arguments

The Dockerfile uses `ARG` and `ENV` instructions to ensure environment variables are available during build:

```dockerfile
ARG JWT_SECRET
ARG DATABASE_URL
ENV JWT_SECRET=$JWT_SECRET
ENV DATABASE_URL=$DATABASE_URL
```

This allows:
- Prisma client generation with the correct database provider
- Next.js build to access required environment variables
- Runtime to use the same variables

## Troubleshooting

### Build Fails: "JWT_SECRET environment variable is required"

**Cause**: Environment variables not available during build.

**Solution**: Ensure `JWT_SECRET` is set in Railway's environment variables. Railway should automatically pass it as a build argument.

### Build Fails: "/app/public: not found"

**Cause**: Docker COPY command fails if source directory doesn't exist.

**Solution**: This should be fixed in the latest version. The repository now includes a `public/.gitkeep` file to ensure the directory exists.

### Database Connection Errors

**Cause**: DATABASE_URL not set correctly or database not provisioned.

**Solution**:
1. Verify PostgreSQL service is running in Railway
2. Check that `DATABASE_URL` variable is set (should be automatic)
3. Ensure the connection string format is correct: `postgresql://user:pass@host:port/database`

### Application Starts But Can't Access Database

**Cause**: Migrations not run.

**Solution**: Run `npx prisma migrate deploy` using Railway CLI or in a one-time service.

## Post-Deployment

### Access Your Application

Your application will be available at:
```
https://[your-service-name].up.railway.app
```

### Demo Users

After seeding the database, you can log in with:

**Owner Account:**
- Email: `owner@example.local`
- Password: `OwnerDemo123!`

**Partner Account:**
- Email: `partner@example.local`
- Password: `PartnerDemo123!`

### Monitor Your Deployment

1. **Logs**: View real-time logs in the Railway dashboard
2. **Metrics**: Monitor CPU, memory, and network usage
3. **Deployments**: Track deployment history and rollback if needed

## Security Recommendations

1. **Use Strong JWT Secret**: Generate a secure random string:
   ```bash
   openssl rand -hex 32
   ```

2. **Enable HTTPS**: Railway provides HTTPS by default

3. **Set Secure Cookies**: Ensure `COOKIE_SECURE=true` in production

4. **Regular Backups**: Use Railway's database backup features

5. **Environment Variables**: Never commit secrets to your repository

## Additional Resources

- [Railway Documentation](https://docs.railway.app/)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Prisma Deployment](https://www.prisma.io/docs/guides/deployment)
