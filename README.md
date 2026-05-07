# FinVest Pro — Backend API

FastAPI backend for FinVest Pro financial intelligence platform.

---

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Framework   | FastAPI + Uvicorn                   |
| Auth        | Firebase Admin SDK (token verify)   |
| Database    | Firestore (primary) + SQLite (cache)|
| Payments    | Cashfree Payment Gateway            |
| Market Data | Yahoo Finance (yfinance via HTTP)   |
| News        | NewsAPI.org                         |
| AI (opt.)   | Claude / OpenAI                     |

---

## Quick Start

### 1. Clone & Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Firebase Setup
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Project Settings → Service Accounts → Generate new private key
3. Save as `firebase/serviceAccountKey.json`

### 3. Environment Variables
```bash
cp .env.example .env
# Edit .env with your actual values
```

### 4. Run
```bash
# Development
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Production
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

API Docs available at: `http://localhost:8000/docs`

---

## API Endpoints

### Auth
| Method | Endpoint             | Auth | Description         |
|--------|----------------------|------|---------------------|
| POST   | /api/v1/auth/sync    | No   | Sync Firebase user  |

### User
| Method | Endpoint             | Auth | Description         |
|--------|----------------------|------|---------------------|
| GET    | /api/v1/user/profile | Yes  | Get profile         |
| PUT    | /api/v1/user/profile | Yes  | Update profile      |
| GET    | /api/v1/user/plan    | Yes  | Get current plan    |

### Engines
| Method | Endpoint                       | Plan   | Description          |
|--------|--------------------------------|--------|----------------------|
| POST   | /api/v1/engines/risk-profile   | Free   | Save risk quiz       |
| GET    | /api/v1/engines/news           | Free   | Curated news         |
| POST   | /api/v1/engines/goal-planner   | Basic+ | SIP calculator       |
| POST   | /api/v1/engines/retirement     | Basic+ | Retirement calc      |
| POST   | /api/v1/engines/stock-analysis | Pro    | Stock deep analysis  |
| POST   | /api/v1/engines/portfolio      | Pro    | Portfolio optimizer  |
| GET    | /api/v1/engines/global-events  | Pro    | Macro events         |

### Payments
| Method | Endpoint                    | Auth | Description           |
|--------|-----------------------------|------|-----------------------|
| POST   | /api/v1/payment/create-order | Yes | Create Cashfree order |
| POST   | /api/v1/payment/verify       | Yes | Verify payment        |
| POST   | /api/v1/payment/webhook      | No  | Cashfree webhook      |
| GET    | /api/v1/payment/history      | Yes | Payment history       |

### Admin (Admin only)
| Method | Endpoint                 | Description       |
|--------|--------------------------|-------------------|
| GET    | /api/v1/admin/stats      | Dashboard stats   |
| GET    | /api/v1/admin/users      | All users         |
| PUT    | /api/v1/admin/users/{uid}| Update user       |
| DELETE | /api/v1/admin/users/{uid}| Delete user       |
| GET    | /api/v1/admin/payments   | All payments      |
| GET    | /api/v1/admin/plans      | Plan config       |

---

## Deployment (Render / Railway / EC2)

### Render
1. Connect GitHub repo
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables from `.env.example`

### Production Checklist
- [ ] `DEBUG=False` in `.env`
- [ ] `CASHFREE_BASE_URL` set to production URL
- [ ] `ALLOWED_ORIGINS` set to your frontend domain
- [ ] `serviceAccountKey.json` uploaded securely (not committed to Git)
- [ ] Strong `SECRET_KEY` set
- [ ] HTTPS enabled on your domain

---

## Plan Access Control

```
Free   → risk-profile, news
Basic  → + goal-planner, retirement
Pro    → + stock-analysis, portfolio, global-events
Elite  → Same as Pro + priority support
```

## Set Admin User

Run once to make a user admin:
```python
from firebase_admin import auth
auth.set_custom_user_claims("USER_UID_HERE", {"admin": True})
```
Or use the `set_admin_claim(uid)` function in `core/security.py`.
