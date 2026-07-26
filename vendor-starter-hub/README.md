# Vendor Starter Hub

Guides, tools, and a SoCal show calendar for new trading card vendors.
Stack: Next.js 15 (App Router) + TypeScript + Tailwind CSS v4, deployed on Vercel.

## Develop
npm install
npm run dev

## Push to GitHub (one-time)
git init && git add -A && git commit -m "Initial site"
# create an empty repo named vendor-starter-hub on GitHub, then:
git remote add origin git@github.com:YOUR_USERNAME/vendor-starter-hub.git
git branch -M main && git push -u origin main
# Finally: Vercel dashboard -> vendor-starter-hub -> Settings -> Git -> connect the repo
# After that, every push auto-deploys.

## Where things live
- Brand name/tagline/nav: components/site.ts (swap once, updates everywhere)
- Design tokens (colors/fonts): app/globals.css (@theme block)
- Email capture backend: app/api/subscribe/route.ts (TODO: wire Kit/Buttondown/Resend — until then signups are NOT stored)
- Pages: app/*/page.tsx
