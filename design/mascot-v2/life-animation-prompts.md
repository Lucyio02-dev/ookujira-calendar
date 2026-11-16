# Ookujira 生活与天气动作

制作日期：2026-11-16。使用内置 imagegen（透明背景），参考 `assets/mascot-v2/happy.png` 保持角色身份。生成原文件保留在 Codex generated_images，项目使用 `assets/mascot-v2/animation/life-atlas.png`。

图集为4列3行，逐行编号：站立、持抱枕、下蹲、鸭子坐、抱枕睡眠、醒来、收伞、撑伞、晒太阳、扇风、捧热杯、接雪花。与旧图集共用脚底基准和播放调度，过渡状态完成后再进入下一动作。当前为关键姿势动画，持续状态通过呼吸与轻晃补充动作。

## 最终生成提示词

```text
Use case: identity-preserve. Asset: production transparent animation sprite atlas for an existing Electron desktop companion. Reference image is the exact character identity: preserve young adult anime whale woman, blue gradient long hair, fin ears, whale tail, white lace headband, navy white gold maid dress and refined face. Make ONE atlas, exactly FOUR columns by THREE rows, equal-sized cells, no borders or labels, transparent background, crisp consistent anime linework. Every cell has same camera, same character scale, centered X, same ground baseline at 95% cell height, ample margin for umbrella, no overlap between cells. Row-major frames: 0 relaxed standing hands together; 1 standing holding a soft small blue whale pillow at chest; 2 crouching with pillow preparing to sit; 3 duck sitting knees forward feet out at sides hugging pillow open eyes; 4 same seated pose asleep cheek resting on pillow eyes closed; 5 same seated pose waking half-open eyes lifting head; 6 standing holding closed pale-blue umbrella; 7 standing holding open pale-blue umbrella above head looking at rain; 8 relaxed standing stretching face up eyes closed enjoying sunshine, NO sun drawn; 9 standing fanning herself with small hand fan looking warm; 10 standing wearing soft pale-blue scarf holding warm cup; 11 standing wearing scarf reaching palm out for a snowflake. No scenery, no ground shadow, no haze, no glow, no text, actual alpha transparency. Elegant adult body proportions match reference across all 12 frames, including seated frames with naturally lower head height. Full head hair shoes tail props visible in every cell.
```
