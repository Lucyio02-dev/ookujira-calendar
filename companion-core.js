(function (root) {
  'use strict';
  const lines = {
    complete: ['划掉。看着就舒服。', '这件收工。尾巴替你盖章。', '又少一件，挺好。', '嗯，这下能松口气了。'],
    save: ['记好了。这件归我盯。', '放进日历了，到点叫你。', '收到，我没打瞌睡。'],
    delete: ['划走了，给别的事腾点地方。', '好，这件不留了。'],
    remind: ['到时间了，先看一眼日历。', '先别戳我，有件正事到点了。'],
    celebrate: ['清空了？那我先躺为敬。', '今天收工。抱枕分你一半。', '最后一件也结束了，舒服。'],
    pin: ['好，我待在上面。不会挡你太久。'], unpin: ['我下去待着，需要时叫我。'],
    curious: ['又有安排？我记着。'], greet: ['来了？我给你留了位置。', '嗯，我在。刚才只是闭目养神。', '今天也归这片桌面管。'],
    idle: ['我挪个位置，你继续。', '枕头借你？……用完还我。', '坐得有点久了，我先伸个懒腰。', '这会儿没事，我眯一下。', '杯子还空着？顺路给自己接点水。'],
    typing: ['你写，我等着。'], focusStart: ['你忙。我把尾巴收好。', '这段时间我安静点。'],
    reschedule: ['挪好了，按新时间叫你。', '换到那天了，我记住了。'], idleExtra: ['抱枕已经就位。', '我没偷懒，在节省体力。'],
    petOn: ['我去桌面找个舒服的位置。', '出来了。枕头也带着。'], soundOn: ['嗯，声音开了。'], soundOff: ['好，小点声。'],
    fullBody: ['尾巴也要看？那就看一眼。'], select: ['这天有什么安排？'],
    clicked: ['嗯？叫我？', '我听着，你说。', '没事的话，我就继续坐着了。', '手收好，我的头发刚理顺。'],
    repeated: ['尾巴不算按钮。', '第三下了。有事直说。', '再戳，我可抱着枕头走了。'],
    head: ['嗯……这次可以。', '头发轻一点，刚梳好。'], tail: ['尾巴不算按钮。', '抓到你了，别碰尾巴。'],
    wake: ['……我听着。眼睛先不睁。', '醒了，醒了。枕头还给我。', '这个点了，你怎么也没睡。'],
    drag: ['搬家可以，枕头带上。', '慢点，尾巴还在后面。', '这次选个舒服的位置。'],
    rain: ['伞拿上。我的这把，你撑不了。', '听雨挺好，裙摆湿了就不好了。'],
    sun: ['这块地方有太阳。我占一会儿。', '晒得刚好，再坐五分钟。'],
    hot: ['有点热。让我扇两下。'], cold: ['杯子是热的。手终于暖了。'], snow: ['接住一片。……化得也太快了。'],
    sit: ['站累了，我坐会儿。', '这里归抱枕和我了。'], pillow: ['枕头到位。没急事先别叫我。']
  };
  function createSpeaker(random = Math.random) {
    const recent = new Map();
    return function say(kind) {
      const pool = lines[kind] || lines.idle;
      const history = recent.get(kind) || [];
      const available = pool.filter(line => !history.includes(line));
      const choices = available.length ? available : pool;
      const line = choices[Math.floor(random() * choices.length)];
      recent.set(kind, [...history, line].slice(-Math.max(1, pool.length - 1)));
      return line;
    };
  }
  function weatherKind(data, now = Date.now()) {
    if (!data || !Number.isFinite(data.observedAt) || now - data.observedAt > 90 * 60000 || data.observedAt > now + 600000) return 'normal';
    const code = data.code;
    if ([71,73,75,77,85,86].includes(code)) return 'snow';
    if ([51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(code)) return 'rain';
    if (data.temperature >= 30) return 'hot';
    if (data.temperature <= 8) return 'cold';
    if (data.isDay && [0,1].includes(code)) return 'sun';
    return 'normal';
  }
  const api = { lines, createSpeaker, weatherKind };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Companion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
