# # Investment Dashboard

A comprehensive investment portfolio management system built with Next.js 14, Prisma ORM, and TypeScript. Features role-based access control (RBAC), multi-module investment tracking, CSV import/export, and audit logging.

### Authentication & Authorization
- **JWT-based authentication** with secure HttpOnly cookies
- **Email & password** sign-up, sign-in flows
- **Server-side RBAC** with three roles:
  - **OWNER**: Full system access, manage users, import data, configure settings
  - **PARTNER**: View only their own investment participations (amounts hidden from other partners)
  - **VIEWER**: Read-only access to permitted data

### Investment Modules
1. **Sukuk/Crowdfunding Deals**
   - Multi-participant deals with recovery assumptions
   - Partner-scoped views (partners see only their own data)
   - Recovery status tracking (ACTIVE, LATE, DEFAULT_LEGAL, WRITTEN_OFF)

2. **Circlys Savings Plans**
   - Savings plan tracking with interest rates
   - Principal and current value monitoring

3. **Managed Portfolio (Malaa)**
   - NAV-based account tracking
   - Historical valuation records
   - Net Asset Value per unit calculations

4. **Crypto Trading Journal**
   - Buy/sell trade tracking
   - Realized and unrealized P/L calculations
   - Transaction metadata for asset details

5. **Business Deals**
   - Private business investments
   - Similar to sukuk with category differentiation
   - Participant management

6. **Loans/Liabilities**
   - Debt tracking
   - Payment schedules

7. **Goals/Projections**
   - Financial goal setting
   - Target amount tracking
   - Progress monitoring

