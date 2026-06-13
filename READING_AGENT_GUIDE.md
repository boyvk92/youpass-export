# Reading Data Guide

Tài liệu này mô tả cách đọc dữ liệu `reading` để một agent khác có thể hiểu nhanh cần lấy gì từ từng phần.

## Cấu trúc tổng quát

- `reading`
  - `part` hoặc `parts`
    - `question_sets`
      - `quest chung`
      - `quest riêng`

## 1. Quest chung

Phần này là nội dung dùng chung cho cả cụm câu hỏi.

- Lấy từ:
  - `data.parts[i].question_sets[j].content`
  - `data.parts[i].question_sets[j].description`
- Quy tắc:
  - Nếu có cả `content` và `description` thì ghép cả hai.
  - `description` thường là phần dẫn nhập của cụm câu hỏi.
  - `content` thường là phần nội dung chính của đề chung.
  - Không chỉ lấy một key rồi bỏ key còn lại.

### Gợi ý render

- Với `SUMMARY_COMPLETION`:
  - `content` có thể chứa các blank như `______`
  - blank phải được thay bằng dạng `n-> <đáp án>`
  - số `n` cần in đậm
  - đáp án cần màu đỏ
  - phần này render ngay trong đề chung, không đẩy đáp án xuống dòng câu riêng
  - nếu raw không có marker `[7]`, cứ đánh số theo thứ tự blank xuất hiện trong content

Ví dụ:

- `of a tree and ______`
- thành `of a tree and 7-> bulbs`

- Với `MATCHING_FEATURES`, `MATCHING_ENDINGS`, `MATCHING_HEADINGS`, `MATCHING_HEADING`:
  - danh sách lựa chọn phải render một lần ở phần đề chung
  - không lặp lại danh sách lựa chọn trước từng câu lẻ
  - phần câu lẻ chỉ render câu hỏi và đáp án theo quy tắc của từng kiểu
  - không render `Answer: ...` trong phần giải thích cho nhóm matching này
- Với `SENTENCE_COMPLETION`:
  - `description` và `content` của question set phải render một lần ở phần đề chung, cùng nhịp với các kiểu matching
  - blank trong content phải được thay trực tiếp bằng đáp án tương ứng tại đúng vị trí xuất hiện
  - từng câu lẻ chỉ render một dòng câu hỏi + đáp án + giải thích riêng
  - không lặp lại phần đề chung trước mỗi câu lẻ
- Với `SHORT_ANSWER`:
  - `content` của question set phải thay blank `______` bằng đáp án tương ứng ngay tại vị trí xuất hiện
  - giữ nguyên phần đề chung nếu có ảnh hoặc đoạn dẫn
  - không render đáp án thành danh sách riêng nếu raw đã đặt blank trong content
- Khi render phần đề chung có `content` dạng HTML:
  - nếu HTML có ảnh thì phải giữ lại và đi qua luồng render ảnh của DOCX
  - không strip `<img>` ra khỏi question set content
- Với `MAP_DIAGRAM_LABEL`:
  - `content` của question set có thể chứa hình ảnh của đề chung
  - blank trong content phải được thay trực tiếp bằng đáp án tương ứng tại đúng vị trí xuất hiện
  - không tách hình ảnh ra khỏi đề chung
  - không render danh sách đáp án riêng nếu raw đã có placeholder ngay trong content
- Với `MULTIPLE_CHOICE_MANY`:
  - mỗi raw question có thể có một block đề chung riêng, không được ghép lẫn lựa chọn của nhiều raw question khác nhau trong cùng một cụm lớn
  - danh sách lựa chọn chỉ render một lần cho đúng block đó
  - câu lẻ không được in lại danh sách lựa chọn
  - phần câu lẻ chỉ giữ `Question n` và phần giải thích
  - nếu raw gom nhiều đáp án trong cùng một cụm thì có thể tách ra nhiều câu `Question n`, `Question n+1`
  - khi raw là table nhiều dòng, mỗi `selection` row phải giữ `order` riêng nếu có, nếu không thì tách theo thứ tự xuất hiện để không dính nhiều dòng vào một câu
  - dòng range ở đề chung phải hiển thị cùng dòng với prompt, ví dụ `<strong>20-21</strong> Which TWO...`
  - phần giải thích của từng câu con chỉ lấy block đầu tiên tương ứng với đáp án của dòng đó, không kéo sang block giải thích của dòng kế tiếp

## 2. Quest riêng

Mỗi câu riêng nằm trong:

- `data.parts[i].question_sets[j].questions[k]`

Với mỗi câu riêng, agent cần lấy:

- `key lấy đáp án`
- `key lấy lựa chọn (nếu có)`
- `key lấy giải thích đáp án`

### 2.1 Key lấy đáp án

Ưu tiên lấy theo thứ tự:

1. `correct_answer`
2. `correct_answers`
3. `answer`
4. dữ liệu đã được normalize từ các field khác nếu có

Ghi chú:

