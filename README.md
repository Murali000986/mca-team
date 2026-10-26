# MCA Team — Ledgerly MCA Automation

Two components for the MCA company registration automation platform:

| Folder | Description |
|--------|-------------|
| `extension/` | Chrome Extension (MV3) — fills SPICe+ Part A & New Company Reg forms on mca.gov.in |
| `admin-panel/` | Next.js Admin Panel — manage clients, review drafts, track submissions |

## Extension

Chrome Manifest V3 extension. Load via `chrome://extensions` → **Load unpacked** → select the `extension/` folder.

Connects to the Ledgerly backend (`localhost:3000` by default) for approved client drafts.

## Admin Panel

Next.js 14 app.

```bash
cd admin-panel
npm install
npm run dev
```
