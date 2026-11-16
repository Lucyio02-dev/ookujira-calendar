# 鲸鱼妹 v2 生成提示词

制作日期：2026-10-30。
工具：内置 imagegen（未使用 CLI / API 回退）。每次均启用 transparent_background。

输入参考：用户选定的成熟比例设定图，见 ../mascot-references/images/02-elegant-sheet.png；来源 TreapGoGo/deepseek-whale-girl，https://github.com/TreapGoGo/deepseek-whale-girl 。这是一套非官方社区角色参考。

工作流：先以参考图生成开心基础立绘，再以同一张开心图作为编辑目标，分别只修改害羞与困倦表情。困倦图首次请求遇到网络错误，使用同一提示词重试成功。

最终图保留了参考图的优雅成人动漫比例，而不是提示词中建议的 3.5 头身。检查后采用这套更贴近用户选中形象的结果；常驻头像和展开半身通过 CSS 裁切同一张原始透明 PNG，避免引入不同脸型。

应用素材在 ../../assets/mascot-v2/ 。三个 PNG 都是 1024×1536，保留生成的透明通道，未用脚本抠图或改绘。抽样检查：外部空白 alpha 为 0，脸部和围裙接近不透明。

生成工具的原文件仍保留在默认生成目录；旧版 assets/mascot-*.png 未覆盖。

本记录披露参考来源和生成方式，不将参考资源的网站代码许可视为图片许可。来源说明继续保留在 ../mascot-references/README.md 。

## 开心基础图

```text
Use case: stylized-concept.
Asset type: final transparent PNG mascot illustration for the user's existing dark-blue desktop calendar.
Image 1 is the user-approved character design reference, not a layout to copy. Create one single refined whale girl, full body, alone, centered, with a truly transparent background. Use the same beautiful, gentle anime face, graceful almond-shaped sapphire blue eyes, soft small smile, subtle blush, and layered navy-to-cobalt-to-pale-aqua flowing long hair of the approved mature reference. Preserve her curved thin ahoge, small white lace headband, small blue ribbon, blue whale-fin ears, the oval sapphire and fine gold setting at the collar, navy blue and pearl white elegant maid dress with long bell-shaped skirt, clean white apron and small whale emblem, fine sparse gold trim, white stockings and navy Mary Jane shoes, one clear blue whale tail curving at her side.
Proportions: a tasteful semi-chibi adaptation, about 3.5 heads tall, with a clear delicate neck, shoulders, defined waist and naturally slender body. She should be prettier and more graceful than a round infant-like chibi; retain a young adult character impression. No oversized balloon head, no whale cushion. Dress is modest, elegant and fully clothed.
Pose: relaxed front-facing standing position with a slight graceful turn, hands resting gently together in front at waist, both shoes and all hair tips visible. Expression: warm gentle open-eyed smile, relaxed eyebrows. Her face should be beautiful and engaging; don't use huge stars in the eyes.
Style: polished high-end Japanese anime character illustration, precise delicate line art, soft cel shading with controlled translucent highlights in hair, crisp readable navy / pearl white / sapphire palette. Simplify tiny lace details enough to remain clear as a desktop mascot. Keep the facial features visibly refined rather than baby-like.
Framing: single full-body vertical composition, character occupies about 90% of image height, generous safety margin around ahoge, tail and shoes, no cropping. No text, no character sheet, no second character, no scenery, no floor, no frame, no watermark, no glow cloud, no cast shadow backdrop. Deliver actual transparency, not a painted checkerboard.
```

## 害羞表情

```text
Use case: identity-preserve. Image 1 is the edit target: the exact final full-body whale girl mascot. Preserve this exact character, face shape, head and body proportions, pose, hands, hair silhouette, blue gradient hair, lace headband, whale-fin ears, sapphire neck brooch, navy-and-white long dress, apron whale emblem, gold trim, whale tail, shoes, delicate anime linework, lighting, original vertical canvas dimensions, subject position and scale. Single character, full body, actual transparent background. Keep the subject opaque including white clothing. Remove any exterior haze/glow if present, leaving only the character silhouette and transparent empty space. Do not add any objects, text, backdrop, shadow, stickers, symbols, speech bubbles or watermark. Change ONLY the facial expression as follows: A refined shy smile, faintly stronger pink blush, eyes gently looking slightly down and to the side but still open, tiny closed-lip smile, softened eyebrows. She is bashful yet graceful. Keep all other pixels and features as close as possible to the base.
```

## 困倦表情

```text
Use case: identity-preserve. Image 1 is the edit target: the exact final full-body whale girl mascot. Preserve this exact character, face shape, head and body proportions, pose, hands, hair silhouette, blue gradient hair, lace headband, whale-fin ears, sapphire neck brooch, navy-and-white long dress, apron whale emblem, gold trim, whale tail, shoes, delicate anime linework, lighting, original vertical canvas dimensions, subject position and scale. Single character, full body, actual transparent background. Keep the subject opaque including white clothing. Remove any exterior haze/glow if present, leaving only the character silhouette and transparent empty space. Do not add any objects, text, backdrop, shadow, stickers, symbols, speech bubbles or watermark. Change ONLY the facial expression as follows: A peaceful sleepy expression, both eyes gently closed with naturally drawn eyelids and lashes, a tiny calm closed-lip smile and relaxed brows. Keep her head in exactly the same position, standing pose unchanged; no drooping body, no pillow, no Z symbols. Keep all other pixels and features as close as possible to the base.
```
