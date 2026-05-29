# E-learning Export

Node tool nhap `id` va `token` qua form, sau do tai ve file `.docx`.

## Chay tool

```bash
npm start
```

Mo trinh duyet tai:

```text
http://127.0.0.1:3001
```

## Cau hinh

Sua `config.json` de doi port hoac API:

```json
{
  "port": 3001,
  "host": "127.0.0.1",
  "apiUrl": "https://api.youpass.vn/v1/quizzes/id?included_vocabs=true"
}
```

Tool se thay path segment `/id` bang ID nhap tren form. Vi du ID `abc123` se goi:

```text
https://api.youpass.vn/v1/quizzes/abc123?included_vocabs=true
```

Co the override bang bien moi truong:

```bash
PORT=3002 npm start
```

Tool se goi endpoint voi:

- Header: `Authorization: Bearer <token>`
- Header: `Accept: application/json`

O form token co the nhap ca chuoi day du `Bearer ...` hoac chi phan JWT. Tool se tu xu ly header cho dung.

Noi dung DOCX uu tien lay tu `data.part`; neu API tra ve danh sach nhu quiz `1306`, tool se dung `data.parts`. File xuat gom title, passage, questions va answers.
