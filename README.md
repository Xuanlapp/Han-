<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/4c292794-3a55-47d1-8981-dc9a375f9c6f

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Tom tat logic - Tach nen (2026-03-27)

- Da tich hop tach nen bang AI voi `@imgly/background-removal` trong utility rieng.
- Luong tach nen moi uu tien `imgly`, neu that bai se tu dong fallback sang thuat toan `pixel_threshold`.
- Ham `processBase64Transparency` da duoc doi sang goi `removeBackgroundSmart`, khong con xu ly flood-fill + ve vien trong `imageUtils`.
- Dau vao ho tro ca Data URL va base64 thuan; dau ra luon la Data URL PNG de gan nguoc vao UI hien tai.
- Build da duoc kiem tra thanh cong voi `npm run build`.
