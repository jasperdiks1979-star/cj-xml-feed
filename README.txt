CJ → XML FEED (Vercel)

Gebruik:
1) Ga naar vercel.com → Add New… → Project → kies "Import" en upload deze ZIP (drag & drop).
2) Na het aanmaken van het project: Settings → Environment Variables → voeg toe:
   Key: CJ_TOKEN, Value: jouw CJ access token (CJ Developers → maak token).
3) Ga naar Deployments → Redeploy.
4) Test: https://<jouw-project>.vercel.app/api/feed?kw=dog
   Of: https://<jouw-project>.vercel.app/api/feed?ids=PRODUCT_ID_1,PRODUCT_ID_2

Er is geen build nodig. Er is alleen /api/feed.js (serverless function).
