# 鲸鱼妹全身动作素材

制作日期：2026-11-15。
工具：内置 imagegen；以 `assets/mascot-v2/happy.png` 作为角色身份参考；侧面步态另以转身图的侧面姿态作为轮廓参考。
目标：沿用已选定的成熟优雅形象，把动作重点放在全身轮廓、步态、裙摆和鲸尾，不重新设计脸部。

本轮补齐待机、正面步行、转身、侧面步行、挥手、伸展、坐下、轻跳、睡眠、拖拽/落地共十张图集。均要求真实透明背景；检查 PNG 画布角落和格间采样的透明通道后，保留原始生成文件，没有脚本抠图或改绘。Electron 端按格定位播放，没有复制多份角色图。

## 八帧步行循环

输出：`assets/mascot-v2/animation/walk-atlas.png`，1774×887，4 列×2 行，共八帧。

```text
Use case: stylized-concept. Asset type: transparent full-body 2D game sprite atlas for an Electron desktop companion. Image 1 is the exact character identity reference. Create one clean sprite atlas with exactly 8 equal vertical frames arranged as a strict 4-column by 2-row grid. Each cell contains the same single full-body whale-girl character, centered at identical scale and baseline, with generous transparent gutters and no cell borders. This atlas will be played as a looping walk cycle.
Character: preserve the exact elegant semi-chibi anime whale girl in Image 1: same face, long navy-to-cobalt-to-pale-aqua hair, white lace band, blue whale-fin ears, sapphire brooch, navy-and-white elegant maid dress and apron whale emblem, stockings, navy Mary Janes, and blue whale tail. Do not redesign clothing or palette. No props.
Motion sequence across the 8 cells in reading order: a natural 8-beat walk cycle seen from a slight three-quarter front view. Alternate left/right step: weight settles, one foot swings forward, foot lands under body, body rises gently, opposite foot swings forward, lands, repeat. Keep upper body balanced with a subtle counter-swing of arms and shoulders; the hands may naturally separate slightly from the reference clasped pose for walking. Skirt hem, long hair tips, ribbon, and whale tail lag behind each step with small believable follow-through. Show clear leg/foot placement differences between frames and readable shifts in the full-body silhouette. Keep head stable and face calm. This is a locomotion sprite atlas, not eight copies of the static pose.
Composition: every frame shows the complete character including ahoge, hair tips, tail, and both shoes. Identical character scale, body proportions, lighting, linework, front-facing direction, and vertical baseline in all cells. Distinct evenly spaced frames; never let the character cross cell boundaries. Real transparent empty background, not checkerboard. No text, labels, arrows, shadows, scenery, borders, watermark, glow cloud, extra characters, face close-up, cropped feet, extreme action pose, spinning.
```

## 停步回身与挥手

输出：`assets/mascot-v2/animation/greeting-atlas.png`，1024×1536，2 列×2 行，共四帧。动作顺序：自然站立 → 回身看向身后 → 全身转回并挥手 → 放下手臂、回到放松站姿。程序在挥手帧短暂停留，形成“走近—停步—回身挥手—回稳”的首次演示。

```text
Use case: stylized-concept. Asset type: transparent full-body 2D game animation pose atlas for the user's desktop companion. Image 1 is the exact character identity and art-style reference. Make exactly 4 equal vertical portrait cells in a strict 2-column by 2-row atlas. Each cell shows the same single whale-girl, full body, centered at identical scale and foot baseline, with generous transparent gutters. No panels or borders.
Character must remain recognizably identical to Image 1: elegant anime whale girl, same youthful adult face, very long navy/cobalt/pale-aqua hair, white lace hairband, whale-fin ears, sapphire brooch, navy-and-white maid dress with apron whale emblem, stockings, navy Mary Janes, one blue whale tail. Preserve proportions, palette, detailed clean linework and soft cel shading. Keep her front three-quarter orientation readable.
Four poses in reading order are one compact action: (1) relaxed neutral standing with weight on one leg and arms naturally resting; (2) turning her torso and head to glance back over one shoulder, hair and tail lagging behind; (3) she faces back toward viewer and raises one hand for a friendly graceful wave, with a slight shoulder lift and smile; (4) lowers the arm and settles back toward the relaxed neutral stance, hair tips and tail following through. These are distinct full-body body-language poses, with the whole silhouette and tail changing naturally, not merely different faces. Keep gestures modest, elegant, anatomically plausible, smooth and readable at desktop size.
All four cells must share identical character size, camera, lighting and ground baseline. Keep complete ahoge, all hair tips, tail and both shoes inside every cell; no overlap across cell edges. Transparent empty background (not checkerboard). No text, labels, frames, scenery, shadows, effects, extra figures, face close-ups, exaggerated chibi or extreme perspective.
```

## 实际接入

- 四帧待机图约每 1.15 秒改变重心和手部姿态；横向移动先从正面转为侧面，再播放八帧侧面步态，停下后转回正面；短距离纵向移动使用正面步态。向左移动时水平镜像角色。
- 首次展示演示短距离行走后回身挥手。点击和提醒挥手，完成待办轻跳；长时间闲置时低频触发伸展或坐下。
- 23:00–06:00 自动切换到蜷坐睡眠姿态，睡眠帧每 1.8 秒切换模拟呼吸；点击或提醒会短暂唤醒，再回到睡眠。
- 拖拽时循环播放悬空平衡姿势，裙摆和鲸尾随重心滞后；松手播放软着陆与回稳姿势。
- 专注模式会中断主动动作；系统启用减少动态效果时停用自动游走、待机动作和逐帧动画。
- 日历陪伴面板原有 happy/shy/sleep 立绘未覆盖；桌宠自身使用全身动作图集。

