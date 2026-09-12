# DayChart - Visual Time Tracker

A free, open-source web application for planning and visualizing your day. Create beautiful time schedules with drag-to-draw functionality on interactive circular and linear timelines.

**Live App:** [daychart.fyi](https://daychart.fyi)

---

## What is DayChart?

DayChart helps you plan your day visually. Instead of writing lists, you draw your schedule directly on a 24-hour timeline. Perfect for:
- Planning your ideal daily routine
- Time blocking your workday
- Visualizing how you spend your time
- Creating templates for different types of days (workday, weekend, etc.)

## Features

✨ **Dual View Modes**
- Circular timeline - See your day as a clock
- Linear timeline - Traditional vertical schedule view

🎨 **Intuitive Creation**
- Drag to create time blocks
- Drag an existing wheel block to move it while preserving its duration
- Drag the dots at either end to resize a block in 5-minute increments
- Click or tap a block to edit its start/end times, label, and color
- Choose hours, five-minute steps, and AM/PM with the block's time pickers
- Overnight blocks are supported; overlapping edits are rejected
- Color-code your activities
- Add custom labels and emojis
- Works on desktop and mobile (touch-enabled)

💾 **Multiple Schedules**
- Create up to 10 different schedules
- Switch between work, personal, and weekend routines
- Export to JSON or CSV

🔒 **Secure & Private**
- Sign in with Google or email
- Your data is private and encrypted
- Free, no credit card required

---

## Future Plans

We're actively working on new features! Upcoming additions include:

- 📊 **Analytics Dashboard** - Insights into how you spend your time
- 📥 **Import Schedules** - Upload JSON/CSV files to restore backups
- 📚 **Template Library** - Pre-made schedules for common routines
- 🖨️ **PDF Export** - Print your schedules
- ⌨️ **Keyboard Shortcuts** - Power user features
- 🌐 **PWA Support** - Install as a mobile app, work offline
- 🔗 **Share Schedules** - Generate public links to share your routines

Have an idea? [Open an issue](https://github.com/omarraf/time-tracker/issues) or contribute!

---

## AI backend deployment (Railway)

Deploy `server/` as the Railway service root. Set `FIREBASE_PROJECT_ID`,
`GOOGLE_SERVICE_ACCOUNT` (the Firebase service account JSON), and `CLAUDE_API_KEY`
in the service's environment variables.

Set `FRONTEND_URL=https://daychart.fyi` on Railway. This is also used for billing
redirects. CORS allows `https://daychart.fyi`, `https://www.daychart.fyi`, local Vite
ports 5173 and 5174, and Vercel deployments. Additional frontend origins can be
provided in `CORS_ALLOWED_ORIGINS` as comma-separated HTTP(S) URLs.
Configured URLs are normalized to their origins, including removal of trailing slashes.

Set `VITE_API_URL=https://<your-service>.up.railway.app` in the frontend hosting
environment **before building**, then rebuild/redeploy the frontend. Without this
variable, the frontend calls `http://localhost:3001` on the user's computer.
Redeploy Railway after changing backend code or environment variables.

To check CORS without invoking AI or using a user's token:

```sh
curl -i -X OPTIONS 'https://<your-service>.up.railway.app/api/ai/message' \
  -H 'Origin: https://daychart.fyi' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,content-type'
```

Expect HTTP 204 with `Access-Control-Allow-Origin: https://daychart.fyi`, POST
among the allowed methods, and Authorization and Content-Type among the allowed
headers. If `/health` fails too, check Railway service health and logs first;
an upstream error without CORS headers can also appear as a browser CORS error.

## Contributing

Contributions are welcome! Whether it's bug reports, feature requests, or code contributions:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

For major changes, please open an issue first to discuss what you'd like to change.
