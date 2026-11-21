# Free deployment setup

This setup avoids Google Cloud billing by using a Render Free web service, a Neon Free PostgreSQL database, the existing Vercel frontend, and Brevo's Free transactional email. It is suitable for a pilot or demo, not a dependable production service: Render Free services sleep after 15 minutes without traffic and can take about a minute to wake.

## What the free plans include

- Render Free backend: $0, with a monthly 750 free instance-hour allowance. The service sleeps after 15 minutes of inactivity.
- Neon Free database: $0 with monthly compute and storage limits. Use its pooled URL for `DATABASE_URL` and its direct URL for `DIRECT_DATABASE_URL`.
- Brevo Free email: enough for up to 300 email sends per day, including transactional email.
- Vercel: keep the current frontend deployment; it needs `VITE_API_BASE_URL` set to the deployed Render service's `/api/v1` URL.

The checked-in `render.yaml` configures only a free backend service. It intentionally does not create a Render Postgres instance because Render's free Postgres database expires after 30 days.

## Setup sequence

1. Create a Neon Free Postgres project and copy its pooled and direct connection URLs.
2. In Render, connect the `PRIYANSHU-KUMAR-IITPATNA/mushroom-hub` GitHub repository and create a Blueprint from `render.yaml` on the `feature/brevo-transactional-sms` branch. Choose the Free service plan.
3. At the initial Blueprint prompt, enter the Neon URLs, the verified Brevo sender email and API key, the updated Apps Script `/exec` URL, and the same random token stored in Apps Script project properties. Keep these values out of the repository and chat.
4. After Render deploys, run the checked-in Prisma migrations once against the Neon database using `DIRECT_DATABASE_URL`. Do not enable automatic schema resets on the shared database.
5. Add `VITE_API_BASE_URL=https://<render-service>.onrender.com/api/v1` to the Vercel project, then redeploy the frontend.

## Limits

Free Render services are intended for testing and previews. They can spin down, have limited monthly build/bandwidth allowances, and should not be relied on for time-sensitive farmer verification. Neon Free also has usage caps. Monitor both dashboards and keep database backups outside this free setup if storing real farmer data.
