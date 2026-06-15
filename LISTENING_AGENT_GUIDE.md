# Listening Data Guide

Tài liệu này mô tả cách đọc dữ liệu `listening` để một agent khác có thể hiểu nhanh cần lấy gì từ từng phần. Renderer DOCX vẫn dùng luồng chung, nhưng mọi xử lý đặc thù của listening phải nằm trong `skill/listening.js` hoặc lớp export gọi listening normalization.

## Cấu trúc tổng quát

- `listening`
  - `data.parts[i]`
    - `vocabs`: transcript/bài nghe
    - `file_id`: audio của part
    - `question_sets[j]`
      - đề chung
      - danh sách lựa chọn chung
      - câu riêng

## 1. Transcript

Transcript lấy từ:

- `data.parts[i].vocabs`
- mỗi item là một lượt thoại
- `item.children` hoặc `item.childrens` là các câu trong lượt thoại
- tên người nói lấy từ `meta.speaker`

Render transcript:

- dùng table 2 cột, viền 0
- cột 1: tên người nói, in đậm
- cột 2: nội dung thoại
- mỗi câu thoại một dòng riêng
- các lượt thoại cách nhau bằng row/table spacing, không gộp thành một đoạn lớn

## 2. Audio

Audio lấy từ:

- `data.parts[i].file_id`

URL tải audio:

- `https://cms.youpass.vn/assets/<file_id>`

Khi export listening:

- file docx và audio của mỗi pass nằm cùng folder
- audio đổi tên theo pass tương ứng, ví dụ `Pass 1.mp3`
- ZIP listening chia theo folder:
  - `<Book>/<Test>/Pass n/<docx + audio>`

## 3. Vị trí câu hỏi

Gợi ý/vị trí lấy từ:

- `question.locate_info`
- hoặc cấu trúc nested trong question set, ví dụ `locate_info[0].questions[0].locate_info`
- với `MULTIPLE_CHOICE_MANY`, `locate_info` có thể là object keyed theo index: `"0"`, `"1"`

Quy tắc:

- `paragraph` tính từ 1
- `sentence` tính từ 1
- `index` là vị trí theo từ, tính từ 1
- cần lấy đoạn transcript từ `start` tới `end`
- render label `Vị trí:` in đậm, nội dung vị trí xuống dòng dưới label

## 4. Question Set Chung

Phần đề chung lấy từ:

- `data.parts[i].question_sets[j].description`
- `data.parts[i].question_sets[j].content`
- `data.parts[i].question_sets[j].options` nếu là nhóm matching hoặc choice dùng chung

Quy tắc:

- `description` phải hiện trước `content`
- không bỏ `content` nếu `description` đã có text
- không bỏ `options` nếu type cần danh sách lựa chọn chung
- danh sách lựa chọn chung chỉ render một lần ở phần đề chung

## 5. MATCHING_ENDINGS trong Listening

Ví dụ raw thật:

- `id: 6580`
- `data.parts[1].question_sets[2].title`: `Questions 16-20`
- `data.parts[1].question_sets[2].question_type`: `MATCHING_ENDINGS`
- `data.parts[1].question_sets[2].options`: danh sách lựa chọn A-G

Vấn đề raw:

- `question_set.question_type` là `MATCHING_ENDINGS`
- nhưng từng câu con có thể có `question.question_type` là `MATCHING`
- nếu để nguyên, renderer chung sẽ không đi vào nhánh `MATCHING_ENDINGS`, dẫn tới không in `question_sets[j].options`

Quy tắc normalize trong `skill/listening.js`:

- nếu question set là `MATCHING_ENDINGS`
- và câu con là `MATCHING`
- thì normalize câu con thành `MATCHING_ENDINGS`
- đồng thời gắn `question_sets[j].options` vào `question.shared_options`
- gắn cùng `shared_question_group_key` / `shared_option_group_key`

Render mong muốn ở đề chung:

- `Questions 16-20:`
- `description`
- danh sách options từ `data.parts[1].question_sets[2].options`
- nội dung câu 16-20 với đáp án đỏ

Ví dụ options phải hiện:

- `A. has limited availability`
- `B. is no longer available`
- `C. is for over 8s only`
- `D. requires help from parents`
- `E. involves an additional fee`
- `F. is a new activity`
- `G. was requested by children`

## 6. MULTIPLE_CHOICE_MANY trong Listening

Với câu chọn nhiều đáp án:

- prompt + list lựa chọn nằm ở phần đề chung
- câu lẻ chỉ giữ `Question n`, `Vị trí:` nếu có, và `Lời giải:`
- không thêm dòng `Answer: ...` riêng
- đáp án đúng phải được tô nền trực tiếp trên lựa chọn A/B/C/D/E ở phần đề chung
- nếu một raw question tương ứng nhiều câu, tách thành `Question n`, `Question n+1`
- `locate_info[0]`, `locate_info[1]` tương ứng với từng câu con

## 7. Nguyên tắc file

- Logic riêng của listening đặt ở `skill/listening.js`
- `skill/reading.js` chỉ giữ renderer/normalizer chung cho các raw type
- export single và export ZIP phải gọi `normalizeListeningExportResult()` trước khi render listening
- không hard-code rule listening trực tiếp vào reading nếu rule đó chỉ nhằm sửa shape raw của listening
