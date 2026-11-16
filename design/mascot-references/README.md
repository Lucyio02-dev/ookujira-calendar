# 鲸鱼妹形象升级：网络资源与设计判断

收集日期：2026-10-30。此目录是角色设计参考资料；应用当前使用的角色素材位于 `assets/`。为尊重各来源图片的独立许可，本公开仓库不包含本目录中的第三方参考图片，只保留来源链接、许可说明和文件摘要。

建议方向：**精致、温柔的鲸鱼少女**。以成熟版的面部和发型为参考，将日历挂件做成约 3～3.5 头身的角色；展开互动时展示半身形象。以下比例和展示方式属于本项目的设计建议，并非来源角色的原设定。

## 为什么当前角色更偏“萌”

观察当前 `assets/mascot-happy.png`：圆脸、极大的眼睛、高占比头部，加上宽大的鲸鱼坐垫，整体轮廓集中在一个圆团里。更适合表达可爱，但颈肩、身体姿态和发型层次不突出。

当前常规窗口中，挂件图片框约 63×60 像素。全身或带大坐垫的图缩到这个尺寸，脸部只有很小的可见区域。后续升级应同时调整角色画法和展示方式，才能看清五官与细节。

## 优先看的三个参考

### A. 精致少女感：成熟比例设定图