本版采用精灵图集逐帧姿态切换，不是骨骼绑定动画。它覆盖常驻待机、正侧向移动、转身、互动、作息和拖拽的全身动作。

## 后续全身动作提示词

以下图集均以 `assets/mascot-v2/happy.png` 作为唯一角色参考，使用 1024×1536、2×2 四格透明画布；优先改变全身姿态、重心、裙摆和鲸尾，不重新设计脸部。

### 待机循环

```text
Use case: stylized-concept. Asset type: transparent four-frame full-body idle loop atlas. Preserve the exact whale-girl design, proportions, navy/cobalt/pale-aqua hair, lace headband, whale-fin ears, sapphire brooch, navy/pearl maid dress, whale apron emblem, stockings, Mary Jane shoes and blue tail. Four subtly different whole-body poses: relaxed balanced stand; settle weight onto one leg with hair and skirt following; smooth the apron briefly while tail tip counterbalances; return to center with hair/tail follow-through. Keep face stable. Same scale, camera, light, full silhouette, and transparent 2x2 portrait cells. No props, floor, backdrop, shadow, glow, text, borders or watermark.
```

### 转身

输出：`assets/mascot-v2/animation/turn-atlas.png`，1024×1536，2 列×2 行。桌宠沿横向移动前按正向播放，停下后反向播放。

```text
Use case: stylized-concept. Asset type: transparent four-frame full-body turning atlas. Preserve the exact referenced whale girl, costume, proportions and palette. Sequence from front to right-facing profile: calm three-quarter front; hips and shoulders pivot together as one shoe turns; clean right profile with the forward foot taking weight; settle into profile while skirt, long hair and whale tail finish following through. Keep silhouette and tail outline changing, not only the face. Same scale, camera, lighting and complete body inside transparent 2x2 portrait cells. No scenery, floor, shadow, text, props, borders or watermark.
```

### 侧面步行循环

输出：`assets/mascot-v2/animation/walk-side-atlas.png`，1774×887，4 列×2 行，共八帧。左行时水平镜像。

```text
Use case: stylized-concept. Asset type: transparent eight-frame right-facing full-body walk cycle atlas. Preserve the exact whale-girl identity and costume, and use the generated profile turn atlas as the exact right-facing silhouette reference. In a 4-column by 2-row atlas, alternate the legs through weight settle, forward swing, foot plant, body pass, opposite-leg swing, second plant and return. Show clear shoe/leg placement changes, subtle arm counter-swing, hair, skirt and tail lagging behind each footfall. Stable profile head and torso; complete full body in each cell. True transparency, no overlap, scenery, floor, shadow, text, props, borders or watermark.
```

### 伸展

```text
Use case: stylized-concept. Asset type: transparent four-frame full-body stretch atlas. Preserve the exact referenced whale girl and costume. Sequence: relaxed clasped hands; shoulders rise and arms begin lifting; both arms reach above head, torso arches slightly and one heel lifts while skirt, hair and whale tail counterbalance; arms lower and weight returns to relaxed stand. Clearly change arms, torso, legs, skirt and tail, not the face. Keep every part inside matching 2x2 portrait cells; no backdrop, floor, shadow, glow, props, text or borders.
```

### 坐下与起身

```text
Use case: stylized-concept. Asset type: transparent four-frame sit/stand atlas. Preserve the exact whale-girl identity, proportions, hair, maid outfit, tail and palette. Sequence: relaxed stand; bend knees and lower center of gravity with tail balancing; unmistakable graceful side-sitting pose, legs folded together, hands on skirt and tail curved behind; press up and return to standing with hair and skirt follow-through. Same camera and scale; entire character and tail inside each 2x2 portrait cell. No chair, cushion, props, scenery, shadows, text or borders.
```

### 轻跳

```text
Use case: stylized-concept. Asset type: transparent four-frame full-body hop atlas. Preserve the exact reference character. Sequence: small knee bend and arms back; push-off with feet lifting and hair/skirt/tail trailing downward; compact joyful hop with both feet off the ground and arms opening; soft landing with knees flexed and tail counterbalancing. Keep it a low graceful hop, clear full-body vertical movement, not acrobatics. Match camera and scale across a transparent 2x2 portrait grid. No effects, stars, floor, shadow, props, text or borders.
```

### 夜间睡眠

```text
Use case: stylized-concept. Asset type: transparent four-frame full-body sleeping atlas. Preserve the exact reference character and complete outfit. Sequence: quiet drowsy stand; lower into a compact side-sitting rest with tail curved beside her; peaceful eyes-closed curled pose with head on folded arms at her lap and tail around feet; barely visible breathing shift and tail-tip movement. Sleeping pose must be visibly lower and more compact than standing. Same character scale, complete silhouette, transparent 2x2 portrait cells. No bed, chair, blanket, pillow, scenery, symbols, text or borders.
```

### 拖拽、悬空与落地

```text
Use case: stylized-concept. Asset type: transparent four-frame full-body drag/landing atlas. Preserve the exact reference whale girl, full-body proportions, costume and palette. Sequence: balanced standing; gently lifted with backward waist lean, feet slightly raised and free arm balancing while hair, skirt and tail lag downward; suspended with a small opposite tilt, bent knees and tail/hair swinging through; soft landing with knees absorbing impact and tail settling. Friendly and weightless; no visible hand or rope. Emphasize posture and tail counterbalance, not facial changes. Same camera and scale in transparent 2x2 portrait cells. No floor, shadow, glow, text or borders.
```
