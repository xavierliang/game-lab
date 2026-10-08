const $ = (id) => document.getElementById(id);
$('from').value = $('to').value = new Date().toISOString().slice(0, 10);
let viewed = null;
function parameters() {
  return new URLSearchParams({
    from: $('from').value,
    to: $('to').value,
    environment: $('environment').value,
    game_id: $('game').value,
  });
}
async function request(path) {
  const res = await fetch(path, {
    headers: { Authorization: 'Bearer ' + $('token').value },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
  return res;
}
function table(id, rows) {
  const root = $(id);
  root.replaceChildren();
  if (!rows.length) {
    root.textContent = '暂无数据';
    return;
  }
  const table = document.createElement('table'),
    keys = Object.keys(rows[0]);
  for (const [i, row] of [keys, ...rows.map((r) => keys.map((k) => r[k]))].entries()) {
    const tr = document.createElement('tr');
    for (const value of row) {
      const cell = document.createElement(i ? 'td' : 'th');
      cell.textContent = String(value);
      tr.append(cell);
    }
    table.append(tr);
  }
  root.append(table);
}
function clear() {
  for (const id of ['cards', 'daily', 'sources', 'metrics', 'scores', 'shares'])
    $(id).replaceChildren();
  $('raw').textContent = '';
  $('result').hidden = true;
}
$('query').onsubmit = async (event) => {
  event.preventDefault();
  clear();
  $('status').textContent = '读取中…';
  try {
    const catalogue = await (await request('/admin/games')).json();
    const choice = $('game').value;
    $('game').replaceChildren();
    for (const game of [...catalogue.games, { id: 'all', title: { zh: '全部游戏 · 分别汇总' } }]) {
      const opt = document.createElement('option');
      opt.value = game.id;
      opt.textContent = game.title.zh + (game.status === 'example' ? ' · 示例' : '');
      $('game').append(opt);
    }
    $('game').value = choice;
    const p = parameters(),
      data = await (await request('/admin/summary?' + p)).json();
    viewed = p;
    $('raw').textContent = JSON.stringify(data, null, 2);
    $('range').textContent =
      `${data.range.game_id} · ${data.range.environment} · ${data.range.from} → ${data.range.to} UTC`;
    if (data.games) {
      table(
        'daily',
        data.games.map((g) => ({
          游戏: g.game_id,
          会话: g.sessions,
          开玩会话: g.started_sessions,
          局数: g.runs,
          '匿名访客（仅游戏内）': g.visitors,
        })),
      );
    } else {
      for (const [label, value] of [
        ['会话', data.sessions],
        ['匿名开玩访客', data.started_visitors],
        ['局数', data.runs],
        ['推荐会话', data.referral_sessions],
      ]) {
        const el = document.createElement('article'),
          n = document.createElement('strong');
        el.textContent = label;
        n.textContent = String(value);
        el.append(n);
        $('cards').append(el);
      }
      table('daily', data.daily);
      table('sources', data.sources);
      table(
        'metrics',
        [
          ['加载到开玩', data.load_to_start],
          ['重玩', data.replay],
          ...Object.entries(data.milestones),
        ].map(([name, r]) => ({
          指标: name,
          分子: r.numerator,
          分母: r.denominator,
          比例: r.value === null ? '—' : (r.value * 100).toFixed(1) + '%',
        })),
      );
      table('scores', [
        ...Object.entries(data.outcomes).map(([k, v]) => ({ 类型: '结果', 项目: k, 局数: v })),
        ...Object.entries(data.score_distribution).map(([k, v]) => ({
          类型: data.score_unit,
          项目: k,
          局数: v,
        })),
      ]);
      table(
        'shares',
        Object.entries(data.actions)
          .filter(([k]) => /share_|card_|link_|referral_/.test(k))
          .map(([name, n]) => ({ 动作: name, 次数: n })),
      );
    }
    $('result').hidden = false;
    $('status').textContent = '已读取真实存储数据。';
  } catch (e) {
    $('status').textContent = e.message;
  }
};
for (const format of ['ndjson', 'csv'])
  $(format).onclick = async () => {
    try {
      const url = URL.createObjectURL(
          await (await request('/admin/export?' + viewed + '&format=' + format)).blob(),
        ),
        a = document.createElement('a');
      a.href = url;
      a.download = `game-lab-${viewed.get('game_id')}-${viewed.get('environment')}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      $('status').textContent = e.message;
    }
  };
$('logout').onclick = () => {
  $('token').value = '';
  clear();
  viewed = null;
  $('status').textContent = '已清除密钥与结果。';
};