- 来源：[TreapGoGo 鲸鱼娘开源资产库](https://treapgogo.github.io/deepseek-whale-girl/index.html)
- [图片原链接](https://treapgogo.github.io/deepseek-whale-girl/assets/dafeiyu-mature-character-sheet.png)
- 本地收集文件：`images/02-elegant-sheet.png`（不随公开仓库分发）
- 借鉴点：舒展的眼型、轻盈的侧刘海、蓝色渐变长发、明确的腰线、细金边与宝石装饰。
- 适合：点击后展开的半身形象，或较大尺寸的独立立绘。
- 设计判断：这是本次最贴近“更漂亮”的方向；如果缩成 60 像素高的全身图，面部细节会损失，应制作配套半身版本。

### B. 小尺寸也清晰：完整桌宠角色设定

- 来源：[YunYueSama / codex-deepseek-pet](https://github.com/YunYueSama/codex-deepseek-pet)
- [图片原链接](https://raw.githubusercontent.com/YunYueSama/codex-deepseek-pet/main/design/character-sheet.png)
- 本地收集文件：`images/05-desktop-character-sheet.png`（不随公开仓库分发）
- 借鉴点：蓝紫发色、统一的发饰和鲸尾轮廓、脸部留白、清楚的待机动作和表情差异。
- 适合：常驻挂件、眨眼与挥手等小幅动画。
- 设计判断：比当前“大坐垫＋大头”的构图更容易保留身体姿态；可以借鉴其小尺寸轮廓，再将五官和身形向 A 的气质调整。

### C. 面部与配色细化：93 张扩展素材

- 来源：[AATINF / deepseek-whale-girl-assets](https://github.com/AATINF/deepseek-whale-girl-assets)
- 内容覆盖表情、姿势、服装、配饰、色卡及其他变体；作者标注为 AI 生成。
- 来源：[成熟版面部表情 C11](https://raw.githubusercontent.com/AATINF/deepseek-whale-girl-assets/main/featured/C11.jpg)、[配色参考 C37](https://raw.githubusercontent.com/AATINF/deepseek-whale-girl-assets/main/featured/C37.jpg)。
- 本地：`images/03-elegant-face.jpg`、`images/04-palette.jpg`
- 借鉴点：眼睛明暗层次、面颊和嘴角的微表情、发色分层、服装主色与装饰色的比例。
- 设计判断：适合作为同一角色微笑、害羞、困倦等表情开发的参考；不同图之间仍需统一脸型、刘海、配饰和服装。

## 补充来源

| 来源 | 能提供什么 | 在本项目中的用途 |
| --- | --- | --- |
| [TreapGoGo Q 版设定图](https://treapgogo.github.io/deepseek-whale-girl/assets/dafeiyu-chibi-character-sheet.png) | Q 版正侧背与细节；已下载为 `images/01-chibi-sheet.png` | 研究鲸鳍、鲸尾和裙摆的角色辨识度 |
| [Bao the Whale 官方网站](https://bao.fish/) | 鲸鱼主题角色的浅蓝、白色与梦幻视觉 | 色彩和柔和气质的灵感；不作为现成可用素材 |
| [Shenshen Pet](https://github.com/schrieeeffer/shenshen-codex-pet) | 桌宠动画、动作预览与图集组织 | 后续做自然眨眼、呼吸、挥手时参考 |

## 图片许可记录

这里记录来源页面的声明及其边界，方便后续选素材时追溯。资源的代码许可和图片许可应分别查看。

| 来源 | 截至收集时的说明 | 当前资料的定位 |
| --- | --- | --- |
| [TreapGoGo README](https://github.com/TreapGoGo/deepseek-whale-girl#代码内容与素材许可) | 网站代码为 MIT，原创文字与提示词为 CC BY-SA 4.0；图片按各自来源或作者说明执行，不能据代码 MIT 推定图片授权 | 两张设定图作为设计研究参考，正式接入前核实对应图片条款 |
| [AATINF README](https://github.com/AATINF/deepseek-whale-girl-assets#授权与署名) | 作者描述为 AI 生成，并将上游角色参考描述为 MIT；这一描述与上游当前对图片许可的单独说明并不完全一致 | 面部和色卡作为研究参考，不能仅据该 README 推定上游图片授权 |
| [YunYueSama 素材说明](https://github.com/YunYueSama/codex-deepseek-pet/blob/main/ASSET_LICENSE.md) | 作者有权授权的新增内容适用自定义署名许可，允许修改及商用；第三方参考仍有独立权利边界。使用时需保留作者、仓库、完整许可，并说明修改 | 已保留 `sources/YunYueSama-LICENSE.txt` 和 `sources/YunYueSama-ASSET_LICENSE.md`；下载的设定图未作修改 |
| [Bao 官方网站](https://bao.fish/) | 官方页面标有版权信息，未在已查看页面发现开放素材许可 | 只保留来源链接，参考视觉气质 |
| [Shenshen 许可说明](https://github.com/schrieeeffer/shenshen-codex-pet#来源与许可) | 项目区分 MIT 代码与视觉素材；视觉素材为 CC BY-NC-SA 4.0 并受上游条款约束 | 只保留来源链接，参考动作设计 |

作者：YunYueSama
仓库：https://github.com/YunYueSama/codex-deepseek-pet
本地收集的 `05-desktop-character-sheet.png` 按来源原样保存，未修改；该文件不随本仓库分发。完整来源许可见 `sources/`。

## 建议的具体改法

1. **比例**：从当前团子构图转为约 3～3.5 头身，露出清楚的颈肩、腰线与手部动作。
2. **五官**：眼睛略收小、拉长眼型；保留清澈蓝瞳，减少大面积星形高光；改用更细腻的微笑和淡腮红。
3. **发型**：海军蓝发根、钴蓝中段、浅青蓝发尾；用几束明确的大弧线组织头发，减少碎乱发丝。
4. **服装**：深蓝＋珍珠白为主，少量金色和一枚宝石点缀；鲸鱼元素集中在鲸鳍、鲸尾和小鲸纹章上。
5. **展示**：常驻状态使用清楚的半身头像或紧凑全身形象；点击后在独立区域展开约 180～240 像素高的半身立绘，避免压住待办。
6. **表情**：统一一张基础设定，再扩展开心、害羞、困倦三种状态；保持发饰、脸型、瞳色、服装和光源一致。
7. **交付**：制作透明背景素材；在真实深色界面中检查 60、96、180 像素三个尺寸的清晰度，确认脸部和轮廓都可辨识。

## 本地文件索引

| 文件 | 内容 |
| --- | --- |
| `images/01-chibi-sheet.png` | TreapGoGo Q 版设定图（仅本地收集，不随公开仓库分发） |
| `images/02-elegant-sheet.png` | TreapGoGo 成熟比例设定图（仅本地收集，不随公开仓库分发） |
| `images/03-elegant-face.jpg` | AATINF C11 面部表情（仅本地收集，不随公开仓库分发） |
| `images/04-palette.jpg` | AATINF C37 配色参考（仅本地收集，不随公开仓库分发） |
| `images/05-desktop-character-sheet.png` | YunYueSama 桌宠设定与动作（仅本地收集，不随公开仓库分发） |
| `references.json` | 来源链接及原始文件 SHA-256 摘要 |

下载地址、文件摘要及收集时间记录于 `references.json`。没有导入或运行任何外部项目代码。
