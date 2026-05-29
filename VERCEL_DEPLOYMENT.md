# Deploy len Vercel

Project nay la Node serverless app, khong co buoc build frontend.

## Gia tri can dien tren Vercel

- Application Preset: `Node`
- Root Directory: `./`
- Build Command: de trong hoac `npm run build`
- Output Directory: de trong
- Install Command: de mac dinh, hoac `npm install`

## Environment Variables

Chi can them bien nay neu muon override endpoint API:

```text
E_LEARNING_API_URL=https://api.youpass.vn/v1/quizzes/id?included_vocabs=true
```

Khong can them `PORT` hoac `HOST` tren Vercel. Vercel tu quan ly serverless runtime.

## Kiem tra sau deploy

- Mo domain Vercel de thay form nhap ID va token.
- Form submit den `/export` va tai file `.docx`.
