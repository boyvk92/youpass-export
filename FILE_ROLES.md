# File Roles

This project is being split so `server.js` only handles routing and wiring.
All export logic should live in the dedicated modules below.

## Current module roles

### `server.js`
- HTTP routes only.
- Reads request body and delegates to `core/export-docs.js` or `core/export-multi.js`.
- Wires shared dependencies into module factories.
- Should not contain DOCX rendering logic or Reading parsing logic.
- Should not keep helpers that parse Reading content or build DOCX paragraphs.
- Should only dispatch URL -> form -> export module.

### `core/view.js`
- HTML for the two forms only.
- Single export form.
- Bulk export form.
- No business logic.

### `core/helper.js`
- Bulk export API helpers.
- URL builders.
- List/detail fetch helpers.
- Generic bulk parsing helpers.

### `core/export-docs.js`
- Single DOCX export orchestration.
- Parse `source`, `id`, `skill`, `token`.
- Resolve quiz id/skill from URL.
- Fetch quiz result.
- Write export log.
- Call DOCX builder and return the file.

### `core/export-multi.js`
- Bulk ZIP export orchestration.
- Build list URL from form input.
- Fetch quiz list pages.
- Fetch mock-test detail when needed.
- Collect DOCX files and build ZIP.

### `skill/reading.js`
- Reading-specific parsing and normalization.
- Convert YouPass Reading data into render lines.
- Build clean export record for Reading.
- Anything that depends on Reading question structure belongs here.

### `skill/common.js`
- Shared DOCX XML builders.
- Paragraph styles.
- Cover page rendering.
- Table/question/explanation XML blocks.
- ZIP assembly for DOCX output.

### `skill/helper.js`
- HTML decoding and text normalization.
- `htmlToText` style helpers.
- Placeholder helpers for blank markers.
- Shared text cleanup utilities.

## Reading dependency map

These are the functions currently passed into `createReadingCore(...)`.
They should stay in Reading/shared modules, not `server.js`.

### Data extraction
- `extractYouPassParts`
- `splitPassageContent`
- `getPartQuestions`
- `extractMarkedAnswers`
- `formatSelectionQuestion`
- `formatChoiceOptions`
- `formatSharedOptions`
- `formatSingleChoiceRadio`
- `formatMultipleChoiceManyOptions`

### Question classification and labeling
- `resolveQuizType`
- `isFillInTheBlankQuestion`
- `getQuestionRawTypeKey`
- `getQuestionTypeLabel`
- `getQuestionRawTypeText`
- `normalizeTypeKey`
- `labelIndexedOptions`
- `formatOptionText`
- `getChoiceAnswer`
- `getDirectAnswer`

### Explanation and keyword handling
- `addExplanationLines`
- `buildExplanationMap`
- `formatAreaOfInformation`
- `extractQuestionKeywords`
- `pushQuestionGroupLines`
- `pushSharedOptions`

### Reading text helpers
- `splitTextLines`
- `htmlToText`
- `htmlToTextWithBlankPlaceholders`
- `htmlWithBlankPlaceholders`

## Export DOCX rendering helpers

These are currently used by `createDocxCore(...)` and should remain in the
common DOCX layer, not in `server.js`.

- `buildCoverPageLines`
- `buildImageRegistry`
- `coverTitleParagraph`
- `coverSubjectParagraph`
- `coverCodeParagraph`
- `pageBreakParagraph`
- `heading`
- `questionGroup`
- `questionDescriptionHtml`
- `questionTitle`
- `questionTextParagraph`
- `questionAnswerParagraph`
- `readingTestTitle`
- `passageLabel`
- `passageTitle`
- `passageParagraph`
- `extractImageOnlyHtml`
- `htmlToDocxParagraphs`
- `questionKeywordsBlock`
- `questionExplanationBlock`
- `answerParagraph`
- `choiceParagraph`
- `questionInfoParagraph`
- `paragraph`
- `formatResult`
- `appendDocxRenderLog`
- `createZip`

## Refactor rule

If a function is used to:
- parse Reading data, move it to `skill/reading.js`
- render DOCX XML, move it to `skill/common.js`
- handle bulk list/detail API logic, move it to `core/helper.js` or `core/export-multi.js`
- render forms, move it to `core/view.js`
- wire routes only, keep it in `server.js`