- Với `SUMMARY_COMPLETION`, đáp án có thể nằm ở `part.questions[]` dù `question_sets[j].questions[]` chưa có đủ
- Khi build map đáp án cho đề chung, cần gom từ cả `question_sets[j].questions[]` và `part.questions[]`

### 2.2 Key lấy lựa chọn

Chỉ lấy khi câu hỏi có dạng trắc nghiệm hoặc có danh sách lựa chọn.

- Các key thường gặp:
  - `choices`
  - `selection`
  - `options`
  - `sharedOptions`
  - `shared_options`
- Nếu không có lựa chọn thì bỏ qua phần này.
- Với nhóm `MATCHING_FEATURES`, `MATCHING_ENDINGS`, `MATCHING_HEADINGS`, `MATCHING_HEADING`:
  - ưu tiên lấy lựa chọn từ block chung của question set
  - không render lại cùng một danh sách ở từng câu con
  - các lựa chọn nên được normalize về cùng một list dùng chung cho cả cụm
- Với `SENTENCE_COMPLETION`:
  - ưu tiên lấy `description` + `content` từ question set chung
  - nếu câu lẻ có `selection`/`choices` thì chỉ lấy phần text để render dòng câu hỏi riêng, không nhân bản đề chung
- Với `MULTIPLE_CHOICE_MANY`:
  - ưu tiên lấy lựa chọn từ block của từng raw question trước, không ghép toàn bộ question set nếu có nhiều cụm con
  - nếu không có block riêng thì mới gom từ các question con cùng cụm
  - options của kiểu này có thể nằm trong `options`, `choices`, `multiple_choice`, `selection_option`, hoặc `selection`
  - không render lựa chọn lặp lại ở từng câu con
  - prompt chung và list lựa chọn phải được đẩy lên block chung của đúng cụm câu con
  - range câu hỏi như `20-21` phải được bold, nhưng không thụt lề riêng

### 2.3 Key lấy giải thích đáp án

Ưu tiên lấy:

1. `explain`
2. `explanation`
3. `question.explain`
4. dữ liệu giải thích đã được map từ phần câu hỏi hoặc nhóm câu hỏi

## 3. Nguyên tắc xử lý

- `question_sets[j].content` là đề chung, không phải câu riêng.
- `questions[k]` là câu riêng.
- Nếu câu riêng là dạng điền từ thì phần đáp án thường nằm trong `correct_answer`, `answer`, hoặc dữ liệu tương đương.
- Nếu câu riêng có lựa chọn thì phải render cả lựa chọn và đáp án đúng.
- Nếu có giải thích thì tách riêng, không trộn vào nội dung câu hỏi.
- Với `SUMMARY_COMPLETION`, tránh render đáp án thành một dòng `Question n -> answer` riêng nếu đáp án đã được cắm trực tiếp vào content.
- Với `MATCHING_FEATURES`, `MATCHING_ENDINGS`, `MATCHING_HEADINGS`, `MATCHING_HEADING`:
  - chỉ render list đáp án chung một lần ở phần đề chung
  - câu lẻ không được tự đẩy lại list lựa chọn
  - phần giải thích chỉ giữ `Lời giải:`
  - không thêm dòng `Answer:` ở phần giải thích cho các kiểu này
- Với `SENTENCE_COMPLETION`:
  - giữ nguyên block đề chung như matching
  - mỗi câu riêng hiển thị prompt ngắn và đáp án của chính nó
  - không lặp lại description/content ở từng câu
  - không tạo danh sách đáp án riêng ở block chung, chỉ thay vào blank trong content
- Với `SHORT_ANSWER`:
  - thay blank trong `question_sets[j].content` bằng đáp án tương ứng
  - không tách đáp án ra khỏi đề chung nếu raw đã có placeholder
  - giữ nguyên ảnh và phần văn bản chung đi kèm
- Với `MAP_DIAGRAM_LABEL`:
  - giữ nguyên hình ảnh và nội dung chung trong `question_sets[j].content`
  - thay blank theo thứ tự xuất hiện bằng đáp án tương ứng
  - không nhân bản lại phần đề chung ở từng câu lẻ
  - không render thêm một danh sách đáp án tách riêng nếu câu đã có placeholder trong content
- Với `MULTIPLE_CHOICE_MANY`:
  - phần đề chung giữ prompt + list lựa chọn của từng cụm câu con
  - câu lẻ chỉ render `Question n` và `Giải thích`
  - không lặp list lựa chọn trong từng câu lẻ
  - một cụm raw có thể tách thành nhiều câu riêng nếu có nhiều đáp án/câu con
  - khi render giải thích, mỗi dòng chỉ lấy phần giải thích đầu tiên đúng với đáp án của dòng đó

## 4. Mục tiêu render

Khi export DOCX, cần đảm bảo:

- phần đề chung hiển thị đủ `description + content`
- phần `SUMMARY_COMPLETION` thay blank đúng vị trí trong content
- phần câu riêng hiển thị đúng nội dung câu hỏi
- phần đáp án lấy đúng key
- phần lựa chọn chỉ hiện khi câu có choice
- phần giải thích hiển thị riêng, không làm rối đề