### Data Management
- **CSV Import Tool** (Owner-only)
  - Column mapping interface
  - Error flagging for invalid values (#NUM!, #VALUE!, etc.)
  - Preview and confirmation workflow
  
- **Export Functionality**
  - CSV export for all data
  - PDF export placeholders

### System Features
- **Audit Logging**: All owner actions tracked to audit_logs table
- **Recovery Assumptions Editor**: Configure recovery rates for deal statuses
- **Fee Handling Configuration**: System settings for fee management
- **Partner Privacy**: Partners never see other participants' sensitive data

## 🛠️ Technology Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL (SQLite-compatible for development)
- **ORM**: Prisma
- **Styling**: Tailwind CSS
- **Authentication**: JWT with bcrypt password hashing
- **Validation**: Zod
- **Data Processing**: csv-parse, csv-stringify

## 📋 Prerequisites

- Node.js 20+ 
- npm or yarn
- PostgreSQL (for production) or SQLite (for development)

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd Investments-dashboard
npm install
```

### 2. Environment Setup

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Database - PostgreSQL (recommended for all environments)
DATABASE_URL="postgresql://investments:investments_password@localhost:5432/investments_dashboard?schema=public"

# JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"

# App Configuration
NODE_ENV="development"

# Cookie Configuration
COOKIE_SECURE="false"  # Set to "true" in production with HTTPS
COOKIE_SAME_SITE="lax"
```

**Note**: The application uses PostgreSQL. You can run PostgreSQL locally via Docker (see Development with Docker Compose below) or install it directly.

### 3. Database Setup

```bash
# Generate Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed demo data
npm run prisma:seed
```

### 4. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## 👥 Demo Users

After seeding, you can log in with these demo accounts:

**Owner Account:**
- Email: `owner@example.local`
- Password: `OwnerDemo123!`
- Access: Full system access

**Partner Account:**
- Email: `partner@example.local`
- Password: `PartnerDemo123!`
- Access: View only their own investments

## 📁 Project Structure

```
/
├── app/                      # Next.js App Router
│   ├── (auth)/              # Authentication pages (login, signup)
│   ├── (dashboard)/         # Protected dashboard pages
│   ├── api/                 # API routes
│   │   ├── auth/           # Authentication endpoints
│   │   ├── dashboard/      # Dashboard data
│   │   ├── investments/    # Investment CRUD
│   │   └── import/         # Import functionality
│   ├── globals.css         # Global styles
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Home page (redirects)
│
├── components/              # React components
│   ├── ui/                 # Reusable UI components (Button, Card, Table)
│   └── dashboard/          # Dashboard-specific components (Navbar)
│
├── lib/                     # Utility libraries
│   ├── db.ts               # Prisma client singleton
│   ├── auth.ts             # Authentication utilities
│   ├── rbac.ts             # Role-based access control
│   ├── audit.ts            # Audit logging
│   └── import.ts           # CSV import utilities
│
├── prisma/                  # Prisma ORM
│   ├── schema.prisma       # Database schema
│   └── seed.ts             # Seed script
│
├── .github/                 # GitHub configuration
│   └── workflows/          # CI/CD workflows
│
├── Dockerfile               # Docker container definition
├── docker-compose.yml       # Docker Compose for dev environment
├── .env.example            # Environment variables template
└── README.md               # This file
```

## 🗄️ Database Schema

### Core Models

- **User**: Authentication and user management
- **Person**: Individuals who participate in deals
- **Account**: Investment accounts (SUKUK, CIRCLYS, MALAA, CRYPTO, BUSINESS, LOAN)
- **Investment**: Individual investment records
- **DealParticipant**: Links persons to investments with their specific amounts
- **Transaction**: Financial transactions (investments, profits, trades, etc.)
- **Valuation**: NAV tracking for managed portfolios
- **RecoveryAssumption**: Recovery rates for different deal statuses
- **Goal**: Financial goals and targets
- **AuditLog**: System activity logging
- **SystemSetting**: Application configuration

## 🔐 Security Features

- ✅ JWT-based authentication with HttpOnly cookies
- ✅ Password hashing with bcrypt (10 rounds)
- ✅ Server-side RBAC enforcement on all API routes
- ✅ No secrets committed to repository
- ✅ CSRF protection via SameSite cookies
- ✅ Input validation with Zod schemas
- ✅ SQL injection protection via Prisma ORM

## 🐳 Docker Deployment

### Development with Docker Compose

```bash
docker-compose up -d
```

This starts:
- PostgreSQL database on port 5432
- Next.js app on port 3000

### Production Deployment

#### Docker Build with Build Arguments

The Dockerfile requires `JWT_SECRET` and `DATABASE_URL` to be passed as build arguments for the build step:

```bash
docker build \
  --build-arg JWT_SECRET="your-jwt-secret" \
  --build-arg DATABASE_URL="postgresql://user:pass@host:port/db" \
  -t investments-dashboard .
```

#### Running the Container

Run with environment variables (these will be used at runtime):

```bash
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="..." \
  investments-dashboard
```

#### Railway Deployment

For Railway or similar platforms, ensure the following build and runtime environment variables are configured:

**Build-time variables** (set in Railway build settings):
- `JWT_SECRET`: Your JWT secret key
- `DATABASE_URL`: PostgreSQL connection string (automatically provided by Railway if using Railway PostgreSQL)

**Runtime variables** (set in Railway service variables):
- `JWT_SECRET`: Same as build-time
- `DATABASE_URL`: Same as build-time
- `COOKIE_SECURE`: Set to `"true"` for production
- `COOKIE_SAME_SITE`: Recommended `"lax"` or `"strict"`

**Note**: The Dockerfile uses `ARG` and `ENV` instructions to ensure environment variables are available during the build process, particularly for Prisma client generation and Next.js build.

## 🧪 Testing

Run the test suite:

```bash
npm test
```

Run linter:

```bash
npm run lint
```

## 📊 Available Scripts

```bash
npm run dev           # Start development server
npm run build         # Build for production
npm start             # Start production server
npm run lint          # Run ESLint
npm test              # Run tests

# Prisma commands
npm run prisma:generate   # Generate Prisma Client
npm run prisma:migrate    # Run database migrations
npm run prisma:studio     # Open Prisma Studio
npm run prisma:seed       # Seed database with demo data
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Database connection string | `file:./dev.db` |
| `JWT_SECRET` | Secret key for JWT signing | **Required** |
| `NODE_ENV` | Environment mode | `development` |
| `NEXT_PUBLIC_APP_URL` | Public app URL | `http://localhost:3000` |
| `COOKIE_SECURE` | Use secure cookies (HTTPS only) | `false` |
| `COOKIE_SAME_SITE` | SameSite cookie attribute | `lax` |

### Recovery Assumptions

Configure recovery rates in the Settings page (Owner only):

- **ACTIVE**: 100% recovery expected
- **LATE**: 90% recovery expected
- **DEFAULT_LEGAL**: 50% recovery via legal action
- **WRITTEN_OFF**: 0% recovery expected

## 📈 Usage Guide

### For Owners

1. **Import Data**: Navigate to Import → Upload CSV with investment data
2. **Manage Users**: Settings → Users → Assign roles and permissions
3. **Configure Recovery**: Settings → Recovery Assumptions → Adjust rates
4. **View All Investments**: Investments → See complete portfolio
5. **Export Data**: Download CSV reports

### For Partners

1. **View Your Investments**: Dashboard → See your participations only
2. **Track Performance**: Monitor your invested amounts and profits
3. **Privacy**: Other partners cannot see your investment details

### For Viewers

1. **Read-Only Access**: View permitted investment data
2. **No Modifications**: Cannot edit or create records

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📝 License

This project is licensed under the ISC License.

## 🐛 Known Issues

- Email functionality (password reset) requires SMTP configuration
- PDF export is placeholder (not yet implemented)

## 🗺️ Roadmap

- [ ] Email notifications for deal updates
- [ ] Mobile responsive improvements
- [ ] PDF report generation
- [ ] Advanced analytics and charts
- [ ] API rate limiting
- [ ] Two-factor authentication
- [ ] Webhook integrations

## 💬 Support

For issues and questions:
1. Check existing GitHub issues
2. Create a new issue with detailed description
3. Include reproduction steps and environment details

---

Built with ❤️ using Next.js, Prisma, and TypeScript