# งานใช่ API (Vercel)

Backend แบบ stateless สำหรับเว็บงานใช่

## Routes
- GET /api/health
- POST /api/match

## Privacy
- ไม่มีฐานข้อมูลผู้สมัคร
- ไม่เก็บชื่อ อีเมล เบอร์โทร ที่อยู่ หรือเรซูเม่
- ไม่ log request body
- ใช้ข้อมูลเฉพาะระหว่าง request ปัจจุบัน

## Vercel Root Directory
ตั้ง Root Directory เป็น `nganchai-api`

## Environment variables
```
ALLOWED_ORIGINS=https://sron2527.github.io
GEMINI_ENABLED=true
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash-lite
```

ถ้าจะเปิด Jooble Thailand เพิ่ม:
```
JOOBLE_ENABLED=true
JOOBLE_API_KEY=...
```

Jooble key ต้องเป็น key ของประเทศไทย และ free REST API มีโควต้าจำกัดมาก จึงปิดไว้โดยค่าเริ่มต้น
